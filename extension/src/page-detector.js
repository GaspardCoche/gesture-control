// Runs in MAIN world (page context) — can load external modules
(async () => {
  "use strict";

  const PINCH_THRESHOLD = 0.045;

  // Load MediaPipe via script tag (allowed in page context)
  const script = document.createElement("script");
  script.type = "module";
  script.textContent = `
    import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
    window.__MP_FilesetResolver = FilesetResolver;
    window.__MP_HandLandmarker = HandLandmarker;
    window.dispatchEvent(new Event("mediapipe-ready"));
  `;
  document.head.appendChild(script);

  // Wait for MediaPipe to be available
  await new Promise((resolve) => {
    if (window.__MP_HandLandmarker) return resolve();
    window.addEventListener("mediapipe-ready", resolve, { once: true });
  });

  const { FilesetResolver, HandLandmarker } = {
    FilesetResolver: window.__MP_FilesetResolver,
    HandLandmarker: window.__MP_HandLandmarker,
  };

  // Init
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
  );

  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });

  // Camera
  let videoEl = document.createElement("video");
  videoEl.style.cssText = "position:fixed;bottom:8px;left:8px;width:120px;height:90px;z-index:1000000;border-radius:8px;opacity:0.4;transform:scaleX(-1);pointer-events:none;display:none;";
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.muted = true;
  document.body.appendChild(videoEl);

  let running = false;
  let stream = null;

  function classifyGesture(landmarks) {
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const ringMcp = landmarks[13];
    const pinkyMcp = landmarks[17];

    const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    if (pinchDist < PINCH_THRESHOLD) return { type: "PINCH", pinchDist };

    const indexUp = indexTip.y < indexMcp.y;
    const middleUp = middleTip.y < middleMcp.y;
    const ringUp = ringTip.y < ringMcp.y;
    const pinkyUp = pinkyTip.y < pinkyMcp.y;

    if (indexUp && middleUp && !ringUp && !pinkyUp) return { type: "PEACE", pinchDist };
    if (indexUp && !middleUp && !ringUp && !pinkyUp) return { type: "POINT", pinchDist };
    if (!indexUp && !middleUp && !ringUp && !pinkyUp) return { type: "FIST", pinchDist };
    if (indexUp && middleUp && ringUp && pinkyUp) {
      const spread = Math.abs(landmarks[8].x - landmarks[20].x);
      return { type: spread > 0.12 ? "SPREAD" : "OPEN", pinchDist };
    }
    return { type: "NONE", pinchDist };
  }

  function loop() {
    if (!running) return;
    if (!videoEl.videoWidth) {
      requestAnimationFrame(loop);
      return;
    }

    const results = handLandmarker.detectForVideo(videoEl, performance.now());

    if (results.landmarks.length > 0) {
      const lm = results.landmarks[0];
      const gesture = classifyGesture(lm);
      window.postMessage({
        source: "gesture-presenter-detector",
        gesture: gesture.type,
        pinchDist: gesture.pinchDist,
        indexTip: { x: lm[8].x, y: lm[8].y, z: lm[8].z },
        thumbTip: { x: lm[4].x, y: lm[4].y, z: lm[4].z },
        landmarks: lm.map((l) => ({ x: l.x, y: l.y, z: l.z })),
      }, "*");
    } else {
      window.postMessage({ source: "gesture-presenter-detector", gesture: "NONE" }, "*");
    }

    requestAnimationFrame(loop);
  }

  // Listen for toggle commands from content script
  window.addEventListener("message", async (e) => {
    if (e.data?.source !== "gesture-presenter-control") return;

    if (e.data.action === "start") {
      if (running) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, frameRate: 30, facingMode: "user" },
        });
        videoEl.srcObject = stream;
        videoEl.style.display = "block";
        await videoEl.play();
        running = true;
        window.postMessage({ source: "gesture-presenter-detector", status: "ready" }, "*");
        loop();
      } catch (err) {
        window.postMessage({ source: "gesture-presenter-detector", status: "error", error: err.message }, "*");
      }
    }

    if (e.data.action === "stop") {
      running = false;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      videoEl.style.display = "none";
      videoEl.srcObject = null;
    }
  });

  // Signal ready
  window.postMessage({ source: "gesture-presenter-detector", status: "loaded" }, "*");
})();
