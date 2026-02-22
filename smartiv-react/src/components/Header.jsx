// Header.jsx — Top navigation bar
import { useEffect, useState } from "react";

export default function Header({ devices, alerts, fbStatus, soundOn, onToggleSound, onOpenAddDevice, onRefresh, onTestAlarm, onScrollAlerts, onSearch }) {
    const [clock, setClock] = useState("--:--:--");
    const [shift, setShift] = useState("");
    const devs = Object.values(devices);
    const total = devs.length;
    const critical = devs.filter(d => d.status === "critical").length;
    const warning = devs.filter(d => d.status === "warning").length;
    const normal = devs.filter(d => d.status === "normal").length;
    const activeAlerts = alerts.filter(a => !a.acknowledged).length;

    useEffect(() => {
        function tick() {
            const now = new Date();
            setClock(now.toLocaleTimeString("en-IN", { hour12: false }));
            const h = now.getHours();
            if (h >= 6 && h < 14) setShift("🌅 Morning Shift · Nurse: R. Sharma");
            else if (h >= 14 && h < 22) setShift("☀ Evening Shift · Nurse: P. Kumar");
            else setShift("🌙 Night Shift · Nurse: S. Mehta");
        }
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, []);

    const fbLabel = fbStatus === "live" ? "Cloud Sync Active" : "Connecting…";

    return (
        <header className="topbar" role="banner">
            {/* Zone 1 — Logo + Stats */}
            <div className="tz1">
                <div className="logo-block">
                    <div className="logo-icon-wrap">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                            <circle cx="12" cy="12" r="3" fill="#fff" />
                        </svg>
                    </div>
                    <div>
                        <div className="logo-name">SmartIV <span className="logo-icu">ICU</span></div>
                        <div className="logo-ver">v3.0 · IoT Monitor</div>
                    </div>
                </div>
                <div className="stat-row">
                    <div className="stat-chip total"><span className="sc-num">{total}</span><span className="sc-lbl">Total</span></div>
                    <div className="stat-chip crit"><span className="sc-bg-dot"></span><span className="sc-num">{critical}</span><span className="sc-lbl">Critical</span></div>
                    <div className="stat-chip warn"><span className="sc-num">{warning}</span><span className="sc-lbl">Warning</span></div>
                    <div className="stat-chip ok"><span className="sc-num">{normal}</span><span className="sc-lbl">Normal</span></div>
                </div>
            </div>

            {/* Zone 2 — System Status */}
            <div className="tz2" role="status">
                <div className="sys-indicator">
                    <span className="pulse-dot green"></span>
                    <span>System Online</span>
                </div>
                <div className="tz2-divider"></div>
                <div className="hosp-name">City General Hospital · ICU Ward B</div>
                <div className="tz2-divider"></div>
                <div className="shift-tag" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{shift}</div>
                <div className="tz2-divider"></div>
                <div className="live-clock">{clock}</div>
                <div className="tz2-divider"></div>
                <div className="fb-pill">
                    <span className={`fb-dot ${fbStatus === "live" ? "live" : fbStatus === "demo" ? "demo" : "off"}`}></span>
                    <span>{fbLabel}</span>
                </div>
            </div>

            {/* Zone 3 — Actions */}
            <div className="tz3" role="toolbar">
                <div className="search-wrap">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8FA3B2" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input type="text" placeholder="Search patient…" onChange={e => onSearch(e.target.value)} aria-label="Search patients" />
                </div>
                <button className="qa-btn" onClick={onOpenAddDevice} title="Register new IV device">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add Device
                </button>
                <button className="qa-btn" onClick={onRefresh} title="Refresh">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                    Refresh
                </button>
                <button className="qa-btn qa-alarm" onClick={onTestAlarm} title="Test alarm">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                    Test
                </button>
                <div className="alert-wrap">
                    <button className="icon-btn" onClick={onScrollAlerts} title="Alert Center" aria-label="Alert Center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                    </button>
                    {activeAlerts > 0 && <span className="alert-badge">{activeAlerts}</span>}
                </div>
                <button className="icon-btn" onClick={onToggleSound} title={soundOn ? "Mute" : "Unmute"} style={{ color: soundOn ? "" : "var(--offline)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        {soundOn ? <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /> : <line x1="1" y1="1" x2="23" y2="23" />}
                    </svg>
                </button>
            </div>
        </header>
    );
}
