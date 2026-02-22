# IV Saline Monitor Integration Guide

## Overview
This document outlines the integration of real-time ESP32 weight data into the Smart-IV React dashboard using Firebase Firestore.

## Firebase Setup
1.  **Project ID**: `iv-saline-monitor`
2.  **Firestore Collections**:
    -   `readings`: Stores real-time sensor data from ESP32.
    -   `controls`: Used for UI commands (Buzzer, LED).
    -   `alert_history`: Logs acknowledged alerts.
3.  **Environment Variables**:
    -   Create a `.env` file in the `smartiv-react` root based on `.env.example`.
    -   Fill in your Firebase API key and other credentials.

## ESP32 Data Schema
The ESP32 should push data to `readings/esp32_001` with the following fields:
```json
{
  "weight": 622,
  "alert_active": false,
  "buzzer_status": false,
  "led_status": false,
  "timestamp": "serverTimestamp()"
}
```

## Thresholds & Volume Logic
The system uses the following weight-to-volume mapping for a 500ml bag:
- **622g** → 500ml (100%) - **FULL**
- **388g** → 250ml (50%) - **HALF**
- **230g** → 125ml (25%) - **QUARTER**
- **115g** → 50ml (10%) - **LOW (Alert Trigger)**

## Firmware Files
The production firmware is located in the `firmware/` directory:
1. `ESP32_IV_Monitor_Final.ino`: Main logic.
2. `config.h`: Hardware pinout and weight thresholds.
3. `firebase_credentials.h`: WiFi and Firebase API keys.

## Deployment Steps
1. Open `ESP32_IV_Monitor_Final.ino` in Arduino IDE.
2. Install `Firebase ESP32` and `HX711` libraries.
3. Update `firebase_credentials.h` with your WiFi SSID and Password.
4. Upload to your ESP32.
