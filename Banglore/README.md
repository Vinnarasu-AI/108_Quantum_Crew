# 🏥 SmartIV — IoT-Based Smart IV Monitoring System

> **Real-time multi-patient IV drip monitoring dashboard with ESP32 + Firebase integration**

---

## 🚀 Quick Start

### Option A — Demo Mode (No Firebase setup needed)

Just open `index.html` in any modern browser.

The dashboard will **automatically** fall back to **demo mode** after 4 seconds if Firebase is not configured.
Demo mode simulates **8 patients** with realistic data, anomalies, and live updates every 2.5 seconds.

### Option B — Full Firebase Integration

#### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add Project"** → Name it `smart-iv-monitor`
3. Enable **Realtime Database** (not Firestore)
4. Set database rules (for development):

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

#### Step 2: Get Your Firebase Config

1. Project Settings → Your apps → Add web app
2. Copy the config object

#### Step 3: Update `index.html`

Find this block and replace with your config:

```javascript
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "your-project.firebaseapp.com",
  databaseURL:       "https://your-project-default-rtdb.firebaseio.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

#### Step 4: Flash ESP32 Firmware

See `esp32_firmware/SmartIV_ESP32.ino` — configure:
- `WIFI_SSID` / `WIFI_PASSWORD`
- `FIREBASE_HOST` / `FIREBASE_API_KEY`
- `DEVICE_ID`, `BED_NUMBER`, `PATIENT_NAME`

---

## 🗂 Project Structure

```
SmartIV/
├── index.html          # Dashboard (single HTML file)
├── styles.css          # Premium dark hospital UI
├── app.js              # Core logic, Firebase listeners, alert engine
├── demo-data.js        # ESP32 simulator (demo fallback)
├── README.md           # This file
└── esp32_firmware/
    └── SmartIV_ESP32.ino   # Arduino firmware
```

---

## 🔥 Firebase Data Structure

```
Realtime Database
├── devices/
│   └── device_001/
│       ├── bedNumber          "3"
│       ├── patientName        "Aditi Sharma"
│       ├── ivType             "Normal Saline"
│       ├── fluidRemainingML   450.0
│       ├── fluidPercentage    90.0
│       ├── flowRate           102.5
│       ├── targetFlowRate     100
│       ├── pressureValue      85
│       ├── airBubbleDetected  false
│       ├── batteryLevel       87
│       ├── deviceOnline       true
│       ├── lastUpdated        1708514522000
│       ├── alarmStatus        "normal"
│       └── alarmSeverity      "none"
├── commands/
│   └── device_001/
│       ├── alarmCommand       "BUZZER_ON"
│       └── timestamp          1708514522000
└── logs/
    └── device_001/
        └── -Nxyz.../
            ├── bed            "3"
            ├── message        "Near empty warning"
            ├── severity       "warning"
            └── timestamp      1708514522000
```

---

## ⚡ Dashboard Features

| Section | Description |
|---------|-------------|
| 🟢 **Patient Grid** | All IV devices as live-updating cards |
| 🔥 **Priority Queue** | AI-sorted critical patients first |
| 🚨 **Alert Center** | Live alerts with Acknowledge / Snooze / Escalate |
| 📊 **Patient Modal** | Expanded detail view per patient |
| 🔊 **Alarm Escalation** | Level 1 (visual) → Level 2 (sound) → Level 3 (ESP32 buzzer) |
| 🧭 **Bed Map** | Color-coded ward overview |
| 📶 **Device Health** | Battery, signal, last-update status |
| 🧾 **Event Log** | Auto-logged events, CSV export |

---

## 🧠 Alert Logic

| Condition | Alert Type | Action |
|-----------|-----------|--------|
| `fluidPercentage < 5%` | 🚨 CRITICAL | Replace IV immediately |
| `fluidPercentage < 10%` | ⚠ WARNING | Prepare new bag |
| `airBubbleDetected == true` | 🚨 CRITICAL | Check IV line |
| `pressureValue > 250 mmHg` | 🚨 CRITICAL | Occlusion check |
| `abs(flow - target) > 15` | ⚠ WARNING | Adjust drip rate |
| `batteryLevel < 15%` | ⚠ WARNING | Charge device |
| `lastUpdated > 20s` | ⚠ WARNING | Device offline |

---

## 🔕 Anti-Alarm Fatigue

- Same alarm within **1 minute** is grouped (not repeated)
- **Snooze** silences for 1 minute
- **Acknowledge** marks resolved
- Critical alarm counter shows grouped count badge

---

## ⚙ ESP32 Hardware Wiring

| Component | ESP32 Pin |
|-----------|-----------|
| HX711 DOUT (Load Cell) | GPIO 16 |
| HX711 SCK | GPIO 4 |
| YF-S201 Flow Sensor | GPIO 18 |
| IR Air Bubble Sensor | GPIO 34 |
| Pressure Sensor (Analog) | GPIO 35 |
| Buzzer | GPIO 26 |
| Status LED | GPIO 2 (built-in) |

---

## 📡 ESP32 Command Paths

The dashboard writes to `/commands/{device_id}/alarmCommand`:

| Command | Effect |
|---------|--------|
| `BUZZER_ON` | Activates physical alarm buzzer |
| `BUZZER_OFF` | Deactivates buzzer |
| `ACK` | Acknowledges, stops buzzer |
| `ESCALATE` | Triple beep escalation sequence |

---

## 🎨 Status Color Legend

| Color | Meaning |
|-------|---------|
| 🟢 **Green** | Normal — all parameters healthy |
| 🟡 **Yellow** | Warning — attention needed soon |
| 🔴 **Red** | Critical — immediate action required |
| ⚫ **Grey** | Offline — device not responding |

---

## 🔒 Production Security Recommendations

1. **Firebase Authentication** — Add Firebase Auth and restrict database rules
2. **HTTPS** — Host dashboard on Firebase Hosting (free)
3. **Role-based access** — Nurse vs. Doctor views
4. **ESP32 OTA** — Enable over-the-air firmware updates
5. **Rate limiting** — Cloud Functions to validate ESP32 writes

---

## 🛠 Tech Stack

- **Frontend**: Vanilla HTML5 + CSS3 + JavaScript (ES2022 modules)
- **Database**: Firebase Realtime Database
- **Hardware**: ESP32 + Firebase ESP32 library (Mobizt)
- **Fonts**: Inter + JetBrains Mono (Google Fonts)
- **No frameworks needed** — zero dependencies on the frontend

---

## 📱 Browser Compatibility

Chrome 90+, Edge 90+, Firefox 88+, Safari 14+

---

## 📜 License

MIT — Free for hospital use and hackathon demonstration.

---

*Built for National Hackathon — IoT Medical Safety Systems track*  
*Prioritizing: Real-time monitoring · Alarm fatigue reduction · Nurse workflow optimization*
