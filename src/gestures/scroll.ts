import type { GestureType } from "./classifier";

interface SamplePt {
  y: number;
  t: number;
}

const BLOCKING: GestureType[] = ["PINCH", "PEACE", "FIST"];
const SWIPE_WINDOW_MS = 350;
const SAMPLE_RETAIN_MS = 600;
const SWIPE_COOLDOWN_MS = 600;
const SWIPE_DISTANCE_NORM = 0.025;
const MIN_SAMPLES = 3;

export class ScrollController {
  private samples: SamplePt[] = [];
  private lastSwipeAt = 0;
  private lastDirection = 0;
  private scrolling = false;
  private debug = false;

  setDebug(on: boolean): void {
    this.debug = on;
  }

  update(gesture: GestureType, wristY: number): number {
    const now = performance.now();

    if (BLOCKING.includes(gesture)) {
      this.samples = [];
      this.scrolling = false;
      return 0;
    }

    this.samples.push({ y: wristY, t: now });
    while (this.samples.length > 0 && now - this.samples[0].t > SAMPLE_RETAIN_MS) {
      this.samples.shift();
    }

    if (now - this.lastSwipeAt < SWIPE_COOLDOWN_MS) return 0;

    const recent = this.samples.filter((s) => now - s.t <= SWIPE_WINDOW_MS);
    if (recent.length < MIN_SAMPLES) return 0;

    const first = recent[0];
    const last = recent[recent.length - 1];
    const dy = last.y - first.y;
    const dt = last.t - first.t;
    if (dt < 60) return 0;

    let cumulativeUp = 0;
    let cumulativeDown = 0;
    for (let i = 1; i < recent.length; i++) {
      const d = recent[i].y - recent[i - 1].y;
      if (d > 0) cumulativeDown += d;
      else cumulativeUp += -d;
    }
    const dominant = cumulativeDown > cumulativeUp ? cumulativeDown : -cumulativeUp;
    if (Math.abs(dominant) < SWIPE_DISTANCE_NORM) {
      if (this.debug) console.debug("[scroll] not enough motion", { dominant: dominant.toFixed(4), dy: dy.toFixed(4), n: recent.length });
      return 0;
    }
    if (Math.sign(dominant) !== Math.sign(dy)) {
      if (this.debug) console.debug("[scroll] direction inconsistent");
      return 0;
    }

    const direction = Math.sign(dominant);
    const distance = Math.round(window.innerHeight * 0.7);
    window.scrollBy({ top: direction * distance, behavior: "smooth" });

    this.lastSwipeAt = now;
    this.lastDirection = direction;
    this.samples = [];
    this.scrolling = true;
    if (this.debug) console.info("[scroll] SWIPE", { direction, distance, gesture, dt: Math.round(dt), dominant: dominant.toFixed(4) });
    return direction * distance;
  }

  get isScrolling(): boolean {
    return this.scrolling;
  }

  get lastSwipeDirection(): number {
    return this.lastDirection;
  }

  reset(): void {
    this.samples = [];
    this.scrolling = false;
  }
}
