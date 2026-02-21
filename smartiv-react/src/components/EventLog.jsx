// EventLog.jsx — Auto event log table
import { fmtTS } from "../utils/statusEngine";
import { exportEventLog } from "../utils/csvExport";

export default function EventLog({ logs }) {
    return (
        <div className="panel" id="eventLogSection">
            <div className="panel-header">
                <span className="ph-icon">🧾</span>
                <h2 className="ph-title">Auto Event Log</h2>
                <span className="ph-badge" id="logCount">{logs.length} events</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                    <button
                        className="qa-btn"
                        onClick={() => exportEventLog(logs)}
                        style={{ fontSize: "10px", padding: "3px 10px" }}
                    >⬇ Export CSV</button>
                    <button
                        className="qa-btn"
                        onClick={() => {/* clear handled in parent */ }}
                        style={{ fontSize: "10px", padding: "3px 10px", background: "none", color: "var(--warning)", borderColor: "var(--warning-border)" }}
                    >🗑 Clear</button>
                </div>
            </div>
            <div className="panel-body" style={{ padding: "0", overflowX: "auto" }}>
                <table className="log-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Bed</th>
                            <th>Severity</th>
                            <th>Event</th>
                        </tr>
                    </thead>
                    <tbody id="logBody">
                        {logs.length === 0
                            ? <tr><td colSpan={4} className="empty-msg" style={{ textAlign: "center", padding: "20px" }}>No events recorded</td></tr>
                            : logs.slice(0, 100).map((e, i) => {
                                const sc = e.severity === "critical" ? "sv-critical" : e.severity === "warning" ? "sv-warning" : "sv-ok";
                                const sl = e.severity === "critical" ? "Critical" : e.severity === "warning" ? "Warning" : "Normal";
                                return (
                                    <tr key={i}>
                                        <td className="ll-ts">{fmtTS(e.timestamp ?? Date.now())}</td>
                                        <td className="ll-bed">Bed {e.bed ?? "SYS"}</td>
                                        <td><span className={`ll-sev-badge ${sc}`}>{sl}</span></td>
                                        <td style={{ color: "var(--text-secondary)", fontSize: "11.5px" }}>{e.message ?? e.msg ?? "Event"}</td>
                                    </tr>
                                );
                            })
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
}
