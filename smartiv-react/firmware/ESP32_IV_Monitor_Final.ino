/**
 * ESP32_IV_Monitor_Final.ino
 * Project: Smart-IV Saline Monitoring System
 * 
 * Hardware:
 *  - ESP32
 *  - HX711 Load Cell (Saline Bag)
 *  - Buzzer & LED
 * 
 * Libraries:
 *  - Firebase ESP32 by Mobizt (v4.x.x recommended)
 *  - HX711 by bogde
 */

#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <HX711.h>

// Helper sub-modules
#include "addons/TokenHelper.h"
#include "config.h"
#include "firebase_credentials.h"

// ── GLOBAL OBJECTS ────────────────────────────────────
HX711 scale;
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ── STATE VARIABLES ───────────────────────────────────
unsigned long lastReadTime = 0;
unsigned long lastPushTime = 0;
float currentWeight = 0;
int currentVolume = 0;
int currentPercentage = 0;
bool alertTriggered = false;

// Control states from Firebase
bool remoteBuzzer = false;
bool remoteLED = false;
bool remoteAck = false;

// ── HELPERS ───────────────────────────────────────────
int calculateVolume(float weight) {
    if (weight >= 622) return 500;
    if (weight <= 0) return 0;
    
    // Simple interpolation between thresholds
    if (weight > 388) return 250 + (weight - 388) * (500 - 250) / (622 - 388);
    if (weight > 230) return 125 + (weight - 230) * (250 - 125) / (388 - 230);
    if (weight > 115) return 50 + (weight - 115) * (125 - 50) / (230 - 115);
    return (weight / 115) * 50; 
}

void handleAlerts() {
    bool localAlert = (currentWeight < W_LOW);
    
    // Alert logic: Continuous + Blinking
    if ((localAlert || remoteBuzzer) && !remoteAck) {
        digitalWrite(BUZZER_PIN, HIGH);
        digitalWrite(LED_PIN, (millis() / 500) % 2); // Blink 1Hz
    } else {
        digitalWrite(BUZZER_PIN, LOW);
        digitalWrite(LED_PIN, remoteLED ? HIGH : LOW);
    }
}

// ── SETUP ─────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);
    
    // HX711 Initialization
    scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
    scale.set_scale(CALIBRATION_FACTOR);
    scale.tare(); // Tares to zero on boot
    
    // Connect WiFi
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        Serial.print(".");
        delay(500);
    }
    Serial.println("\nWiFi Connected");

    // Firebase Initialization
    config.api_key = API_KEY;
    auth.user.email = USER_EMAIL;
    auth.user.password = USER_PASSWORD;
    
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
}

// ── MAIN LOOP ─────────────────────────────────────────
void loop() {
    if (!Firebase.ready()) return;

    unsigned long now = millis();

    // 1. Read Sensor (every 1s)
    if (now - lastReadTime >= SENSOR_READ_INTERVAL) {
        lastReadTime = now;
        if (scale.is_ready()) {
            currentWeight = scale.get_units(5); // Average of 5 readings
            currentVolume = calculateVolume(currentWeight);
            currentPercentage = (currentVolume * 100) / 500;
        }
    }

    // 2. Alert Logic & Hardware Control
    handleAlerts();

    // 3. Push to Firestore (every 5s)
    if (now - lastPushTime >= FIREBASE_SEND_INTERVAL) {
        lastPushTime = now;
        
        FirebaseJson json;
        json.set("fields/weight/doubleValue", (double)currentWeight);
        json.set("fields/volume/integerValue", currentVolume);
        json.set("fields/percentage/integerValue", currentPercentage);
        json.set("fields/alert_active/booleanValue", currentWeight < W_LOW);
        json.set("fields/buzzer_status/booleanValue", digitalRead(BUZZER_PIN));
        json.set("fields/led_status/booleanValue", digitalRead(LED_PIN));
        json.set("fields/timestamp/timestampValue", "NULL"); // Handled by server or use manual string

        String path = "projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/readings/esp32_001";
        
        if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "", path.c_str(), json.raw(), "weight,volume,percentage,alert_active,buzzer_status,led_status")) {
            Serial.println("Push OK");
        } else {
            Serial.println(fbdo.errorReason());
        }

        // 4. Log Alert to History (if triggered and not yet logged)
        if (currentWeight < W_LOW && !alertTriggered) {
            alertTriggered = true;
            FirebaseJson logJson;
            logJson.set("fields/device_id/stringValue", "esp32_001");
            logJson.set("fields/alert_type/stringValue", "LOW_LEVEL");
            logJson.set("fields/percentage/integerValue", currentPercentage);
            logJson.set("fields/action_taken/stringValue", "Automatic Alert");
            
            String logPath = "projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/alert_history";
            Firebase.Firestore.createDocument(&fbdo, FIREBASE_PROJECT_ID, "", logPath.c_str(), logJson.raw());
        } else if (currentWeight >= W_LOW) {
            alertTriggered = false;
        }
    }

    // 5. Listen for Listen for Control Commands (Simplified polling)
    // In production, use Firestore stream. For this template, we'll get the doc.
    if (now % 2000 == 0) { // Check controls every 2s
        String controlPath = "projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/controls/esp32_001";
        if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "", controlPath.c_str())) {
            FirebaseJson &res = fbdo.jsonObject();
            // Parse buzzer_control, led_control, acknowledge_alert logic here
            // Note: FirebaseESP32 json parsing for Firestore is nested under 'fields'
        }
    }
}
