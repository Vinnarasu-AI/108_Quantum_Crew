// AddDeviceModal.jsx — Register new ESP32 device
import { useState } from "react";

const IV_TYPES = [
    "Normal Saline", "Dextrose 5%", "Ringer's Lactate",
    "Dextrose Saline", "Antibiotic Infusion", "Blood Transfusion",
];

export default function AddDeviceModal({ onClose, onAdd }) {
    const [form, setForm] = useState({
        deviceId: "", bedNumber: "", patientName: "",
        patientAge: "", ivType: "Normal Saline",
        fluidVolume: 500, targetFlowRate: 100,
    });
    const [error, setError] = useState("");

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const submit = () => {
        if (!form.deviceId.trim() || !form.bedNumber.trim() || !form.patientName.trim()) {
            setError("Device ID, Bed Number and Patient Name are required.");
            return;
        }
        onAdd({
            deviceId: form.deviceId.trim(),
            bedNumber: form.bedNumber.trim(),
            patientName: form.patientName.trim(),
            patientAge: Number(form.patientAge) || 0,
            ivType: form.ivType,
            fluid_level: 100,
            fluid_ml: Number(form.fluidVolume),
            flow_rate: Number(form.targetFlowRate),
            target_flow: Number(form.targetFlowRate),
            pressure: 85,
            weight: Number(form.fluidVolume),
            air_bubble: false,
            battery_level: 90,
            loadcell_error: false,
            hx711_error: false,
            mcu_error: false,
            deviceOnline: true,
            timestamp: Date.now(),
            alarmStatus: "normal",
        });
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ display: "flex" }}>
            <div className="modal-box" style={{ maxWidth: "480px", width: "92%" }}>
                <div className="modal-header">
                    <span>➕ Register IV Device</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    {error && <div style={{ padding: "8px 12px", background: "var(--critical-bg)", color: "var(--critical)", borderRadius: "6px", fontSize: "11.5px", border: "1px solid var(--critical-border)" }}>{error}</div>}

                    <Field label="Device ID (ESP32 MAC / ID) *" value={form.deviceId} onChange={v => set("deviceId", v)} placeholder="e.g. dev_009" />
                    <Field label="Bed Number *" value={form.bedNumber} onChange={v => set("bedNumber", v)} placeholder="e.g. 6" />
                    <Field label="Patient Name *" value={form.patientName} onChange={v => set("patientName", v)} placeholder="First Last" />
                    <Field label="Patient Age" value={form.patientAge} onChange={v => set("patientAge", v)} placeholder="e.g. 45" type="number" />

                    <div>
                        <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>IV Fluid Type</label>
                        <select value={form.ivType} onChange={e => set("ivType", e.target.value)}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: "7px", border: "1px solid var(--border-light)", fontSize: "12px" }}>
                            {IV_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>

                    <Field label="Total IV Volume (mL)" value={form.fluidVolume} onChange={v => set("fluidVolume", v)} type="number" placeholder="500" />
                    <Field label="Target Flow Rate (mL/hr)" value={form.targetFlowRate} onChange={v => set("targetFlowRate", v)} type="number" placeholder="100" />

                    <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                        <button className="qa-btn" onClick={submit} style={{ flex: 1 }}>✅ Register Device</button>
                        <button className="qa-btn" onClick={onClose} style={{ flex: 1, background: "none", color: "var(--text-secondary)", borderColor: "var(--border-light)" }}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
    return (
        <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
            <input
                type={type} value={value} onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: "7px", border: "1px solid var(--border-light)", fontSize: "12px", outline: "none" }}
            />
        </div>
    );
}
