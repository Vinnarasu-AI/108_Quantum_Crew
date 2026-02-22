// ============================================================
//  useFirebaseData.js — Central Firebase hook
//  ALWAYS starts with rich demo data immediately.
//  Replaces with live Firebase data when available.
// ============================================================
import { useState, useEffect, useCallback, useRef } from "react";
import { db, rtdb } from "../firebase.js";
import {
    collection, onSnapshot, addDoc, updateDoc, doc,
    serverTimestamp, query, orderBy, limit,
} from "firebase/firestore";
import { ref, onValue, set, push } from "firebase/database";
import {
    computeStatus, computeAlerts, OFFLINE_SEC, GROUP_MS, SNOOZE_MS,
} from "../utils/statusEngine";

const DEMO_DEVICES = {
    esp32_001: { deviceId: "esp32_001", bedNumber: "01", patientName: "Aditi Sharma", age: 24, gender: "Female", diagnosis: "Hardware Monitor", status: "normal", fluidPercentage: 100, flowRate: 0, targetFlowRate: 100, batteryLevel: 100, alarmStatus: "ok" },
    exp_002: { deviceId: "exp_002", bedNumber: "02", patientName: "A. Sharma", age: 45, gender: "Male", diagnosis: "Post-Op Recovery", status: "normal", fluidPercentage: 65, flowRate: 105, targetFlowRate: 100, batteryLevel: 82, alarmStatus: "ok" },
    exp_003: { deviceId: "exp_003", bedNumber: "03", patientName: "R. Kumar", age: 32, gender: "Male", diagnosis: "Severe Dehydration", status: "warning", fluidPercentage: 12, flowRate: 98, targetFlowRate: 100, batteryLevel: 45, alarmStatus: "warning" },
    exp_004: { deviceId: "exp_004", bedNumber: "04", patientName: "M. Verma", age: 28, gender: "Female", diagnosis: "Observation", status: "normal", fluidPercentage: 88, flowRate: 102, targetFlowRate: 100, batteryLevel: 91, alarmStatus: "ok" },
    exp_005: { deviceId: "exp_005", bedNumber: "05", patientName: "S. Gupta", age: 67, gender: "Female", diagnosis: "Critical ICU Care", status: "critical", fluidPercentage: 4, flowRate: 115, targetFlowRate: 100, batteryLevel: 12, alarmStatus: "critical" },
    exp_006: { deviceId: "exp_006", bedNumber: "06", patientName: "P. Singh", age: 54, gender: "Male", diagnosis: "General Fluid Support", status: "normal", fluidPercentage: 42, flowRate: 100, targetFlowRate: 100, batteryLevel: 77, alarmStatus: "ok" },
};

// ────────────────────────────────────────────────────────────
//  HOOK
// ────────────────────────────────────────────────────────────
export function useFirebaseData() {
    const [devices, setDevices] = useState(DEMO_DEVICES);
    const [nurses, setNurses] = useState([
        { id: "n1", name: "S. Mehta", phone: "9876543210", shift: "Night", beds: ["01", "02"] },
        { id: "n2", name: "J. Doe", phone: "9876543211", shift: "Night", beds: ["03", "04", "05"] },
    ]);
    const [alerts, setAlerts] = useState([]);
    const [alertHistory, setAlertHistory] = useState([]);
    const [eventLog, setEventLog] = useState([]);
    const [fbStatus, setFbStatus] = useState("loading");
    const [soundOn, setSoundOn] = useState(true);

    const audioCtxRef = useRef(null);
    const snoozedRef = useRef({});
    const simTickRef = useRef(null);
    const fbLiveRef = useRef(false);   // true once Firebase sends real data

    // ── Alert push (anti-fatigue grouping) ─────────────────
    const pushAlert = useCallback((alert) => {
        if (snoozedRef.current[alert.id] > Date.now()) return;
        setAlerts(prev => {
            const ex = prev.find(a => a.id === alert.id);
            if (ex && (Date.now() - ex.time < GROUP_MS))
                return prev.map(a => a.id === alert.id ? { ...a, count: (a.count || 1) + 1, time: Date.now() } : a);
            if (ex)
                return prev.map(a => a.id === alert.id ? { ...a, time: Date.now(), acknowledged: false, count: 1 } : a);
            const newA = { ...alert, count: 1, acknowledged: false };
            setAlertHistory(h => [newA, ...h].slice(0, 200));
            if (alert.severity === "critical" && soundOn) playAlarm(audioCtxRef);
            return [newA, ...prev].slice(0, 60);
        });
    }, [soundOn]);

    // ── Ingest a device ────────────────────────────────────
    const ingestDevice = useCallback((deviceId, data) => {
        const now = Date.now();
        const tsRaw = (data.timestamp?.toMillis ? data.timestamp.toMillis() : (data.timestamp ?? data.lastUpdated ?? 0));
        const secAgo = tsRaw > 0 ? (now - tsRaw) / 1000 : 0;
        const isOffline = tsRaw > 0 && secAgo > OFFLINE_SEC;

        setDevices(prev => {
            const existing = prev[deviceId] || {};
            const merged = { ...existing, ...data, deviceId, isOffline, secAgo };
            const status = computeStatus(merged, isOffline);
            const enriched = { ...merged, status };

            // Generate alerts based on merged state
            computeAlerts(deviceId, enriched, isOffline).forEach(pushAlert);

            return { ...prev, [deviceId]: enriched };
        });
    }, [pushAlert]);

    // ── Event log ──────────────────────────────────────────
    const addEventLog = useCallback((bed, message, severity) => {
        setEventLog(prev => [{ bed, message, severity, timestamp: Date.now() }, ...prev].slice(0, 200));
    }, []);

    // ── Pre-live startup & SIMULATION ─────────────────────
    useEffect(() => {
        setFbStatus("connecting");
        addEventLog("SYSTEM", "Cloud Integration Started — Connecting to IR Monitoring System", "ok");

        // Simulation ticker for DUMMY beds only
        simTickRef.current = setInterval(() => {
            setDevices(prev => {
                const updated = { ...prev };
                Object.keys(updated).forEach(id => {
                    if (id === "esp32_001") return; // Keep live hardware live!
                    const d = updated[id];
                    if (!d) return;
                    const drop = Math.random() * 0.5;
                    const newPct = Math.max(0, (d.fluidPercentage || d.percentage || 100) - drop);
                    updated[id] = { ...d, fluidPercentage: newPct, status: computeStatus({ ...d, fluidPercentage: newPct }, false) };
                });
                return updated;
            });
        }, 3000);

        return () => clearInterval(simTickRef.current);
    }, [addEventLog]);

    // ── STEP 2: Try Firebase RTDB (overlay if available) ──
    useEffect(() => {
        let unsubRTDB = null;
        let unsubReadings = null;
        let unsubNurses = null;
        let unsubHistory = null;

        try {
            if (rtdb) {
                // 1. Listen to 'devices' path (Managed data)
                unsubRTDB = onValue(ref(rtdb, "devices"), snap => {
                    const data = snap.val();
                    if (data) {
                        fbLiveRef.current = true;
                        setFbStatus("live");
                        Object.entries(data).forEach(([id, d]) => ingestDevice(id, d));
                    }
                });

                // 2. Listen to 'readings' path (Raw hardware data)
                unsubReadings = onValue(ref(rtdb, "readings"), snap => {
                    const data = snap.val();
                    if (data) {
                        fbLiveRef.current = true;
                        setFbStatus("live");
                        Object.entries(data).forEach(([id, d]) => ingestDevice(id, d));
                    }
                });
            }
        } catch (e) { console.error("RTDB Init Error:", e); }

        try {
            const q = query(collection(db, "nurses"), limit(20));
            unsubNurses = onSnapshot(q, snap => {
                if (!snap.empty) setNurses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }, () => { });
        } catch { /* use demo */ }

        try {
            const q = query(collection(db, "alert_history"), orderBy("timestamp", "desc"), limit(200));
            unsubHistory = onSnapshot(q, snap => {
                if (!snap.empty) setAlertHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }, () => { });
        } catch { /* use demo */ }

        return () => {
            unsubRTDB?.();
            unsubReadings?.();
            unsubNurses?.();
            unsubHistory?.();
        };
    }, [ingestDevice]);

    // ── Periodic offline check ────────────────────────────
    useEffect(() => {
        const iv = setInterval(() => {
            setDevices(prev => {
                const updated = {};
                Object.entries(prev).forEach(([id, d]) => {
                    const ts = (d.timestamp?.toMillis ? d.timestamp.toMillis() : (d.timestamp ?? d.lastUpdated ?? 0));
                    const secAgo = (Date.now() - ts) / 1000;
                    const offline = secAgo > OFFLINE_SEC;
                    updated[id] = { ...d, isOffline: offline, secAgo, status: computeStatus(d, offline) };
                });
                return updated;
            });
        }, 5000);
        return () => clearInterval(iv);
    }, []);

    // ── Alert actions ─────────────────────────────────────
    const ackAlert = useCallback((id) => {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        setAlertHistory(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        addEventLog("SYS", `Alert acknowledged: ${id.split("_").slice(1).join("_")}`, "ok");
        try { updateDoc(doc(db, "alerts", id), { acknowledged: true, resolvedAt: serverTimestamp() }); } catch { }
    }, [addEventLog]);

    const snoozeAlert = useCallback((id) => {
        const deviceId = id.split("_")[0];
        snoozedRef.current[id] = Date.now() + 5000; // 5-second snooze
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));

        // If it's the live hardware, send a mute command
        if (deviceId === "esp32_001" && rtdb) {
            try {
                set(ref(rtdb, `controls/${deviceId}/buzzer_control`), false);
                set(ref(rtdb, `controls/${deviceId}/led_control`), false);

                // Auto-reset after 5 seconds to resume monitoring
                setTimeout(() => {
                    set(ref(rtdb, `controls/${deviceId}/buzzer_control`), true);
                    set(ref(rtdb, `controls/${deviceId}/led_control`), true);
                }, 5000);
            } catch { }
        }

        addEventLog("SYS", `Alert snoozed (5s): ${id}`, "warning");
    }, [addEventLog]);

    const escalateAlert = useCallback((id, deviceId) => {
        addEventLog("SYS", `‼ ESCALATED: ${id}`, "critical");
        if (rtdb) {
            try { set(ref(rtdb, `commands/${deviceId}`), { alarmCommand: "ESCALATE", timestamp: Date.now() }); } catch { }
        }
    }, [addEventLog]);

    const acknowledgeAll = useCallback(() => {
        setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
        addEventLog("SYS", "All alerts acknowledged", "ok");
    }, [addEventLog]);

    const sendBuzzerCommand = useCallback((deviceId, cmd) => {
        if (rtdb) {
            try { set(ref(rtdb, `commands/${deviceId}`), { alarmCommand: cmd, timestamp: Date.now() }); } catch { }
        }
        addEventLog(deviceId, `ESP32 command: ${cmd}`, "ok");
    }, [addEventLog]);

    const addDevice = useCallback((payload) => {
        const { deviceId, ...rest } = payload;
        ingestDevice(deviceId, { ...rest, timestamp: Date.now() });
        if (rtdb) {
            try { set(ref(rtdb, `devices/${deviceId}`), { ...rest, timestamp: Date.now() }); } catch { }
        }
        addEventLog(rest.bedNumber ?? "?", `Device registered: ${rest.patientName}`, "ok");
    }, [ingestDevice, addEventLog]);

    const deleteDevice = useCallback((deviceId) => {
        setDevices(prev => {
            const next = { ...prev };
            delete next[deviceId];
            return next;
        });
        if (rtdb) {
            try { set(ref(rtdb, `devices/${deviceId}`), null); } catch { }
        }
        addEventLog(deviceId, "Device removed from ward", "warning");
    }, [addEventLog]);

    const saveNurse = useCallback(async (nurse) => {
        try {
            if (nurse.id) await updateDoc(doc(db, "nurses", nurse.id), nurse);
            else await addDoc(collection(db, "nurses"), nurse);
        } catch { }
        setNurses(prev => {
            const exists = prev.find(n => n.id === nurse.id);
            return exists ? prev.map(n => n.id === nurse.id ? nurse : n) : [...prev, { ...nurse, id: `nurse_${Date.now()}` }];
        });
    }, []);

    return {
        devices, nurses, alerts, alertHistory, eventLog,
        fbStatus, soundOn, setSoundOn,
        ackAlert, snoozeAlert, escalateAlert, acknowledgeAll,
        sendBuzzerCommand, addDevice, saveNurse, addEventLog,
    };
}

// ── Sound ──────────────────────────────────────────────────
function playAlarm(audioCtxRef) {
    try {
        if (!audioCtxRef.current)
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioCtxRef.current;
        [880, 1100, 880, 1100].forEach((freq, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = freq; osc.type = "square";
            const t = ctx.currentTime + i * 0.22;
            gain.gain.setValueAtTime(0.06, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.start(t); osc.stop(t + 0.22);
        });
    } catch { }
}
