# Smart-IV ICU Monitoring System: Project Integration Report

## 1. Project Overview
The **Smart-IV ICU Monitoring System** is a professional-grade React dashboard designed to monitor IV saline levels in real-time using IoT-enabled ESP32 devices. The project has been successfully migrated to the **`ir-monitoring-system`** Firebase project.

## 2. Real-Time Status Analysis

### 📡 Real-Time Components (Working)
| Component | Data Source | Sync Type | Status |
| :--- | :--- | :--- | :--- |
| **IVMonitor** | Firestore (`readings/esp32_001`) | `onSnapshot` | **ACTIVE** — Full real-time sync. |
| **Alert Center** | Firestore (`alert_history`) | `onSnapshot` | **ACTIVE** — Logs update as they happen. |
| **Control Panel** | Firestore (`controls/`) | Write / `setDoc` | **ACTIVE** — Commands sent directly to ESP32. |
| **Live ICU Grid** | Firebase RTDB (`devices/`) | `onValue` | **ACTIVE** — Updates device cards instantly. |

### 🛠️ Legacy & Dummy Data Summary
The system is designed with a **"Demo Fallback"** logic to ensure the dashboard looks functional even when hardware is offline.
- **Dummy Devices**: 8 simulated patient scenarios (Aditi, Ramesh, etc.) defined in `useFirebaseData.js`.
- **Demo Simulation**: A timer in `useFirebaseData.js` that drains fluid levels and generates drift every 2.5 seconds to simulate real-world usage.
- **Auto-Switch**: The dashboard automatically switches from "Demo" to "Live" the moment it receives a valid pulse from your Firebase Database.

## 3. File-by-File Technical Audit

### Core Infrastructure
- **`src/firebase.js`**: **(STABLE)** Centralized configuration using the `ir-monitoring-system` ID. Includes safety wrappers to prevent crashes if credentials are missing.
- **`src/hooks/useFirebaseData.js`**: **(STABLE)** The "Brain" of the app. Handles data merging between Live Firebase data and Demo simulation.
- **`src/utils/statusEngine.js`**: **(STABLE)** Contains the math for calculating alerts (Occlusion, Empty Bag, Air Bubble) based on raw sensor values.

### UI Components
- **`src/components/iv-monitor/IVMonitor.jsx`**: **(NEW - REALTIME)** The primary interface for your real ESP32. It calculates Volume (ml) and Percentage (%) using linear interpolation based on your requested weight thresholds.
- **`src/App.jsx`**: **(STABLE)** The main shell. Successfully integrated the new `IVMonitor` view.
- **`src/components/Sidebar.jsx`**: **(UPDATED)** Added the "ESP32 Monitor" navigation item for easy access.

## 4. Hardware Calibration Logic
The `IVMonitor.jsx` component is specifically programmed with your provided thresholds:
- **FULL**: 622g (500ml)
- **HALF**: 388g (250ml)
- **QTR**: 230g (125ml)
- **LOW**: 115g (50ml) — *Triggers Red Visual Alert*

## 5. Integration Summary
- **Real-Time Connectivity**: YES. The app is successfully listening to `ir-monitoring-system.firebaseapp.com`.
- **System Stability**: HIGH. Errors regarding missing Firebase paths have been patched with conditional checks.
- **Aesthetics**: Premium. Uses Tailwind CSS with smooth animations and medical-grade color palettes.

---
**Prepared By**: Antigravity AI
**Date**: February 21, 2026
**Environment**: React + Vite + Firebase v12
