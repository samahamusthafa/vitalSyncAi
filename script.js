// ─── Elements ─────────────────────────────────────────────────────────────
const video  = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");

// ─── State ────────────────────────────────────────────────────────────────
let blinkCount    = 0;
let lastEyeState  = "open";
let lastAlertTime = 0;
let isRunning     = false;
let cameraInst    = null;
let timerInst     = null;
let seconds       = 0;
const alertsLog   = [];

// ─── Hydration State ──────────────────────────────────────────────────────
const HYDRATE_INTERVAL = 30;   // 10 seconds for testing — change to 1200 for final demo
let hydrateSecsLeft    = HYDRATE_INTERVAL;
let hydrateTimer       = null;
let cupsToday          = 0;

// ─── EAR landmarks ────────────────────────────────────────────────────────
const LEFT_EYE  = [33,  160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
const EAR_CLOSE = 0.20;
const EAR_OPEN  = 0.22;

function ear(lm, idx) {
  const p = idx.map(i => lm[i]);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]));
}

// ─── FaceMesh ─────────────────────────────────────────────────────────────
const faceMesh = new FaceMesh({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
faceMesh.onResults(onResults);

// ─── Per-frame detection ──────────────────────────────────────────────────
function onResults(results) {
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks?.length) return;
  const lm = results.multiFaceLandmarks[0];

  // Blink
  const avgEar = (ear(lm, LEFT_EYE) + ear(lm, RIGHT_EYE)) / 2;
  if (avgEar < EAR_CLOSE && lastEyeState === "open") {
    blinkCount++;
    lastEyeState = "closed";
    document.getElementById("blinkVal").textContent = blinkCount;
  }
  if (avgEar > EAR_OPEN) lastEyeState = "open";

  if (blinkCount < 5 && Date.now() - lastAlertTime > 8000)
    pushAlert("info", "Blink more — your eyes need moisture");

  // Posture
  const tilt    = lm[10].y - lm[1].y;
  const posture = tilt > 0.1 ? "Poor" : "Good";
  if (posture === "Poor" && Date.now() - lastAlertTime > 6000)
    pushAlert("warn", "Sit straight — posture drift detected");

  // Stress
  const stress = blinkCount < 5 ? "High" : blinkCount < 12 ? "Medium" : "Calm";
  const stressClass = stress === "Calm" ? "badge-low" : "badge-warn";

  setMetric("postureVal", "postureBadge", posture, posture === "Good" ? "badge-good" : "badge-warn");
  setMetric("stressVal",  "stressBadge",  stress,  stressClass);
}

function setMetric(valId, badgeId, text, cls) {
  document.getElementById(valId).textContent = text;
  const b = document.getElementById(badgeId);
  b.textContent   = text;
  b.className     = "metric-badge " + cls;
  b.style.display = "inline-block";
}

// ─── Alerts ───────────────────────────────────────────────────────────────
function pushAlert(type, msg) {
  if (Date.now() - lastAlertTime < 3000) return;
  lastAlertTime = Date.now();
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  alertsLog.unshift({ type, msg, time });
  if (alertsLog.length > 6) alertsLog.pop();
  document.getElementById("alertsList").innerHTML = alertsLog.map(a =>
    `<div class="alert-item">
       <div class="alert-dot dot-${a.type}"></div>
       <span class="alert-msg">${a.msg}</span>
       <span class="alert-time">${a.time}</span>
     </div>`
  ).join("");
  document.getElementById("alertCount").textContent = alertsLog.length + " new";
}

// ─── UI helpers ───────────────────────────────────────────────────────────
function setUI(active) {
  const btn = document.getElementById("startBtn");
  btn.textContent = active ? "End Session" : "Start Session";
  active ? btn.classList.add("btn-danger") : btn.classList.remove("btn-danger");

  document.getElementById("statusDot").classList.toggle("active", active);
  document.getElementById("statusText").textContent = active ? "Active" : "Inactive";
  document.getElementById("statusPill").classList.toggle("pill-active", active);

  document.getElementById("cameraLabel").textContent = active ? "ANALYZING" : "STANDBY";
  document.getElementById("cameraLabel").classList.toggle("label-active", active);
  document.getElementById("placeholder").style.display = active ? "none" : "flex";
  document.getElementById("scanLine").style.display    = active ? "block" : "none";
  document.getElementById("liveBadge").classList.toggle("live-on", active);
  document.getElementById("cameraView").classList.toggle("camera-active", active);
}

function resetMetrics() {
  ["blinkVal","postureVal","stressVal"].forEach(id =>
    document.getElementById(id).textContent = "—");
  ["postureBadge","stressBadge"].forEach(id =>
    document.getElementById(id).style.display = "none");
  document.getElementById("sessionTime").textContent = "00:00";
  document.getElementById("alertsList").innerHTML =
    '<div class="alert-empty">No alerts yet — start a session</div>';
  document.getElementById("alertCount").textContent = "0 new";
}

// ─── Start / Stop ─────────────────────────────────────────────────────────
async function startSession() {
  blinkCount       = 0;
  lastEyeState     = "open";
  alertsLog.length = 0;
  seconds          = 0;
  cupsToday        = 0;

  // Start hydration timer — inline here so nothing can go wrong
  hydrateSecsLeft = HYDRATE_INTERVAL;
  clearInterval(hydrateTimer);
  hydrateTimer = setInterval(() => {
    hydrateSecsLeft--;
    if (hydrateSecsLeft <= 0) {
      showHydratePopup();
      hydrateSecsLeft = HYDRATE_INTERVAL;
    }
  }, 1000);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" }
    });
    video.srcObject      = stream;
    video.style.display  = "block";
    canvas.style.display = "block";

    await new Promise(res => { video.onloadedmetadata = res; });
    await video.play();

    cameraInst = new Camera(video, {
      onFrame: async () => { if (isRunning) await faceMesh.send({ image: video }); },
      width: 640, height: 480
    });
    cameraInst.start();

    isRunning = true;
    setUI(true);

    timerInst = setInterval(() => {
      seconds++;
      const m = String(Math.floor(seconds / 60)).padStart(2, "0");
      const s = String(seconds % 60).padStart(2, "0");
      document.getElementById("sessionTime").textContent = m + ":" + s;
    }, 1000);

  } catch (err) {
    console.error("Camera error:", err);
    alert("Camera access denied. Please allow camera permissions and try again.");
  }
}

function stopSession() {
  isRunning = false;
  clearInterval(timerInst);
  clearInterval(hydrateTimer);
  closeHydratePopup();
  if (cameraInst) { cameraInst.stop(); cameraInst = null; }
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  video.style.display  = "none";
  canvas.style.display = "none";
  setUI(false);
  resetMetrics();
}

// ─── Button wiring ────────────────────────────────────────────────────────
document.getElementById("startBtn").onclick = () => {
  if (!isRunning) startSession();
  else            stopSession();
};

// ─── Hydration Popup ──────────────────────────────────────────────────────
function showHydratePopup() {
  renderPopupCups();
  document.getElementById("popupMsg").textContent = "";
  const overlay = document.getElementById("hydrateOverlay");
  // Set every style property explicitly via JS — no CSS can block this
  overlay.style.cssText =
    "display:flex; position:fixed; top:0; left:0; width:100%; height:100%;" +
    "background:rgba(0,0,0,0.6); z-index:99999;" +
    "align-items:center; justify-content:center;";
}

function closeHydratePopup() {
  const overlay = document.getElementById("hydrateOverlay");
  if (overlay) overlay.style.display = "none";
}

function popupDrink() {
  cupsToday++;
  renderPopupCups();
  document.getElementById("popupMsg").textContent = "Logged! " + cupsToday + " cups today.";
  pushAlert("good", "Drink logged — " + cupsToday + " cups today");
  setTimeout(closeHydratePopup, 10);
}

function popupSnooze() {
  hydrateSecsLeft = 300; // snooze 5 minutes
  document.getElementById("popupMsg").textContent = "Snoozed — reminding you in 5 minutes.";
  setTimeout(closeHydratePopup, 10

  );
}

function renderPopupCups() {
  const el = document.getElementById("popupCups");
  if (!el) return;
  el.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const d = document.createElement("div");
    d.style.cssText =
      "width:18px; height:22px; border-radius:3px 3px 5px 5px; border:1.5px solid " +
      (i < cupsToday ? "#22c55e" : "rgba(255,255,255,0.15)") +
      "; background:" + (i < cupsToday ? "#22c55e" : "transparent") + ";";
    el.appendChild(d);
  }
}