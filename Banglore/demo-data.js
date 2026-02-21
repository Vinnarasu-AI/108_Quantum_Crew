/* ================================================================
   SmartIV ICU — demo-data.js  v2.0
   Realistic ESP32 sensor simulation engine.
   8 patient scenarios: critical, warning, normal, offline.
================================================================ */
"use strict";

// ────────────────────────────────────────────────────────────────
//  PATIENT PROFILES  (8 scenarios)
// ────────────────────────────────────────────────────────────────
const PROFILES = [
    { deviceId: "device_001", bed: "3", name: "Aditi Sharma", ivType: "Normal Saline", total: 500, target: 100, scenario: "critical_empty" },
    { deviceId: "device_002", bed: "7", name: "Ramesh Patel", ivType: "Dextrose 5%", total: 1000, target: 80, scenario: "flow_fast" },
    { deviceId: "device_003", bed: "12", name: "Fatima Begum", ivType: "Ringer's Lactate", total: 500, target: 120, scenario: "air_bubble" },
    { deviceId: "device_004", bed: "5", name: "Sanjay Mehta", ivType: "Dextrose Saline", total: 500, target: 60, scenario: "normal" },
    { deviceId: "device_005", bed: "9", name: "Priya Nair", ivType: "Antibiotic Infusion", total: 250, target: 50, scenario: "occlusion" },
    { deviceId: "device_006", bed: "2", name: "Vikram Rao", ivType: "Blood Transfusion", total: 350, target: 90, scenario: "offline" },
    { deviceId: "device_007", bed: "11", name: "Sunita Devi", ivType: "Normal Saline", total: 1000, target: 125, scenario: "low_battery" },
    { deviceId: "device_008", bed: "4", name: "Arjun Krishnan", ivType: "Dextrose 5%", total: 500, target: 100, scenario: "normal" },
];

// ────────────────────────────────────────────────────────────────
//  STATE
// ────────────────────────────────────────────────────────────────
const SIM = { states: {}, interval: null, tick: 0 };
const OFFLINE_THR = 20; // seconds

// ────────────────────────────────────────────────────────────────
//  ENTRY POINTS
// ────────────────────────────────────────────────────────────────
window.startDemoMode = function () {
    if (SIM.interval) return;
    window._setFirebaseStatus("demo");
    window._addEventLog("SYSTEM", "Demo mode active — simulating 8 ESP32 devices", "ok");

    PROFILES.forEach(p => { SIM.states[p.deviceId] = initState(p); });
    ingestAll();
    window._renderAll();
    window.showToast("info", "🔵 Demo Mode", "Firebase not configured — showing simulated data");

    // Tick every 2.5s (mirrors real ESP32 push rate)
    SIM.interval = setInterval(tick, 2500);
};

window.tickDemoData = function () { tick(); };

// Seed demo data into Firebase when DB is available but empty
window.seedFirebaseDemo = function () {
    if (!window._db) return;
    PROFILES.forEach(p => {
        const st = initState(p);
        const snap = buildSnap(p, st);
        window._set(window._ref(window._db, `devices/${p.deviceId}`), snap);
    });
};

// ────────────────────────────────────────────────────────────────
//  INIT STATE
// ────────────────────────────────────────────────────────────────
function initState(p) {
    return {
        fluidML: startFluid(p),
        flowDrift: 0,
        pressure: rand(70, 120),
        battery: startBattery(p),
        air: p.scenario === "air_bubble",
        online: p.scenario !== "offline",
        staleCount: p.scenario === "offline" ? 999 : 0,
        tick: Date.now(),
    };
}

// ────────────────────────────────────────────────────────────────
//  TICK — advance all simulations
// ────────────────────────────────────────────────────────────────
function tick() {
    SIM.tick++;
    const now = Date.now();

    PROFILES.forEach(p => {
        const st = SIM.states[p.deviceId];
        if (!st) return;

        if (p.scenario === "offline") {
            st.staleCount += 3;
            st.tick = now;
            return;
        }

        // Drain fluid
        const fr = Math.max(0, p.target + st.flowDrift);
        const elapsed = (now - st.tick) / 3_600_000; // hours
        st.fluidML = Math.max(0, st.fluidML - fr * elapsed);
        st.tick = now;
        st.staleCount = 0;

        // Slow battery drain
        st.battery = Math.max(0, st.battery - 0.06);

        // Scenario dynamics
        switch (p.scenario) {
            case "critical_empty":
                st.fluidML = Math.max(0, st.fluidML - rand(4, 9)); // extra drain
                st.flowDrift = rand(-4, 4);
                break;
            case "flow_fast":
                st.flowDrift = 22 + 10 * Math.sin(SIM.tick * 0.4);
                break;
            case "air_bubble":
                st.air = (SIM.tick % 18) < 8;
                st.flowDrift = rand(-5, 5);
                break;
            case "occlusion":
                st.pressure = Math.min(360, st.pressure + rand(2, 7));
                st.flowDrift = -rand(8, 25); // flow slows
                break;
            case "low_battery":
                st.battery = Math.max(3, 12 - SIM.tick * 0.25);
                st.flowDrift = rand(-3, 3);
                break;
            case "normal":
            default:
                st.flowDrift = 3 * Math.sin(SIM.tick * 0.25);
                st.pressure = rand(75, 130);
                // Occasional realistic anomaly
                if (Math.random() < 0.03) {
                    st.flowDrift += rand(-22, 22);
                    setTimeout(() => { if (SIM.states[p.deviceId]) SIM.states[p.deviceId].flowDrift = 0; }, 8000);
                }
                break;
        }
    });

    ingestAll();
    window._renderAll();
}

// ────────────────────────────────────────────────────────────────
//  BUILD SNAPSHOT (mirrors Firebase device schema)
// ────────────────────────────────────────────────────────────────
function buildSnap(p, st) {
    const now = Date.now();
    const isOffline = st.staleCount > OFFLINE_THR;
    const fr = Math.max(0, p.target + (st.flowDrift || 0));
    const fp = Math.max(0, (st.fluidML / p.total) * 100);
    const alm = alarmStatus(fp, fr, p.target, st);

    return {
        bedNumber: p.bed,
        patientName: p.name,
        ivType: p.ivType,
        fluidRemainingML: parseFloat(st.fluidML.toFixed(1)),
        fluidPercentage: parseFloat(fp.toFixed(1)),
        flowRate: parseFloat(fr.toFixed(1)),
        targetFlowRate: p.target,
        pressureValue: parseFloat((st.pressure || 85).toFixed(0)),
        airBubbleDetected: st.air || false,
        batteryLevel: parseFloat((st.battery || 80).toFixed(0)),
        deviceOnline: !isOffline,
        lastUpdated: isOffline ? (now - st.staleCount * 1000) : now,
        alarmStatus: alm,
        alarmSeverity: alm === "critical" ? "high" : alm === "warning" ? "medium" : "none",
    };
}

function alarmStatus(fp, fr, tfr, st) {
    if (fp < 5 || st.air || (st.pressure || 0) > 250) return "critical";
    if (fp < 15 || Math.abs(fr - tfr) > 15 || (st.battery || 100) < 15) return "warning";
    return "normal";
}

// ────────────────────────────────────────────────────────────────
//  INGEST ALL → push to STATE via app.js
// ────────────────────────────────────────────────────────────────
function ingestAll() {
    PROFILES.forEach(p => {
        const st = SIM.states[p.deviceId];
        if (!st) return;
        window._ingestDevice(p.deviceId, buildSnap(p, st));
    });
}

// ────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────
function startFluid(p) {
    const map = {
        critical_empty: 0.06,
        flow_fast: rand(0.4, 0.7),
        air_bubble: rand(0.5, 0.8),
        occlusion: rand(0.6, 0.9),
        low_battery: rand(0.45, 0.75),
        offline: rand(0.35, 0.6),
        normal: rand(0.3, 0.9),
    };
    return p.total * (map[p.scenario] || 0.5);
}

function startBattery(p) {
    if (p.scenario === "low_battery") return rand(5, 13);
    if (p.scenario === "offline") return rand(20, 55);
    return rand(55, 100);
}

function rand(min, max) { return min + Math.random() * (max - min); }
