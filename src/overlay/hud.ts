import type { Mode } from "../modes";
import type { GestureType } from "../gestures/detector";

const MODE_LABELS: Record<Mode, { icon: string; label: string; color: string }> = {
  inspect:   { icon: "O", label: "Inspect",   color: "#6366f1" },
  draw:      { icon: "/",  label: "Draw",      color: "#f59e0b" },
  spotlight: { icon: "*", label: "Spotlight", color: "#22d3ee" },
  console:   { icon: ">",  label: "Console",   color: "#10b981" },
  measure:   { icon: "#", label: "Measure",   color: "#f472b6" },
};

const GESTURE_COLORS: Record<string, string> = {
  PINCH: "#f59e0b", POINT: "#22d3ee", FIST: "#ef4444",
  OPEN: "#10b981", SPREAD: "#8b5cf6", PEACE: "#f472b6", NONE: "#475569",
};

export class HUD {
  root: HTMLElement;
  private gestureEl!: HTMLElement;
  private modeEl!: HTMLElement;
  private helpEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private helpVisible = false;
  private lastFrameTime = 0;
  private frameCount = 0;

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
        padding: 6px 14px; border-radius: 20px;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
        font-size: 13px; font-weight: 700; color: #e2e8f0;
        display: flex; align-items: center; gap: 8px;
        border: 1px solid rgba(99,102,241,0.3);
      "></div>
      <div id="ghud-gesture" style="
        padding: 4px 12px; border-radius: 16px;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
        font-size: 11px; font-weight: 600; color: #475569;
        text-transform: uppercase; letter-spacing: 0.05em;
      ">No hand</div>
      <div id="ghud-fps" style="
        padding: 3px 10px; border-radius: 12px;
        background: rgba(0,0,0,0.4);
        font-size: 10px; color: #475569;
      ">-- fps</div>
      <div id="ghud-help" style="
        padding: 10px 14px; border-radius: 10px;
        background: rgba(0,0,0,0.85); backdrop-filter: blur(12px);
        font-size: 11px; color: #94a3b8; line-height: 1.8;
        max-width: 280px; display: none;
        border: 1px solid #27272a;
      ">
        <div style="color:#e2e8f0;font-weight:700;margin-bottom:6px;">Gesture Controls</div>
        <div><span style="color:#22d3ee;">Point</span> -- move cursor</div>
        <div><span style="color:#f59e0b;">Pinch</span> -- select / draw / grab</div>
        <div><span style="color:#10b981;">Open</span> -- release / deselect</div>
        <div><span style="color:#ef4444;">Fist</span> (hold) -- clear</div>
        <div><span style="color:#8b5cf6;">Spread</span> -- zoom / resize</div>
        <div><span style="color:#f472b6;">Peace</span> -- cycle mode</div>
        <div style="margin-top:8px;color:#64748b;font-size:10px;">
          <kbd style="background:#27272a;padding:1px 4px;border-radius:3px;">1-5</kbd> modes
          <kbd style="background:#27272a;padding:1px 4px;border-radius:3px;">C</kbd> clear
          <kbd style="background:#27272a;padding:1px 4px;border-radius:3px;">Z</kbd> undo
          <kbd style="background:#27272a;padding:1px 4px;border-radius:3px;">H</kbd> help
          <kbd style="background:#27272a;padding:1px 4px;border-radius:3px;">D</kbd> debug
        </div>
      </div>
    `;

    container.appendChild(this.root);
    this.gestureEl = this.root.querySelector("#ghud-gesture")!;
    this.modeEl = this.root.querySelector("#ghud-mode")!;
    this.helpEl = this.root.querySelector("#ghud-help")!;
    this.fpsEl = this.root.querySelector("#ghud-fps")!;
  }

  updateMode(mode: Mode) {
    const m = MODE_LABELS[mode];
    this.modeEl.innerHTML = `<span style="color:${m.color};">[${m.icon}]</span> <span>${m.label}</span>`;
    this.modeEl.style.borderColor = m.color + "60";
  }

  updateGesture(type: GestureType, confidence: number) {
    if (type === "NONE") {
      this.gestureEl.textContent = "No hand detected";
      this.gestureEl.style.color = "#475569";
    } else {
      this.gestureEl.textContent = `${type} (${Math.round(confidence * 100)}%)`;
      this.gestureEl.style.color = GESTURE_COLORS[type] || "#e2e8f0";
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

  toggleHelp() {
    this.helpVisible = !this.helpVisible;
    this.helpEl.style.display = this.helpVisible ? "block" : "none";
  }
}
