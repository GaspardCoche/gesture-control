import { initDetector, detect, type GestureState, type GestureType } from "./gestures/detector";
import { ModeManager } from "./modes";
import { CanvasOverlay } from "./overlay/canvas-overlay";
import { DOMInspector } from "./overlay/dom-inspector";
import { ConsolePanel } from "./overlay/console-panel";
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
  const consolePanel = new ConsolePanel(overlayRoot);
  const hud = new HUD(overlayRoot);

  hud.updateMode(modes.current);
  modes.onChange((mode) => {
    hud.updateMode(mode);
    canvas.setHighlight(null);
    inspector.select(null);
    if (mode === "console") consolePanel.show();
    else consolePanel.hide();
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
        if (mode === "spotlight") {
          canvas.spotlightCenter = { ...canvas.smoothCursor };
        }
        break;

      case "PINCH":
        if (mode === "inspect") {
          const el = inspector.getElementAt(canvas.smoothCursor.x, canvas.smoothCursor.y);
          if (el) {
            inspector.select(el);
            const rect = el.getBoundingClientRect();
            canvas.setHighlight(rect, inspector.getTagLabel(el));
            consolePanel.logAction(`Selected <${el.tagName.toLowerCase()}> ${el.id ? "#" + el.id : ""}`);
          }
        }
        if (mode === "draw") {
          if (!canvas.isDrawing) canvas.startStroke();
          canvas.addStrokePoint();
        }
        if (mode === "spotlight") {
          canvas.spotlightCenter = { ...canvas.smoothCursor };
        }
        if (mode === "measure") {
          if (type !== lastGesture) {
            canvas.addMeasurePoint();
            consolePanel.logAction(`Measure point at (${Math.round(canvas.smoothCursor.x)}, ${Math.round(canvas.smoothCursor.y)})`);
          }
        }
        if (mode === "console") {
          if (type !== lastGesture) {
            inspector.toggleDebugBorders();
            consolePanel.logAction(`Debug borders: ${inspector.debugBorders ? "ON" : "OFF"}`);
          }
        }
        break;

      case "FIST":
        if (Date.now() - gestureStartTime > 1200 && lastGesture === "FIST") {
          canvas.clearAll();
          inspector.select(null);
          if (mode === "console") consolePanel.clear();
          consolePanel.logAction("Cleared all");
          gestureStartTime = Date.now() + 5000;
        }
        break;

      case "SPREAD":
        if (mode === "spotlight" && canvas.spotlightCenter) {
          canvas.spotlightRadius = Math.min(400, canvas.spotlightRadius + 2);
        }
        if (mode === "console") {
          if (type !== lastGesture) {
            inspector.toggleDebugSpacing();
            consolePanel.logAction(`Debug spacing: ${inspector.debugSpacing ? "ON" : "OFF"}`);
          }
        }
        break;

      case "OPEN":
        if (mode === "draw" && canvas.isDrawing) canvas.endStroke();
        if (mode === "spotlight") {
          canvas.spotlightCenter = null;
          canvas.spotlightRadius = 120;
        }
        if (mode === "inspect") {
          canvas.setHighlight(null);
          inspector.select(null);
        }
        break;

      case "PEACE":
        if (Date.now() - peaceDebounce > 600) {
          modes.cycle();
          peaceDebounce = Date.now();
          consolePanel.logAction(`Mode: ${modes.current}`);
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

  // WebSocket bridge (optional)
  try {
    const ws = new WebSocket("ws://localhost:8765");
    ws.onopen = () => {
      statusEl.textContent += " | Bridge connected";
    };
    ws.onmessage = () => {};
  } catch {
    // Bridge not running
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "1") modes.set("inspect");
    if (e.key === "2") modes.set("draw");
    if (e.key === "3") modes.set("spotlight");
    if (e.key === "4") modes.set("console");
    if (e.key === "5") modes.set("measure");
    if (e.key === "c" || e.key === "C") { canvas.clearAll(); inspector.select(null); }
    if (e.key === "z" || e.key === "Z") canvas.undoStroke();
    if (e.key === "h" || e.key === "H") hud.toggleHelp();
    if (e.key === "d" || e.key === "D") {
      inspector.toggleDebugBorders();
      consolePanel.logAction(`Debug borders: ${inspector.debugBorders ? "ON" : "OFF"}`);
    }
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
  consolePanel.logAction("Gesture DevTools initialized");
}

main();
