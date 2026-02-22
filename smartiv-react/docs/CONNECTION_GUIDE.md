# Hardware Connection & Integration Guide
Project: Smart-IV ICU Monitoring System

This guide explains how to connect your physical ESP32 hardware to the React Dashboard via Firebase.

## 1. Hardware Setup (Wiring)
| Component | ESP32 Pin (GPIO) | Notes |
| :--- | :--- | :--- |
| **HX711 DT** | GPIO 18 | Data line for weight sensor |
| **HX711 SCK** | GPIO 19 | Clock line for weight sensor |
| **Buzzer (+)** | GPIO 13 | Primary alarm signal |
| **LED (+)** | GPIO 2 | Visual status/blink indicator |
| **Ground (GND)** | GND | Connect all GND pins together |

## 2. WiFi Configuration
1. Open `firmware/ESP32_IV_Monitor.ino`.
2. Locate the following lines:
   ```cpp
   #define WIFI_SSID "YOUR_WIFI_SSID"
   #define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
   ```
3. Replace with your actual network details.

## 3. Firebase Setup
1. Ensure your Firebase Project ID is `ir-monitoring-system`.
2. Go to **Authentication** in the Firebase Console.
3. Add a new user with Email `esp32@system.local` and Password `esp32password`.
4. The API Key is already embedded in the code.

## 4. Upload Code to ESP32
1. Install **Arduino IDE**.
2. Install these libraries via Library Manager:
   - `HX711` by Bogdan Necula
   - `Firebase ESP Client` by Mobizt
3. Connect ESP32 via USB and select the correct **Board** and **Port**.
4. Click **Upload**.

## 5. Test Connection
1. Open the **Serial Monitor** in Arduino IDE (115200 Baud).
2. It should show `Connected to WiFi` and then `[Cloud] Data pushed successfully`.
3. Check your **Firestore Console**: A document at `readings/esp32_001` should appear updating in real-time.

## 6. Verify React Dashboard
1. Run the dashboard: `npm run dev`.
2. Open [http://localhost:5173/](http://localhost:5173/) in your browser.
3. Navigate to **IV Operations > ESP32 Monitor**.
4. You should see the real weight and fluid percentage from your hardware.

---
### Troubleshooting
- **No Data**: Verify your WiFi SSID and ensure the device has internet access.
- **Wrong Weight**: You may need to adjust the `CALIBRATION_FACTOR` in the `.ino` file based on your specific load cell.
- **Dashboard Empty**: Ensure the `Device ID` in the React code and ESP32 code are both set to `esp32_001`.
