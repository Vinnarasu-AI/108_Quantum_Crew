/**
 * Smart-IV ESP32 Firmware (RTDB VERSION with Email Alerts)
 * --------------------------------------------------------
 * 1. Continuous Monitoring (1ml resolution)
 * 2. Automatic Email Alerts on Low Level
 * 3. Real-time Firebase Sync
 */

#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <HX711.h>
#include <ESP_Mail_Client.h> // <--- Requires "ESP Mail Client" library by Mobizt

// ── CONFIGURATION ──────────────────────────────────────────────
#define WIFI_SSID           "GAT-Connect"
#define WIFI_PASSWORD       "Global@4321"

#define API_KEY             "AIzaSyAJNIwyPoVkPwtohLZS9PTj4GSZupbFtRg"
#define DATABASE_URL        "https://ir-monitoring-system-default-rtdb.firebaseio.com"
#define DEVICE_ID           "esp32_001"

// ── EMAIL CONFIGURATION ────────────────────────────────────────
#define SMTP_HOST "smtp.gmail.com"
#define SMTP_PORT 465
#define AUTHOR_EMAIL "kalavakuntakarthik8@gmail.com"
#define AUTHOR_PASSWORD "xrzhhovulbqlqfzs" // App Password
#define RECIPIENT_EMAIL "kalavakuntakarthik8@gmail.com"

// ── PIN DEFINITIONS ────────────────────────────────────────────
#define DT_PIN       18
#define SCK_PIN      19
#define BUZZER_PIN   13
#define LED_PIN      2

// ── OBJECTS & CONSTANTS ────────────────────────────────────────
HX711 scale;
FirebaseData fbdo;
FirebaseData fbStream;
FirebaseAuth auth;
FirebaseConfig config;
SMTPSession smtp;

const float W_FULL = 622.0;   // Grams for 500ml
const float W_LOW  = 115.0;   // Low Level Threshold
const float CALIBRATION_FACTOR = 420.0;

// ── STATE VARIABLES ────────────────────────────────────────────
float currentWeight = 0;
int currentVolume = 0;
int currentPercentage = 0;
String currentLevel = "NORMAL";
bool alarmState = false;
bool emailSent = false;
unsigned long lastFirebaseSend = 0;

// ── EMAIL FUNCTION ─────────────────────────────────────────────
void sendLowLevelEmail(int pct) {
    if (emailSent) return; // Only send once

    ESP_Mail_Session session;
    session.server.host_name = SMTP_HOST;
    session.server.port = SMTP_PORT;
    session.login.email = AUTHOR_EMAIL;
    session.login.password = AUTHOR_PASSWORD;
    session.login.user_domain = "";

    SMTP_Message message;
    message.sender.name = "Smart-IV Monitor";
    message.sender.email = AUTHOR_EMAIL;
    message.subject = "[CRITICAL] Low IV Level Alert - Bed 01";
    message.addRecipient("Admin", RECIPIENT_EMAIL);

    String textMsg = "Bed 01 (Patient: Aditi Sharma) is running low on IV fluids.\n\n";
    textMsg += "Current Level: " + String(pct) + "%\n";
    textMsg += "Please replace the IV bag immediately.";
    message.text.content = textMsg.c_str();

    if (!MailClient.sendMail(&smtp, &message)) {
        Serial.println("❌ Email Error: " + smtp.errorReason());
    } else {
        Serial.println("✅ Alert Email Sent Successfully!");
        emailSent = true;
    }
}

// ── CALLBACKS ──────────────────────────────────────────────────
void streamCallback(FirebaseStream data) {
    if (data.dataPath() == "/buzzer_control") {
        bool remoteMute = !data.boolData();
        digitalWrite(BUZZER_PIN, (alarmState && !remoteMute) ? HIGH : LOW);
    }
}

void setup() {
    Serial.begin(115200);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);

    // HX711 Load Cell
    scale.begin(DT_PIN, SCK_PIN);
    scale.set_scale(CALIBRATION_FACTOR);
    Serial.println("Starting TARE... Bag must be empty!");
    delay(2000);
    scale.tare();

    // WiFi
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
    Serial.println("\n✅ WiFi Connected!");

    // Firebase
    config.api_key = API_KEY;
    config.database_url = DATABASE_URL;
    config.timeout.rtdb_read = 15000;
    config.timeout.rtdb_write = 15000;
    
    if (Firebase.signUp(&config, &auth, "", "")) Serial.println("[Firebase] Auth OK");
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);

    // Stream for Dashboard Remote Commands
    String controlPath = "/controls/" + String(DEVICE_ID);
    Firebase.RTDB.beginStream(&fbStream, controlPath.c_str());
    Firebase.RTDB.setStreamCallback(&fbStream, streamCallback, NULL);

    // SMTP Config
    smtp.debug(0); 
}

void loop() {
    // 1. Read Sensors every 1 second
    static unsigned long lastReading = 0;
    if (millis() - lastReading >= 1000) {
        lastReading = millis();
        currentWeight = scale.get_units(5);
        if (currentWeight < 0) currentWeight = 0;

        // 📈 CONTINUOUS CALCULATION (1ml Resolution)
        // Ratio: 500ml = 622g -> 1ml = 1.244g
        currentVolume = currentWeight / 1.244;
        if (currentVolume > 500) currentVolume = 500;
        currentPercentage = (currentVolume * 100) / 500;

        // Update Alarm Logic
        alarmState = (currentWeight < W_LOW);
        currentLevel = (currentPercentage < 15) ? "LOW" : (currentPercentage < 50) ? "HALF" : "FULL";

        // Handle Hardware Output
        digitalWrite(BUZZER_PIN, alarmState ? HIGH : LOW);
        digitalWrite(LED_PIN, alarmState ? (millis() / 500 % 2) : LOW);

        // 📝 Serial Log
        Serial.printf("Weight: %.1fg | Vol: %dml | %d%% | Level: %s\n", 
                     currentWeight, currentVolume, currentPercentage, currentLevel.c_str());

        // ✉️ EMAIL TRIGGER
        if (currentPercentage < 15) {
            sendLowLevelEmail(currentPercentage);
        } else if (currentPercentage > 20) {
            emailSent = false; // Reset trigger when bag is refilled
        }
    }

    // 2. Sync to Firebase every 5 seconds
    if (Firebase.ready() && (millis() - lastFirebaseSend >= 5000)) {
        lastFirebaseSend = millis();
        FirebaseJson json;
        json.set("weight", currentWeight);
        json.set("volume", currentVolume);
        json.set("percentage", currentPercentage);
        json.set("level", currentLevel);
        json.set("alert_active", alarmState);
        json.set("buzzer_status", alarmState);
        
        String path = "/readings/" + String(DEVICE_ID);
        if (Firebase.RTDB.setJSON(&fbdo, path.c_str(), &json)) {
            Serial.println("📤 [RTDB] Data Updated");
        } else {
            Serial.println("❌ RTDB Error: " + fbdo.errorReason());
        }
    }
}
