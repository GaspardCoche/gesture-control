import type { GestureType } from "./classifier";

const BLOCKING: GestureType[] = ["PINCH"];
const DEADZONE = 0.0015;
const SPEED_FACTOR = 3000;
const MAX_PER_FRAME = 100;
const SMOOTH = 0.6;

export interface ScrollDebugInfo {
  gesture: GestureType | "NONE";
  trackY: number;
  rawDy: number;
  smoothedDy: number;
  pxApplied: number;
  blocked: boolean;
  reason: string;
}

export class ScrollController {
  private lastY: number | null = null;
  private smoothedDy = 0;
  private scrolling = false;
  private debug = false;
  private lastInfo: ScrollDebugInfo = {
    gesture: "NONE",
    trackY: 0, rawDy: 0, smoothedDy: 0, pxApplied: 0,
    blocked: false, reason: "init",
  };

  setDebug(on: boolean): void {
    this.debug = on;
  }

  getDebugInfo(): ScrollDebugInfo {
    return this.lastInfo;
  }

  update(gesture: GestureType, trackY: number): number {
    let pxApplied = 0;
    let reason = "";
    let blocked = false;

    if (BLOCKING.includes(gesture)) {
      this.lastY = null;
      this.smoothedDy = 0;
      this.scrolling = false;
      blocked = true;
      reason = "blocked-by-gesture";
      this.lastInfo = { gesture, trackY, rawDy: 0, smoothedDy: 0, pxApplied: 0, blocked, reason };
      return 0;
    }

    if (this.lastY === null) {
      this.lastY = trackY;
      reason = "first-frame";
      this.lastInfo = { gesture, trackY, rawDy: 0, smoothedDy: 0, pxApplied: 0, blocked: false, reason };
      return 0;
    }

    const rawDy = trackY - this.lastY;
    this.lastY = trackY;

    if (Math.abs(rawDy) < DEADZONE) {
      this.smoothedDy *= 1 - SMOOTH;
      this.scrolling = false;
      reason = "deadzone";
      this.lastInfo = { gesture, trackY, rawDy, smoothedDy: this.smoothedDy, pxApplied: 0, blocked: false, reason };
      return 0;
    }

    this.smoothedDy = this.smoothedDy * (1 - SMOOTH) + rawDy * SMOOTH;
    const px = Math.sign(this.smoothedDy) * Math.min(Math.abs(this.smoothedDy) * SPEED_FACTOR, MAX_PER_FRAME);
    if (Math.abs(px) >= 0.5) {
      window.scrollBy({ top: px, behavior: "auto" });
      this.scrolling = true;
      pxApplied = px;
      reason = "scrolling";
      if (this.debug) console.debug("[scroll] dy", rawDy.toFixed(4), "px", Math.round(px), "gesture", gesture);
    } else {
      reason = "px-too-small";
    }

    this.lastInfo = { gesture, trackY, rawDy, smoothedDy: this.smoothedDy, pxApplied, blocked: false, reason };
    return pxApplied;
  }

  get isScrolling(): boolean {
    return this.scrolling;
  }

  reset(): void {
    this.lastY = null;
    this.smoothedDy = 0;
    this.scrolling = false;
  }
}
