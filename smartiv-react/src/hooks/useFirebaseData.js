// ============================================================
//  useFirebaseData.js — Central hook for all Firebase listeners
//  Handles: devices (RTDB hardware), patients, nurses,
//           alerts, alert_history, bed_map (Firestore)
// ============================================================
import { useState, useEffect, useCallback, useRef } from "react";
import { db, rtdb } from "../firebase/config";
import {
    collection, onSnapshot, addDoc, updateDoc, doc,
    serverTimestamp, query, orderBy, limit,
} from "firebase/firestore";
import { ref, onValue, set, push } from "firebase/database";
import {
    computeStatus, computeAlerts, priorityScore,
    OFFLINE_SEC, GROUP_MS, SNOOZE_MS,
} from "../utils/statusEngine";

// ── Demo data seed when Firebase is not configured ──────────
const DEMO_DEVICES = [
    { deviceId: "dev_001", bedNumber: "3", patientName: "Aditi Sharma", ivType: "Normal Saline", fluid_level: 4, flow_rate: 98, target_flow: 100, pressure: 85, battery_level: 72, weight: 420, loadcell_error: false, hx711_error: false, mcu_error: false, air_bubble: false, timestamp: Date.now() },
    { deviceId: "dev_002", bedNumber: "7", patientName: "Ramesh Patel", ivType: "Dextrose 5%", fluid_level: 52, flow_rate: 122, target_flow: 80, pressure: 90, battery_level: 60, weight: 260, loadcell_error: false, hx711_error: false, mcu_error: false, air_bubble: false, timestamp: Date.now() },
    { deviceId: "dev_003", bedNumber: "12", patientName: "Fatima Begum", ivType: "Ringer's Lactate", fluid_level: 68, flow_rate: 118, target_flow: 120, pressure: 88, battery_level: 45, weight: 340, loadcell_error: false, hx711_error: false, mcu_error: false, air_bubble: true, timestamp: Date.now() },
    { deviceId: "dev_004", bedNumber: "5", patientName: "Sanjay Mehta", ivType: "Dextrose Saline", fluid_level: 85, flow_rate: 60, target_flow: 60, pressure: 95, battery_level: 88, weight: 425, loadcell_error: false, hx711_error: false, mcu_error: false, air_bubble: false, timestamp: Date.now() },
    { deviceId: "dev_005", bedNumber: "9", patientName: "Priya Nair", ivType: "Antibiotic Infusion", fluid_level: 38, flow_rate: 28, target_flow: 50, pressure: 270, battery_level: 55, weight: 190, loadcell_error: false, hx711_error: false, mcu_error: false, air_bubble: false, timestamp: Date.now() },
    { deviceId: "dev_006", bedNumber: "2", patientName: "Vikram Rao", ivType: "Blood Transfusion", fluid_level: 20, flow_rate: 90, target_flow: 90, pressure: 80, battery_level: 30, weight: 175, loadcell_error: true, hx711_error: false, mcu_error: false, air_bubble: false, timestamp: Date.now() - 35000 },
    { deviceId: "dev_007", bedNumber: "11", patientName: "Sunita Devi", ivType: "Normal Saline", fluid_level: 72, flow_rate: 125, target_flow: 125, pressure: 92, battery_level: 8, weight: 360, loadcell_error: false, hx711_error: false, mcu_error: false, air_bubble: false, timestamp: Date.now() },
    { deviceId: "dev_008", bedNumber: "4", patientName: "Arjun Krishnan", ivType: "Dextrose 5%", fluid_level: 91, flow_rate: 100, target_flow: 100, pressure: 88, battery_level: 95, weight: 455, loadcell_error: false, hx711_error: true, mcu_error: true, air_bubble: false, timestamp: Date.now() },
];

const DEMO_NURSES = [
    { id: "nurse_001", name: "S. Mehta", shift: "Night", assignedBeds: ["3", "7", "12"] },
    { id: "nurse_002", name: "R. Sharma", shift: "Morning", assignedBeds: ["5", "9", "2"] },
    { id: "nurse_003", name: "P. Kumar", shift: "Evening", assignedBeds: ["11", "4"] },
];

export function useFirebaseData() {
    const [devices, setDevices] = useState({});
    const [patients, setPatients] = useState([]);
    const [nurses, setNurses] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [alertHistory, setAlertHistory] = useState([]);
    const [eventLog, setEventLog] = useState([]);
    const [fbStatus, setFbStatus] = useState("connecting"); // live | demo | offline
    const [soundOn, setSoundOn] = useState(true);
    const audioCtxRef = useRef(null);
    const snoozedRef = useRef({});
    const alertsRef = useRef([]);
    alertsRef.current = alerts;

    // ── Alert push with anti-fatigue grouping ──────────────────
    const pushAlert = useCallback((alert) => {
        const key = alert.id;
        const now = Date.now();
        if (snoozedRef.current[key] && snoozedRef.current[key] > now) return;

        setAlerts(prev => {
            const ex = prev.find(a => a.id === key);
            if (ex) {
                if (now - ex.time < GROUP_MS) {
                    return prev.map(a => a.id === key ? { ...a, count: (a.count || 1) + 1, time: now } : a);
                }
                return prev.map(a => a.id === key ? { ...a, time: now, acknowledged: false, count: 1 } : a);
            }
            const newAlert = { ...alert, count: 1, acknowledged: false };
            // store in alert history
            setAlertHistory(h => [newAlert, ...h].slice(0, 200));
            return [newAlert, ...prev].slice(0, 60);
        });

        if (alert.severity === "critical" && soundOn) playAlarm(audioCtxRef);
    }, [soundOn]);

    // ── Ingest a single device's hardware data ─────────────────
    const ingestDevice = useCallback((deviceId, data) => {
        const now = Date.now();
        const tsRaw = data.timestamp ?? data.lastUpdated ?? 0;
        const secAgo = tsRaw > 0 ? (now - tsRaw) / 1000 : 0;
        const isOffline = tsRaw > 0 && secAgo > OFFLINE_SEC;
        const enriched = {
            ...data, deviceId, isOffline, secAgo,
            status: computeStatus(data, isOffline),
        };
        setDevices(prev => ({ ...prev, [deviceId]: enriched }));
        computeAlerts(deviceId, data, isOffline).forEach(a => pushAlert(a));
    }, [pushAlert]);

    // ── Demo mode ticker ───────────────────────────────────────
    useEffect(() => {
        let usedFirebase = false;
        let unsubs = [];

        function startDemo() {
            setFbStatus("demo");
            DEMO_DEVICES.forEach(d => ingestDevice(d.deviceId, d));
            setNurses(DEMO_NURSES);
            addEventLog("SYSTEM", "Demo mode — simulating 8 IoT devices", "ok");

            // Simulate live hardware ticks every 2.5 s
            const iv = setInterval(() => {
                if (usedFirebase) { clearInterval(iv); return; }
                DEMO_DEVICES.forEach(d => {
                    const delta = (Math.random() - 0.5) * 4;
                    const fp = Math.max(0, (d.fluid_level ?? 50) + delta * 0.3);
                    ingestDevice(d.deviceId, { ...d, fluid_level: fp, timestamp: Date.now() });
                });
            }, 2500);
            unsubs.push(() => clearInterval(iv));
        }

        // Try Firebase RTDB listener
        try {
            const devRef = ref(rtdb, "devices");
            const unsubRTDB = onValue(devRef, snap => {
                const data = snap.val();
                if (!data) { if (!usedFirebase) startDemo(); return; }
                usedFirebase = true;
                setFbStatus("live");
                Object.entries(data).forEach(([id, d]) => ingestDevice(id, d));
            }, () => { if (!usedFirebase) startDemo(); });
            unsubs.push(unsubRTDB);
        } catch { startDemo(); }

        // Firestore: nurses
        try {
            const unsubNurses = onSnapshot(collection(db, "nurses"), snap => {
                if (!snap.empty) setNurses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });
            unsubs.push(unsubNurses);
        } catch { /* demo covers this */ }

        // Firestore: alert_history
        try {
            const q = query(collection(db, "alert_history"), orderBy("timestamp", "desc"), limit(200));
            const unsubHistory = onSnapshot(q, snap => {
                if (!snap.empty)
                    setAlertHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });
            unsubs.push(unsubHistory);
        } catch { /* demo covers this */ }

        return () => unsubs.forEach(u => u());
    }, [ingestDevice]);

    // ── Periodic offline re-check ──────────────────────────────
    useEffect(() => {
        const iv = setInterval(() => {
            setDevices(prev => {
                const updated = {};
                Object.entries(prev).forEach(([id, d]) => {
                    const secAgo = (Date.now() - (d.timestamp ?? d.lastUpdated ?? 0)) / 1000;
                    const offline = secAgo > OFFLINE_SEC;
                    updated[id] = { ...d, isOffline: offline, secAgo, status: computeStatus(d, offline) };
                });
                return updated;
            });
        }, 5000);
        return () => clearInterval(iv);
    }, []);

    // ── Event log helper ───────────────────────────────────────
    const addEventLog = useCallback((bed, message, severity) => {
        setEventLog(prev => [{ bed, message, severity, timestamp: Date.now() }, ...prev].slice(0, 200));
    }, []);

    // ── Alert actions ──────────────────────────────────────────
    const ackAlert = useCallback((id) => {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        setAlertHistory(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        addEventLog("SYS", `Alert acknowledged: ${id.split("_").slice(1).join("_")}`, "ok");
        // Persist to Firestore
        try { updateDoc(doc(db, "alerts", id), { acknowledged: true, resolvedAt: serverTimestamp() }); } catch { /* ignore */ }
    }, [addEventLog]);

    const snoozeAlert = useCallback((id) => {
        snoozedRef.current[id] = Date.now() + SNOOZE_MS;
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        addEventLog("SYS", `Alert snoozed: ${id}`, "warning");
    }, [addEventLog]);

    const escalateAlert = useCallback((id, deviceId) => {
        addEventLog("SYS", `‼ ESCALATED: ${id}`, "critical");
        try {
            set(ref(rtdb, `commands/${deviceId}`), { alarmCommand: "ESCALATE", timestamp: Date.now() });
        } catch { /* ignore */ }
    }, [addEventLog]);

    const acknowledgeAll = useCallback(() => {
        setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
        addEventLog("SYS", "All alerts acknowledged", "ok");
    }, [addEventLog]);

    // ── Buzzer control ─────────────────────────────────────────
    const sendBuzzerCommand = useCallback((deviceId, cmd) => {
        try {
            set(ref(rtdb, `commands/${deviceId}`), { alarmCommand: cmd, timestamp: Date.now() });
        } catch { /* demo */ }
        addEventLog(deviceId, `ESP32 command: ${cmd}`, "ok");
    }, [addEventLog]);

    // ── Add device ─────────────────────────────────────────────
    const addDevice = useCallback((payload) => {
        const { deviceId, ...rest } = payload;
        ingestDevice(deviceId, { ...rest, timestamp: Date.now() });
        try {
            set(ref(rtdb, `devices/${deviceId}`), { ...rest, timestamp: Date.now() });
        } catch { /* demo */ }
        addEventLog(rest.bedNumber ?? "?", `Device registered: ${rest.patientName}`, "ok");
    }, [ingestDevice, addEventLog]);

    // ── Nurse save ─────────────────────────────────────────────
    const saveNurse = useCallback(async (nurse) => {
        try {
            if (nurse.id) {
                await updateDoc(doc(db, "nurses", nurse.id), nurse);
            } else {
                await addDoc(collection(db, "nurses"), nurse);
            }
        } catch { /* demo */ }
        setNurses(prev => {
            const exists = prev.find(n => n.id === nurse.id);
            return exists ? prev.map(n => n.id === nurse.id ? nurse : n) : [...prev, { ...nurse, id: `nurse_${Date.now()}` }];
        });
    }, []);

    return {
        devices, patients, nurses, alerts, alertHistory, eventLog,
        fbStatus, soundOn, setSoundOn,
        ackAlert, snoozeAlert, escalateAlert, acknowledgeAll,
        sendBuzzerCommand, addDevice, saveNurse, addEventLog,
    };
}

// ── Sound helpers ──────────────────────────────────────────────
function playAlarm(audioCtxRef) {
    try {
        if (!audioCtxRef.current)
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioCtxRef.current;
        [880, 1100, 880, 1100].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = "square";
            const t = ctx.currentTime + i * 0.22;
            gain.gain.setValueAtTime(0.06, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.start(t); osc.stop(t + 0.22);
        });
    } catch { /* no audio */ }
}
