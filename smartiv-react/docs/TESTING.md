# IV Saline Monitor Testing Plan

## Test Cases

| ID | Description | Input (ESP32 Data) | Expected UI/Behavior |
|:---|:---|:---|:---|
| **TC01** | Full Bottle | weight: 622 | 500ml, 100%, Status: FULL, Color: Green |
| **TC02** | Half Bottle | weight: 388 | 250ml, 50%, Status: HALF, Color: Blue |
| **TC03** | Quarter Bottle | weight: 230 | 125ml, 25%, Status: QUARTER, Color: Orange |
| **TC04** | Low Alert | weight: < 115 | 50ml, < 10%, Status: LOW, Red Alert Banner, Buzzer pulse |
| **TC05** | Mute Buzzer | UI Toggle (OFF) | Firestore `controls/esp32_001/buzzer_control` → `false` |
| **TC06** | Ack Alert | Click "Acknowledge" | Alert banner disappears, record added to `alert_history` |
| **TC07** | Device Offline | Firestore Down | Gray indicator, "Connection Lost" overlay visible |
| **TC08** | Isolation | - | Other dashboard modules (ECG, BedMap) remain functional |

## Verification Steps
1.  **Firebase Emulator/Console**: Manually update weight in `readings/esp32_001` and observe UI.
2.  **Control Loop**: Toggle Buzzer in UI and check `controls` collection in Firestore.
3.  **Persistence**: Trigger LOW alert, acknowledge it, and verify entry in `alert_history`.
