// ExportPanel.jsx — CSV export hub
import { exportAlertHistory, exportDeviceData, exportEventLog } from "../utils/csvExport";

export default function ExportPanel({ devices, alertHistory, eventLog }) {
    const devCount = Object.keys(devices).length;
    const histCount = alertHistory.length;
    const logCount = eventLog.length;

    const cards = [
        {
            icon: "📊", title: "Device Data Export",
            description: `Export live monitoring data for all ${devCount} device(s). Includes fluid level, flow rate, weight, equipment condition, hardware error flags, and timestamps.`,
            count: devCount, unit: "devices",
            action: () => exportDeviceData(devices),
            btnLabel: "⬇ Export Device Data",
        },
        {
            icon: "📜", title: "Alert History Export",
            description: `Export all ${histCount} stored alert records. Includes alert type, severity, assigned bed, patient, action taken, and resolved/unresolved state.`,
            count: histCount, unit: "alerts",
            action: () => exportAlertHistory(alertHistory),
            btnLabel: "⬇ Export Alert History",
        },
        {
            icon: "🧾", title: "Event Log Export",
            description: `Export the full event log with ${logCount} entries. Includes all system events, bed changes, and triggered conditions with timestamps.`,
            count: logCount, unit: "events",
            action: () => exportEventLog(eventLog),
            btnLabel: "⬇ Export Event Log",
        },
    ];

    return (
        <div className="panel" style={{ flex: 1 }}>
            <div className="panel-header">
                <span className="ph-icon">⬇</span>
                <h2 className="ph-title">Export CSV Data</h2>
            </div>
            <div className="panel-body" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", padding: "10px 14px", background: "var(--primary-pale)", borderRadius: "8px", border: "1px solid var(--primary-light)" }}>
                    ℹ All exports are browser-side CSV downloads. No server required. Data reflects current session state.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "14px" }}>
                    {cards.map(c => (
                        <div key={c.title} style={{ padding: "18px", background: "var(--bg-card)", borderRadius: "10px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div style={{ fontSize: "24px" }}>{c.icon}</div>
                            <div style={{ fontWeight: 700, fontSize: "13px" }}>{c.title}</div>
                            <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", flex: 1 }}>{c.description}</div>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--primary)" }}>
                                {c.count} {c.unit} available
                            </div>
                            <button
                                className="qa-btn"
                                onClick={c.action}
                                disabled={c.count === 0}
                                style={{ width: "100%", justifyContent: "center", opacity: c.count === 0 ? 0.4 : 1 }}
                            >{c.btnLabel}</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
