/* ================================================================
   SmartIV ICU — app.js  v3.0  (Light Medical Theme)
   Full dashboard engine: Firebase listeners, status engine,
   alert system, priority queue, all UI rendering
================================================================ */
"use strict";

// ────────────────────────────────────────────────────────────────
//  GLOBAL STATE
// ────────────────────────────────────────────────────────────────
const STATE = {
  devices: {},       // deviceId → enriched device object
  alerts: [],        // active alert objects
  eventLog: [],      // event log entries
  filter: "all",
  searchQuery: "",
  soundOn: true,
  activeModal: null,
  snoozed: {},       // alertId → snoozeUntilMs
  sidebarCollapsed: false,
  usingDemo: false,
  fbConnected: false,
};

// ────────────────────────────────────────────────────────────────
//  CONSTANTS
// ────────────────────────────────────────────────────────────────
const FLOW_THR = 15;    // mL/hr deviation = warning
const PRESSURE_LIM = 250;   // mmHg occlusion threshold
const OFFLINE_SEC = 20;    // seconds before device goes offline
const SNOOZE_MS = 60_000;
const GROUP_MS = 60_000;

// ────────────────────────────────────────────────────────────────
//  BOOT
// ────────────────────────────────────────────────────────────────
(function boot() {
  clockTick();
  setInterval(clockTick, 1000);
  setInterval(reCheckOfflineStatus, 5000); // periodic offline check

  if (window._firebaseReady && window._db) {
    setupFirebaseListeners();
  } else {
    console.warn("[SmartIV] Firebase not ready — demo mode");
    STATE.usingDemo = true;
    setFBStatus("demo");
    setTimeout(() => {
      if (typeof window.startDemoMode === "function") window.startDemoMode();
    }, 120);
  }
})();

// ────────────────────────────────────────────────────────────────
//  CLOCK
// ────────────────────────────────────────────────────────────────
function clockTick() {
  const now = new Date();
  const t = now.toLocaleTimeString("en-IN", { hour12: false });
  const el = document.getElementById("liveClock");
  if (el) el.textContent = t;

  // update shift tag
  const h = now.getHours();
  const shiftEl = document.getElementById("shiftTag");
  if (shiftEl) {
    if (h >= 6 && h < 14) shiftEl.textContent = "🌅 Morning Shift · Nurse: R. Sharma";
    else if (h >= 14 && h < 22) shiftEl.textContent = "☀ Evening Shift · Nurse: P. Kumar";
    else shiftEl.textContent = "🌙 Night Shift · Nurse: S. Mehta";
  }
}

// ────────────────────────────────────────────────────────────────
//  FIREBASE LISTENERS
// ────────────────────────────────────────────────────────────────
function setupFirebaseListeners() {
  const db = window._db;
  if (!db) return;

  const devRef = window._ref(db, "devices");
  window._onValue(devRef, snap => {
    const data = snap.val();
    if (!data) {
      if (typeof window.seedFirebaseDemo === "function") window.seedFirebaseDemo();
      return;
    }
    STATE.fbConnected = true;
    STATE.usingDemo = false;
    setFBStatus("live");

    // Clear old device list to remove stale entries
    STATE.devices = {};
    Object.entries(data).forEach(([id, d]) => ingestDevice(id, d));
    renderAll();
  }, err => {
    console.error("[SmartIV] Firebase error:", err);
    setFBStatus("off");
    if (!STATE.usingDemo) {
      STATE.usingDemo = true;
      setFBStatus("demo");
      if (typeof window.startDemoMode === "function") window.startDemoMode();
    }
  });

  // Firebase Logs
  window._onValue(window._ref(db, "logs"), snap => {
    const data = snap.val();
    if (!data) return;
    const flat = [];
    Object.entries(data).forEach(([devId, entries]) => {
      Object.values(entries).forEach(e => flat.push({ ...e, deviceId: devId }));
    });
    flat.sort((a, b) => b.timestamp - a.timestamp);
    STATE.eventLog = flat.slice(0, 120);
    renderEventLog();
  });
}

// ────────────────────────────────────────────────────────────────
//  DEVICE INGESTION + STATUS ENGINE
// ────────────────────────────────────────────────────────────────
function ingestDevice(deviceId, data) {
  const now = Date.now();
  const lastUpd = data.lastUpdated || 0;
  const secAgo = (now - lastUpd) / 1000;
  const isOffline = lastUpd > 0 && secAgo > OFFLINE_SEC;

  const device = {
    ...data,
    deviceId,
    isOffline,
    secAgo,
    status: computeStatus(data, isOffline),
    alerts: computeAlerts(deviceId, data, isOffline),
  };

  STATE.devices[deviceId] = device;
  device.alerts.forEach(a => pushAlert(a));
}

function computeStatus(d, isOffline) {
  if (isOffline) return "offline";
  const fp = d.fluidPercentage || 0;
  const fr = d.flowRate || 0;
  const tfr = d.targetFlowRate || 100;
  const ab = d.airBubbleDetected;
  const pv = d.pressureValue || 0;

  if (d.alarmStatus === "critical") return "critical";
  if (fp < 5) return "critical";
  if (ab === true) return "critical";
  if (pv > PRESSURE_LIM) return "critical";
  if (fp < 15) return "warning";
  if (Math.abs(fr - tfr) > FLOW_THR) return "warning";
  if ((d.batteryLevel || 100) < 15) return "warning";
  return "normal";
}

function computeAlerts(deviceId, d, isOffline) {
  const res = [];
  const bed = d.bedNumber || deviceId;
  const pt = d.patientName || "Unknown";
  const now = Date.now();

  function mk(type, sev, msg, action) {
    return { id: `${deviceId}_${type}`, deviceId, bed, patient: pt, type, severity: sev, message: msg, action, time: now };
  }

  if (isOffline) {
    res.push(mk("OFFLINE", "warning", `Bed ${bed} — Device offline (no signal)`, "Check WiFi / Power"));
    return res;
  }

  const fp = d.fluidPercentage || 0;
  const fr = d.flowRate || 0;
  const tfr = d.targetFlowRate || 100;
  const ab = d.airBubbleDetected;
  const pv = d.pressureValue || 0;
  const bat = d.batteryLevel || 100;

  if (fp < 5)
    res.push(mk("NEAR_EMPTY_CRIT", "critical", `Bed ${bed} — ${pt}: IV critically empty (${fp.toFixed(0)}%)`, "Replace IV bag immediately"));
  else if (fp < 10)
    res.push(mk("NEAR_EMPTY", "warning", `Bed ${bed} — ${pt}: IV near empty (${fp.toFixed(0)}%)`, "Prepare new IV bag now"));

  if (ab === true)
    res.push(mk("AIR_BUBBLE", "critical", `Bed ${bed} — ${pt}: ⚠ Air bubble detected!`, "Inspect IV line immediately"));

  if (pv > PRESSURE_LIM)
    res.push(mk("OCCLUSION", "critical", `Bed ${bed} — ${pt}: Occlusion — ${pv} mmHg`, "Check IV for blockage"));

  const diff = Math.abs(fr - tfr);
  if (diff > FLOW_THR) {
    const dir = fr > tfr ? "too fast" : "too slow";
    res.push(mk("FLOW_ERR", "warning", `Bed ${bed} — ${pt}: Flow ${dir} (${fr} vs ${tfr} mL/hr)`, `Adjust drip — target ${tfr} mL/hr`));
  }

  if (bat < 15 && bat > 0)
    res.push(mk("LOW_BATTERY", "warning", `Bed ${bed} — Battery low (${bat}%)`, "Charge device battery"));

  return res;
}

// Periodic offline re-check (runs every 5s)
function reCheckOfflineStatus() {
  Object.entries(STATE.devices).forEach(([id, d]) => {
    const nowSec = (Date.now() - (d.lastUpdated || 0)) / 1000;
    if (nowSec > OFFLINE_SEC && !d.isOffline) {
      d.isOffline = true;
      d.secAgo = nowSec;
      d.status = "offline";
      d.alerts = computeAlerts(id, d, true);
      d.alerts.forEach(a => pushAlert(a));
      renderAll();
    }
  });
}

// ────────────────────────────────────────────────────────────────
//  ALERT PUSH (anti-fatigue grouping)
// ────────────────────────────────────────────────────────────────
function pushAlert(alert) {
  const key = alert.id;
  const now = Date.now();

  // Snoozed?
  if (STATE.snoozed[key] && STATE.snoozed[key] > now) return;

  // Already exists?
  const ex = STATE.alerts.find(a => a.id === key);
  if (ex) {
    if (now - ex.time < GROUP_MS) {
      ex.count = (ex.count || 1) + 1;
      ex.time = now;
      return;
    }
    ex.time = now;
    ex.acknowledged = false;
    ex.count = 1;
    return;
  }

  alert.count = 1;
  alert.acknowledged = false;
  STATE.alerts.unshift(alert);
  if (STATE.alerts.length > 60) STATE.alerts.length = 60;

  addLog(alert.bed, alert.message, alert.severity === "critical" ? "critical" : "warning");

  // Smart alarm escalation
  if (alert.severity === "critical" && STATE.soundOn) {
    playAlarm();
    // Level 3 → Firebase buzzer command
    if (!STATE.usingDemo && window._db) {
      window._set(window._ref(window._db, `commands/${alert.deviceId}`), {
        alarmCommand: "BUZZER_ON",
        timestamp: Date.now()
      }).catch(() => { });
    }
  }

  showToast(
    alert.severity === "critical" ? "crit" : "warn",
    alert.severity === "critical" ? "🚨 CRITICAL" : "⚠ WARNING",
    alert.message
  );
}

// ────────────────────────────────────────────────────────────────
//  PRIORITY SCORING
// ────────────────────────────────────────────────────────────────
function priorityScore(d) {
  let s = 0;
  if (d.isOffline) s += 50;
  if (d.alarmStatus === "critical") s += 200;
  if ((d.fluidPercentage || 100) < 5) s += 180;
  if ((d.fluidPercentage || 100) < 10) s += 100;
  if (d.airBubbleDetected) s += 170;
  if ((d.pressureValue || 0) > PRESSURE_LIM) s += 155;
  const fd = Math.abs((d.flowRate || 0) - (d.targetFlowRate || 100));
  if (fd > FLOW_THR) s += 55;
  if ((d.batteryLevel || 100) < 15) s += 28;
  return s;
}

function priorityReason(d) {
  if (d.alarmStatus === "critical") return "Critical alarm active";
  if ((d.fluidPercentage || 100) < 5) return "IV critically empty (<5%)";
  if ((d.fluidPercentage || 100) < 10) return "IV near empty (<10%)";
  if (d.airBubbleDetected) return "Air bubble detected!";
  if ((d.pressureValue || 0) > PRESSURE_LIM) return "Occlusion detected";
  if (d.isOffline) return "Device offline";
  const fd = Math.abs((d.flowRate || 0) - (d.targetFlowRate || 100));
  if (fd > FLOW_THR) return `Flow anomaly (${fd.toFixed(0)} mL/hr off)`;
  if ((d.batteryLevel || 100) < 15) return "Low battery";
  return "Monitoring";
}

// ────────────────────────────────────────────────────────────────
//  RENDER ALL
// ────────────────────────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderBedMap();
  renderPriorityList();
  renderPatientGrid();
  renderAlertCenter();
  renderDeviceHealth();
  renderEventLog();
  renderAlertBadge();
  renderCritBanner();
  if (STATE.activeModal) openPatientModal(STATE.activeModal);
}

// Expose for demo-data.js
window._renderAll = renderAll;
window._ingestDevice = ingestDevice;
window._addEventLog = addLog;
window._setFirebaseStatus = setFBStatus;
window.showToast = showToast;
window.addLog = addLog;
window.downloadLog = downloadLog;
window.clearLog = clearLog;

// ────────────────────────────────────────────────────────────────
//  STATS
// ────────────────────────────────────────────────────────────────
function renderStats() {
  const devs = Object.values(STATE.devices);
  setText("statTotal", devs.length);
  setText("statCritical", devs.filter(d => d.status === "critical").length);
  setText("statWarning", devs.filter(d => d.status === "warning").length);
  setText("statNormal", devs.filter(d => d.status === "normal").length);
}

// ────────────────────────────────────────────────────────────────
//  BED MAP
// ────────────────────────────────────────────────────────────────
function renderBedMap() {
  const el = document.getElementById("bedMap");
  const devs = Object.values(STATE.devices);
  if (!devs.length) { el.innerHTML = `<div class="empty-msg" style="grid-column:1/-1">No beds registered</div>`; return; }
  const icon = { normal: "🟢", warning: "🟡", critical: "🔴", offline: "⚫" };
  el.innerHTML = devs.map(d => `
    <div class="bm-cell ${d.status}" onclick="openPatientModal('${d.deviceId}')"
         title="${d.patientName || 'Unknown'} — ${d.status}"
         role="button" tabindex="0" aria-label="Bed ${d.bedNumber} ${d.patientName}">
      <span class="bm-icon">${icon[d.status] || "⚫"}</span>
      <span class="bm-num">B${d.bedNumber || "?"}</span>
    </div>`).join("");
}

// ────────────────────────────────────────────────────────────────
//  PRIORITY LIST
// ────────────────────────────────────────────────────────────────
function renderPriorityList() {
  const ranked = Object.values(STATE.devices)
    .map(d => ({ d, score: priorityScore(d) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  setText("pqBadge", ranked.length);
  const elPQ = document.getElementById("priorityList");
  if (!ranked.length) { elPQ.innerHTML = `<div class="empty-msg">All patients stable ✅</div>`; return; }

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  elPQ.innerHTML = ranked.map((item, i) => {
    const d = item.d;
    const sev = d.status === "critical" ? "crit" : "warn";
    return `
    <div class="pq-item pq-${sev}" onclick="openPatientModal('${d.deviceId}')" role="button" tabindex="0">
      <span class="pq-rank">${medals[i] || ""}</span>
      <div class="pq-info">
        <div class="pq-bed">Bed ${d.bedNumber || "?"} · ${(d.patientName || "Unknown").split(" ")[0]}</div>
        <div class="pq-why">${priorityReason(d)}</div>
      </div>
      <span class="pq-sev s-${sev}">${sev === "crit" ? "CRIT" : "WARN"}</span>
    </div>`;
  }).join("");
}

// ────────────────────────────────────────────────────────────────
//  PATIENT GRID
// ────────────────────────────────────────────────────────────────
function renderPatientGrid() {
  const grid = document.getElementById("patientGrid");
  let devs = Object.values(STATE.devices);

  if (STATE.filter !== "all") devs = devs.filter(d => d.status === STATE.filter);

  if (STATE.searchQuery.trim()) {
    const q = STATE.searchQuery.trim().toLowerCase();
    devs = devs.filter(d =>
      (d.patientName || "").toLowerCase().includes(q) ||
      String(d.bedNumber || "").includes(q) ||
      (d.ivType || "").toLowerCase().includes(q)
    );
  }

  if (!devs.length) {
    grid.innerHTML = `<div class="empty-msg" style="grid-column:1/-1;padding:48px 16px">
      <div style="font-size:32px;margin-bottom:8px">🔍</div>
      <div>No matching patients found</div>
    </div>`;
    return;
  }

  devs.sort((a, b) => priorityScore(b) - priorityScore(a));
  grid.innerHTML = devs.map(buildCard).join("");
}

function buildCard(d) {
  const fp = d.fluidPercentage || 0;
  const fr = d.flowRate || 0;
  const tfr = d.targetFlowRate || 100;
  const bat = d.batteryLevel || 0;
  const pv = d.pressureValue || 0;
  const ml = d.fluidRemainingML || 0;

  const barCls = fp < 5 ? "crit" : fp < 15 ? "low" : "";
  const flowCls = Math.abs(fr - tfr) > FLOW_THR ? "bad" : "good";
  const batCls = bat < 20 ? "bad" : bat < 40 ? "warn" : "good";
  const pvCls = pv > PRESSURE_LIM ? "bad" : "good";

  const stMap = { normal: "s-normal", warning: "s-warning", critical: "s-critical", offline: "s-offline" };
  const stTxt = { normal: "✅ Normal", warning: "⚠ Warning", critical: "🔴 CRITICAL", offline: "⚫ Offline" };

  const ab = d.airBubbleDetected;
  const ago = fmtAgo(d.secAgo || 0);

  const estTime = fr > 0 ? (ml / fr * 60).toFixed(0) + " min" : "N/A";

  return `
  <article class="patient-card s-${d.status}" id="card_${d.deviceId}"
           onclick="openPatientModal('${d.deviceId}')"
           role="button" tabindex="0"
           aria-label="Bed ${d.bedNumber} — ${d.patientName || 'Unknown'} — ${d.status}">
    <div class="ch">
      <div class="ch-left">
        <div class="ch-bed">BED ${d.bedNumber || "?"}</div>
        <div class="ch-name">${d.patientName || "Unknown"}</div>
      </div>
      <div class="ch-right">
        <span class="ch-status ${stMap[d.status] || ""}">${stTxt[d.status] || "—"}</span>
        <span class="ch-ivtype">${d.ivType || "IV Fluid"}</span>
      </div>
    </div>
    <div class="cf">
      <div class="cf-row">
        <span>Fluid Level</span>
        <span class="cf-pct">${fp.toFixed(0)}% &nbsp;·&nbsp; ${ml.toFixed(0)} mL</span>
      </div>
      <div class="cf-bar-bg" role="progressbar" aria-valuenow="${fp.toFixed(0)}" aria-valuemin="0" aria-valuemax="100" aria-label="Fluid level">
        <div class="cf-bar-fill ${barCls}" style="width:${Math.min(100, Math.max(0, fp)).toFixed(1)}%"></div>
      </div>
    </div>
    <div class="cm">
      <div class="cm-cell">
        <div class="cm-l">Flow</div>
        <div class="cm-v ${flowCls}">${fr}<small style="font-size:8px;font-weight:400"> mL/hr</small></div>
      </div>
      <div class="cm-cell">
        <div class="cm-l">Target</div>
        <div class="cm-v">${tfr}<small style="font-size:8px;font-weight:400"> mL/hr</small></div>
      </div>
      <div class="cm-cell">
        <div class="cm-l">Battery</div>
        <div class="cm-v ${batCls}">${bat}%</div>
      </div>
      <div class="cm-cell">
        <div class="cm-l">Est. Left</div>
        <div class="cm-v" style="font-size:11px">${estTime}</div>
      </div>
    </div>
    <div class="cfoot">
      <div class="cfoot-icons">
        <span class="cfoot-icon ${ab ? "active" : "ok"}" title="Air Bubble Status">${ab ? "🫧 AIR" : "🫧 OK"}</span>
        <span class="cfoot-icon ${d.isOffline ? "active" : "ok"}" title="Connectivity">${d.isOffline ? "📡 OFF" : "📡 ON"}</span>
        ${pv > PRESSURE_LIM ? `<span class="cfoot-icon active" title="Occlusion">🔧 OCC</span>` : ""}
      </div>
      <span class="cfoot-upd">${ago}</span>
    </div>
  </article>`;
}

// ────────────────────────────────────────────────────────────────
//  ALERT CENTER
// ────────────────────────────────────────────────────────────────
function renderAlertCenter() {
  const al = document.getElementById("alertList");
  const active = STATE.alerts.filter(a => !a.acknowledged);

  setText("alertCenterBadge", active.length);

  if (!active.length) {
    al.innerHTML = `<div class="empty-msg">✅ No active alerts — All patients stable</div>`;
    return;
  }

  const iconMap = {
    NEAR_EMPTY_CRIT: "🚨", NEAR_EMPTY: "🔴", AIR_BUBBLE: "🫧",
    OCCLUSION: "🔧", FLOW_ERR: "⚡", OFFLINE: "📡", LOW_BATTERY: "🔋"
  };

  al.innerHTML = active.map(a => {
    const cls = a.severity === "critical" ? "al-crit" : "al-warn";
    const grp = a.count > 1 ? `<span class="al-grp">×${a.count}</span>` : "";
    const ts = new Date(a.time).toLocaleTimeString("en-IN", { hour12: false });
    return `
    <div class="al-item ${cls}" id="al_${a.id}" role="alert">
      <div class="al-top">
        <span class="al-ico">${iconMap[a.type] || "⚠"}</span>
        <div class="al-txt">
          <div class="al-title">${a.message}${grp}</div>
          <div class="al-meta">Bed ${a.bed} · ${ts}</div>
          <div class="al-action">→ ${a.action || ""}</div>
        </div>
      </div>
      <div class="al-btns">
        <button class="al-btn ab-ack" onclick="ackAlert('${a.id}')" id="ack-${a.id}">✅ Ack</button>
        <button class="al-btn" onclick="snoozeAlert('${a.id}')" id="snz-${a.id}">😴 Snooze</button>
        <button class="al-btn ab-esc" onclick="escalateAlert('${a.id}')" id="esc-${a.id}">⬆ Escalate</button>
      </div>
    </div>`;
  }).join("");
}

// ────────────────────────────────────────────────────────────────
//  DEVICE HEALTH
// ────────────────────────────────────────────────────────────────
function renderDeviceHealth() {
  const el = document.getElementById("deviceHealthList");
  const devs = Object.values(STATE.devices);
  if (!devs.length) { el.innerHTML = `<div class="empty-msg">No devices registered</div>`; return; }
  el.innerHTML = devs.map(d => {
    const bat = d.batteryLevel || 0;
    const bCol = bat < 20 ? "var(--critical)" : bat < 40 ? "var(--warning)" : "var(--normal)";
    const dotCol = d.isOffline ? "var(--critical)" : "var(--normal)";
    const batPct = Math.min(100, Math.max(0, bat));
    return `
    <div class="dh-item">
      <div class="dh-dot" style="background:${dotCol}"></div>
      <div class="dh-info">
        <div class="dh-name">Bed ${d.bedNumber || "?"} — ${(d.patientName || "Unknown").split(" ")[0]}</div>
        <div class="dh-meta">${d.isOffline ? "⛔ Device Offline" : "✅ " + fmtAgo(d.secAgo || 0)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
        <span class="dh-bat" style="color:${bCol}">${bat}% 🔋</span>
        <div class="dh-bat-bar">
          <div class="dh-bat-fill" style="width:${batPct}%;background:${bCol}"></div>
        </div>
      </div>
    </div>`;
  }).join("");
}

// ────────────────────────────────────────────────────────────────
//  EVENT LOG
// ────────────────────────────────────────────────────────────────
function renderEventLog() {
  const tbody = document.getElementById("logBody");
  setText("logCount", `${STATE.eventLog.length} events`);
  if (!tbody) return;
  if (!STATE.eventLog.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-msg">No events recorded</td></tr>`;
    return;
  }

  const sevClass = { critical: "sv-critical", warning: "sv-warning", ok: "sv-ok", warning: "sv-warning" };
  const sevLabel = { critical: "Critical", warning: "Warning", ok: "Normal" };

  tbody.innerHTML = STATE.eventLog.slice(0, 100).map(e => {
    const ts = fmtTS(e.timestamp || Date.now());
    const sc = e.severity === "critical" ? "sv-critical" : e.severity === "warning" ? "sv-warning" : "sv-ok";
    const sl = e.severity === "critical" ? "Critical" : e.severity === "warning" ? "Warning" : "Normal";
    return `<tr>
      <td class="ll-ts">${ts}</td>
      <td class="ll-bed">Bed ${e.bed || "SYS"}</td>
      <td><span class="ll-sev-badge ${sc}">${sl}</span></td>
      <td style="color:var(--text-secondary);font-size:11.5px">${e.message || e.msg || "Event"}</td>
    </tr>`;
  }).join("");
}

// ────────────────────────────────────────────────────────────────
//  ALERT BADGE + CRITICAL BANNER
// ────────────────────────────────────────────────────────────────
function renderAlertBadge() {
  const count = STATE.alerts.filter(a => !a.acknowledged).length;
  const badge = document.getElementById("alertBadge");
  const navBdg = document.getElementById("navAlertBadge");
  badge.textContent = count;
  navBdg.textContent = count;
  badge.style.display = count ? "flex" : "none";
}

function renderCritBanner() {
  const crits = STATE.alerts.filter(a => a.severity === "critical" && !a.acknowledged);
  const banner = document.getElementById("critBanner");
  if (crits.length) {
    setText("critBannerMsg",
      `🚨 ${crits.length} CRITICAL ALERT(S) — ` +
      crits.slice(0, 3).map(a => `Bed ${a.bed}: ${a.type.replace(/_/g, " ")}`).join(" | ")
    );
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

// ────────────────────────────────────────────────────────────────
//  PATIENT MODAL
// ────────────────────────────────────────────────────────────────
function openPatientModal(deviceId) {
  const d = STATE.devices[deviceId];
  if (!d) return;
  STATE.activeModal = deviceId;
  document.getElementById("modalOverlay").style.display = "flex";

  const fp = d.fluidPercentage || 0;
  const fr = d.flowRate || 0;
  const tfr = d.targetFlowRate || 100;
  const bat = d.batteryLevel || 0;
  const pv = d.pressureValue || 0;
  const ab = d.airBubbleDetected;
  const ml = d.fluidRemainingML || 0;

  setText("pmBed", `Bed ${d.bedNumber || "?"}`);
  setText("pmName", d.patientName || "Unknown");
  setText("pmIVType", d.ivType || "IV Fluid");

  const stBadge = document.getElementById("pmStatus");
  const stStyles = {
    normal: "background:var(--normal-bg);color:var(--normal);border:1px solid var(--normal-border)",
    warning: "background:var(--warning-bg);color:var(--warning);border:1px solid var(--warning-border)",
    critical: "background:var(--critical-bg);color:var(--critical);border:1px solid var(--critical-border)",
    offline: "background:var(--offline-bg);color:var(--offline);border:1px solid var(--offline-border)"
  };
  stBadge.style.cssText = stStyles[d.status] || "";
  stBadge.textContent = (d.status || "—").toUpperCase();

  // Fluid gauge
  const gRing = document.getElementById("pmGaugeRing");
  const gCol = fp < 10 ? "var(--critical)" : fp < 25 ? "var(--warning)" : "var(--primary)";
  gRing.style.background = `conic-gradient(${gCol} ${fp.toFixed(1)}%, var(--border-light) 0)`;
  setText("pmGaugePct", `${fp.toFixed(0)}%`);
  setText("pmGaugeML", `${ml.toFixed(0)} mL`);

  // Flow rate
  setText("pmFlowRate", `${fr} mL/hr`);
  setText("pmTargetRate", tfr);
  const delta = fr - tfr;
  const dEl = document.getElementById("pmDelta");
  dEl.textContent = `${delta > 0 ? "+" : ""}${delta.toFixed(0)} mL/hr`;
  dEl.style.color = Math.abs(delta) > FLOW_THR ? "var(--critical)" : "var(--normal)";
  const maxRate = Math.max(tfr, fr, 10);
  const fillEl = document.getElementById("pmFlowFill");
  fillEl.style.width = `${Math.min(100, (fr / maxRate * 100)).toFixed(1)}%`;
  fillEl.style.background = Math.abs(delta) > FLOW_THR ? "var(--critical)" : "var(--primary)";
  document.getElementById("pmTargetLine").style.left = `${(tfr / maxRate * 100).toFixed(1)}%`;

  // Air Bubble
  const abEl = document.getElementById("pmAirBubble");
  if (ab) {
    abEl.innerHTML = `<span class="sb-icon">🫧</span><span class="sb-txt" style="color:var(--critical)">AIR BUBBLE DETECTED!</span>`;
    abEl.style.background = "var(--critical-bg)";
    abEl.style.borderColor = "var(--critical-border)";
  } else {
    abEl.innerHTML = `<span class="sb-icon">💧</span><span class="sb-txt" style="color:var(--normal)">No air bubble — Clear</span>`;
    abEl.style.background = "var(--normal-bg)";
    abEl.style.borderColor = "var(--normal-border)";
  }

  // Occlusion
  setText("pmPressure", `${pv} mmHg`);
  const occEl = document.getElementById("pmOcclusion");
  if (pv > PRESSURE_LIM) {
    occEl.innerHTML = `<span class="sb-icon">🔴</span><span class="sb-txt" style="color:var(--critical)">OCCLUSION DETECTED</span>`;
    occEl.style.background = "var(--critical-bg)";
    occEl.style.borderColor = "var(--critical-border)";
  } else {
    occEl.innerHTML = `<span class="sb-icon">🔵</span><span class="sb-txt" style="color:var(--normal)">Pressure normal</span>`;
    occEl.style.background = "var(--normal-bg)";
    occEl.style.borderColor = "var(--normal-border)";
  }

  // Battery
  const bCol = bat < 20 ? "var(--critical)" : bat < 40 ? "var(--warning)" : "var(--normal)";
  document.getElementById("pmBatFill").style.cssText = `width:${bat}%;background:${bCol}`;
  setText("pmBatPct", `${bat}%`);

  // Network
  const onlineEl = document.getElementById("pmOnline");
  onlineEl.textContent = d.isOffline ? "⛔ OFFLINE" : "✅ Online";
  onlineEl.style.color = d.isOffline ? "var(--critical)" : "var(--normal)";
  setText("pmLastUpd", fmtAgo(d.secAgo || 0));
  setText("pmDevId", deviceId);

  document.getElementById("patientModal").dataset.deviceId = deviceId;
}
window.openPatientModal = openPatientModal;

function closePatientModal() {
  document.getElementById("modalOverlay").style.display = "none";
  STATE.activeModal = null;
}
window.closePatientModal = closePatientModal;

function closeModal(e) {
  if (e.target.id === "modalOverlay") closePatientModal();
}
window.closeModal = closeModal;

// ────────────────────────────────────────────────────────────────
//  ESP32 COMMANDS
// ────────────────────────────────────────────────────────────────
function sendCommand(cmd) {
  const deviceId = document.getElementById("patientModal")?.dataset?.deviceId;
  if (!deviceId) return;
  const d = STATE.devices[deviceId];
  const bed = d?.bedNumber || deviceId;

  if (STATE.usingDemo || !window._db) {
    showToast("info", "📡 Command (Demo)", `"${cmd}" → Bed ${bed}`);
    addLog(bed, `ESP32 command: ${cmd}`, "ok");
    return;
  }
  const r = window._ref(window._db, `commands/${deviceId}`);
  window._set(r, { alarmCommand: cmd, timestamp: Date.now() })
    .then(() => {
      showToast("ok", "📡 Command Sent", `"${cmd}" → Bed ${bed}`);
      addLog(bed, `ESP32 command: ${cmd}`, "ok");
      if (cmd === "ESCALATE") showToast("crit", "⬆ ESCALATED", `Bed ${bed} alarm escalated to supervisor`);
    })
    .catch(err => showToast("crit", "Command Failed", err.message));
}
window.sendCommand = sendCommand;

// ────────────────────────────────────────────────────────────────
//  ALERT ACTIONS
// ────────────────────────────────────────────────────────────────
function ackAlert(id) {
  const a = STATE.alerts.find(x => x.id === id);
  if (!a) return;
  a.acknowledged = true;
  addLog(a.bed, `Alert acknowledged: ${a.type}`, "ok");
  renderAlertCenter(); renderAlertBadge(); renderCritBanner();
  showToast("ok", "✅ Acknowledged", `Bed ${a.bed} alert cleared`);
  if (!STATE.usingDemo && window._db) {
    window._push(window._ref(window._db, `logs/${a.deviceId}`),
      { bed: a.bed, message: `Acknowledged: ${a.message}`, severity: "ok", timestamp: Date.now() });
  }
}
window.ackAlert = ackAlert;

function snoozeAlert(id) {
  const a = STATE.alerts.find(x => x.id === id);
  if (!a) return;
  a.acknowledged = true;
  STATE.snoozed[id] = Date.now() + SNOOZE_MS;
  addLog(a.bed, `Alert snoozed 1min: ${a.type}`, "warning");
  renderAlertCenter(); renderAlertBadge(); renderCritBanner();
  showToast("info", "😴 Snoozed 1 min", `Bed ${a.bed} alert will reactivate in 1 minute`);
}
window.snoozeAlert = snoozeAlert;

function escalateAlert(id) {
  const a = STATE.alerts.find(x => x.id === id);
  if (!a) return;
  addLog(a.bed, `‼ ESCALATED to supervisor: ${a.message}`, "critical");
  showToast("crit", "⬆ ESCALATED", `Bed ${a.bed} escalated to nursing supervisor!`);
  if (!STATE.usingDemo && window._db) {
    window._set(window._ref(window._db, `commands/${a.deviceId}`),
      { alarmCommand: "ESCALATE", timestamp: Date.now() });
  }
}
window.escalateAlert = escalateAlert;

function acknowledgeAll() {
  STATE.alerts.forEach(a => a.acknowledged = true);
  addLog("ALL", "All alerts acknowledged by nurse", "ok");
  renderAlertCenter(); renderAlertBadge(); renderCritBanner();
  showToast("ok", "✅ All Acknowledged", "All active alerts cleared");
}
window.acknowledgeAll = acknowledgeAll;

function clearAlerts() {
  STATE.alerts = [];
  renderAlertCenter(); renderAlertBadge(); renderCritBanner();
  showToast("info", "🗑 Cleared", "Alert log cleared");
}
window.clearAlerts = clearAlerts;

// ────────────────────────────────────────────────────────────────
//  ADD DEVICE
// ────────────────────────────────────────────────────────────────
function openAddDevice() {
  document.getElementById("addDeviceOverlay").style.display = "flex";
}
window.openAddDevice = openAddDevice;

function closeAddDevice() {
  document.getElementById("addDeviceOverlay").style.display = "none";
}
window.closeAddDevice = closeAddDevice;

function closeAddModal(e) {
  if (e.target.id === "addDeviceOverlay") closeAddDevice();
}
window.closeAddModal = closeAddModal;

function addDevice() {
  const id = document.getElementById("ad_id").value.trim();
  const bed = document.getElementById("ad_bed").value.trim();
  const name = document.getElementById("ad_name").value.trim();
  const type = document.getElementById("ad_type").value;
  const vol = parseFloat(document.getElementById("ad_vol").value) || 500;
  const flow = parseFloat(document.getElementById("ad_flow").value) || 100;

  if (!id || !bed || !name) {
    showToast("warn", "⚠ Missing Fields", "Please fill in all required fields");
    return;
  }

  const payload = {
    bedNumber: bed, patientName: name, ivType: type,
    fluidRemainingML: vol, fluidPercentage: 100,
    flowRate: flow, targetFlowRate: flow, pressureValue: 85,
    airBubbleDetected: false, batteryLevel: 90,
    deviceOnline: true, lastUpdated: Date.now(),
    alarmStatus: "normal", alarmSeverity: "none"
  };

  if (!STATE.usingDemo && window._db) {
    window._set(window._ref(window._db, `devices/${id}`), payload)
      .then(() => {
        showToast("ok", "✅ Device Registered", `${name} — Bed ${bed}`);
        closeAddDevice();
      })
      .catch(err => showToast("crit", "Error", err.message));
  } else {
    ingestDevice(id, payload);
    addLog(bed, `Device registered: ${name}`, "ok");
    renderAll();
    showToast("ok", "✅ Device Added (Demo)", `${name} — Bed ${bed}`);
    closeAddDevice();
  }
}
window.addDevice = addDevice;

// ────────────────────────────────────────────────────────────────
//  BUZZER CONTROL PANEL
// ────────────────────────────────────────────────────────────────
function openBuzzerPanel() {
  document.getElementById("buzzerOverlay").style.display = "flex";
  const grid = document.getElementById("buzzerGrid");
  const devs = Object.values(STATE.devices);
  if (!devs.length) { grid.innerHTML = `<div class="empty-msg">No devices registered</div>`; return; }
  grid.innerHTML = devs.map(d => `
    <div class="buzzer-row">
      <div>
        <div class="bz-info">Bed ${d.bedNumber || "?"} · ${(d.patientName || "Unknown").split(" ")[0]}</div>
        <div class="bz-bed">${d.deviceId} · ${d.isOffline ? "⛔ OFFLINE" : "✅ Online"}</div>
      </div>
      <div class="bz-btns">
        <button class="al-btn" onclick="sendCommandTo('${d.deviceId}','BUZZER_ON')">🔊 ON</button>
        <button class="al-btn" onclick="sendCommandTo('${d.deviceId}','BUZZER_OFF')">🔕 OFF</button>
        <button class="al-btn ab-esc" onclick="sendCommandTo('${d.deviceId}','ESCALATE')">⬆ Esc</button>
      </div>
    </div>`).join("");
}
window.openBuzzerPanel = openBuzzerPanel;

function closeBuzzerPanel(e) {
  if (!e || e.target?.id === "buzzerOverlay")
    document.getElementById("buzzerOverlay").style.display = "none";
}
window.closeBuzzerPanel = closeBuzzerPanel;

function sendCommandTo(deviceId, cmd) {
  const d = STATE.devices[deviceId];
  if (!d) return;
  if (STATE.usingDemo || !window._db) {
    addLog(d.bedNumber, `Command: ${cmd}`, "ok");
    showToast("info", "📡 Sent (Demo)", `"${cmd}" → Bed ${d.bedNumber}`);
    return;
  }
  window._set(window._ref(window._db, `commands/${deviceId}`), { alarmCommand: cmd, timestamp: Date.now() })
    .then(() => showToast("ok", "📡 Sent", `"${cmd}" → Bed ${d.bedNumber}`));
}
window.sendCommandTo = sendCommandTo;

// ────────────────────────────────────────────────────────────────
//  FILTER + SEARCH + VIEW
// ────────────────────────────────────────────────────────────────
function setFilter(f, btn) {
  STATE.filter = f;
  document.querySelectorAll(".fpill").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  else {
    const el = document.getElementById(`fp-${f}`);
    if (el) el.classList.add("active");
  }
  renderPatientGrid();
}
window.setFilter = setFilter;

function filterCards() {
  STATE.searchQuery = document.getElementById("searchInput").value;
  renderPatientGrid();
}
window.filterCards = filterCards;

function viewToggle(mode) {
  const grid = document.getElementById("patientGrid");
  if (mode === "list") {
    grid.style.gridTemplateColumns = "1fr";
  } else {
    grid.style.gridTemplateColumns = "repeat(auto-fill,minmax(260px,1fr))";
  }
}
window.viewToggle = viewToggle;

function setView(v) { /* reserved for future views */ }
window.setView = setView;

// ────────────────────────────────────────────────────────────────
//  SOUND SYSTEM
// ────────────────────────────────────────────────────────────────
let _audioCtx = null;

function playAlarm() {
  if (!STATE.soundOn || document.hidden) return;
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100, 880, 1100].forEach((freq, i) => {
      const osc = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.connect(gain); gain.connect(_audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = "square";
      const t = _audioCtx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.start(t); osc.stop(t + 0.22);
    });
  } catch (e) { /* AudioContext not available */ }
}

function toggleSound() {
  STATE.soundOn = !STATE.soundOn;
  const btn = document.getElementById("soundBtn");
  if (btn) {
    btn.style.color = STATE.soundOn ? "" : "var(--offline)";
    btn.style.borderColor = STATE.soundOn ? "" : "var(--offline-border)";
  }
  showToast("info", STATE.soundOn ? "🔊 Sound ON" : "🔕 Sound OFF",
    STATE.soundOn ? "Alarm sound enabled" : "Alarm sound muted");
}
window.toggleSound = toggleSound;

function testAlarm() {
  STATE.soundOn = true;
  playAlarm();
  showToast("warn", "🔊 Alarm Test", "Alarm system is functional");
}
window.testAlarm = testAlarm;

// ────────────────────────────────────────────────────────────────
//  EVENT LOG
// ────────────────────────────────────────────────────────────────
function addLog(bed, message, severity) {
  const entry = { bed, message, severity, timestamp: Date.now() };
  STATE.eventLog.unshift(entry);
  if (STATE.eventLog.length > 200) STATE.eventLog.length = 200;
  setText("logCount", `${STATE.eventLog.length} events`);
  renderEventLog();

  if (!STATE.usingDemo && window._db && bed !== "SYSTEM") {
    window._push(window._ref(window._db, `logs/${bed}`), entry).catch(() => { });
  }
}
window.addLog = addLog;
window._addEventLog = addLog;

function downloadLog() {
  const header = "Timestamp,Bed,Severity,Message\n";
  const rows = STATE.eventLog.map(e =>
    `"${fmtTS(e.timestamp)}","${e.bed}","${e.severity}","${(e.message || e.msg || "").replace(/"/g, "'")}"`)
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `SmartIV_Log_${new Date().toISOString().slice(0, 10)}.csv`
  });
  a.click();
  showToast("ok", "⬇ Exported", "CSV log downloaded successfully");
}
window.downloadLog = downloadLog;

function clearLog() {
  STATE.eventLog = [];
  renderEventLog();
  showToast("info", "🗑 Log Cleared", "Event log has been cleared");
}
window.clearLog = clearLog;

// ────────────────────────────────────────────────────────────────
//  TOAST NOTIFICATIONS
// ────────────────────────────────────────────────────────────────
function showToast(type, title, msg) {
  const icons = { crit: "🚨", warn: "⚠", ok: "✅", info: "ℹ", success: "✅" };
  const cls = { crit: "t-crit", warn: "t-warn", ok: "t-ok", info: "t-info", success: "t-ok" };
  const el = document.createElement("div");
  el.className = `toast ${cls[type] || "t-info"}`;
  el.setAttribute("role", "status");
  el.innerHTML = `
    <span class="t-icon">${icons[type] || "ℹ"}</span>
    <div class="t-body">
      <div class="t-title">${title}</div>
      ${msg ? `<div class="t-msg">${msg}</div>` : ""}
    </div>
    <span class="t-close" onclick="this.closest('.toast').remove()" title="Dismiss">✕</span>`;
  document.getElementById("toastStack").prepend(el);
  setTimeout(() => {
    el.classList.add("removing");
    setTimeout(() => el.remove(), 320);
  }, 4500);
}
window.showToast = showToast;

// ────────────────────────────────────────────────────────────────
//  SIDEBAR & NAVIGATION
// ────────────────────────────────────────────────────────────────
function toggleSidebar() {
  STATE.sidebarCollapsed = !STATE.sidebarCollapsed;
  const sb = document.getElementById("sidebar");
  const ma = document.getElementById("mainArea");
  const btn = document.getElementById("btn-sidebar-toggle");
  sb.classList.toggle("collapsed", STATE.sidebarCollapsed);
  if (ma) ma.classList.toggle("sb-collapsed", STATE.sidebarCollapsed);
  if (btn) {
    btn.innerHTML = STATE.sidebarCollapsed
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
  }
}
window.toggleSidebar = toggleSidebar;

function toggleNav(group) {
  const items = document.getElementById(`ngi-${group}`);
  const ng = document.getElementById(`ng-${group}`);
  if (!items) return;
  const isOpen = !items.classList.contains("collapsed");
  items.classList.toggle("collapsed", isOpen);
  if (ng) ng.classList.toggle("active", !isOpen);
}
window.toggleNav = toggleNav;

// ────────────────────────────────────────────────────────────────
//  MISC
// ────────────────────────────────────────────────────────────────
function forceRefresh() {
  if (STATE.usingDemo) {
    if (typeof window.tickDemoData === "function") window.tickDemoData();
    showToast("info", "🔄 Refreshed", "Demo data updated with new values");
  } else {
    showToast("info", "🔄 Firebase Active", "Data is streaming in real-time");
  }
}
window.forceRefresh = forceRefresh;

function scrollToAlerts() {
  document.getElementById("alertCenter")?.scrollIntoView({ behavior: "smooth" });
}
window.scrollToAlerts = scrollToAlerts;

function setFBStatus(state) {
  const dot = document.getElementById("fbDot");
  const lbl = document.getElementById("fbLabel");
  const sd = document.getElementById("sysStatusDot");
  if (!dot || !lbl) return;
  dot.className = "fb-dot";
  if (state === "live") {
    dot.classList.add("live"); lbl.textContent = "Firebase Live";
    if (sd) { sd.className = "pulse-dot green"; }
    setText("sysStatusText", "System Online");
  } else if (state === "demo") {
    dot.classList.add("demo"); lbl.textContent = "Demo Mode";
    if (sd) { sd.className = "pulse-dot"; sd.style.background = "var(--warning)"; }
    setText("sysStatusText", "Demo Mode");
  } else {
    dot.classList.add("off"); lbl.textContent = "Offline";
    if (sd) { sd.className = "pulse-dot"; sd.style.background = "var(--critical)"; }
    setText("sysStatusText", "Firebase Offline");
  }
}
window._setFirebaseStatus = setFBStatus;

// ────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function fmtAgo(sec) {
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec.toFixed(0)}s ago`;
  if (sec < 3600) return `${(sec / 60).toFixed(0)}m ago`;
  return `${(sec / 3600).toFixed(0)}h ago`;
}

function fmtTS(ms) {
  return new Date(ms).toLocaleString("en-IN", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  });
}
