// ============================================================
//  statusEngine.js — Device status & alert computation
//  Mirrors hardware-pushed data structure.
// ============================================================

export const FLOW_THR = 15;   // mL/hr max deviation
export const PRESSURE_LIM = 250;  // mmHg occlusion threshold
export const OFFLINE_SEC = 30;   // seconds → device offline
export const SNOOZE_MS = 60_000;
export const GROUP_MS = 60_000;

/**
 * Compute a device's overall status from hardware data.
 * Hardware pushes: fluid_level, flow_rate, weight, device_status, timestamp
 */
export function computeStatus(d, isOffline) {
    if (isOffline) return "offline";
    if (hasHardwareError(d)) return "critical";

    // Hardware-triggered alert
    if (d.alert_active === true || d.alarmStatus === "critical") return "critical";

    const fp = d.percentage ?? d.fluid_level ?? d.fluidPercentage ?? 0;
    const fr = d.flow_rate ?? d.flowRate ?? 0;
    const tfr = d.target_flow ?? d.targetFlowRate ?? 100;
    const ab = d.air_bubble ?? d.airBubbleDetected ?? false;
    const pv = d.pressure ?? d.pressureValue ?? 0;

    if (fp < 5) return "critical";
    if (ab === true) return "critical";
    if (pv > PRESSURE_LIM) return "critical";
    if (fp < 15) return "warning";
    if (Math.abs(fr - tfr) > FLOW_THR) return "warning";
    if ((d.battery_level ?? d.batteryLevel ?? 100) < 15) return "warning";
    return "normal";
}

/**
 * Detect hardware-level errors from device data.
 * Returns array of error { type, label, description }.
 */
export function detectHardwareErrors(d) {
    const errors = [];
    const w = d.weight ?? null;
    const fp = d.fluid_level ?? d.fluidPercentage ?? null;
    const fr = d.flow_rate ?? d.flowRate ?? null;

    // LOADCELL ERROR — weight reading is out of valid range or missing
    if (d.loadcell_error === true || (w !== null && (w < 0 || w > 5000))) {
        errors.push({
            type: "LOADCELL_ERROR",
            label: "LOADCELL ERROR",
            description: "Weight sensor reading is invalid. Check load cell connections.",
            severity: "critical",
        });
    }

    // HX711 ERROR — no digital value / ADC module failure
    if (d.hx711_error === true || (w === null && fp === null)) {
        errors.push({
            type: "HX711_ERROR",
            label: "HX711 MODULE ERROR",
            description: "No digital weight value received. HX711 ADC module may be faulty.",
            severity: "critical",
        });
    }

    // MICROCONTROLLER ERROR — multiple simultaneous failures
    const failCount = (d.loadcell_error ? 1 : 0) + (d.hx711_error ? 1 : 0) +
        (d.sensor_error ? 1 : 0) + (d.comm_error ? 1 : 0);
    if (d.mcu_error === true || failCount >= 2) {
        errors.push({
            type: "MCU_ERROR",
            label: "MICROCONTROLLER ERROR",
            description: "Multiple sensor failures detected. Device may require hardware reset.",
            severity: "critical",
        });
    }

    return errors;
}

export function hasHardwareError(d) {
    return detectHardwareErrors(d).length > 0;
}

/**
 * Compute alert objects from device state.
 */
export function computeAlerts(deviceId, d, isOffline) {
    const res = [];
    const bed = d.bedNumber ?? d.bed_number ?? deviceId;
    const pt = d.patientName ?? d.patient_name ?? "Unknown";
    const now = Date.now();

    function mk(type, sev, msg, action) {
        return { id: `${deviceId}_${type}`, deviceId, bed, patient: pt, type, severity: sev, message: msg, action, time: now };
    }

    if (isOffline) {
        res.push(mk("OFFLINE", "warning", `Bed ${bed} — Device offline (no signal)`, "Check WiFi / Power"));
        return res;
    }

    // Hardware errors first
    detectHardwareErrors(d).forEach(err => {
        res.push(mk(err.type, err.severity, `Bed ${bed} — ${err.label}: ${err.description}`, "Check hardware connections"));
    });

    // Hardware-triggered alert
    if (d.alert_active === true) {
        res.push(mk("HARDWARE_ALERT", "critical", `Bed ${bed} — ${pt}: Hardware alarm triggered!`, "Check patient and device immediately"));
    }

    const fp = d.percentage ?? d.fluid_level ?? d.fluidPercentage ?? 0;
    const fr = d.flow_rate ?? d.flowRate ?? 0;
    const tfr = d.target_flow ?? d.targetFlowRate ?? 100;
    const ab = d.air_bubble ?? d.airBubbleDetected ?? false;
    const pv = d.pressure ?? d.pressureValue ?? 0;
    const bat = d.battery_level ?? d.batteryLevel ?? 100;

    if (fp < 5)
        res.push(mk("NEAR_EMPTY_CRIT", "critical", `Bed ${bed} — ${pt}: IV critically empty (${fp.toFixed(0)}%)`, "Replace IV bag immediately"));
    else if (fp < 10)
        res.push(mk("NEAR_EMPTY", "warning", `Bed ${bed} — ${pt}: IV near empty (${fp.toFixed(0)}%)`, "Prepare new IV bag now"));

    if (ab === true)
        res.push(mk("AIR_BUBBLE", "critical", `Bed ${bed} — ${pt}: Air bubble detected!`, "Inspect IV line immediately"));

    if (pv > PRESSURE_LIM)
        res.push(mk("OCCLUSION", "critical", `Bed ${bed} — ${pt}: Occlusion — ${pv} mmHg`, "Check IV for blockage"));

    const diff = Math.abs(fr - tfr);
    if (diff > FLOW_THR) {
        const dir = fr > tfr ? "too fast" : "too slow";
        res.push(mk("FLOW_ERR", "warning", `Bed ${bed} — ${pt}: Flow ${dir} (${fr} vs ${tfr} mL/hr)`, `Adjust drip — target ${tfr} mL/hr`));
    }

    if (bat < 15 && bat > 0)
        res.push(mk("SERVICE_REQ", "warning", `Bed ${bed} — Equipment service req (Low power)`, "Connect device to power source"));

    return res;
}

/**
 * Priority score for queue ordering.
 */
export function priorityScore(d) {
    let s = 0;
    if (d.isOffline) s += 50;
    if (hasHardwareError(d)) s += 220;
    if (d.alarmStatus === "critical") s += 200;
    const fp = d.percentage ?? d.fluid_level ?? d.fluidPercentage ?? 100;
    const bat = d.battery_level ?? d.batteryLevel ?? 100;
    const pv = d.pressure ?? d.pressureValue ?? 0;
    const ab = d.air_bubble ?? d.airBubbleDetected ?? false;
    if (fp < 5) s += 180;
    if (fp < 10) s += 100;
    if (ab) s += 170;
    if (pv > PRESSURE_LIM) s += 155;
    const fd = Math.abs((d.flow_rate ?? d.flowRate ?? 0) - (d.target_flow ?? d.targetFlowRate ?? 100));
    if (fd > FLOW_THR) s += 55;
    if (bat < 15) s += 28;
    return s;
}

export function priorityReason(d) {
    if (hasHardwareError(d)) return detectHardwareErrors(d)[0]?.label ?? "Hardware error";
    if (d.alarmStatus === "critical") return "Critical alarm active";
    const fp = d.fluid_level ?? d.fluidPercentage ?? 100;
    if (fp < 5) return "IV critically empty (<5%)";
    if (fp < 10) return "IV near empty (<10%)";
    if (d.air_bubble ?? d.airBubbleDetected) return "Air bubble detected!";
    const pv = d.pressure ?? d.pressureValue ?? 0;
    if (pv > PRESSURE_LIM) return "Occlusion detected";
    if (d.isOffline) return "Device offline";
    const fd = Math.abs((d.flow_rate ?? d.flowRate ?? 0) - (d.target_flow ?? d.targetFlowRate ?? 100));
    if (fd > FLOW_THR) return `Flow anomaly (${fd.toFixed(0)} mL/hr off)`;
    const bat = d.battery_level ?? d.batteryLevel ?? 100;
    if (bat < 15) return "Low battery";
    return "Monitoring";
}

export function equipmentCondition(d) {
    if (d.isOffline) return { label: "DISCONNECTED", color: "var(--offline)" };
    const errs = detectHardwareErrors(d);
    if (errs.length > 0) return { label: "FAULTY", color: "var(--critical)" };
    if (d.battery_level < 20 || d.batteryLevel < 20) return { label: "SERVICE REQ", color: "var(--warning)" };
    return { label: "OPTIMAL", color: "var(--normal)" };
}

export function fmtAgo(sec) {
    if (!sec || sec < 5) return "just now";
    if (sec < 60) return `${Math.floor(sec)}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
}

export function fmtTS(ms) {
    return new Date(ms).toLocaleString("en-IN", {
        day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
    });
}
