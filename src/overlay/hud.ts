import type { Mode } from "../modes";
import type { GestureType } from "../gestures/detector";
import { icon } from "./icons";

const MODE_META: Record<Mode, { label: string; color: string; desc: string; iconKey: string }> = {
  inspect: { label: "Inspect", color: "#6366f1", desc: "Point to highlight, pinch to select", iconKey: "inspect" },
  draw:    { label: "Draw",    color: "#f59e0b", desc: "Pinch to draw, open hand to release", iconKey: "pencil" },
  measure: { label: "Measure", color: "#f472b6", desc: "Pinch twice to set two points", iconKey: "ruler" },
};

const GESTURE_META: Record<GestureType, { label: string; iconKey: string; color: string } | null> = {
  POINT: { label: "Point", iconKey: "pointer", color: "#22d3ee" },
  PINCH: { label: "Pinch", iconKey: "pinch", color: "#f59e0b" },
  OPEN: { label: "Open", iconKey: "open_hand", color: "#10b981" },
  PEACE: { label: "Peace", iconKey: "peace", color: "#a78bfa" },
  FIST: { label: "Fist", iconKey: "fist", color: "#ef4444" },
  THUMBS_UP: { label: "Thumbs up", iconKey: "thumbs_up", color: "#22d3ee" },
  NONE: null,
};

export class HUD {
  root: HTMLElement;
  private modeEl!: HTMLElement;
  private modeIconEl!: HTMLElement;
  private modeLabelEl!: HTMLElement;
  private descEl!: HTMLElement;
  private gestureEl!: HTMLElement;
  private gestureIconEl!: HTMLElement;
  private gestureLabelEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private eyeEl!: HTMLElement;
  private voiceEl!: HTMLElement;
  private stabilityBar!: HTMLElement;
  private onboardEl!: HTMLElement;
  private onboardVisible = true;
  private lastFrameTime = 0;
  private frameCount = 0;
  private onboardTimer: number | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "gesture-hud";
    this.root.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 100002;
      pointer-events: none; display: flex; flex-direction: column;
      align-items: flex-end; gap: 8px;
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-feature-settings: 'cv02','cv11';
    `;

    this.root.innerHTML = `
      <style>
        @keyframes ghud-pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:.6;transform:scale(.96);} }
        @keyframes ghud-fade-in { from{opacity:0;transform:translateY(-4px);} to{opacity:1;transform:translateY(0);} }
        #gesture-hud .ghud-card {
          background: rgba(10,10,15,0.78); backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px; padding: 10px 14px;
          box-shadow: 0 8px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04);
          animation: ghud-fade-in .3s ease;
        }
        #gesture-hud .ghud-row { display:flex; align-items:center; gap:10px; }
        #gesture-hud .ghud-icon { display:flex; align-items:center; justify-content:center; }
        #gesture-hud kbd {
          display:inline-block; padding: 1px 6px; border-radius: 4px;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1);
          font-family: ui-monospace, 'SF Mono', monospace; font-size: 10px;
          color: #e2e8f0;
        }
      </style>

      <div id="ghud-mode" class="ghud-card" style="
        display:flex; align-items:center; gap:10px;
        padding:10px 16px; border-radius: 999px;
        font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
      ">
        <span id="ghud-mode-icon" class="ghud-icon"></span>
        <span id="ghud-mode-label">Inspect</span>
      </div>

      <div id="ghud-desc" class="ghud-card" style="
        padding: 6px 14px; border-radius: 10px;
        font-size: 11px; color: #94a3b8; max-width: 260px;
      "></div>

      <div id="ghud-gesture" class="ghud-card" style="
        padding: 8px 12px; border-radius: 12px;
        font-size: 11px; font-weight: 600; color: #64748b;
        text-transform: uppercase; letter-spacing: 0.04em;
        display:flex; align-items:center; gap:8px;
      ">
        <span id="ghud-gesture-icon" class="ghud-icon" style="color:#475569;"></span>
        <span id="ghud-gesture-label">Show your hand</span>
      </div>

      <div id="ghud-stability" style="
        width: 120px; height: 3px; border-radius: 2px;
        background: rgba(255,255,255,0.06); overflow: hidden;
      ">
        <div id="ghud-stability-bar" style="
          width: 0%; height: 100%;
          background: linear-gradient(90deg, #10b981, #6366f1);
          transition: width .12s ease, background .2s;
        "></div>
      </div>

      <div id="ghud-eye" class="ghud-card ghud-row" style="
        padding: 6px 12px; border-radius: 10px;
        font-size: 11px; font-weight: 600; color:#22d3ee;
      "></div>

      <div id="ghud-voice" class="ghud-card" style="
        display: none; padding: 6px 12px; border-radius: 10px;
        background: rgba(239,68,68,0.18); border-color: rgba(239,68,68,0.35);
        font-size: 11px; font-weight: 600; color: #fca5a5;
        animation: ghud-pulse 1.2s ease-in-out infinite;
      "></div>

      <div id="ghud-fps" style="
        padding: 3px 10px; border-radius: 8px;
        background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.04);
        font-size: 10px; color: #475569; font-family: ui-monospace, monospace;
      ">— fps</div>

      <div id="ghud-onboard" class="ghud-card" style="
        margin-top: 4px; padding: 16px 18px; border-radius: 14px;
        font-size: 12px; color: #e2e8f0; line-height: 1.7;
        max-width: 280px;
      ">
        <div style="font-weight:700; font-size:13px; margin-bottom:10px; color:#e2e8f0; letter-spacing:-.01em; display:flex; align-items:center; gap:8px;">
          ${icon("zap", 14, { stroke: "#6366f1" })} Quick start
        </div>
        ${this.helpRow("pointer", "#22d3ee", "Point", "move cursor")}
        ${this.helpRow("pinch", "#f59e0b", "Pinch", "select / draw / measure")}
        ${this.helpRow("open_hand", "#10b981", "Open", "release / scroll")}
        ${this.helpRow("swipe_down", "#a78bfa", "Swipe down", "scroll one page")}
        ${this.helpRow("peace", "#ec4899", "Peace (1.5s)", "next mode")}
        ${this.helpRow("fist", "#ef4444", "Fist (hold)", "clear all")}
        ${this.helpRow("thumbs_up", "#22d3ee", "Thumbs up", "toggle eye tracking")}
        ${this.helpRow("mic", "#f87171", "V key + element", "voice feedback")}
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06); font-size:10px; color:#64748b; line-height:1.9;">
          <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> mode
          &nbsp; <kbd>C</kbd> clear &nbsp; <kbd>Z</kbd> undo &nbsp; <kbd>H</kbd> help
          <br><kbd>E</kbd> eye &nbsp; <kbd>V</kbd> voice &nbsp; <kbd>F</kbd> feedback
        </div>
      </div>
    `;

    container.appendChild(this.root);

    this.modeEl = this.root.querySelector("#ghud-mode")!;
    this.modeIconEl = this.root.querySelector("#ghud-mode-icon")!;
    this.modeLabelEl = this.root.querySelector("#ghud-mode-label")!;
    this.descEl = this.root.querySelector("#ghud-desc")!;
    this.gestureEl = this.root.querySelector("#ghud-gesture")!;
    this.gestureIconEl = this.root.querySelector("#ghud-gesture-icon")!;
    this.gestureLabelEl = this.root.querySelector("#ghud-gesture-label")!;
    this.fpsEl = this.root.querySelector("#ghud-fps")!;
    this.eyeEl = this.root.querySelector("#ghud-eye")!;
    this.voiceEl = this.root.querySelector("#ghud-voice")!;
    this.stabilityBar = this.root.querySelector("#ghud-stability-bar")!;
    this.onboardEl = this.root.querySelector("#ghud-onboard")!;

    this.updateEyeTracking(true);
    this.onboardTimer = window.setTimeout(() => this.hideOnboard(), 18000);
  }

  private helpRow(iconKey: string, color: string, label: string, desc: string): string {
    return `
      <div style="display:flex; align-items:center; gap:10px; padding:3px 0;">
        <span style="display:inline-flex; width:22px; height:22px; align-items:center; justify-content:center; color:${color};">${icon(iconKey, 18, { stroke: color })}</span>
        <span><b style="color:${color}; font-weight:600;">${label}</b> <span style="color:#94a3b8;">— ${desc}</span></span>
      </div>
    `;
  }

  updateMode(mode: Mode) {
    const m = MODE_META[mode];
    this.modeIconEl.innerHTML = icon(m.iconKey, 16, { stroke: m.color });
    this.modeLabelEl.textContent = m.label;
    this.modeEl.style.color = m.color;
    this.modeEl.style.borderColor = m.color + "55";
    this.descEl.textContent = m.desc;
  }

  updateGesture(type: GestureType, _confidence: number) {
    const meta = GESTURE_META[type];
    if (!meta) {
      this.gestureIconEl.innerHTML = icon("cursor", 14, { stroke: "#475569" });
      this.gestureLabelEl.textContent = "Show your hand";
      this.gestureEl.style.color = "#475569";
      return;
    }
    this.gestureIconEl.innerHTML = icon(meta.iconKey, 14, { stroke: meta.color });
    this.gestureLabelEl.textContent = meta.label;
    this.gestureEl.style.color = meta.color;
    if (this.onboardVisible) this.hideOnboard();
  }

  updateStability(info: { score: number; ambiguity: number; stableFrames: number; required: number }) {
    const ratio = info.required > 0 ? Math.min(1, info.stableFrames / info.required) : 0;
    this.stabilityBar.style.width = `${Math.round(ratio * 100)}%`;
    this.stabilityBar.style.background = info.ambiguity > 0.7
      ? "linear-gradient(90deg, #f59e0b, #ef4444)"
      : "linear-gradient(90deg, #10b981, #6366f1)";
  }

  updateFPS() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFrameTime >= 1000) {
      const fps = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
      this.fpsEl.textContent = `${fps} fps`;
      this.fpsEl.style.color = fps > 24 ? "#10b981" : fps > 15 ? "#f59e0b" : "#ef4444";
    }
  }

  updateVoice(recording: boolean) {
    this.voiceEl.style.display = recording ? "flex" : "none";
    if (recording) {
      this.voiceEl.innerHTML = `${icon("mic", 14, { stroke: "#fca5a5" })} <span>Recording…</span>`;
      this.voiceEl.style.alignItems = "center";
      this.voiceEl.style.gap = "8px";
    }
  }

  updateEyeTracking(enabled: boolean) {
    const color = enabled ? "#22d3ee" : "#475569";
    this.eyeEl.style.color = color;
    this.eyeEl.innerHTML = `${icon(enabled ? "eye" : "eye_off", 14, { stroke: color })} <span>Eye ${enabled ? "ON" : "OFF"}</span>`;
  }

  toggleHelp() {
    this.onboardVisible = !this.onboardVisible;
    this.onboardEl.style.display = this.onboardVisible ? "block" : "none";
    this.onboardEl.style.opacity = this.onboardVisible ? "1" : "0";
  }

  private hideOnboard() {
    if (!this.onboardVisible) return;
    this.onboardVisible = false;
    this.onboardEl.style.transition = "opacity 0.5s";
    this.onboardEl.style.opacity = "0";
    setTimeout(() => { this.onboardEl.style.display = "none"; }, 500);
    if (this.onboardTimer) clearTimeout(this.onboardTimer);
  }
}
