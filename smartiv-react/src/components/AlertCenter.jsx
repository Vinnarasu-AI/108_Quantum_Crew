// AlertCenter.jsx — Active alert panel with ack/snooze/escalate
const ICON_MAP = {
    NEAR_EMPTY_CRIT: "🚨", NEAR_EMPTY: "🔴", AIR_BUBBLE: "🫧",
    OCCLUSION: "🔧", FLOW_ERR: "⚡", OFFLINE: "📡", LOW_BATTERY: "🔋",
    LOADCELL_ERROR: "⚖", HX711_ERROR: "🔌", MCU_ERROR: "💻",
};

export default function AlertCenter({ alerts, onAck, onSnooze, onEscalate, onAckAll }) {
    const active = alerts.filter(a => !a.acknowledged);

    return (
        <div className="panel" id="alertCenter">
            <div className="panel-header">
                <span className="ph-icon">🚨</span>
                <h2 className="ph-title">Alert Center</h2>
                <span className="ph-badge red" id="alertCenterBadge">{active.length}</span>
                {active.length > 0 && (
                    <button onClick={onAckAll} style={{ marginLeft: "auto", background: "none", border: "1px solid var(--normal)", color: "var(--normal)", borderRadius: "6px", fontSize: "10px", padding: "2px 8px", cursor: "pointer" }}>
                        ✅ Ack All
                    </button>
                )}
            </div>
            <div className="alert-list" id="alertList">
                {active.length === 0
                    ? <div className="empty-msg">✅ No active alerts — All patients stable</div>
                    : active.map(a => {
                        const cls = a.severity === "critical" ? "al-crit" : "al-warn";
                        const ts = new Date(a.time).toLocaleTimeString("en-IN", { hour12: false });
                        return (
                            <div key={a.id} className={`al-item ${cls}`} role="alert">
                                <div className="al-top">
                                    <span className="al-ico">{ICON_MAP[a.type] ?? "⚠"}</span>
                                    <div className="al-txt">
                                        <div className="al-title">
                                            {a.message}
                                            {(a.count ?? 1) > 1 && <span className="al-grp">×{a.count}</span>}
                                        </div>
                                        <div className="al-meta">Bed {a.bed} · {ts}</div>
                                        {a.action && <div className="al-action">→ {a.action}</div>}
                                    </div>
                                </div>
                                <div className="al-btns">
                                    <button className="al-btn ab-ack" onClick={() => onAck(a.id)}>✅ Ack</button>
                                    <button className="al-btn" onClick={() => onSnooze(a.id)}>😴 Snooze</button>
                                    <button className="al-btn ab-esc" onClick={() => onEscalate(a.id, a.deviceId)}>⬆ Escalate</button>
                                </div>
                            </div>
                        );
                    })
                }
            </div>
        </div>
    );
}
