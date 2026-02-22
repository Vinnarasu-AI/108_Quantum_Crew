// DeviceHealth.jsx — Hardware health panel with Loadcell / HX711 / MCU errors
import { useMemo } from "react";
import { detectHardwareErrors, fmtAgo, equipmentCondition } from "../utils/statusEngine";

export default function DeviceHealth({ devices }) {
    const devs = useMemo(() => Object.values(devices), [devices]);

    return (
        <div className="panel" id="deviceHealthSection">
            <div className="panel-header">
                <span className="ph-icon">📶</span>
                <h2 className="ph-title">Device Health</h2>
                <span className="ph-badge">{devs.length}</span>
            </div>
            <div className="panel-body" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {devs.length === 0
                    ? <div className="empty-msg">No devices registered</div>
                    : devs.map(d => <DeviceHealthCard key={d.deviceId} device={d} />)
                }
            </div>
        </div>
    );
}

function DeviceHealthCard({ device: d }) {
    const cond = equipmentCondition(d);
    const errors = detectHardwareErrors(d);
    const bat = d.battery_level ?? d.batteryLevel ?? 0;
    const batPct = Math.min(100, Math.max(0, bat));
    const dotCol = errors.length > 0 ? "var(--critical)" : d.isOffline ? "var(--warning)" : "var(--normal)";
    const bed = d.bedNumber ?? d.bed_number ?? "?";
    const name = (d.patientName ?? d.patient_name ?? "Unknown").split(" ")[0];
    const ago = fmtAgo(d.secAgo ?? 0);

    // Hardware signals
    const lc = d.loadcell_error;
    const hx = d.hx711_error;
    const mcu = d.mcu_error;

    return (
        <div className={`dh-item${errors.length > 0 ? " dh-error" : ""}`}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", width: "100%" }}>
                <div className="dh-dot" style={{ background: dotCol, marginTop: "3px" }}></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dh-name">Bed {bed} — {name}</div>

                    {/* Hardware status row */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                        <HwTag ok={!lc} ok_label="LOADCELL OK" err_label="LOADCELL ERR" />
                        <HwTag ok={!hx} ok_label="HX711 OK" err_label="HX711 ERR" />
                        <HwTag ok={!mcu} ok_label="MCU OK" err_label="MCU ERR" />
                    </div>

                    {/* Error descriptions */}
                    {errors.map(err => (
                        <div key={err.type} style={{ marginTop: "5px", padding: "5px 8px", borderRadius: "6px", background: "var(--critical-bg)", border: "1px solid var(--critical-border)" }}>
                            <div style={{ fontWeight: 700, color: "var(--critical)", fontSize: "10.5px" }}>⛔ {err.label}</div>
                            <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px" }}>{err.description}</div>
                        </div>
                    ))}

                    {/* Weight display */}
                    <div className="dh-meta" style={{ marginTop: "6px" }}>
                        {d.isOffline ? "⛔ Device Offline" : `✅ ${ago}`}
                        {d.weight != null && <span style={{ marginLeft: "10px" }}>⚖ {Number(d.weight).toFixed(1)}g</span>}
                    </div>

                    {/* Condition & Battery */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: cond.color }}>{cond.label}</span>
                        <span className="dh-bat" style={{ color: bat < 20 ? "var(--critical)" : "var(--text-secondary)" }}>{bat}% 🔋</span>
                    </div>
                    <div className="dh-bat-bar" style={{ height: "4px", marginTop: "4px" }}>
                        <div className="dh-bat-fill" style={{ width: `${batPct}%`, background: bat < 20 ? "var(--critical)" : "var(--primary)" }}></div>
                    </div>

                    {/* Connectivity */}
                    <div style={{ display: "flex", gap: "8px", marginTop: "6px", fontSize: "10px", color: "var(--text-secondary)" }}>
                        <span>WiFi: {d.wifi_rssi ? `${d.wifi_rssi} dBm` : "N/A"}</span>
                        <span>|</span>
                        <span>Uptime: {d.uptime_sec ? `${Math.floor(d.uptime_sec / 60)}m` : "N/A"}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function HwTag({ ok, ok_label, err_label }) {
    return (
        <span style={{
            padding: "2px 7px", borderRadius: "4px", fontSize: "9.5px", fontWeight: 700,
            background: ok ? "var(--normal-bg)" : "var(--critical-bg)",
            color: ok ? "var(--normal)" : "var(--critical)",
            border: ok ? "1px solid var(--normal-border)" : "1px solid var(--critical-border)",
        }}>
            {ok ? "✅ " : "❌ "}{ok ? ok_label : err_label}
        </span>
    );
}
