// PriorityQueue.jsx — Priority-sorted patient list
import { useMemo } from "react";
import { priorityScore, priorityReason } from "../utils/statusEngine";

const MEDALS = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

export default function PriorityQueue({ devices, onSelectDevice }) {
    const ranked = useMemo(() => (
        Object.values(devices)
            .map(d => ({ d, score: priorityScore(d) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
    ), [devices]);

    return (
        <div className="panel" id="priorityPanel">
            <div className="panel-header">
                <span className="ph-icon">🔥</span>
                <h2 className="ph-title">Priority Queue</h2>
                <span className="ph-badge red">{ranked.length}</span>
            </div>
            <div className="panel-body">
                <div className="priority-list">
                    {ranked.length === 0
                        ? <div className="empty-msg">All patients stable ✅</div>
                        : ranked.map(({ d }, i) => {
                            const sev = d.status === "critical" ? "crit" : "warn";
                            const bed = d.bedNumber ?? d.bed_number ?? "?";
                            const name = (d.patientName ?? d.patient_name ?? "Unknown").split(" ")[0];
                            return (
                                <div
                                    key={d.deviceId}
                                    className={`pq-item pq-${sev}`}
                                    onClick={() => onSelectDevice(d.deviceId)}
                                    role="button" tabIndex={0}
                                >
                                    <span className="pq-rank">{MEDALS[i] ?? ""}</span>
                                    <div className="pq-info">
                                        <div className="pq-bed">Bed {bed} · {name}</div>
                                        <div className="pq-why">{priorityReason(d)}</div>
                                    </div>
                                    <span className={`pq-sev s-${sev}`}>{sev === "crit" ? "CRIT" : "WARN"}</span>
                                </div>
                            );
                        })
                    }
                </div>
            </div>
        </div>
    );
}
