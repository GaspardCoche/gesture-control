import { initDetector, detect, type GestureState, type GestureType } from "./gestures/detector";
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

  statusEl.textContent = "Loading MediaPipe...";
  await initDetector();
  statusEl.textContent = "Ready — show your hand";

  const overlayRoot = document.body;
  const modes = new ModeManager();
  const canvas = new CanvasOverlay(overlayRoot);
  const inspector = new DOMInspector(overlayRoot);
  const hud = new HUD(overlayRoot);

  hud.updateMode(modes.current);
  modes.onChange((mode) => {
    hud.updateMode(mode);
    canvas.setHighlight(null);
    inspector.select(null);
  });

  let lastGesture: GestureType = "NONE";
  let gestureStartTime = 0;
  let peaceDebounce = 0;

  function handleGesture(state: GestureState) {
    const { type } = state;
    canvas.updateCursor(state.indexTip.x, state.indexTip.y);

    if (type !== lastGesture) {
      if (lastGesture === "PINCH" && modes.current === "draw") {
        canvas.endStroke();
      }
      gestureStartTime = Date.now();
    }

    const mode = modes.current;

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
        break;

      case "PEACE":
        if (Date.now() - peaceDebounce > 600) {
          modes.cycle();
          peaceDebounce = Date.now();
        }
        break;
    }

    hud.updateGesture(type, state.confidence);
    lastGesture = type;
  }

  function handleNoHand() {
    if (lastGesture === "PINCH" && modes.current === "draw") {
      canvas.endStroke();
    }
    canvas.trail = [];
    lastGesture = "NONE";
    hud.updateGesture("NONE", 0);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "1") modes.set("inspect");
    if (e.key === "2") modes.set("draw");
    if (e.key === "3") modes.set("measure");
    if (e.key === "c" || e.key === "C") { canvas.clearAll(); inspector.select(null); }
    if (e.key === "z" || e.key === "Z") canvas.undoStroke();
    if (e.key === "h" || e.key === "H") hud.toggleHelp();
  });

  function loop() {
    const now = performance.now();
    const state = detect(videoEl, now);

    if (state && state.type !== "NONE") {
      handleGesture(state);
    } else {
      handleNoHand();
    }

    canvas.render(lastGesture, modes.current);
    hud.updateFPS();
    requestAnimationFrame(loop);
  }

  loop();
}

main();
