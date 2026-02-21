// AlertHistory.jsx — Full alert history with filter and CSV export
import { useState } from "react";
import { fmtTS } from "../utils/statusEngine";
import { exportAlertHistory } from "../utils/csvExport";

const FILTERS = ["All", "Critical", "Warning", "Resolved", "Unresolved"];

export default function AlertHistory({ alertHistory }) {
    const [filter, setFilter] = useState("All");
    const [search, setSearch] = useState("");

    const filtered = alertHistory.filter(a => {
        if (filter === "Critical" && a.severity !== "critical") return false;
        if (filter === "Warning" && a.severity !== "warning") return false;
        if (filter === "Resolved" && !a.acknowledged) return false;
        if (filter === "Unresolved" && a.acknowledged) return false;
        if (search && !(a.message ?? "").toLowerCase().includes(search.toLowerCase()) &&
            !String(a.bed ?? "").includes(search)) return false;
        return true;
    });

    return (
        <div className="panel" style={{ width: "100%", flex: 1 }}>
            <div className="panel-header">
                <span className="ph-icon">📜</span>
                <h2 className="ph-title">Alert History</h2>
                <span className="ph-badge">{filtered.length}</span>
                <button
                    className="qa-btn"
                    onClick={() => exportAlertHistory(alertHistory)}
                    style={{ marginLeft: "auto", fontSize: "10px", padding: "3px 10px" }}
                >⬇ Export CSV</button>
            </div>
            <div className="panel-body" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Filter row */}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                    {FILTERS.map(f => (
                        <button key={f} className={`fpill${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
                    ))}
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search…"
                        style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--border-light)", fontSize: "11px", outline: "none", width: "140px" }}
                    />
                </div>

                {/* Table */}
                <div style={{ overflowX: "auto" }}>
                    <table className="log-table">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Bed</th>
                                <th>Patient</th>
                                <th>Type</th>
                                <th>Severity</th>
                                <th>Message</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0
                                ? <tr><td colSpan={7} className="empty-msg" style={{ textAlign: "center", padding: "24px" }}>No alert history found</td></tr>
                                : filtered.map((a, i) => {
                                    const sc = a.severity === "critical" ? "sv-critical" : a.severity === "warning" ? "sv-warning" : "sv-ok";
                                    return (
                                        <tr key={a.id ?? i}>
                                            <td className="ll-ts" style={{ whiteSpace: "nowrap" }}>{fmtTS(a.time ?? a.timestamp ?? Date.now())}</td>
                                            <td className="ll-bed">Bed {a.bed ?? "?"}</td>
                                            <td style={{ fontSize: "11px" }}>{a.patient ?? "—"}</td>
                                            <td style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{(a.type ?? "").replace(/_/g, " ")}</td>
                                            <td><span className={`ll-sev-badge ${sc}`}>{a.severity ?? "—"}</span></td>
                                            <td style={{ fontSize: "11px", color: "var(--text-secondary)", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.message ?? "—"}</td>
                                            <td>
                                                <span style={{
                                                    padding: "2px 7px", borderRadius: "4px", fontSize: "9.5px", fontWeight: 700,
                                                    background: a.acknowledged ? "var(--normal-bg)" : "var(--warning-bg)",
                                                    color: a.acknowledged ? "var(--normal)" : "var(--warning)",
                                                    border: a.acknowledged ? "1px solid var(--normal-border)" : "1px solid var(--warning-border)",
                                                }}>
                                                    {a.acknowledged ? "Resolved" : "Active"}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
