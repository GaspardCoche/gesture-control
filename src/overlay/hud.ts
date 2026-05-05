import type { Mode } from "../modes";
import type { GestureType } from "../gestures/detector";

const MODE_LABELS: Record<Mode, { label: string; color: string; desc: string }> = {
  inspect: { label: "Inspect", color: "#6366f1", desc: "Point to highlight elements, pinch to select" },
  draw:    { label: "Draw",    color: "#f59e0b", desc: "Pinch to draw, open hand to stop" },
  measure: { label: "Measure", color: "#f472b6", desc: "Pinch to place measurement points" },
};

export class HUD {
  root: HTMLElement;
  private gestureEl!: HTMLElement;
  private modeEl!: HTMLElement;
  private descEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private eyeEl!: HTMLElement;
  private onboardEl!: HTMLElement;
  private onboardVisible = true;
  private lastFrameTime = 0;
  private frameCount = 0;
  private onboardTimer: number | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "gesture-hud";
    this.root.style.cssText = `
      position: fixed; top: 12px; right: 12px; z-index: 100002;
      pointer-events: none; display: flex; flex-direction: column;
      align-items: flex-end; gap: 6px; font-family: system-ui, -apple-system, sans-serif;
    `;

    this.root.innerHTML = `
      <div id="ghud-mode" style="
        padding: 8px 16px; border-radius: 20px;
        background: rgba(0,0,0,0.75); backdrop-filter: blur(10px);
        font-size: 14px; font-weight: 700; color: #e2e8f0;
        border: 1px solid rgba(99,102,241,0.3);
      "></div>
      <div id="ghud-desc" style="
        padding: 4px 12px; border-radius: 12px;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
        font-size: 11px; color: #94a3b8; max-width: 240px;
      "></div>
      <div id="ghud-gesture" style="
        padding: 4px 12px; border-radius: 16px;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
        font-size: 11px; font-weight: 600; color: #475569;
        text-transform: uppercase;
      ">Show your hand</div>
      <div id="ghud-eye" style="
        padding: 4px 12px; border-radius: 16px;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
        font-size: 11px; font-weight: 600; color: #22d3ee;
      ">&#128065; Eye ON</div>
      <div id="ghud-voice" style="
        display: none; padding: 4px 12px; border-radius: 16px;
        background: rgba(239, 68, 68, 0.2); backdrop-filter: blur(8px);
        font-size: 11px; font-weight: 600; color: #ef4444;
        animation: ghud-pulse 1s ease-in-out infinite;
      "></div>
      <style>@keyframes ghud-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }</style>
      <div id="ghud-fps" style="
        padding: 3px 10px; border-radius: 12px;
        background: rgba(0,0,0,0.3);
        font-size: 10px; color: #475569;
      ">-- fps</div>
      <div id="ghud-onboard" style="
        margin-top: 8px; padding: 16px 20px; border-radius: 14px;
        background: rgba(0,0,0,0.88); backdrop-filter: blur(16px);
        border: 1px solid rgba(99,102,241,0.25);
        font-size: 13px; color: #e2e8f0; line-height: 2;
        max-width: 260px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      ">
        <div style="font-weight:800;font-size:14px;margin-bottom:8px;color:#6366f1;">Quick Start</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">&#9757;</span>
          <span><b style="color:#22d3ee;">Point</b> = move cursor</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">&#129295;</span>
          <span><b style="color:#f59e0b;">Pinch</b> = action</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">&#9995;</span>
          <span><b style="color:#10b981;">Open</b> = release</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">&#9996;</span>
          <span><b style="color:#f472b6;">Peace</b> = next mode</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">&#9994;</span>
          <span><b style="color:#ef4444;">Fist</b> (hold) = clear</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">&#128077;</span>
          <span><b style="color:#22d3ee;">Thumbs up</b> = toggle eye</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">&#9995;</span>
          <span><b style="color:#a78bfa;">Open + move</b> = scroll</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">&#127908;</span>
          <span><b style="color:#ef4444;">V</b> = voice feedback</span>
        </div>
        <div style="margin-top:8px;font-size:10px;color:#64748b;">
          Keys: <b>1</b> Inspect <b>2</b> Draw <b>3</b> Measure | <b>C</b> clear <b>Z</b> undo <b>H</b> help <b>E</b> eye <b>V</b> voice <b>F</b> feedback
        </div>
      </div>
    `;

    container.appendChild(this.root);
    this.gestureEl = this.root.querySelector("#ghud-gesture")!;
    this.modeEl = this.root.querySelector("#ghud-mode")!;
    this.descEl = this.root.querySelector("#ghud-desc")!;
    this.fpsEl = this.root.querySelector("#ghud-fps")!;
    this.eyeEl = this.root.querySelector("#ghud-eye")!;
    this.onboardEl = this.root.querySelector("#ghud-onboard")!;

    this.onboardTimer = window.setTimeout(() => this.hideOnboard(), 15000);
  }

  updateMode(mode: Mode) {
    const m = MODE_LABELS[mode];
    this.modeEl.textContent = m.label;
    this.modeEl.style.borderColor = m.color + "60";
    this.modeEl.style.color = m.color;
    this.descEl.textContent = m.desc;
  }

  updateGesture(type: GestureType, confidence: number) {
    if (type === "NONE") {
      this.gestureEl.textContent = "Show your hand";
      this.gestureEl.style.color = "#475569";
    } else {
      this.gestureEl.textContent = `${type} ${Math.round(confidence * 100)}%`;
      this.gestureEl.style.color = "#94a3b8";
      if (this.onboardVisible) this.hideOnboard();
    }
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
    const badge = this.root.querySelector("#ghud-voice") as HTMLElement;
    if (badge) {
      badge.style.display = recording ? "block" : "none";
      badge.textContent = recording ? "\u{1F534} Recording..." : "";
    }
  }

  updateEyeTracking(enabled: boolean) {
    this.eyeEl.textContent = enabled ? "\u{1F441} Eye ON" : "\u{1F441} Eye OFF";
    this.eyeEl.style.color = enabled ? "#22d3ee" : "#475569";
  }

  toggleHelp() {
    this.onboardVisible = !this.onboardVisible;
    this.onboardEl.style.display = this.onboardVisible ? "block" : "none";
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
