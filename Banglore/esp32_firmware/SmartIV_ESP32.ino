/*
  =====================================================
  SmartIV — ESP32 Firmware
  IoT-Based Smart IV Monitoring System
  
  Hardware:
    - ESP32 DevKit
    - HX711 Load Cell Amplifier
    - YF-S201 Flow Sensor
    - IR Air Bubble Sensor
    - MPX53 Pressure Sensor (analog)
    - Buzzer on GPIO 26
  
  Libraries Required (install via Arduino Library Manager):
    - FirebaseESP32 by Mobizt  (v4.3.x)
    - HX711 by bogde
  =====================================================
*/

#include <Arduino.h>
#include <WiFi.h>
#include <FirebaseESP32.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ════════════════════════════════════════════════════
//  CONFIGURATION — EDIT THESE
// ════════════════════════════════════════════════════
#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"

// Firebase project details
#define FIREBASE_HOST    "https://smart-iv-monitor-default-rtdb.firebaseio.com/"
#define FIREBASE_API_KEY "YOUR_FIREBASE_WEB_API_KEY"
#define FIREBASE_USER    "esp32@smartiv.com"
#define FIREBASE_PASS    "esp32password"

// Device identity
#define DEVICE_ID        "device_001"
#define BED_NUMBER       "3"
#define PATIENT_NAME     "Aditi Sharma"
#define IV_TYPE          "Normal Saline"
#define FLUID_TOTAL_ML   500.0f

// ════════════════════════════════════════════════════
//  PIN DEFINITIONS
// ════════════════════════════════════════════════════
#define FLOW_SENSOR_PIN    18    // Flow sensor interrupt pin
#define AIR_BUBBLE_PIN     34    // IR air bubble sensor (analog/digital)
#define PRESSURE_PIN       35    // Pressure sensor analog pin
#define BUZZER_PIN         26    // Active buzzer
#define HX711_DOUT         16    // Load cell data
#define HX711_SCK          4     // Load cell clock
#define LED_STATUS         2     // Built-in LED (status)

// ════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════
#define PUSH_INTERVAL_MS   3000  // Send data every 3 seconds
#define FLOW_CALIBRATION   7.5f  // YF-S201: 7.5 pulses per mL
#define LOAD_CELL_SCALE    420.0 // Calibration factor (adjust after taring)
#define PRESSURE_SCALE     0.488 // 3.3V / 4096 * 1000 / (0.9 * sensitivity)
#define AIR_THRESHOLD      2000  // ADC value threshold for air bubble
#define OCCLUSION_PRESSURE 250   // mmHg — occlusion threshold

// ════════════════════════════════════════════════════
//  FIREBASE OBJECTS
// ════════════════════════════════════════════════════
FirebaseData   fbData;
FirebaseData   fbStream;
FirebaseAuth   fbAuth;
FirebaseConfig fbConfig;

// ════════════════════════════════════════════════════
//  SENSOR STATE
// ════════════════════════════════════════════════════
volatile uint32_t flowPulseCount = 0;
float   fluidRemainingML  = FLUID_TOTAL_ML;
float   flowRateMlPerHour = 0.0f;
float   pressureMmHg      = 0.0f;
bool    airBubbleDetected = false;
int     batteryPercent    = 95;
bool    buzzerActive      = false;
uint32_t lastPushTime     = 0;
uint32_t lastFlowTime     = 0;

// ════════════════════════════════════════════════════
//  LOAD CELL (HX711)
// ════════════════════════════════════════════════════
// Simple HX711 read (no library version for embedded clarity)
long readHX711() {
  // Wait for data ready (DOUT goes LOW)
  unsigned long start = millis();
  while (digitalRead(HX711_DOUT) == HIGH) {
    if (millis() - start > 1000) return 0;
  }
  
  long count = 0;
  for (int i = 0; i < 24; i++) {
    digitalWrite(HX711_SCK, HIGH);
    delayMicroseconds(1);
    count = (count << 1) | digitalRead(HX711_DOUT);
    digitalWrite(HX711_SCK, LOW);
    delayMicroseconds(1);
  }
  // Gain 128 — one extra pulse
  digitalWrite(HX711_SCK, HIGH); delayMicroseconds(1);
  digitalWrite(HX711_SCK, LOW);
  
  // 2's complement
  if (count & 0x800000) count |= 0xFF000000;
  return count;
}

// ════════════════════════════════════════════════════
//  FLOW SENSOR ISR
// ════════════════════════════════════════════════════
void IRAM_ATTR flowSensorISR() {
  flowPulseCount++;
}

// ════════════════════════════════════════════════════
//  SETUP
// ════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  
  // GPIO setup
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  pinMode(AIR_BUBBLE_PIN,  INPUT);
  pinMode(BUZZER_PIN,      OUTPUT);
  pinMode(LED_STATUS,      OUTPUT);
  pinMode(HX711_DOUT,      INPUT);
  pinMode(HX711_SCK,       OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowSensorISR, FALLING);
  
  // WiFi
  Serial.printf("[WiFi] Connecting to %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
    digitalWrite(LED_STATUS, !digitalRead(LED_STATUS));  // Blink
  }
  Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  digitalWrite(LED_STATUS, HIGH);
  
  // Firebase config
  fbConfig.host             = FIREBASE_HOST;
  fbConfig.api_key          = FIREBASE_API_KEY;
  fbAuth.user.email         = FIREBASE_USER;
  fbAuth.user.password      = FIREBASE_PASS;
  fbConfig.token_status_callback = tokenStatusCallback;
  
  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);
  
  // Register device in Firebase
  writeDeviceInfo();
  
  // Start listening for alarm commands
  if (!Firebase.beginStream(fbStream, String("/commands/") + DEVICE_ID)) {
    Serial.printf("[Firebase] Stream failed: %s\n", fbStream.errorReason().c_str());
  }
  Firebase.setStreamCallback(fbStream, streamCallback, streamTimeoutCallback);
  
  Serial.printf("[SmartIV] Device %s ready on Bed %s\n", DEVICE_ID, BED_NUMBER);
  lastFlowTime = millis();
}

// ════════════════════════════════════════════════════
//  MAIN LOOP
// ════════════════════════════════════════════════════
void loop() {
  uint32_t now = millis();
  
  // ── Read sensors ───────────────────────────────
  readFlowSensor(now);
  readPressureSensor();
  readAirBubbleSensor();
  readBattery();
  readLoadCell();
  
  // ── Push to Firebase ────────────────────────────
  if (now - lastPushTime >= PUSH_INTERVAL_MS) {
    lastPushTime = now;
    pushToFirebase();
    
    // Log to console
    Serial.printf("[Data] Fluid:%.1fmL (%.0f%%) | Flow:%.1f mL/hr | Pressure:%.0f mmHg | Air:%s | Bat:%d%%\n",
      fluidRemainingML,
      (fluidRemainingML / FLUID_TOTAL_ML * 100.0f),
      flowRateMlPerHour,
      pressureMmHg,
      airBubbleDetected ? "YES" : "NO",
      batteryPercent);
  }
  
  // ── Handle buzzer ───────────────────────────────
  if (buzzerActive) {
    tone(BUZZER_PIN, 2000, 200);
    delay(300);
    tone(BUZZER_PIN, 1500, 200);
    delay(300);
  }
  
  delay(50);  // 20Hz loop
}

// ════════════════════════════════════════════════════
//  SENSOR READERS
// ════════════════════════════════════════════════════
void readFlowSensor(uint32_t now) {
  uint32_t elapsed = now - lastFlowTime;
  if (elapsed < 1000) return;  // Only calculate every second
  
  noInterrupts();
  uint32_t pulses = flowPulseCount;
  flowPulseCount  = 0;
  interrupts();
  
  // YF-S201: frequency (Hz) = flow (L/min) × 7.5
  float freqHz       = pulses / (elapsed / 1000.0f);
  float litresPerMin = freqHz / FLOW_CALIBRATION;
  flowRateMlPerHour  = litresPerMin * 60.0f * 1000.0f;  // Convert to mL/hr
  
  // Drain from calculated flow
  float drainedML   = litresPerMin * (elapsed / 60000.0f) * 1000.0f;
  fluidRemainingML  = max(0.0f, fluidRemainingML - drainedML);
  
  lastFlowTime = now;
}

void readPressureSensor() {
  int raw = analogRead(PRESSURE_PIN);
  // Convert 12-bit ADC (0-4095) with 3.3V ref → voltage → pressure
  float voltage = (raw / 4095.0f) * 3.3f;
  pressureMmHg  = voltage * 75.0f + 20.0f;  // Linear calibration (adjust per sensor)
  pressureMmHg  = constrain(pressureMmHg, 0.0f, 500.0f);
}

void readAirBubbleSensor() {
  // IR sensor: HIGH when air detected (beam interrupted by air gap)
  int raw = analogRead(AIR_BUBBLE_PIN);
  airBubbleDetected = (raw > AIR_THRESHOLD);
}

void readBattery() {
  // Simple slow drain simulation (replace with actual ADC read from battery divider)
  static uint32_t lastBattRead = 0;
  if (millis() - lastBattRead > 60000) {  // Update every minute
    batteryPercent = max(0, batteryPercent - 1);
    lastBattRead = millis();
  }
}

void readLoadCell() {
  // Use load cell for backup fluid level (weight-based estimation)
  // Uncomment if HX711 is wired:
  /*
  long raw = readHX711();
  float weightGrams = (raw - TARE_VALUE) / LOAD_CELL_SCALE;
  // 1 mL normal saline ≈ 1.005 g
  float mlFromWeight = weightGrams / 1.005f;
  // Blend with pulse-count estimate (60% weight, 40% pulse)
  fluidRemainingML = (0.6f * mlFromWeight) + (0.4f * fluidRemainingML);
  fluidRemainingML = constrain(fluidRemainingML, 0.0f, FLUID_TOTAL_ML);
  */
}

// ════════════════════════════════════════════════════
//  FIREBASE PUSH
// ════════════════════════════════════════════════════
void pushToFirebase() {
  if (!Firebase.ready()) {
    Serial.println("[Firebase] Not ready — skipping push");
    digitalWrite(LED_STATUS, LOW);
    return;
  }
  
  String basePath = String("/devices/") + DEVICE_ID + "/";
  float  fluidPct = (fluidRemainingML / FLUID_TOTAL_ML) * 100.0f;
  
  // Compute alarm status on device side
  String alarmStatus = "normal";
  String alarmSeverity = "none";
  if (fluidPct < 5 || airBubbleDetected || pressureMmHg > OCCLUSION_PRESSURE) {
    alarmStatus = "critical"; alarmSeverity = "high";
  } else if (fluidPct < 15 || abs(flowRateMlPerHour - 100) > 15 || batteryPercent < 15) {
    alarmStatus = "warning";  alarmSeverity = "medium";
  }
  
  // Batch update using JSON (more efficient than multiple set calls)
  FirebaseJson json;
  json.set("bedNumber",         BED_NUMBER);
  json.set("patientName",       PATIENT_NAME);
  json.set("ivType",            IV_TYPE);
  json.set("fluidRemainingML",  fluidRemainingML);
  json.set("fluidPercentage",   fluidPct);
  json.set("flowRate",          flowRateMlPerHour);
  json.set("targetFlowRate",    100.0f);       // Prescribed rate
  json.set("pressureValue",     pressureMmHg);
  json.set("airBubbleDetected", airBubbleDetected);
  json.set("batteryLevel",      batteryPercent);
  json.set("deviceOnline",      true);
  json.set("lastUpdated/.sv",   "timestamp");  // Firebase server timestamp
  json.set("alarmStatus",       alarmStatus);
  json.set("alarmSeverity",     alarmSeverity);
  
  String devicePath = String("/devices/") + DEVICE_ID;
  if (!Firebase.updateNode(fbData, devicePath, json)) {
    Serial.printf("[Firebase] Push failed: %s\n", fbData.errorReason().c_str());
    digitalWrite(LED_STATUS, LOW);
  } else {
    digitalWrite(LED_STATUS, HIGH);
  }
  
  // Auto-log near-empty warning to Firebase
  if (fluidPct < 10) {
    logEvent("Near empty warning — " + String(fluidPct, 0) + "% remaining", "warning");
  }
  if (airBubbleDetected) {
    logEvent("Air bubble detected!", "critical");
  }
}

// ════════════════════════════════════════════════════
//  WRITE STATIC DEVICE INFO
// ════════════════════════════════════════════════════
void writeDeviceInfo() {
  FirebaseJson info;
  info.set("bedNumber",      BED_NUMBER);
  info.set("patientName",    PATIENT_NAME);
  info.set("ivType",         IV_TYPE);
  info.set("targetFlowRate", 100);
  info.set("deviceOnline",   true);
  info.set("lastUpdated/.sv","timestamp");
  
  String path = String("/devices/") + DEVICE_ID;
  Firebase.updateNode(fbData, path, info);
  Serial.printf("[Firebase] Device registered at %s\n", path.c_str());
}

// ════════════════════════════════════════════════════
//  FIREBASE STREAM CALLBACK (receive commands)
// ════════════════════════════════════════════════════
void streamCallback(StreamData data) {
  String path = data.dataPath();
  String value = data.stringData();
  
  Serial.printf("[Stream] %s = %s\n", path.c_str(), value.c_str());
  
  if (path == "/alarmCommand") {
    if (value == "BUZZER_ON") {
      buzzerActive = true;
      Serial.println("[ESP32] BUZZER ACTIVATED by dashboard");
    } else if (value == "BUZZER_OFF") {
      buzzerActive = false;
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println("[ESP32] Buzzer deactivated");
    } else if (value == "ACK") {
      buzzerActive = false;
      noTone(BUZZER_PIN);
      Serial.println("[ESP32] Alarm acknowledged");
      logEvent("Alarm acknowledged from dashboard", "ok");
    } else if (value == "ESCALATE") {
      // Triple beep for escalation
      for (int i = 0; i < 3; i++) {
        tone(BUZZER_PIN, 2500, 300);
        delay(400);
      }
      Serial.println("[ESP32] Alarm ESCALATED");
      logEvent("Alarm escalated to supervisor", "critical");
    }
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("[Firebase] Stream timeout — reconnecting...");
  }
}

// ════════════════════════════════════════════════════
//  LOG EVENT TO FIREBASE
// ════════════════════════════════════════════════════
void logEvent(String message, String severity) {
  if (!Firebase.ready()) return;
  
  FirebaseJson logEntry;
  logEntry.set("bed",        BED_NUMBER);
  logEntry.set("message",    message);
  logEntry.set("severity",   severity);
  logEntry.set("timestamp/.sv", "timestamp");
  
  String logPath = String("/logs/") + DEVICE_ID;
  Firebase.pushJSON(fbData, logPath, logEntry);
}
