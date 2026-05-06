import { initDetector, detect, type GestureState, type GestureType } from "./gestures/detector";
import { getStabilityInfo } from "./gestures/classifier";
import { ScrollController } from "./gestures/scroll";
import { ModeManager } from "./modes";
import { CanvasOverlay } from "./overlay/canvas-overlay";
import { DOMInspector, navigateFrom, type DomNavDirection } from "./overlay/dom-inspector";
import { HUD } from "./overlay/hud";
import { SpeechRecorder } from "./voice/speech-recorder";
import { WhisperRecorder } from "./voice/whisper-recorder";
import { FeedbackStore } from "./voice/feedback-store";
import { FeedbackPanel } from "./overlay/feedback-panel";
import { SettingsPanel } from "./overlay/settings-panel";
import { matchCommand } from "./voice/command-grammar";
import { executeCommand, undoLast, undoStackSize } from "./voice/command-executor";
import { SignatureDetector, type SignatureEvent } from "./gestures/signature";
import { DebugHUD } from "./overlay/debug-hud";
import { TwoHandDetector, type TwoHandEvent } from "./gestures/two-hand-gestures";
import { ActionPanel } from "./overlay/action-panel";

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

  let rafId: number | null = null;
  const teardown = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    for (const track of stream.getTracks()) track.stop();
    videoEl.srcObject = null;
  };
  window.addEventListener("pagehide", teardown, { once: true });
  window.addEventListener("beforeunload", teardown, { once: true });

  statusEl.textContent = "Loading hand tracking…";
  await initDetector();
  statusEl.textContent = "Ready";

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
  const actionPanel = new ActionPanel(document.querySelector(".app-shell")!);
  actionPanel.setHooks({
    onApplyCss: (css, selectors) => applyCssToSelections(css, selectors),
    onUndo: () => false,
  });
  actionPanel.setOnChange(() => {
    /* count is internal */
  });
  const signatureDetector = new SignatureDetector();
  const twoHandDetector = new TwoHandDetector();
  const debugHud = new DebugHUD(overlayRoot);
  feedbackPanel.setOnOpenSettings(() => settingsPanel.show());
  settingsPanel.onChange(() => {
    feedbackPanel.refreshKeyBadge();
    actionPanel.refreshKeyState();
  });
  window.addEventListener("gc-open-settings", () => settingsPanel.show());
  window.addEventListener("gc-toast", (e: any) => showToast(e.detail.msg, e.detail.color));

  function applyCssToSelections(css: string, _selectors: string[]): { applied: number; failed: number } {
    let applied = 0, failed = 0;
    const items = actionPanel.getItems();
    if (!items.length) return { applied: 0, failed: 0 };
    const declarations = parseCssDeclarations(css);
    for (const it of items) {
      const el = it.info.element;
      if (!el) { failed++; continue; }
      try {
        for (const [prop, val] of declarations) {
          (el.style as any)[cssToCamel(prop)] = val;
        }
        applied++;
      } catch {
        failed++;
      }
    }
    return { applied, failed };
  }

  function parseCssDeclarations(css: string): Array<[string, string]> {
    const decls: Array<[string, string]> = [];
    const noBraces = css.replace(/[^{}]+\{|\}/g, ";");
    for (const part of noBraces.split(";")) {
      const idx = part.indexOf(":");
      if (idx < 0) continue;
      const prop = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim().replace(/!important\s*$/, "").trim();
      if (prop && val) decls.push([prop, val]);
    }
    return decls;
  }

  function cssToCamel(prop: string): string {
    return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  let lastIndexY = 0;
  let lastWristY = 0;
  let frameFps = 0;

  let voiceRecorder: VoiceBackend | null = null;

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
    }, 2200);
  }

  function startVoiceRecording() {
    const useWhisper = whisperReady && WhisperRecorder.isSupported();
    const useWebSpeech = !useWhisper && SpeechRecorder.isSupported();
    if (!useWhisper && !useWebSpeech) return;

    canvas.recordingActive = true;
    hud.updateVoice(true);

    const callbacks = {
      onInterim: (_: string) => {},
      onFinal: (text: string, confidence: number) => {
        const target = inspector.selectedElement;
        if (target) {
          const match = matchCommand(text);
          if (match) {
            const result = executeCommand(target as HTMLElement, match.action);
            showToast(`${result.ok ? "✓" : "✗"} ${result.message}`, result.ok ? "#10b981" : "#ef4444");
            return;
          }
          const info = inspector.getInfo(target);
          feedbackStore.add(info, text, confidence);
          feedbackPanel.show();
          showToast("Feedback recorded — open panel (F)", "#a78bfa");
        } else if (actionPanel.count() > 0) {
          actionPanel.setIntent(text);
          showToast("Intent set — Send to Claude Code (K)", "#a78bfa");
        } else {
          showToast("Nothing selected", "#f59e0b");
        }
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

  function curateSelection(): void {
    const target = inspector.selectedElement;
    if (!target) {
      showToast("Pinch an element first", "#f59e0b");
      return;
    }
    const info = inspector.getInfo(target);
    actionPanel.add(target, info);
    showToast(`Added to selection (${actionPanel.count()})`, "#10b981");
  }

  function navigateDom(dir: DomNavDirection): void {
    const cur = inspector.selectedElement;
    if (!cur) {
      showToast("No element selected", "#f59e0b");
      return;
    }
    const next = navigateFrom(cur, dir);
    if (!next) {
      showToast(`No ${dir}`, "#64748b");
      return;
    }
    inspector.select(next);
    canvas.setHighlight(next.getBoundingClientRect(), inspector.getTagLabel(next));
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

  function handleGesture(state: GestureState) {
    const { type } = state;
    canvas.updateCursor(state.indexTip.x, state.indexTip.y, modes.current === "draw" ? "draw" : "default");

    lastIndexY = state.indexTip.y;
    lastWristY = state.wrist.y;
    const scrollAmount = scrollCtrl.update(type, state.indexTip.y);
    canvas.setScrollIndicator(scrollAmount);

    signatureDetector.feed(type, state.mp?.category ?? null);

    if (type !== lastGesture) {
      if (lastGesture === "PINCH" && modes.current === "draw") canvas.endStroke();
      gestureStartTime = Date.now();
    }

    const mode = modes.current;

    switch (type) {
      case "POINT":
        if (mode === "inspect") {
          const el = inspector.getElementAt(canvas.smoothCursor.x, canvas.smoothCursor.y);
          if (el && el !== inspector.hoveredElement) {
            const rect = inspector.hover(el);
            canvas.setHighlight(rect, inspector.getTagLabel(el));
          } else if (!el) {
            canvas.setHighlight(null);
          }
        }
        break;

      case "PINCH":
        if (mode === "inspect" && type !== lastGesture) {
          const el = inspector.getElementAt(canvas.smoothCursor.x, canvas.smoothCursor.y);
          if (el) {
            inspector.select(el);
            canvas.setHighlight(el.getBoundingClientRect(), inspector.getTagLabel(el));
            const info = inspector.getInfo(el);
            actionPanel.add(el, info);
            showToast(`Added (${actionPanel.count()})`, "#10b981");
          }
        }
        if (mode === "draw") {
          if (!canvas.isDrawing) canvas.startStroke();
          canvas.addStrokePoint();
        }
        if (mode === "measure" && type !== lastGesture) {
          canvas.addMeasurePoint();
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
        break;

      case "PEACE":
        if (Date.now() - peaceDebounce > 1500) {
          modes.cycle();
          peaceDebounce = Date.now();
        }
        break;
    }

    hud.updateGesture(type, state.confidence);
    lastGesture = type;
  }

  function handleNoHand() {
    if (lastGesture === "PINCH" && modes.current === "draw") canvas.endStroke();
    canvas.trail = [];
    lastGesture = "NONE";
    hud.updateGesture("NONE", 0);
  }

  if (localStorage.getItem("gc_debug") === "1") {
    scrollCtrl.setDebug(true);
    debugHud.setVisible(true);
    console.info("[gesture-control] debug mode ON (toggle with D key)");
  } else if (location.search.includes("debug")) {
    scrollCtrl.setDebug(true);
    console.info("[gesture-control] scroll debug logs ON, press D for visual debug HUD");
  }

  signatureDetector.setListener((event: SignatureEvent) => {
    if (event === "double-pinch") {
      if (actionPanel.count() === 0) {
        showToast("Pinch elements first, then double-pinch to send", "#f59e0b");
        return;
      }
      actionPanel.triggerAsk();
      showToast("✨ Double-pinch → sent to Claude", "#10b981");
    } else if (event === "double-fist") {
      actionPanel.clear();
      inspector.select(null);
      canvas.setHighlight(null);
      showToast("Double-fist → cleared", "#ef4444");
    } else if (event === "ilove-you") {
      if (voiceRecorder?.recording) {
        stopVoiceRecording();
        showToast("🤟 ILY → voice stopped", "#a78bfa");
      } else {
        startVoiceRecording();
        showToast("🤟 ILY → voice recording", "#a78bfa");
      }
    } else if (event === "thumb-up-mp") {
      debugHud.toggle();
      showToast("Debug HUD toggled", "#22d3ee");
    }
  });

  twoHandDetector.setListener((event: TwoHandEvent) => {
    if (event === "two-hand-clap") {
      if (actionPanel.count() === 0) {
        showToast("Select elements first (pinch)", "#f59e0b");
        return;
      }
      actionPanel.triggerAsk();
      showToast("👏 Clap → sent to Claude", "#10b981");
    } else if (event === "two-hand-spread") {
      actionPanel.clear();
      inspector.select(null);
      canvas.setHighlight(null);
      showToast("✋✋ Spread → cleared", "#f59e0b");
    } else if (event === "two-hand-zoom-out") {
      navigateDom("parent");
    } else if (event === "two-hand-zoom-in") {
      navigateDom("firstChild");
    }
  });
  (window as any).__gc = {
    enableDebug: () => { localStorage.setItem("gc_debug", "1"); scrollCtrl.setDebug(true); console.info("debug ON"); },
    disableDebug: () => { localStorage.removeItem("gc_debug"); scrollCtrl.setDebug(false); console.info("debug OFF"); },
  };

  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable) return;

    if (e.key === "1") modes.set("inspect");
    else if (e.key === "2") modes.set("draw");
    else if (e.key === "3") modes.set("measure");
    else if (e.key === "c" || e.key === "C") { canvas.clearAll(); inspector.select(null); }
    else if (e.key === "z" || e.key === "Z") {
      if (undoStackSize() > 0) {
        const r = undoLast();
        showToast(r.message, r.ok ? "#22d3ee" : "#64748b");
      } else {
        canvas.undoStroke();
      }
    }
    else if (e.key === "h" || e.key === "H") hud.toggleHelp();
    else if (e.key === "v" || e.key === "V") {
      if (voiceRecorder?.recording) stopVoiceRecording();
      else startVoiceRecording();
    }
    else if (e.key === "f" || e.key === "F") feedbackPanel.toggle();
    else if (e.key === "s" || e.key === "S") settingsPanel.toggle();
    else if (e.key === "w" || e.key === "W") {
      canvas.toggleWhiteboardMode();
      canvas.setWhiteboardVisible(modes.current === "draw" && canvas.whiteboardMode);
    }
    else if (e.key === "a" || e.key === "A") curateSelection();
    else if (e.key === "k" || e.key === "K") {
      if (actionPanel.count() === 0) { showToast("Nothing selected", "#f59e0b"); return; }
      actionPanel.triggerAsk();
    }
    else if (e.key === "Escape") { actionPanel.clear(); inspector.select(null); canvas.setHighlight(null); }
    else if (e.key === "ArrowUp") { e.preventDefault(); navigateDom("parent"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); navigateDom("firstChild"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); navigateDom("prevSibling"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); navigateDom("nextSibling"); }
    else if (e.key === "d" || e.key === "D") { debugHud.toggle(); }
  });

  function loop() {
    const now = performance.now();
    const result = detect(videoEl, now);

    if (result.hand && result.hand.type !== "NONE") handleGesture(result.hand);
    else handleNoHand();

    const twoH = twoHandDetector.feed(result.hand, result.hand2);
    if (twoH.distance !== null && twoH.parallelDy !== null && Math.abs(twoH.parallelDy) > 0.005) {
      const boost = twoH.parallelDy * 6000;
      const px = Math.sign(boost) * Math.min(Math.abs(boost), 120);
      window.scrollBy({ top: px, behavior: "auto" });
    }

    canvas.render(lastGesture, modes.current, false);
    hud.updateFPS();
    hud.updateStability(getStabilityInfo());
    frameFps++;
    debugHud.update({
      custom: lastGesture,
      mp: result.hand?.mp?.category ?? null,
      mpScore: result.hand?.mp?.score ?? 0,
      indexY: lastIndexY,
      wristY: lastWristY,
      scroll: scrollCtrl.getDebugInfo(),
      fps: Math.round(frameFps * 1000 / Math.max(1, performance.now() - lastFpsT) || 0),
    });
    if (performance.now() - lastFpsT > 1000) {
      lastFpsT = performance.now();
      frameFps = 0;
    }
    rafId = requestAnimationFrame(loop);
  }
  let lastFpsT = performance.now();

  rafId = requestAnimationFrame(loop);
}

main().catch((err) => {
  const el = document.getElementById("status");
  if (el) el.textContent = "Error: " + (err?.message ?? err);
  console.error("Gesture Control failed:", err);
});
