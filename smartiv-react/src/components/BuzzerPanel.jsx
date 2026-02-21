// BuzzerPanel.jsx — Per-device buzzer control
export default function BuzzerPanel({ devices, onSendCommand, onClose }) {
    const devs = Object.values(devices);

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ display: "flex" }}>
            <div className="modal-box" style={{ maxWidth: "540px", width: "92%" }}>
                <div className="modal-header">
                    <span>🔊 Buzzer Control Panel (ESP32)</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px" }}>
                    {devs.length === 0
                        ? <div className="empty-msg">No devices registered</div>
                        : devs.map(d => {
                            const bed = d.bedNumber ?? d.bed_number ?? "?";
                            const name = (d.patientName ?? d.patient_name ?? "Unknown").split(" ")[0];
                            return (
                                <div key={d.deviceId} className="dh-item">
                                    <div style={{ flex: 1 }}>
                                        <div className="dh-name">Bed {bed} · {name}</div>
                                        <div className="dh-meta">{d.deviceId} · {d.isOffline ? "⛔ OFFLINE" : "✅ Online"}</div>
                                    </div>
                                    <div style={{ display: "flex", gap: "6px" }}>
                                        <button className="al-btn" onClick={() => onSendCommand(d.deviceId, "BUZZER_ON")}>🔊 ON</button>
                                        <button className="al-btn" onClick={() => onSendCommand(d.deviceId, "BUZZER_OFF")}>🔕 OFF</button>
                                        <button className="al-btn ab-esc" onClick={() => onSendCommand(d.deviceId, "ESCALATE")}>⬆ Esc</button>
                                    </div>
                                </div>
                            );
                        })
                    }
                </div>
            </div>
        </div>
    );
}
