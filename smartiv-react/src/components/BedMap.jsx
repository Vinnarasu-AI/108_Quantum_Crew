// BedMap.jsx — Realtime bed status grid
import { useMemo } from "react";

const STATUS_ICON = { normal: "🟢", warning: "🟡", critical: "🔴", offline: "⚫" };

export default function BedMap({ devices, onSelectDevice }) {
    const devs = Object.values(devices);

    return (
        <div className="panel" id="bedMapSection">
            <div className="panel-header">
                <span className="ph-icon">🧭</span>
                <h2 className="ph-title">Bed Map</h2>
                <span className="ph-badge" style={{ background: "var(--primary)" }}>{devs.length}</span>
            </div>
            <div className="panel-body" style={{ padding: "12px" }}>
                {devs.length === 0
                    ? <div className="empty-msg">No beds registered</div>
                    : <div className="bed-map">
                        {devs.map(d => (
                            <div
                                key={d.deviceId || d.bedNumber || d.bed_number}
                                className={`bm-cell ${d.status}`}
                                onClick={() => onSelectDevice(d.deviceId)}
                                role="button" tabIndex={0}
                                title={`${d.patientName ?? d.patient_name ?? "Unknown"} — ${d.status}`}
                                aria-label={`Bed ${d.bedNumber ?? d.bed_number} ${d.patientName}`}
                            >
                                <span className="bm-icon">{STATUS_ICON[d.status] ?? "⚫"}</span>
                                <span className="bm-num">B{d.bedNumber ?? d.bed_number ?? "?"}</span>
                            </div>
                        ))}
                    </div>
                }
            </div>
        </div>
    );
}
