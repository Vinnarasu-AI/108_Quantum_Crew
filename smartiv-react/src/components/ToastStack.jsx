// ToastStack.jsx — Non-blocking toast notifications
import { useState, useCallback, useEffect, useRef } from "react";

const ICONS = { crit: "🚨", warn: "⚠", ok: "✅", info: "ℹ", success: "✅" };
const CLS = { crit: "t-crit", warn: "t-warn", ok: "t-ok", info: "t-info", success: "t-ok" };

let _push = null;
export function useToast() {
    const [toasts, setToasts] = useState([]);
    const show = useCallback((type, title, msg) => {
        const id = Date.now() + Math.random();
        setToasts(p => [{ id, type, title, msg }, ...p].slice(0, 6));
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
    }, []);
    // expose globally for non-React code
    useEffect(() => { _push = show; return () => { _push = null; }; }, [show]);
    const dismiss = useCallback((id) => setToasts(p => p.filter(t => t.id !== id)), []);
    return { toasts, show, dismiss };
}

export function showToast(type, title, msg) {
    if (_push) _push(type, title, msg);
}

export function ToastStack({ toasts, onDismiss }) {
    return (
        <div className="toast-stack" aria-live="polite">
            {toasts.map(t => (
                <div key={t.id} className={`toast ${CLS[t.type] ?? "t-info"}`} role="status">
                    <span className="t-icon">{ICONS[t.type] ?? "ℹ"}</span>
                    <div className="t-body">
                        <div className="t-title">{t.title}</div>
                        {t.msg && <div className="t-msg">{t.msg}</div>}
                    </div>
                    <span className="t-close" onClick={() => onDismiss(t.id)}>✕</span>
                </div>
            ))}
        </div>
    );
}
