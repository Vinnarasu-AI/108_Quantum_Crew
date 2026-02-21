// NurseAssignment.jsx — Nurse-to-bed assignment panel
import { useState } from "react";

export default function NurseAssignment({ nurses, devices, onSaveNurse }) {
    const [editing, setEditing] = useState(null); // nurse object or null (new)
    const [formData, setFormData] = useState({});
    const devs = Object.values(devices);

    const openForm = (nurse = null) => {
        setEditing(nurse ?? { name: "", shift: "Morning", assignedBeds: [] });
        setFormData(nurse ?? { name: "", shift: "Morning", assignedBeds: [] });
    };

    const toggleBed = (bed) => {
        const beds = formData.assignedBeds ?? [];
        setFormData(p => ({
            ...p,
            assignedBeds: beds.includes(bed) ? beds.filter(b => b !== bed) : [...beds, bed],
        }));
    };

    const save = () => {
        if (!formData.name?.trim()) return;
        onSaveNurse({ ...formData });
        setEditing(null);
    };

    const shifts = ["Morning", "Evening", "Night"];
    const allBeds = [...new Set(devs.map(d => d.bedNumber ?? d.bed_number).filter(Boolean))];

    return (
        <div className="panel" style={{ flex: 1 }}>
            <div className="panel-header">
                <span className="ph-icon">👩‍⚕️</span>
                <h2 className="ph-title">Nurse Assignment</h2>
                <button className="qa-btn" onClick={() => openForm()} style={{ marginLeft: "auto", fontSize: "10px", padding: "3px 10px" }}>+ Assign Nurse</button>
            </div>
            <div className="panel-body" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>

                {/* Nurse list */}
                {nurses.length === 0
                    ? <div className="empty-msg">No nurses assigned yet</div>
                    : nurses.map(n => {
                        const activeBeds = allBeds.filter(b => (n.assignedBeds ?? []).includes(b));
                        const alertBeds = activeBeds.filter(b => {
                            const dev = devs.find(d => (d.bedNumber ?? d.bed_number) === b);
                            return dev && (dev.status === "critical" || dev.status === "warning");
                        });
                        return (
                            <div key={n.id} className="dh-item" style={{ cursor: "default" }}>
                                <div className="dh-dot" style={{ background: alertBeds.length > 0 ? "var(--critical)" : "var(--normal)" }}></div>
                                <div style={{ flex: 1 }}>
                                    <div className="dh-name">{n.name}</div>
                                    <div className="dh-meta" style={{ marginBottom: "6px" }}>
                                        {n.shift} Shift
                                        {alertBeds.length > 0 && <span style={{ marginLeft: "8px", color: "var(--critical)", fontWeight: 700 }}>⚠ {alertBeds.length} alert{alertBeds.length > 1 ? "s" : ""}</span>}
                                    </div>
                                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                        {(n.assignedBeds ?? []).map(b => {
                                            const dev = devs.find(d => (d.bedNumber ?? d.bed_number) === b);
                                            const color = dev?.status === "critical" ? "var(--critical)" : dev?.status === "warning" ? "var(--warning)" : "var(--normal)";
                                            return (
                                                <span key={b} style={{ padding: "2px 8px", borderRadius: "4px", background: "var(--primary-pale)", color, fontWeight: 700, fontSize: "10px", border: `1px solid ${color}` }}>
                                                    Bed {b}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                                <button className="al-btn" onClick={() => openForm(n)} style={{ alignSelf: "flex-start" }}>✏ Edit</button>
                            </div>
                        );
                    })
                }

                {/* Edit form */}
                {editing && (
                    <div style={{ background: "var(--bg-page)", borderRadius: "10px", padding: "14px", border: "1px solid var(--border-light)" }}>
                        <div style={{ fontWeight: 700, marginBottom: "10px", color: "var(--primary)" }}>
                            {editing.id ? "Edit Nurse" : "Assign New Nurse"}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <input
                                type="text" placeholder="Nurse name *"
                                value={formData.name ?? ""}
                                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                                style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-light)", fontSize: "12px" }}
                            />
                            <select
                                value={formData.shift ?? "Morning"}
                                onChange={e => setFormData(p => ({ ...p, shift: e.target.value }))}
                                style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-light)", fontSize: "12px" }}
                            >
                                {shifts.map(s => <option key={s}>{s}</option>)}
                            </select>
                            <div>
                                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Assign Beds</div>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    {allBeds.map(b => (
                                        <button
                                            key={b}
                                            onClick={() => toggleBed(b)}
                                            style={{
                                                padding: "3px 10px", borderRadius: "5px", cursor: "pointer", fontSize: "11px", fontWeight: 700,
                                                background: (formData.assignedBeds ?? []).includes(b) ? "var(--primary)" : "var(--bg-page)",
                                                color: (formData.assignedBeds ?? []).includes(b) ? "#fff" : "var(--text-secondary)",
                                                border: "1px solid var(--border-light)",
                                            }}
                                        >Bed {b}</button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <button className="qa-btn" onClick={save}>💾 Save</button>
                                <button className="qa-btn" onClick={() => setEditing(null)} style={{ background: "none", color: "var(--text-secondary)", borderColor: "var(--border-light)" }}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
