// App.jsx — Root application shell
import { useState, useCallback } from "react";
import { useFirebaseData } from "./hooks/useFirebaseData";
import { useToast, ToastStack } from "./components/ToastStack";
import { exportDeviceData } from "./utils/csvExport";

import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import PatientGrid from "./components/PatientGrid";
import BedMap from "./components/BedMap";
import PriorityQueue from "./components/PriorityQueue";
import AlertCenter from "./components/AlertCenter";
import DeviceHealth from "./components/DeviceHealth";
import EventLog from "./components/EventLog";
import AlertHistory from "./components/AlertHistory";
import NurseAssignment from "./components/NurseAssignment";
import BuzzerPanel from "./components/BuzzerPanel";
import PatientModal from "./components/PatientModal";
import AddDeviceModal from "./components/AddDeviceModal";
import ExportPanel from "./components/ExportPanel";
import IVMonitor from "./components/iv-monitor";
import ESP32LiveData from "./components/esp32/ESP32LiveData";

export default function App() {
  const {
    devices, nurses, alerts, alertHistory, eventLog,
    fbStatus, soundOn, setSoundOn,
    ackAlert, snoozeAlert, escalateAlert, acknowledgeAll,
    sendBuzzerCommand, addDevice, deleteDevice, saveNurse, addEventLog,
  } = useFirebaseData();

  const { toasts, show: showToast, dismiss } = useToast();

  const [view, setView] = useState("monitor");
  const [sbCollapsed, setSbCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDev, setSelectedDev] = useState(null);   // device id for modal
  const [showAddDev, setShowAddDev] = useState(false);
  const [showBuzzer, setShowBuzzer] = useState(false);

  const critAlerts = alerts.filter(a => a.severity === "critical" && !a.acknowledged);

  // ── Wrapped alert actions with toast ──────────────────────
  const handleAck = useCallback((id) => {
    ackAlert(id); showToast("ok", "✅ Acknowledged", "Alert cleared");
  }, [ackAlert, showToast]);

  const handleSnooze = useCallback((id) => {
    snoozeAlert(id); showToast("info", "🔇 Snoozed 5s", "Hardware alarm silenced");
  }, [snoozeAlert, showToast]);

  const handleEscalate = useCallback((id, deviceId) => {
    escalateAlert(id, deviceId); showToast("crit", "⬆ ESCALATED", "Supervisor notified!");
  }, [escalateAlert, showToast]);

  const handleAckAll = useCallback(() => {
    acknowledgeAll(); showToast("ok", "✅ All Acknowledged", "All alerts cleared");
  }, [acknowledgeAll, showToast]);

  const handleAddDevice = useCallback((payload) => {
    addDevice(payload);
    showToast("ok", "✅ Device Registered", `${payload.patientName} — Bed ${payload.bedNumber}`);
  }, [addDevice, showToast]);

  const handleBuzzer = useCallback((deviceId, cmd) => {
    sendBuzzerCommand(deviceId, cmd);
    showToast("info", "📡 Command Sent", `${cmd} → ${deviceId}`);
  }, [sendBuzzerCommand, showToast]);

  const handleSendCommand = useCallback((deviceId, cmd) => {
    sendBuzzerCommand(deviceId, cmd);
    showToast("info", "📡 ESP32 Command", `${cmd} sent to ${deviceId}`);
  }, [sendBuzzerCommand, showToast]);

  const testAlarm = useCallback(() => {
    setSoundOn(true);
    showToast("warn", "🔊 Alarm Test", "Alarm system is functional");
  }, [setSoundOn, showToast]);

  const handleRefresh = useCallback(() => {
    showToast("info", "🔄 Firebase Streaming", "Data updates in real-time");
  }, [showToast]);

  const selectedDevice = selectedDev ? devices[selectedDev] : null;

  return (
    <div className="app-shell">
      {/* ── Critical banner ──────────────────────────────────── */}
      {critAlerts.length > 0 && (
        <div className="crit-banner" role="alert">
          <span className="crit-blink">🚨</span>
          <span>
            {critAlerts.length} CRITICAL ALERT(S) — {" "}
            {critAlerts.slice(0, 3).map(a => `Bed ${a.bed}: ${(a.type ?? "").replace(/_/g, " ")}`).join(" | ")}
          </span>
          <button onClick={handleAckAll} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: "5px", padding: "2px 12px", cursor: "pointer", fontSize: "11px" }}>Ack All</button>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────── */}
      <Header
        devices={devices}
        alerts={alerts}
        fbStatus={fbStatus}
        soundOn={soundOn}
        onToggleSound={() => { setSoundOn(!soundOn); showToast("info", soundOn ? "🔕 Muted" : "🔊 Sound On", ""); }}
        onOpenAddDevice={() => setShowAddDev(true)}
        onRefresh={handleRefresh}
        onTestAlarm={testAlarm}
        onScrollAlerts={() => setView("alerts")}
        onSearch={setSearchQuery}
      />

      {/* ── Main layout ───────────────────────────────────────── */}
      <div className="layout">
        <Sidebar
          collapsed={sbCollapsed}
          onToggle={() => setSbCollapsed(p => !p)}
          currentView={view}
          onViewChange={setView}
          alertCount={alerts.filter(a => !a.acknowledged).length}
        />

        <main className={`main-area${sbCollapsed ? " sb-collapsed" : ""}`} role="main">

          {/* ── MONITOR view (default) ────────────────────────── */}
          {view === "monitor" && (
            <div className="content-col">
              {/* Row 1 — 3-column */}
              <div className="content-row" style={{ alignItems: "flex-start" }}>
                {/* Left */}
                <div className="left-col">
                  <BedMap devices={devices} onSelectDevice={setSelectedDev} />
                  <PriorityQueue devices={devices} onSelectDevice={setSelectedDev} />
                </div>

                {/* Center */}
                <PatientGrid
                  devices={devices}
                  searchQuery={searchQuery}
                  onSelectDevice={setSelectedDev}
                />

                {/* Right */}
                <div className="right-col">
                  <AlertCenter
                    alerts={alerts}
                    onAck={handleAck}
                    onSnooze={handleSnooze}
                    onEscalate={handleEscalate}
                    onAckAll={handleAckAll}
                  />
                  <DeviceHealth devices={devices} />
                </div>
              </div>

              {/* Row 2 — Event Log */}
              <EventLog logs={eventLog} />
            </div>
          )}

          {/* ── ALERTS view ───────────────────────────────────── */}
          {view === "alerts" && (
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <AlertCenter
                alerts={alerts}
                onAck={handleAck}
                onSnooze={handleSnooze}
                onEscalate={handleEscalate}
                onAckAll={handleAckAll}
              />
            </div>
          )}

          {/* ── PRIORITY view ─────────────────────────────────── */}
          {view === "priority" && (
            <div style={{ padding: "20px" }}>
              <PriorityQueue devices={devices} onSelectDevice={dev => { setSelectedDev(dev); setView("monitor"); }} />
            </div>
          )}

          {/* ── BED MAP view ──────────────────────────────────── */}
          {view === "bedmap" && (
            <div style={{ padding: "20px" }}>
              <BedMap devices={devices} onSelectDevice={dev => { setSelectedDev(dev); setView("monitor"); }} />
            </div>
          )}

          {/* ── NURSES view ───────────────────────────────────── */}
          {view === "nurses" && (
            <div style={{ padding: "20px", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-start" }}>
              <NurseAssignment nurses={nurses} devices={devices} onSaveNurse={saveNurse} />
            </div>
          )}

          {/* ── DEVICE HEALTH view ────────────────────────────── */}
          {view === "devhealth" && (
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <DeviceHealth devices={devices} />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="qa-btn" onClick={() => setShowBuzzer(true)} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  🔊 Buzzer Control Panel
                </button>
              </div>
            </div>
          )}

          {/* ── BUZZER view ───────────────────────────────────── */}
          {view === "buzzer" && (
            <div style={{ padding: "20px" }}>
              <BuzzerPanel
                devices={devices}
                onSendCommand={handleBuzzer}
                onClose={() => setView("monitor")}
              />
            </div>
          )}

          {/* ── IV MONITOR (ESP32) view ──────────────────────── */}
          {view === "ivmonitor" && (
            <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
              <div style={{ maxWidth: "500px", width: "100%" }}>
                <IVMonitor deviceId="esp32_001" />
              </div>
            </div>
          )}

          {/* ── ESP32 LIVE DATA view ─────────────────────────── */}
          {view === "esp32live" && (
            <ESP32LiveData deviceId="esp32_001" />
          )}

          {/* ── ALERT HISTORY view ────────────────────────────── */}
          {view === "history" && (
            <div style={{ padding: "20px" }}>
              <AlertHistory alertHistory={alertHistory} />
            </div>
          )}

          {/* ── EXPORT view ───────────────────────────────────── */}
          {view === "export" && (
            <div style={{ padding: "20px" }}>
              <ExportPanel devices={devices} alertHistory={alertHistory} eventLog={eventLog} />
            </div>
          )}
        </main>
      </div>

      {/* ── Modals ────────────────────────────────────────────── */}
      {selectedDevice && (
        <PatientModal
          device={selectedDevice}
          onClose={() => setSelectedDev(null)}
          onSendCommand={handleSendCommand}
          onDelete={() => { deleteDevice(selectedDev); setSelectedDev(null); showToast("warn", "🗑 Device Removed", "System updated"); }}
        />
      )}
      {showAddDev && (
        <AddDeviceModal onClose={() => setShowAddDev(false)} onAdd={handleAddDevice} />
      )}
      {showBuzzer && (
        <BuzzerPanel devices={devices} onSendCommand={handleBuzzer} onClose={() => setShowBuzzer(false)} />
      )}

      {/* ── Toast stack ───────────────────────────────────────── */}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
