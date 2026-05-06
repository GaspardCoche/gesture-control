import type { GestureType } from "./classifier";

const BLOCKING: GestureType[] = ["PINCH", "PEACE", "FIST"];
const DEADZONE = 0.0035;
const SPEED_FACTOR = 2400;
const MAX_PER_FRAME = 80;
const SMOOTH = 0.55;

export class ScrollController {
  private lastWristY: number | null = null;
  private smoothedDy = 0;
  private scrolling = false;
  private debug = false;

  setDebug(on: boolean): void {
    this.debug = on;
  }

  update(gesture: GestureType, wristY: number): number {
    if (BLOCKING.includes(gesture)) {
      this.lastWristY = null;
      this.smoothedDy = 0;
      this.scrolling = false;
      return 0;
    }

    if (this.lastWristY === null) {
      this.lastWristY = wristY;
      return 0;
    }

    const rawDy = wristY - this.lastWristY;
    this.lastWristY = wristY;

    if (Math.abs(rawDy) < DEADZONE) {
      this.smoothedDy *= 1 - SMOOTH;
      this.scrolling = false;
      return 0;
    }

    this.smoothedDy = this.smoothedDy * (1 - SMOOTH) + rawDy * SMOOTH;
    const px = Math.sign(this.smoothedDy) * Math.min(Math.abs(this.smoothedDy) * SPEED_FACTOR, MAX_PER_FRAME);
    if (Math.abs(px) < 0.5) return 0;

    window.scrollBy({ top: px, behavior: "auto" });
    this.scrolling = true;
    if (this.debug) console.debug("[scroll]", { dy: rawDy.toFixed(4), smooth: this.smoothedDy.toFixed(4), px: Math.round(px) });
    return px;
  }

  get isScrolling(): boolean {
    return this.scrolling;
  }

  reset(): void {
    this.lastWristY = null;
    this.smoothedDy = 0;
    this.scrolling = false;
  }
}
