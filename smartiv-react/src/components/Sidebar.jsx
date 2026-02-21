// Sidebar.jsx — Navigation sidebar
import { useState } from "react";

const NAV_GROUPS = [
    {
        id: "critical", icon: "🔴", label: "Critical Monitoring",
        items: [
            { id: "monitor", icon: "📊", label: "Live ICU Monitor", view: "monitor" },
            { id: "alerts", icon: "🚨", label: "Critical Alerts", view: "alerts", badge: true },
            { id: "priority", icon: "🔥", label: "Priority Queue", view: "priority" },
        ],
    },
    {
        id: "iv", icon: "💉", label: "IV Operations",
        items: [
            { id: "fluid", icon: "💧", label: "IV Fluid Levels", view: "monitor" },
            { id: "flow", icon: "⚡", label: "Flow Rate Monitor", view: "monitor" },
        ],
    },
    {
        id: "ward", icon: "🏥", label: "Ward Management",
        items: [
            { id: "bedmap", icon: "🧭", label: "Bed Map", view: "bedmap" },
            { id: "patients", icon: "🧑‍⚕️", label: "Patient Details", view: "monitor" },
            { id: "nurses", icon: "👩‍⚕️", label: "Nurse Assignment", view: "nurses" },
        ],
    },
    {
        id: "device", icon: "📡", label: "Device & Hardware",
        items: [
            { id: "devhealth", icon: "📶", label: "Device Health", view: "devhealth" },
            { id: "battery", icon: "🔋", label: "Battery Status", view: "devhealth" },
            { id: "buzzer", icon: "🔊", label: "Buzzer Control", view: "buzzer" },
        ],
    },
    {
        id: "logs", icon: "📋", label: "Logs & Reports",
        items: [
            { id: "eventlog", icon: "🧾", label: "Auto Event Log", view: "monitor" },
            { id: "history", icon: "📜", label: "Alert History", view: "history" },
            { id: "export", icon: "⬇", label: "Export CSV", view: "export" },
        ],
    },
];

export default function Sidebar({ collapsed, onToggle, currentView, onViewChange, alertCount }) {
    const [openGroups, setOpenGroups] = useState({ critical: true });

    const toggleGroup = (id) => setOpenGroups(p => ({ ...p, [id]: !p[id] }));

    return (
        <nav className={`sidebar${collapsed ? " collapsed" : ""}`} aria-label="Main Navigation">
            <button className="sidebar-toggle" onClick={onToggle} title="Toggle sidebar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {collapsed
                        ? <polyline points="9 18 15 12 9 6" />
                        : <polyline points="15 18 9 12 15 6" />}
                </svg>
            </button>

            {NAV_GROUPS.map(group => (
                <div key={group.id} className={`nav-group${openGroups[group.id] ? " active" : ""}`}>
                    <div className="nav-group-header" onClick={() => toggleGroup(group.id)} role="button" tabIndex={0}>
                        <span className="ng-icon">{group.icon}</span>
                        <span className="ng-label">{group.label}</span>
                        <span className="ng-arr">▾</span>
                    </div>
                    <div className={`nav-items${openGroups[group.id] ? "" : " collapsed"}`}>
                        {group.items.map(item => (
                            <a
                                key={item.id}
                                className={`nav-item${currentView === item.view ? " active" : ""}`}
                                onClick={() => onViewChange(item.view)}
                            >
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                                {item.badge && alertCount > 0 && (
                                    <span className="nav-badge">{alertCount}</span>
                                )}
                            </a>
                        ))}
                    </div>
                </div>
            ))}
        </nav>
    );
}
