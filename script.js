const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let blinkCount = 0;
let lastEyeState = "open";
let lastAlertTime = 0; // prevent spam alerts

// 🎥 Start Camera
startBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    const camera = new Camera(video, {
      onFrame: async () => {
        await faceMesh.send({ image: video });
      },
      width: 640,
      height: 480
    });

    camera.start();

  } catch (error) {
    console.error("Camera Error:", error);
    showAlert("Camera access denied ❌");
  }
};

// 😤 Stress Function
function updateStress(blinkCount) {
  let stress;

  if (blinkCount < 5) {
    stress = "High";
  } else if (blinkCount < 10) {
    stress = "Medium";
  } else {
    stress = "Low";
  }

  document.getElementById("stress").innerText =
    stress === "High" ? "🔴 High" :
    stress === "Medium" ? "🟡 Medium" : "🟢 Low";
}

// 💧 Hydration Reminder (every 1 min)
setInterval(() => {
  showAlert("Drink water 💧");
}, 60000);

// 🔔 Alert Function (with anti-spam)
function showAlert(msg) {
  const now = Date.now();

  // prevent alert spam (3 sec gap)
  if (now - lastAlertTime < 3000) return;

  lastAlertTime = now;

  const box = document.getElementById("alertBox");
  box.innerText = msg;

  setTimeout(() => {
    box.innerText = "";
  }, 3000);
}

// 🤖 FaceMesh Setup
const faceMesh = new FaceMesh({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// 👁️ Detection Logic
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    // 👁️ Blink Detection
    const leftEyeTop = landmarks[159].y;
    const leftEyeBottom = landmarks[145].y;

    const eyeOpen = Math.abs(leftEyeTop - leftEyeBottom);

    if (eyeOpen < 0.015 && lastEyeState === "open") {
      blinkCount++;
      lastEyeState = "closed";
    }

    if (eyeOpen > 0.02) {
      lastEyeState = "open";
    }

    document.getElementById("blink").innerText = blinkCount;

    updateStress(blinkCount);

    if (blinkCount < 5 && Date.now() - lastAlertTime > 5000) {
      showAlert("Blink more 👁️");
    }

    // ✅ 🧍 Posture Detection (INSIDE BLOCK)
    const nose = landmarks[1];
    const forehead = landmarks[10];

    const tilt = forehead.y - nose.y;

    let posture;

    if (tilt > 0.1) {
      posture = "Bad";

      if (Date.now() - lastAlertTime > 3000) {
        showAlert("Sit straight 🧍");
      }

    } else {
      posture = "Good";
    }

    document.getElementById("posture").innerText = posture;
  }
}