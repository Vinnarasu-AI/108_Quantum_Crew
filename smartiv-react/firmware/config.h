/**
 * config.h - Hardware Pins & Thresholds
 * Project: Smart-IV Saline Monitoring System
 */

#ifndef CONFIG_H
#define CONFIG_H

// ── PINS ──────────────────────────────────────────────
#define LOADCELL_DOUT_PIN  18  // DT
#define LOADCELL_SCK_PIN   19  // SCK
#define BUZZER_PIN         13  // Pulse/Continuous Buzzer
#define LED_PIN            2   // Status LED

// ── CALIBRATION ───────────────────────────────────────
#define CALIBRATION_FACTOR 420.0  // Adjust via Serial Monitor if needed

// ── THRESHOLDS (Grams) ────────────────────────────────
#define W_FULL    622
#define W_HALF    388
#define W_QTR     230
#define W_LOW     115

// ── TIMING ───────────────────────────────────────────
#define SENSOR_READ_INTERVAL  1000  // 1 second
#define FIREBASE_SEND_INTERVAL 5000  // 5 seconds

#endif
