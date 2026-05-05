import type { GestureType } from "./classifier";

export class ScrollController {
  private active = false;
  private lastWristY = 0;
  private scrolling = false;

  private readonly DEADZONE = 0.012;
  private readonly SPEED_SCALE = 2200;
  private readonly MAX_SCROLL = 50;

  update(gesture: GestureType, wristY: number): number {
    if (gesture !== "OPEN") {
      this.active = false;
      this.scrolling = false;
      return 0;
    }

    if (!this.active) {
      this.active = true;
      this.lastWristY = wristY;
      return 0;
    }

    const delta = wristY - this.lastWristY;
    this.lastWristY = wristY;

    if (Math.abs(delta) < this.DEADZONE) return 0;

    this.scrolling = true;
    const speed = Math.sign(delta) * Math.min(
      Math.abs(delta) * this.SPEED_SCALE,
      this.MAX_SCROLL
    );
    window.scrollBy({ top: speed, behavior: "auto" });
    return speed;
  }

  get isScrolling(): boolean {
    return this.scrolling;
  }

  reset() {
    this.active = false;
    this.scrolling = false;
    this.lastWristY = 0;
  }
}
