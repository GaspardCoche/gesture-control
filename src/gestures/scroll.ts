import type { GestureType } from "./classifier";

interface SamplePt {
  y: number;
  t: number;
}

export class ScrollController {
  private active = false;
  private samples: SamplePt[] = [];
  private startTime = 0;
  private lastSwipeAt = 0;
  private dragMode = false;
  private lastDragY = 0;
  private scrolling = false;
  private lastDirection = 0;

  private readonly SWIPE_DISTANCE = 0.04;
  private readonly SWIPE_WINDOW_MS = 220;
  private readonly SWIPE_COOLDOWN_MS = 500;
  private readonly DRAG_AFTER_MS = 800;
  private readonly DRAG_DEADZONE = 0.008;
  private readonly DRAG_SPEED = 1800;
  private readonly DRAG_MAX = 40;
  private readonly SAMPLE_LIMIT = 10;

  update(gesture: GestureType, wristY: number): number {
    if (gesture !== "OPEN") {
      this.cancel();
      return 0;
    }

    const now = performance.now();

    if (!this.active) {
      this.active = true;
      this.startTime = now;
      this.samples = [{ y: wristY, t: now }];
      this.dragMode = false;
      return 0;
    }

    this.samples.push({ y: wristY, t: now });
    while (this.samples.length > this.SAMPLE_LIMIT) this.samples.shift();
    while (this.samples.length > 2 && now - this.samples[0].t > this.SWIPE_WINDOW_MS) {
      this.samples.shift();
    }

    if (!this.dragMode && now - this.startTime > this.DRAG_AFTER_MS) {
      this.dragMode = true;
      this.lastDragY = wristY;
    }

    if (this.dragMode) {
      const delta = wristY - this.lastDragY;
      this.lastDragY = wristY;
      if (Math.abs(delta) < this.DRAG_DEADZONE) return 0;
      this.scrolling = true;
      const speed = Math.sign(delta) * Math.min(Math.abs(delta) * this.DRAG_SPEED, this.DRAG_MAX);
      window.scrollBy({ top: speed, behavior: "auto" });
      return speed;
    }

    if (now - this.lastSwipeAt < this.SWIPE_COOLDOWN_MS) return 0;
    if (this.samples.length < 3) return 0;

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dy = last.y - first.y;
    const dt = last.t - first.t;
    if (dt < 60 || dt > this.SWIPE_WINDOW_MS) return 0;
    if (Math.abs(dy) < this.SWIPE_DISTANCE) return 0;

    const direction = Math.sign(dy);
    const distance = Math.round(window.innerHeight * 0.7);
    window.scrollBy({ top: direction * distance, behavior: "smooth" });

    this.lastSwipeAt = now;
    this.lastDirection = direction;
    this.samples = [{ y: wristY, t: now }];
    this.scrolling = true;
    return direction * distance;
  }

  private cancel(): void {
    this.active = false;
    this.scrolling = false;
    this.samples = [];
    this.dragMode = false;
  }

  get isScrolling(): boolean {
    return this.scrolling;
  }

  get lastSwipeDirection(): number {
    return this.lastDirection;
  }

  reset(): void {
    this.cancel();
    this.lastSwipeAt = 0;
    this.lastDirection = 0;
  }
}
