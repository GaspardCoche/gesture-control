import { initDetector, detect, isFaceReady, type GestureState, type GestureType, type GazeState } from "./gestures/detector";
import { resetGazeFilter } from "./gestures/gaze";
import { getStabilityInfo } from "./gestures/classifier";
import { ScrollController } from "./gestures/scroll";
import { ModeManager } from "./modes";
import { CanvasOverlay } from "./overlay/canvas-overlay";
import { DOMInspector } from "./overlay/dom-inspector";
import { HUD } from "./overlay/hud";
import { SpeechRecorder } from "./voice/speech-recorder";
import { WhisperRecorder } from "./voice/whisper-recorder";
import { FeedbackStore } from "./voice/feedback-store";
import { FeedbackPanel } from "./overlay/feedback-panel";
import { SettingsPanel } from "./overlay/settings-panel";
import { matchCommand } from "./voice/command-grammar";
import { executeCommand, undoLast, undoStackSize } from "./voice/command-executor";

interface VoiceBackend {
  start(): void | Promise<void>;
  stop(): void;
  readonly recording: boolean;
}

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

  let whisperReady = false;
  if (WhisperRecorder.isSupported()) {
    WhisperRecorder.warmup()
      .then(() => {
        whisperReady = true;
        const dev = WhisperRecorder.device();
        console.info(`[whisper] ready (${dev})`);
      })
      .catch((err) => {
        console.warn("[whisper] warmup failed, falling back to Web Speech:", err);
      });
  }

  const overlayRoot = document.body;
  const modes = new ModeManager();
  const canvas = new CanvasOverlay(overlayRoot);
  const inspector = new DOMInspector(overlayRoot);
  const hud = new HUD(overlayRoot);
  const scrollCtrl = new ScrollController();
  const feedbackStore = new FeedbackStore();
  const feedbackPanel = new FeedbackPanel(overlayRoot, feedbackStore);
  const settingsPanel = new SettingsPanel(overlayRoot);
  feedbackPanel.setOnOpenSettings(() => settingsPanel.show());
  settingsPanel.onChange(() => feedbackPanel.refreshKeyBadge());

  let voiceRecorder: VoiceBackend | null = null;
  let voiceTranscript = "";

  const toastEl = document.createElement("div");
  toastEl.id = "gesture-toast";
  toastEl.style.cssText = `
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
    padding: 10px 18px; border-radius: 999px;
    background: rgba(11,11,16,0.96); backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    border: 1px solid rgba(255,255,255,0.08); color: #f1f5f9;
    font-family: 'Inter', system-ui, sans-serif; font-size: 13px; font-weight: 600;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    z-index: 100005; pointer-events: none; opacity: 0;
    transition: opacity .2s, transform .2s;
  `;
  document.body.appendChild(toastEl);
  let toastTimer: number | null = null;
  function showToast(msg: string, color = "#10b981") {
    toastEl.style.color = color;
    toastEl.style.borderColor = color + "55";
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    toastEl.style.transform = "translateX(-50%) translateY(0)";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translateX(-50%) translateY(8px)";
    }, 2400);
  }

  function startVoiceRecording() {
    if (!inspector.selectedElement) return;
    const useWhisper = whisperReady && WhisperRecorder.isSupported();
    const useWebSpeech = !useWhisper && SpeechRecorder.isSupported();
    if (!useWhisper && !useWebSpeech) return;

    voiceTranscript = "";
    canvas.recordingActive = true;
    hud.updateVoice(true);

    const callbacks = {
      onInterim: (text: string) => { voiceTranscript = text; },
      onFinal: (text: string, confidence: number) => {
        voiceTranscript = text;
        const target = inspector.selectedElement;
        if (!target) return;

        const match = matchCommand(text);
        if (match) {
          const result = executeCommand(target as HTMLElement, match.action);
          if (result.ok) {
            showToast(`✓ ${result.message}`, "#10b981");
          } else {
            showToast(`✗ ${result.message}`, "#ef4444");
          }
          return;
        }

        const info = inspector.getInfo(target);
        feedbackStore.add(info, text, confidence);
        feedbackPanel.show();
        showToast(`Feedback recorded — open panel (F)`, "#a78bfa");
      },
      onError: (err: string) => {
        canvas.recordingActive = false;
        hud.updateVoice(false);
        showToast(`Voice error: ${err}`, "#ef4444");
      },
      onEnd: () => {
        canvas.recordingActive = false;
        hud.updateVoice(false);
        voiceRecorder = null;
      },
    };

    voiceRecorder = useWhisper ? new WhisperRecorder(callbacks) : new SpeechRecorder(callbacks);
    void voiceRecorder.start();
  }

  function stopVoiceRecording() {
    if (voiceRecorder?.recording) voiceRecorder.stop();
  }

  hud.updateMode(modes.current);
  if (modes.current === "draw" && canvas.whiteboardMode) canvas.setWhiteboardVisible(true);
  modes.onChange((mode) => {
    hud.updateMode(mode);
    canvas.setHighlight(null);
    inspector.select(null);
    scrollCtrl.reset();
    canvas.resetCursorFilter();
    canvas.setWhiteboardVisible(mode === "draw" && canvas.whiteboardMode);
  });

  let lastGesture: GestureType = "NONE";
  let gestureStartTime = 0;
  let peaceDebounce = 0;
  let eyeTrackingEnabled = true;
  let lastGaze: GazeState | null = null;
  let blinkDebounce = 0;

  const gazeSmooth = { x: 0.5, y: 0.5 };
  const GAZE_SMOOTHING = 0.6;

  function handleGesture(state: GestureState) {
    const { type } = state;
    canvas.updateCursor(state.indexTip.x, state.indexTip.y, modes.current === "draw" ? "draw" : "default");

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
        if (Date.now() - peaceDebounce > 1500) {
          modes.cycle();
          peaceDebounce = Date.now();
        }
        break;

      case "THUMBS_UP":
        if (type !== lastGesture) {
          eyeTrackingEnabled = !eyeTrackingEnabled;
          if (eyeTrackingEnabled) resetGazeFilter();
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
    hud.updateGesture("NONE", 0);
  }

  if (location.search.includes("debug") || localStorage.getItem("gc_debug") === "1") {
    scrollCtrl.setDebug(true);
    console.info("[gesture-control] debug mode ON — scroll events will be logged");
  }
  (window as any).__gc = {
    enableDebug: () => { localStorage.setItem("gc_debug", "1"); scrollCtrl.setDebug(true); console.info("debug ON, reload to also enable on next session"); },
    disableDebug: () => { localStorage.removeItem("gc_debug"); scrollCtrl.setDebug(false); console.info("debug OFF"); },
  };

  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable) return;
    if (e.key === "1") modes.set("inspect");
    if (e.key === "2") modes.set("draw");
    if (e.key === "3") modes.set("measure");
    if (e.key === "c" || e.key === "C") { canvas.clearAll(); inspector.select(null); }
    if (e.key === "z" || e.key === "Z") {
      if (undoStackSize() > 0) {
        const r = undoLast();
        showToast(r.message, r.ok ? "#22d3ee" : "#64748b");
      } else {
        canvas.undoStroke();
      }
    }
    if (e.key === "h" || e.key === "H") hud.toggleHelp();
    if (e.key === "e" || e.key === "E") {
      eyeTrackingEnabled = !eyeTrackingEnabled;
      gazeSmooth.x = 0.5;
      gazeSmooth.y = 0.5;
      resetGazeFilter();
      hud.updateEyeTracking(eyeTrackingEnabled);
    }
    if (e.key === "v" || e.key === "V") {
      if (voiceRecorder?.recording) {
        stopVoiceRecording();
      } else {
        startVoiceRecording();
      }
    }
    if (e.key === "f" || e.key === "F") {
      feedbackPanel.toggle();
    }
    if (e.key === "s" || e.key === "S") {
      settingsPanel.toggle();
    }
    if (e.key === "w" || e.key === "W") {
      canvas.toggleWhiteboardMode();
      canvas.setWhiteboardVisible(modes.current === "draw" && canvas.whiteboardMode);
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
    hud.updateStability(getStabilityInfo());
    requestAnimationFrame(loop);
  }

  loop();
}

main().catch((err) => {
  const el = document.getElementById("status");
  if (el) el.textContent = "Error: " + (err?.message ?? err);
  console.error("Gesture DevTools failed:", err);
});
