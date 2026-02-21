// ============================================================
//  useFirebaseData.js — Central Firebase hook
//  ALWAYS starts with rich demo data immediately.
//  Replaces with live Firebase data when available.
// ============================================================
import { useState, useEffect, useCallback, useRef } from "react";
import { db, rtdb } from "../firebase/config";
import {
    collection, onSnapshot, addDoc, updateDoc, doc,
    serverTimestamp, query, orderBy, limit,
} from "firebase/firestore";
import { ref, onValue, set, push } from "firebase/database";
import {
    computeStatus, computeAlerts, OFFLINE_SEC, GROUP_MS, SNOOZE_MS,
} from "../utils/statusEngine";

// ────────────────────────────────────────────────────────────
//  RICH DEMO DATA  (Hospital-realistic, mixed statuses)
// ────────────────────────────────────────────────────────────
const NOW = Date.now();

const DEMO_DEVICES = {
    dev_001: {
        bedNumber: "3", patientName: "Aditi Sharma", ivType: "Normal Saline",
        patient_age: 42, fluid_level: 4.2, flow_rate: 97, target_flow: 100,
        fluid_ml: 21, weight: 420, pressure: 88, battery_level: 72,
        air_bubble: false, loadcell_error: false, hx711_error: false, mcu_error: false,
        device_status: "critical", timestamp: NOW,
    },
    dev_002: {
        bedNumber: "7", patientName: "Ramesh Patel", ivType: "Dextrose 5%",
        patient_age: 58, fluid_level: 51.0, flow_rate: 122, target_flow: 80,
        fluid_ml: 255, weight: 510, pressure: 91, battery_level: 60,
        air_bubble: false, loadcell_error: false, hx711_error: false, mcu_error: false,
        device_status: "warning", timestamp: NOW,
    },
    dev_003: {
        bedNumber: "12", patientName: "Fatima Begum", ivType: "Ringer's Lactate",
        patient_age: 34, fluid_level: 68.5, flow_rate: 119, target_flow: 120,
        fluid_ml: 342, weight: 685, pressure: 90, battery_level: 45,
        air_bubble: true, loadcell_error: false, hx711_error: false, mcu_error: false,
        device_status: "critical", timestamp: NOW,
    },
    dev_004: {
        bedNumber: "5", patientName: "Sanjay Mehta", ivType: "Dextrose Saline",
        patient_age: 65, fluid_level: 84.0, flow_rate: 60, target_flow: 60,
        fluid_ml: 420, weight: 840, pressure: 95, battery_level: 88,
        air_bubble: false, loadcell_error: false, hx711_error: false, mcu_error: false,
        device_status: "normal", timestamp: NOW,
    },
    dev_005: {
        bedNumber: "9", patientName: "Priya Nair", ivType: "Antibiotic Infusion",
        patient_age: 29, fluid_level: 37.0, flow_rate: 28, target_flow: 50,
        fluid_ml: 92, weight: 185, pressure: 275, battery_level: 55,
        air_bubble: false, loadcell_error: false, hx711_error: false, mcu_error: false,
        device_status: "critical", timestamp: NOW,
    },
    dev_006: {
        bedNumber: "2", patientName: "Vikram Rao", ivType: "Blood Transfusion",
        patient_age: 71, fluid_level: 19.0, flow_rate: 90, target_flow: 90,
        fluid_ml: 95, weight: 190, pressure: 82, battery_level: 30,
        air_bubble: false, loadcell_error: true, hx711_error: false, mcu_error: false,
        device_status: "warning", timestamp: NOW - 8000,
    },
    dev_007: {
        bedNumber: "11", patientName: "Sunita Devi", ivType: "Normal Saline",
        patient_age: 53, fluid_level: 72.0, flow_rate: 125, target_flow: 125,
        fluid_ml: 360, weight: 720, pressure: 93, battery_level: 8,
        air_bubble: false, loadcell_error: false, hx711_error: false, mcu_error: false,
        device_status: "warning", timestamp: NOW,
    },
    dev_008: {
        bedNumber: "4", patientName: "Arjun Krishnan", ivType: "Dextrose 5%",
        patient_age: 48, fluid_level: 91.0, flow_rate: 100, target_flow: 100,
        fluid_ml: 455, weight: 910, pressure: 88, battery_level: 95,
        air_bubble: false, loadcell_error: false, hx711_error: true, mcu_error: true,
        device_status: "critical", timestamp: NOW,
    },
};

const DEMO_NURSES = [
    { id: "nurse_001", name: "S. Mehta", shift: "Night", assignedBeds: ["3", "7", "12"] },
    { id: "nurse_002", name: "R. Sharma", shift: "Morning", assignedBeds: ["5", "9", "2"] },
    { id: "nurse_003", name: "P. Kumar", shift: "Evening", assignedBeds: ["11", "4"] },
];

const DEMO_ALERT_HISTORY = [
    { id: "ah_1", bed: "3", patient: "Aditi Sharma", type: "NEAR_EMPTY_CRIT", severity: "critical", message: "Bed 3 — IV critically empty (4%)", action: "Replace IV bag immediately", time: NOW - 120000, acknowledged: false },
    { id: "ah_2", bed: "12", patient: "Fatima Begum", type: "AIR_BUBBLE", severity: "critical", message: "Bed 12 — Air bubble detected in IV line!", action: "Inspect IV line immediately", time: NOW - 240000, acknowledged: false },
    { id: "ah_3", bed: "9", patient: "Priya Nair", type: "OCCLUSION", severity: "critical", message: "Bed 9 — Occlusion detected (275 mmHg)", action: "Check IV for blockage", time: NOW - 360000, acknowledged: false },
    { id: "ah_4", bed: "7", patient: "Ramesh Patel", type: "FLOW_ERR", severity: "warning", message: "Bed 7 — Flow too fast (122 vs 80 mL/hr)", action: "Adjust drip — target 80 mL/hr", time: NOW - 480000, acknowledged: true },
    { id: "ah_5", bed: "2", patient: "Vikram Rao", type: "LOADCELL_ERROR", severity: "warning", message: "Bed 2 — LOADCELL ERROR: Invalid weight", action: "Check load cell connections", time: NOW - 600000, acknowledged: true },
    { id: "ah_6", bed: "11", patient: "Sunita Devi", type: "LOW_BATTERY", severity: "warning", message: "Bed 11 — Battery low (8%)", action: "Charge device battery", time: NOW - 720000, acknowledged: true },
    { id: "ah_7", bed: "4", patient: "Arjun Krishnan", type: "HX711_ERROR", severity: "critical", message: "Bed 4 — HX711 MODULE ERROR: No ADC value", action: "Check HX711 module", time: NOW - 840000, acknowledged: false },
    { id: "ah_8", bed: "4", patient: "Arjun Krishnan", type: "MCU_ERROR", severity: "critical", message: "Bed 4 — MICROCONTROLLER ERROR: Multi-fail", action: "Hardware reset required", time: NOW - 840000, acknowledged: false },
    { id: "ah_9", bed: "5", patient: "Sanjay Mehta", type: "OFFLINE", severity: "warning", message: "Bed 5 — Device offline briefly", action: "Device reconnected after 15s", time: NOW - 1800000, acknowledged: true },
    { id: "ah_10", bed: "3", patient: "Aditi Sharma", type: "NEAR_EMPTY", severity: "warning", message: "Bed 3 — IV near empty (9%) — earlier warn", action: "Prepare new IV bag", time: NOW - 900000, acknowledged: true },
];

const DEMO_EVENT_LOG = [
    { bed: "3", severity: "critical", message: "IV critically empty — 4% remaining", timestamp: NOW - 120000 },
    { bed: "12", severity: "critical", message: "Air bubble detected in IV line", timestamp: NOW - 240000 },
    { bed: "9", severity: "critical", message: "Occlusion detected — pressure 275 mmHg", timestamp: NOW - 360000 },
    { bed: "4", severity: "critical", message: "HX711 MODULE ERROR: No digital value from ADC", timestamp: NOW - 480000 },
    { bed: "4", severity: "critical", message: "MICROCONTROLLER ERROR: Multiple sensor failures", timestamp: NOW - 490000 },
    { bed: "2", severity: "warning", message: "LOADCELL ERROR: Weight reading out of range", timestamp: NOW - 600000 },
    { bed: "7", severity: "warning", message: "Flow rate too fast: 122 mL/hr (target 80)", timestamp: NOW - 700000 },
    { bed: "11", severity: "warning", message: "Battery critically low — 8%", timestamp: NOW - 800000 },
    { bed: "SYSTEM", severity: "ok", message: "Demo mode active — 8 ESP32 devices connected", timestamp: NOW - 5000 },
];

// ────────────────────────────────────────────────────────────
//  HOOK
// ────────────────────────────────────────────────────────────
export function useFirebaseData() {
    const [devices, setDevices] = useState({});
    const [nurses, setNurses] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [alertHistory, setAlertHistory] = useState([]);
    const [eventLog, setEventLog] = useState([]);
    const [fbStatus, setFbStatus] = useState("demo");
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
        const tsRaw = data.timestamp ?? data.lastUpdated ?? 0;
        const secAgo = tsRaw > 0 ? (now - tsRaw) / 1000 : 0;
        const isOffline = tsRaw > 0 && secAgo > OFFLINE_SEC;
        const enriched = { ...data, deviceId, isOffline, secAgo, status: computeStatus(data, isOffline) };
        setDevices(prev => ({ ...prev, [deviceId]: enriched }));
        computeAlerts(deviceId, data, isOffline).forEach(pushAlert);
    }, [pushAlert]);

    // ── Event log ──────────────────────────────────────────
    const addEventLog = useCallback((bed, message, severity) => {
        setEventLog(prev => [{ bed, message, severity, timestamp: Date.now() }, ...prev].slice(0, 200));
    }, []);

    // ── STEP 1: Load demo data IMMEDIATELY (synchronous) ──
    useEffect(() => {
        // Seed devices
        Object.entries(DEMO_DEVICES).forEach(([id, d]) => ingestDevice(id, d));
        // Seed nurses
        setNurses(DEMO_NURSES);
        // Seed alert history
        setAlertHistory(DEMO_ALERT_HISTORY);
        // Seed event log
        setEventLog(DEMO_EVENT_LOG);
        setFbStatus("demo");

        // Live demo simulation ticker — updates fluid levels every 2.5 s
        let tick = 0;
        simTickRef.current = setInterval(() => {
            if (fbLiveRef.current) { clearInterval(simTickRef.current); return; }
            tick++;
            const nowTs = Date.now();
            setDevices(prev => {
                const updated = { ...prev };
                Object.entries(DEMO_DEVICES).forEach(([id, base]) => {
                    const d = prev[id] ?? { ...base, deviceId: id };
                    // Slowly drain fluid
                    const fl = Math.max(0, (d.fluid_level ?? base.fluid_level) - (Math.random() * 0.4));
                    // Small flow drift
                    const fr = Math.max(0, (d.flow_rate ?? base.flow_rate) + (Math.random() - 0.5) * 3);
                    // Oscillate air bubble for dev_003
                    const ab = id === "dev_003" ? (tick % 14) < 7 : (d.air_bubble ?? false);
                    const newD = { ...d, fluid_level: fl, flow_rate: Math.round(fr), air_bubble: ab, timestamp: nowTs };
                    const secAgo = 0;
                    const isOffline = false;
                    updated[id] = { ...newD, isOffline, secAgo, status: computeStatus(newD, isOffline) };
                });
                return updated;
            });
        }, 2500);

        return () => clearInterval(simTickRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── STEP 2: Try Firebase RTDB (overlay if available) ──
    useEffect(() => {
        let unsubRTDB = null;
        let unsubNurses = null;
        let unsubHistory = null;

        try {
            const devRef = ref(rtdb, "devices");
            unsubRTDB = onValue(devRef, snap => {
                const data = snap.val();
                if (!data) return; // demo keeps running
                fbLiveRef.current = true;
                setFbStatus("live");
                Object.entries(data).forEach(([id, d]) => ingestDevice(id, d));
            }, () => { /* Firebase unavailable — demo mode stays active */ });
        } catch { /* use demo */ }

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
            try { unsubRTDB?.(); } catch { }
            try { unsubNurses?.(); } catch { }
            try { unsubHistory?.(); } catch { }
        };
    }, [ingestDevice]);

    // ── Periodic offline check ────────────────────────────
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

    // ── Alert actions ─────────────────────────────────────
    const ackAlert = useCallback((id) => {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        setAlertHistory(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        addEventLog("SYS", `Alert acknowledged: ${id.split("_").slice(1).join("_")}`, "ok");
        try { updateDoc(doc(db, "alerts", id), { acknowledged: true, resolvedAt: serverTimestamp() }); } catch { }
    }, [addEventLog]);

    const snoozeAlert = useCallback((id) => {
        snoozedRef.current[id] = Date.now() + SNOOZE_MS;
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        addEventLog("SYS", `Alert snoozed: ${id}`, "warning");
    }, [addEventLog]);

    const escalateAlert = useCallback((id, deviceId) => {
        addEventLog("SYS", `‼ ESCALATED: ${id}`, "critical");
        try { set(ref(rtdb, `commands/${deviceId}`), { alarmCommand: "ESCALATE", timestamp: Date.now() }); } catch { }
    }, [addEventLog]);

    const acknowledgeAll = useCallback(() => {
        setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
        addEventLog("SYS", "All alerts acknowledged", "ok");
    }, [addEventLog]);

    const sendBuzzerCommand = useCallback((deviceId, cmd) => {
        try { set(ref(rtdb, `commands/${deviceId}`), { alarmCommand: cmd, timestamp: Date.now() }); } catch { }
        addEventLog(deviceId, `ESP32 command: ${cmd}`, "ok");
    }, [addEventLog]);

    const addDevice = useCallback((payload) => {
        const { deviceId, ...rest } = payload;
        ingestDevice(deviceId, { ...rest, timestamp: Date.now() });
        try { set(ref(rtdb, `devices/${deviceId}`), { ...rest, timestamp: Date.now() }); } catch { }
        addEventLog(rest.bedNumber ?? "?", `Device registered: ${rest.patientName}`, "ok");
    }, [ingestDevice, addEventLog]);

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
