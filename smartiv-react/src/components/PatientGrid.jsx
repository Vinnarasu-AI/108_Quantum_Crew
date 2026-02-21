// PatientGrid.jsx — Main patient card grid with filters
import { useMemo, useState } from "react";
import { priorityScore, fmtAgo, FLOW_THR, PRESSURE_LIM } from "../utils/statusEngine";

const FILTERS = [
    { key: "all", label: "All" },
    { key: "critical", label: "🔴 Critical" },
    { key: "warning", label: "🟡 Warning" },
    { key: "normal", label: "🟢 Normal" },
    { key: "offline", label: "⚫ Offline" },
];

const ST_LABEL = { normal: "✅ Normal", warning: "⚠ Warning", critical: "🔴 CRITICAL", offline: "⚫ Offline" };
const ST_CLASS = { normal: "s-normal", warning: "s-warning", critical: "s-critical", offline: "s-offline" };

export default function PatientGrid({ devices, searchQuery, onSelectDevice }) {
    const [filter, setFilter] = useState("all");
    const [listMode, setListMode] = useState(false);

    const devs = useMemo(() => {
        let list = Object.values(devices);
        if (filter !== "all") list = list.filter(d => d.status === filter);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(d =>
                (d.patientName ?? d.patient_name ?? "").toLowerCase().includes(q) ||
                String(d.bedNumber ?? d.bed_number ?? "").includes(q) ||
                (d.ivType ?? d.iv_type ?? "").toLowerCase().includes(q)
            );
        }
        return list.sort((a, b) => priorityScore(b) - priorityScore(a));
    }, [devices, filter, searchQuery]);

    return (
        <div className="center-col">
            {/* Toolbar */}
            <div className="ctoolbar" role="toolbar">
                <div className="filter-group">
                    {FILTERS.map(f => (
                        <button
                            key={f.key}
                            className={`fpill${filter === f.key ? " active" : ""}`}
                            onClick={() => setFilter(f.key)}
                        >{f.label}</button>
                    ))}
                </div>
                <div className="ctoolbar-right">
                    <button className="ctb-btn" onClick={() => setListMode(false)}>⊞ Grid</button>
                    <button className="ctb-btn" onClick={() => setListMode(true)}>≡ List</button>
                </div>
            </div>

            {/* Grid */}
            <div className="patient-grid" style={listMode ? { gridTemplateColumns: "1fr" } : {}}>
                {devs.length === 0
                    ? <div className="empty-msg" style={{ gridColumn: "1/-1", padding: "48px" }}>
                        <div style={{ fontSize: "32px", marginBottom: "8px" }}>🔍</div>
                        No matching patients found
                    </div>
                    : devs.map(d => <PatientCard key={d.deviceId} device={d} onClick={() => onSelectDevice(d.deviceId)} listMode={listMode} />)
                }
            </div>
        </div>
    );
}

function PatientCard({ device: d, onClick, listMode }) {
    const fp = d.fluid_level ?? d.fluidPercentage ?? 0;
    const fr = d.flow_rate ?? d.flowRate ?? 0;
    const tfr = d.target_flow ?? d.targetFlowRate ?? 100;
    const bat = d.battery_level ?? d.batteryLevel ?? 0;
    const ml = d.fluid_ml ?? d.fluidRemainingML ?? 0;
    const ab = d.air_bubble ?? d.airBubbleDetected ?? false;
    const hw = d.loadcell_error || d.hx711_error || d.mcu_error;

    const barCls = fp < 5 ? "crit" : fp < 15 ? "low" : "";
    const flowCls = Math.abs(fr - tfr) > FLOW_THR ? "bad" : "good";
    const batCls = bat < 20 ? "bad" : bat < 40 ? "warn" : "good";
    const estTime = fr > 0 ? `${Math.floor(ml / fr * 60)} min` : "N/A";
    const ago = fmtAgo(d.secAgo ?? 0);
    const bed = d.bedNumber ?? d.bed_number ?? "?";
    const name = d.patientName ?? d.patient_name ?? "Unknown";
    const ivType = d.ivType ?? d.iv_type ?? "IV Fluid";

    return (
        <article
            className={`patient-card s-${d.status}`}
            onClick={onClick}
            role="button" tabIndex={0}
            aria-label={`Bed ${bed} — ${name} — ${d.status}`}
        >
            <div className="ch">
                <div className="ch-left">
                    <div className="ch-bed">BED {bed}</div>
                    <div className="ch-name">{name}</div>
                </div>
                <div className="ch-right">
                    <span className={`ch-status ${ST_CLASS[d.status] ?? ""}`}>{ST_LABEL[d.status] ?? "—"}</span>
                    <span className="ch-ivtype">{ivType}</span>
                </div>
            </div>

            {/* Hardware error badge */}
            {hw && (
                <div style={{ padding: "0 14px 8px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {d.loadcell_error && <span className="cfoot-icon active" style={{ fontSize: "10px" }}>⚠ LOADCELL ERR</span>}
                    {d.hx711_error && <span className="cfoot-icon active" style={{ fontSize: "10px" }}>⚠ HX711 ERR</span>}
                    {d.mcu_error && <span className="cfoot-icon active" style={{ fontSize: "10px" }}>⚠ MCU ERR</span>}
                </div>
            )}

            <div className="cf">
                <div className="cf-row">
                    <span>Fluid Level</span>
                    <span className="cf-pct">{fp.toFixed(0)}% &nbsp;·&nbsp; {ml.toFixed(0)} mL</span>
                </div>
                <div className="cf-bar-bg" role="progressbar" aria-valuenow={fp.toFixed(0)} aria-valuemin="0" aria-valuemax="100">
                    <div className={`cf-bar-fill ${barCls}`} style={{ width: `${Math.min(100, Math.max(0, fp)).toFixed(1)}%` }}></div>
                </div>
            </div>

            <div className="cm">
                <div className="cm-cell"><div className="cm-l">Flow</div><div className={`cm-v ${flowCls}`}>{fr}<small style={{ fontSize: "8px", fontWeight: "400" }}> mL/hr</small></div></div>
                <div className="cm-cell"><div className="cm-l">Target</div><div className="cm-v">{tfr}<small style={{ fontSize: "8px", fontWeight: "400" }}> mL/hr</small></div></div>
                <div className="cm-cell"><div className="cm-l">Battery</div><div className={`cm-v ${batCls}`}>{bat}%</div></div>
                <div className="cm-cell"><div className="cm-l">Est. Left</div><div className="cm-v" style={{ fontSize: "11px" }}>{estTime}</div></div>
            </div>

            <div className="cfoot">
                <div className="cfoot-icons">
                    <span className={`cfoot-icon ${ab ? "active" : "ok"}`}>{ab ? "🫧 AIR" : "🫧 OK"}</span>
                    <span className={`cfoot-icon ${d.isOffline ? "active" : "ok"}`}>{d.isOffline ? "📡 OFF" : "📡 ON"}</span>
                    {!isNaN(d.weight) && d.weight != null && <span className="cfoot-icon ok">⚖ {Number(d.weight).toFixed(0)}g</span>}
                </div>
                <span className="cfoot-upd">{ago}</span>
            </div>
        </article>
    );
}
