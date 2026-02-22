// ============================================================
//  csvExport.js — Browser-side CSV download utility
// ============================================================
import { fmtTS } from "./statusEngine";

/**
 * Download an array of objects as a CSV file.
 */
export function downloadCSV(rows, filename) {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const lines = [
        headers.join(","),
        ...rows.map(row =>
            headers.map(h => {
                const val = row[h] ?? "";
                return `"${String(val).replace(/"/g, "'")}"`;
            }).join(",")
        ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Export alert history to CSV.
 */
export function exportAlertHistory(alerts) {
    const rows = alerts.map(a => ({
        Timestamp: fmtTS(a.time ?? a.timestamp ?? Date.now()),
        Bed: a.bed ?? "",
        Patient: a.patient ?? "",
        Type: a.type ?? "",
        Severity: a.severity ?? "",
        Message: a.message ?? "",
        Action: a.action ?? "",
        Status: a.acknowledged ? "Resolved" : "Unresolved",
    }));
    downloadCSV(rows, `SmartIV_AlertHistory_${dateSuffix()}.csv`);
}

/**
 * Export device monitoring data to CSV.
 */
export function exportDeviceData(devices) {
    const rows = Object.values(devices).map(d => ({
        DeviceID: d.deviceId ?? "",
        Bed: d.bedNumber ?? d.bed_number ?? "",
        Patient: d.patientName ?? d.patient_name ?? "",
        Status: d.status ?? "",
        FluidLevel: d.percentage ?? d.fluid_level ?? d.fluidPercentage ?? "",
        FluidML: d.fluid_ml ?? d.fluidRemainingML ?? "",
        FlowRate: d.flow_rate ?? d.flowRate ?? "",
        TargetFlow: d.target_flow ?? d.targetFlowRate ?? "",
        Pressure: d.pressure ?? d.pressureValue ?? "",
        "Battery (%)": d.battery_level ?? d.batteryLevel ?? "",
        EquipmentCondition: d.isOffline ? "DISCONNECTED" : (detectHardwareErrors(d).length > 0 ? "FAULTY" : "OPTIMAL"),
        Weight: d.weight ?? "",
        LoadcellError: d.loadcell_error ? "YES" : "NO",
        HX711Error: d.hx711_error ? "YES" : "NO",
        MCUError: d.mcu_error ? "YES" : "NO",
        Online: d.isOffline ? "OFFLINE" : "ONLINE",
        LastUpdated: fmtTS(d.lastUpdated ?? d.timestamp ?? Date.now()),
    }));
    downloadCSV(rows, `SmartIV_Devices_${dateSuffix()}.csv`);
}

/**
 * Export patient monitoring log to CSV.
 */
export function exportEventLog(logs) {
    const rows = logs.map(e => ({
        Timestamp: fmtTS(e.timestamp ?? Date.now()),
        Bed: e.bed ?? "SYS",
        Severity: e.severity ?? "",
        Event: e.message ?? e.msg ?? "",
    }));
    downloadCSV(rows, `SmartIV_EventLog_${dateSuffix()}.csv`);
}

function dateSuffix() {
    return new Date().toISOString().slice(0, 10);
}
