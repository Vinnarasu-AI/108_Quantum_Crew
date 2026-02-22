/**
 * firebase_credentials.h - Connection Details
 * Project: Smart-IV Saline Monitoring System
 */

#ifndef FIREBASE_CREDENTIALS_H
#define FIREBASE_CREDENTIALS_H

// ── WIFI ──────────────────────────────────────────────
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// ── FIREBASE ──────────────────────────────────────────
// Get the API Key from Firebase Console > Project Settings
#define API_KEY       "AIzaSyAJNIwyPoVkPwtohLZS9PTj4GSZupbFtRg"
#define FIREBASE_PROJECT_ID "ir-monitoring-system"

// For Email/Password Authentication
#define USER_EMAIL    "esp32@system.local" // Create this user in Firebase Auth
#define USER_PASSWORD "esp32password"

#endif
