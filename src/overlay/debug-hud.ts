import type { ScrollDebugInfo } from "../gestures/scroll";
import type { GestureType } from "../gestures/classifier";
import type { MPCategory } from "../gestures/gesture-recognizer";

export class DebugHUD {
  private root: HTMLElement;
  private visible = false;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "gesture-debug-hud";
    this.root.style.cssText = `
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      padding: 8px 14px; border-radius: 10px;
      background: rgba(11,11,16,0.96); backdrop-filter: blur(12px);
      border: 1px solid rgba(34,211,238,0.35);
      color: #67e8f9; font-family: ui-monospace, 'SF Mono', monospace; font-size: 11px;
      z-index: 100006; pointer-events: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      display: none;
      white-space: nowrap;
    `;
    container.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.style.display = visible ? "block" : "none";
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  update(data: {
    custom: GestureType;
    mp: MPCategory | null;
    mpScore: number;
    indexY: number;
    wristY: number;
    scroll: ScrollDebugInfo;
    fps: number;
  }): void {
    if (!this.visible) return;
    const mpDisplay = data.mp ? `${data.mp} (${(data.mpScore * 100).toFixed(0)}%)` : "—";
    const dyColor = Math.abs(data.scroll.rawDy) >= 0.0015 ? "#10b981" : "#64748b";
    const pxColor = data.scroll.pxApplied !== 0 ? "#a78bfa" : "#475569";
    this.root.innerHTML = `
      <span style="color:#94a3b8;">custom:</span> <span style="color:${data.custom === "NONE" ? "#475569" : "#67e8f9"};font-weight:700;">${data.custom}</span>
      &nbsp;·&nbsp;<span style="color:#94a3b8;">ml:</span> <span style="color:#a78bfa;">${mpDisplay}</span>
      &nbsp;·&nbsp;<span style="color:#94a3b8;">idxY:</span> ${data.indexY.toFixed(3)}
      &nbsp;<span style="color:#94a3b8;">wrY:</span> ${data.wristY.toFixed(3)}
      &nbsp;·&nbsp;<span style="color:#94a3b8;">dy:</span> <span style="color:${dyColor};">${data.scroll.rawDy.toFixed(4)}</span>
      &nbsp;<span style="color:#94a3b8;">px:</span> <span style="color:${pxColor};font-weight:700;">${Math.round(data.scroll.pxApplied)}</span>
      &nbsp;<span style="color:#94a3b8;">[${data.scroll.reason}]</span>
      &nbsp;·&nbsp;<span style="color:#94a3b8;">fps:</span> ${data.fps}
    `;
  }
}
