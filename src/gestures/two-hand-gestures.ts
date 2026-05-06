import type { GestureState } from "./detector";

export type TwoHandEvent =
  | "two-hand-clap"
  | "two-hand-spread"
  | "two-hand-scroll-up"
  | "two-hand-scroll-down"
  | "two-hand-zoom-in"
  | "two-hand-zoom-out";

const CLAP_DISTANCE = 0.10;
const SPREAD_DISTANCE = 0.55;
const COOLDOWN_MS = 800;
const PARALLEL_DEADZONE = 0.005;

export class TwoHandDetector {
  private lastEvent = 0;
  private listener?: (e: TwoHandEvent) => void;
  private prevDistance: number | null = null;
  private prevAvgY: number | null = null;
  private clapStartedAt = 0;
  private spreadStartedAt = 0;

  setListener(cb: (e: TwoHandEvent) => void): void {
    this.listener = cb;
  }

  feed(left: GestureState | null, right: GestureState | null): { distance: number | null; parallelDy: number | null } {
    if (!left || !right) {
      this.prevDistance = null;
      this.prevAvgY = null;
      this.clapStartedAt = 0;
      this.spreadStartedAt = 0;
      return { distance: null, parallelDy: null };
    }

    const lwx = left.wrist.x, lwy = left.wrist.y;
    const rwx = right.wrist.x, rwy = right.wrist.y;
    const distance = Math.hypot(lwx - rwx, lwy - rwy);
    const avgY = (lwy + rwy) / 2;
    const now = performance.now();

    let parallelDy: number | null = null;
    if (this.prevAvgY !== null) {
      parallelDy = avgY - this.prevAvgY;
      const bothOpen = (left.type === "OPEN" || right.type === "OPEN") && Math.abs(parallelDy) > PARALLEL_DEADZONE;
      if (bothOpen && now - this.lastEvent > 80) {
        if (parallelDy > 0) this.fire("two-hand-scroll-down", now);
        else this.fire("two-hand-scroll-up", now);
      }
    }

    if (distance < CLAP_DISTANCE) {
      if (this.clapStartedAt === 0) this.clapStartedAt = now;
      else if (now - this.clapStartedAt > 250 && now - this.lastEvent > COOLDOWN_MS) {
        this.fire("two-hand-clap", now);
        this.clapStartedAt = now + 99999;
      }
    } else {
      this.clapStartedAt = 0;
    }

    if (distance > SPREAD_DISTANCE) {
      if (this.spreadStartedAt === 0) this.spreadStartedAt = now;
      else if (now - this.spreadStartedAt > 250 && now - this.lastEvent > COOLDOWN_MS) {
        this.fire("two-hand-spread", now);
        this.spreadStartedAt = now + 99999;
      }
    } else {
      this.spreadStartedAt = 0;
    }

    if (this.prevDistance !== null) {
      const distanceDelta = distance - this.prevDistance;
      if (Math.abs(distanceDelta) > 0.04 && now - this.lastEvent > COOLDOWN_MS) {
        if (distanceDelta > 0 && (left.type === "OPEN" || right.type === "OPEN")) {
          this.fire("two-hand-zoom-out", now);
        } else if (distanceDelta < 0 && (left.type === "OPEN" || right.type === "OPEN")) {
          this.fire("two-hand-zoom-in", now);
        }
      }
    }

    this.prevDistance = distance;
    this.prevAvgY = avgY;
    return { distance, parallelDy };
  }

  private fire(event: TwoHandEvent, now: number): void {
    this.lastEvent = now;
    this.listener?.(event);
  }
}
