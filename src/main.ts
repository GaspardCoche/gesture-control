import { initDetector, detect, isFaceReady, type GestureState, type GestureType, type GazeState } from "./gestures/detector";
import { ScrollController } from "./gestures/scroll";
import { ModeManager } from "./modes";
import { CanvasOverlay } from "./overlay/canvas-overlay";
import { DOMInspector } from "./overlay/dom-inspector";
import { HUD } from "./overlay/hud";

async function main() {
  const videoEl = document.getElementById("gesture-video-feed") as HTMLVideoElement;
  const statusEl = document.getElementById("status")!;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  statusEl.textContent = "Loading MediaPipe (hand + face)...";
  await initDetector();
  statusEl.textContent = isFaceReady()
    ? "Ready — hand + eye tracking"
    : "Ready — hand tracking (face model failed)";

  const overlayRoot = document.body;
  const modes = new ModeManager();
  const canvas = new CanvasOverlay(overlayRoot);
  const inspector = new DOMInspector(overlayRoot);
  const hud = new HUD(overlayRoot);
  const scrollCtrl = new ScrollController();

  hud.updateMode(modes.current);
  modes.onChange((mode) => {
    hud.updateMode(mode);
    canvas.setHighlight(null);
    inspector.select(null);
    scrollCtrl.reset();
  });

  let lastGesture: GestureType = "NONE";
  let gestureStartTime = 0;
  let peaceDebounce = 0;
  let eyeTrackingEnabled = true;
  let lastGaze: GazeState | null = null;
  let blinkDebounce = 0;

  const gazeSmooth = { x: 0.5, y: 0.5 };
  const GAZE_SMOOTHING = 0.12;

  function handleGesture(state: GestureState) {
    const { type } = state;
    canvas.updateCursor(state.indexTip.x, state.indexTip.y);

    const scrollAmount = scrollCtrl.update(type, state.wrist.y);

    if (type !== lastGesture) {
      if (lastGesture === "PINCH" && modes.current === "draw") {
        canvas.endStroke();
      }
      gestureStartTime = Date.now();
    }

    const mode = modes.current;

    if (type === "OPEN" && scrollCtrl.isScrolling) {
      canvas.setScrollIndicator(scrollAmount);
      hud.updateGesture(type, state.confidence);
      lastGesture = type;
      return;
    }

    switch (type) {
      case "POINT":
        if (mode === "inspect") {
          const el = inspector.getElementAt(canvas.smoothCursor.x, canvas.smoothCursor.y);
          if (el) {
            const rect = inspector.hover(el);
            canvas.setHighlight(rect, inspector.getTagLabel(el));
          } else {
            canvas.setHighlight(null);
          }
        }
        break;

      case "PINCH":
        if (mode === "inspect") {
          const el = inspector.getElementAt(canvas.smoothCursor.x, canvas.smoothCursor.y);
          if (el) {
            inspector.select(el);
            const rect = el.getBoundingClientRect();
            canvas.setHighlight(rect, inspector.getTagLabel(el));
          }
        }
        if (mode === "draw") {
          if (!canvas.isDrawing) canvas.startStroke();
          canvas.addStrokePoint();
        }
        if (mode === "measure") {
          if (type !== lastGesture) {
            canvas.addMeasurePoint();
          }
        }
        break;

      case "FIST":
        if (Date.now() - gestureStartTime > 1200 && lastGesture === "FIST") {
          canvas.clearAll();
          inspector.select(null);
          gestureStartTime = Date.now() + 5000;
        }
        break;

      case "OPEN":
        if (mode === "draw" && canvas.isDrawing) canvas.endStroke();
        if (mode === "inspect") {
          canvas.setHighlight(null);
          inspector.select(null);
        }
        canvas.setScrollIndicator(0);
        break;

      case "PEACE":
        if (Date.now() - peaceDebounce > 600) {
          modes.cycle();
          peaceDebounce = Date.now();
        }
        break;

      case "THUMBS_UP":
        if (type !== lastGesture) {
          eyeTrackingEnabled = !eyeTrackingEnabled;
          hud.updateEyeTracking(eyeTrackingEnabled);
        }
        break;
    }

    hud.updateGesture(type, state.confidence);
    lastGesture = type;
  }

  function handleGaze(gaze: GazeState) {
    if (!eyeTrackingEnabled) return;
    lastGaze = gaze;

    gazeSmooth.x += (gaze.x - gazeSmooth.x) * GAZE_SMOOTHING;
    gazeSmooth.y += (gaze.y - gazeSmooth.y) * GAZE_SMOOTHING;

    canvas.updateGazeCursor(gazeSmooth.x, gazeSmooth.y);

    if (gaze.bothBlink && Date.now() - blinkDebounce > 800) {
      blinkDebounce = Date.now();
      const mode = modes.current;
      const gx = gazeSmooth.x * window.innerWidth;
      const gy = gazeSmooth.y * window.innerHeight;

      if (mode === "inspect") {
        const el = inspector.getElementAt(gx, gy);
        if (el) {
          inspector.select(el);
          const rect = el.getBoundingClientRect();
          canvas.setHighlight(rect, inspector.getTagLabel(el));
        }
      }
      if (mode === "measure") {
        canvas.addMeasurePointAt(gx, gy);
      }
    }
  }

  function handleNoHand() {
    if (lastGesture === "PINCH" && modes.current === "draw") {
      canvas.endStroke();
    }
    canvas.trail = [];
    lastGesture = "NONE";
    scrollCtrl.reset();
    hud.updateGesture("NONE", 0);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "1") modes.set("inspect");
    if (e.key === "2") modes.set("draw");
    if (e.key === "3") modes.set("measure");
    if (e.key === "c" || e.key === "C") { canvas.clearAll(); inspector.select(null); }
    if (e.key === "z" || e.key === "Z") canvas.undoStroke();
    if (e.key === "h" || e.key === "H") hud.toggleHelp();
    if (e.key === "e" || e.key === "E") {
      eyeTrackingEnabled = !eyeTrackingEnabled;
      hud.updateEyeTracking(eyeTrackingEnabled);
    }
  });

  function loop() {
    const now = performance.now();
    const result = detect(videoEl, now);

    if (result.hand && result.hand.type !== "NONE") {
      handleGesture(result.hand);
    } else {
      handleNoHand();
    }

    if (result.gaze) {
      handleGaze(result.gaze);
    }

    canvas.render(lastGesture, modes.current, eyeTrackingEnabled);
    hud.updateFPS();
    requestAnimationFrame(loop);
  }

  loop();
}

main();
