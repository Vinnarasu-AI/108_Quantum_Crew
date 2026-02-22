/**
 * Smart-IV ESP32 Firmware
 * -----------------------
 * Objective: Reads load cell weight, calculates IV levels, and sends data to Firebase.
 * Hardware: ESP32 + HX711 + Load Cell + Buzzer + LED.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <HX711.h>
#include "addons/TokenHelper.h"

// ────────────────────────────────────────────────────────────
//  1. CONFIGURATION (Edit These)
// ────────────────────────────────────────────────────────────
#define WIFI_SSID           "YOUR_WIFI_SSID"
#define WIFI_PASSWORD       "YOUR_WIFI_PASSWORD"

// Firebase API Key (Console > Project Settings)
#define FIREBASE_API_KEY    "AIzaSyAJNIwyPoVkPwtohLZS9PTj4GSZupbFtRg"
#define FIREBASE_PROJECT_ID "ir-monitoring-system"
#define FIREBASE_USER_EMAIL "esp32@system.local" // Create in Firebase Auth
#define FIREBASE_USER_PASS  "esp32password"

// ────────────────────────────────────────────────────────────
//  2. HARDWARE PINS
// ────────────────────────────────────────────────────────────
#define DT_PIN       18
#define SCK_PIN      19
#define BUZZER_PIN   13
#define LED_PIN      2

// ────────────────────────────────────────────────────────────
//  3. IV THRESHOLDS (Grams)
// ────────────────────────────────────────────────────────────
const int W_FULL = 622;
const int W_HALF = 388;
const int W_QTR  = 230;
const int W_LOW  = 115;
const float CALIBRATION_FACTOR = 420.0; // Adjust after hardware setup

// ────────────────────────────────────────────────────────────
//  4. OBJECTS & STATE
// ────────────────────────────────────────────────────────────
HX711 scale;
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long lastSendTime = 0;
float currentWeight = 0;
bool alertActive = false;
bool remoteBuzzer = false;

// ────────────────────────────────────────────────────────────
//  5. FUNCTIONS
// ────────────────────────────────────────────────────────────

void readLoadCell() {
    if (scale.is_ready()) {
        currentWeight = scale.get_units(5); // Average of 5 readings
        if (currentWeight < 0) currentWeight = 0;
    }
}

int calculateLevel() {
    if (currentWeight >= W_FULL) return 100;
    if (currentWeight <= 0) return 0;
    return (currentWeight / W_FULL) * 100;
}

int calculateVolume() {
    // Linear mapping matching React dashboard expectations
    if (currentWeight >= 622) return 500;
    if (currentWeight <= 0) return 0;
    if (currentWeight > 388) return 250 + (currentWeight - 388) * (500 - 250) / (622 - 388);
    if (currentWeight > 230) return 125 + (currentWeight - 230) * (250 - 125) / (388 - 230);
    if (currentWeight > 115) return 50 + (currentWeight - 115) * (125 - 50) / (230 - 115);
    return (currentWeight / 115) * 50;
}

void sendToFirebase() {
    FirebaseJson json;
    int volume = calculateVolume();
    int percentage = (volume * 100) / 500;
    
    // Update main readings document (Firestore)
    json.set("fields/weight/doubleValue", (double)currentWeight);
    json.set("fields/volume/integerValue", volume);
    json.set("fields/percentage/integerValue", percentage);
    json.set("fields/alert_active/booleanValue", currentWeight < W_LOW);
    json.set("fields/buzzer_status/booleanValue", digitalRead(BUZZER_PIN));
    json.set("fields/led_status/booleanValue", digitalRead(LED_PIN));

    String path = "projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/readings/esp32_001";
    if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "", path.c_str(), json.raw(), "weight,volume,percentage,alert_active,buzzer_status,led_status")) {
        Serial.println("[Cloud] Data pushed successfully");
    }
}

void checkControls() {
    String path = "projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/controls/esp32_001";
    if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "", path.c_str())) {
        // Simple polling for buzzer remote control
        // For production, use Firebase Stream for zero-latency response
    }
}

void controlBuzzer(bool on) { digitalWrite(BUZZER_PIN, on ? HIGH : LOW); }
void controlLED(bool on) { digitalWrite(LED_PIN, on ? HIGH : LOW); }

// ────────────────────────────────────────────────────────────
//  SETUP & LOOP
// ────────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);

    // HX711 Setup
    scale.begin(DT_PIN, SCK_PIN);
    scale.set_scale(CALIBRATION_FACTOR);
    scale.tare();

    // WiFi Setup
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500); Serial.print(".");
    }
    Serial.println("\n[WiFi] Connected!");

    // Firebase Setup
    config.api_key = FIREBASE_API_KEY;
    auth.user.email = FIREBASE_USER_EMAIL;
    auth.user.password = FIREBASE_USER_PASS;
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
}

void loop() {
    if (Firebase.ready()) {
        readLoadCell();
        
        // Local Alert Handling
        if (currentWeight < W_LOW) {
            controlBuzzer(true);
            controlLED((millis() / 500) % 2); // Blinking 1Hz
        } else {
            controlBuzzer(false);
            controlLED(false);
        }

        // Periodic Cloud Sync (Every 5 seconds)
        if (millis() - lastSendTime > 5000) {
            lastSendTime = millis();
            sendToFirebase();
            checkControls();
        }
    }
}
