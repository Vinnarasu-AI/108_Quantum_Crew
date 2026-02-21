// PatientModal.jsx — Patient detail drawer/modal
import { FLOW_THR, PRESSURE_LIM, detectHardwareErrors, fmtAgo } from "../utils/statusEngine";

export default function PatientModal({ device: d, onClose, onSendCommand }) {
    if (!d) return null;

    const fp = d.fluid_level ?? d.fluidPercentage ?? 0;
    const fr = d.flow_rate ?? d.flowRate ?? 0;
    const tfr = d.target_flow ?? d.targetFlowRate ?? 100;
    const bat = d.battery_level ?? d.batteryLevel ?? 0;
    const pv = d.pressure ?? d.pressureValue ?? 0;
    const ab = d.air_bubble ?? d.airBubbleDetected ?? false;
    const ml = d.fluid_ml ?? d.fluidRemainingML ?? 0;
    const bed = d.bedNumber ?? d.bed_number ?? "?";
    const name = d.patientName ?? d.patient_name ?? "Unknown";
    const ivT = d.ivType ?? d.iv_type ?? "IV Fluid";
    const ago = fmtAgo(d.secAgo ?? 0);

    const delta = fr - tfr;
    const bCol = bat < 20 ? "var(--critical)" : bat < 40 ? "var(--warning)" : "var(--normal)";
    const fCol = Math.abs(delta) > FLOW_THR ? "var(--critical)" : "var(--primary)";
    const fpCol = fp < 10 ? "var(--critical)" : fp < 25 ? "var(--warning)" : "var(--primary)";
    const hwErrs = detectHardwareErrors(d);
    const maxRate = Math.max(tfr, fr, 10);

    const stStyles = {
        normal: { background: "var(--normal-bg)", color: "var(--normal)", border: "1px solid var(--normal-border)" },
        warning: { background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" },
        critical: { background: "var(--critical-bg)", color: "var(--critical)", border: "1px solid var(--critical-border)" },
        offline: { background: "var(--offline-bg)", color: "var(--offline)", border: "1px solid var(--offline-border)" },
    };

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ display: "flex" }}>
            <div className="modal-box" style={{ maxWidth: "640px", width: "94%" }}>
                {/* Header */}
                <div className="modal-header">
                    <div>
                        <span className="pm-bed" id="pmBed">Bed {bed}</span>
                        <span style={{ margin: "0 8px", color: "var(--text-muted)" }}>·</span>
                        <span className="pm-name" id="pmName">{name}</span>
                        <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--text-secondary)" }}>{ivT}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span style={{ ...stStyles[d.status], padding: "2px 10px", borderRadius: "6px", fontSize: "10.5px", fontWeight: 700 }}>
                            {(d.status ?? "—").toUpperCase()}
                        </span>
                        <button className="modal-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="modal-body" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>

                    {/* Hardware errors */}
                    {hwErrs.length > 0 && (
                        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "var(--critical-bg)", border: "1px solid var(--critical-border)" }}>
                            <div style={{ fontWeight: 700, color: "var(--critical)", marginBottom: "6px" }}>⛔ Hardware Errors Detected</div>
                            {hwErrs.map(e => (
                                <div key={e.type} style={{ fontSize: "11px", color: "var(--critical)", marginBottom: "3px" }}>• {e.label}: {e.description}</div>
                            ))}
                        </div>
                    )}

                    {/* Top row — gauge + flow */}
                    <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
                        {/* Fluid Gauge */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", minWidth: "120px" }}>
                            <div className="gauge-ring" style={{ background: `conic-gradient(${fpCol} ${fp.toFixed(1)}%, var(--border-light) 0)` }}>
                                <div className="gauge-inner">
                                    <div className="gauge-pct">{fp.toFixed(0)}%</div>
                                    <div className="gauge-ml">{ml.toFixed(0)} mL</div>
                                </div>
                            </div>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>Fluid Level</div>
                        </div>

                        {/* Flow Rate */}
                        <div style={{ flex: 1, minWidth: "200px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-primary)" }}>
                                    {fr} <small style={{ fontSize: "9px", fontWeight: 400 }}>mL/hr actual</small>
                                </span>
                                <span style={{ fontSize: "11.5px", color: fCol, fontWeight: 700 }}>
                                    {delta > 0 ? "+" : ""}{delta.toFixed(0)} mL/hr
                                </span>
                            </div>
                            <div className="flow-bar-bg">
                                <div className="flow-bar-fill" style={{ width: `${(fr / maxRate * 100).toFixed(1)}%`, background: fCol }}></div>
                                <div className="target-line" style={{ left: `${(tfr / maxRate * 100).toFixed(1)}%` }} title="Target"></div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "10.5px", color: "var(--text-muted)" }}>
                                <span>Target: {tfr} mL/hr</span>
                                <span>Est. Left: {fr > 0 ? `${Math.floor(ml / fr * 60)} min` : "N/A"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Status badges row */}
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {/* Air Bubble */}
                        <div className="sb-badge" style={{ ...(ab ? { background: "var(--critical-bg)", borderColor: "var(--critical-border)" } : { background: "var(--normal-bg)", borderColor: "var(--normal-border)" }), flex: 1, minWidth: "130px" }}>
                            <span className="sb-icon">🫧</span>
                            <span className="sb-txt" style={{ color: ab ? "var(--critical)" : "var(--normal)" }}>
                                {ab ? "AIR BUBBLE DETECTED!" : "No air bubble — Clear"}
                            </span>
                        </div>

                        {/* Occlusion */}
                        <div className="sb-badge" style={{ ...(pv > PRESSURE_LIM ? { background: "var(--critical-bg)", borderColor: "var(--critical-border)" } : { background: "var(--normal-bg)", borderColor: "var(--normal-border)" }), flex: 1, minWidth: "130px" }}>
                            <span className="sb-icon">🔧</span>
                            <div>
                                <span className="sb-txt" style={{ color: pv > PRESSURE_LIM ? "var(--critical)" : "var(--normal)" }}>
                                    {pv > PRESSURE_LIM ? "OCCLUSION DETECTED" : "Pressure normal"}
                                </span>
                                <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{pv} mmHg</div>
                            </div>
                        </div>
                    </div>

                    {/* Hardware sensors */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "8px" }}>
                        <InfoRow label="Weight" value={d.weight != null ? `${Number(d.weight).toFixed(1)}g` : "N/A"} />
                        <InfoRow label="Battery" value={`${bat}%`} color={bCol} />
                        <InfoRow label="WiFi RSSI" value={d.wifi_rssi ? `${d.wifi_rssi} dBm` : "N/A"} />
                        <InfoRow label="Uptime" value={d.uptime_sec ? `${Math.floor(d.uptime_sec / 60)}m` : "N/A"} />
                        <InfoRow label="Connectivity" value={d.isOffline ? "OFFLINE" : "Online"} color={d.isOffline ? "var(--critical)" : "var(--normal)"} />
                        <InfoRow label="Last Update" value={ago} />
                        <InfoRow label="Device ID" value={d.deviceId} mono />
                        <HwRow label="Loadcell" ok={!d.loadcell_error} />
                        <HwRow label="HX711" ok={!d.hx711_error} />
                        <HwRow label="MCU" ok={!d.mcu_error} />
                    </div>

                    {/* Battery bar */}
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px" }}>
                            <span>Battery</span>
                            <span style={{ color: bCol, fontWeight: 700 }}>{bat}%</span>
                        </div>
                        <div className="dh-bat-bar" style={{ height: "8px", borderRadius: "4px" }}>
                            <div className="dh-bat-fill" style={{ width: `${bat}%`, background: bCol, borderRadius: "4px" }}></div>
                        </div>
                    </div>

                    {/* Commands */}
                    <div>
                        <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px" }}>ESP32 Commands</div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {["BUZZER_ON", "BUZZER_OFF", "PAUSE", "RESUME", "RESET", "ESCALATE"].map(cmd => (
                                <button key={cmd} className="al-btn" onClick={() => onSendCommand(d.deviceId, cmd)} style={{ fontSize: "10.5px" }}>
                                    {cmd}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value, color, mono }) {
    return (
        <div style={{ padding: "6px 10px", background: "var(--bg-page)", borderRadius: "7px", border: "1px solid var(--border-light)" }}>
            <div style={{ fontSize: "9.5px", color: "var(--text-muted)", marginBottom: "2px" }}>{label}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: color ?? "var(--text-primary)", fontFamily: mono ? "var(--font-mono)" : "inherit" }}>
                {value}
            </div>
        </div>
    );
}

function HwRow({ label, ok }) {
    return (
        <div style={{ padding: "6px 10px", borderRadius: "7px", background: ok ? "var(--normal-bg)" : "var(--critical-bg)", border: `1px solid ${ok ? "var(--normal-border)" : "var(--critical-border)"}` }}>
            <div style={{ fontSize: "9.5px", color: "var(--text-muted)", marginBottom: "2px" }}>{label}</div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: ok ? "var(--normal)" : "var(--critical)" }}>
                {ok ? "✅ OK" : "❌ ERROR"}
            </div>
        </div>
    );
}
