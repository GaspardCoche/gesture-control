import type { GestureType } from "./classifier";
import type { MPCategory } from "./gesture-recognizer";

export type SignatureEvent =
  | "double-pinch"
  | "double-fist"
  | "ilove-you"
  | "thumb-up-mp"
  | "thumb-down-mp";

interface DoubleTapState {
  lastTriggerAt: number;
  lastReleaseAt: number;
  inTap: boolean;
}

const DOUBLE_TAP_WINDOW_MS = 700;
const COOLDOWN_MS = 800;
const ILY_HOLD_MS = 600;

export class SignatureDetector {
  private pinchState: DoubleTapState = { lastTriggerAt: 0, lastReleaseAt: 0, inTap: false };
  private fistState: DoubleTapState = { lastTriggerAt: 0, lastReleaseAt: 0, inTap: false };
  private iloveStartedAt = 0;
  private lastEvent = 0;
  private listener?: (e: SignatureEvent) => void;
  private prevCustom: GestureType = "NONE";
  private prevMp: MPCategory = "None";

  setListener(cb: (e: SignatureEvent) => void): void {
    this.listener = cb;
  }

  feed(custom: GestureType, mp: MPCategory | null): void {
    const now = performance.now();

    this.detectDoubleTap(custom, "PINCH", this.pinchState, now, "double-pinch");
    this.detectDoubleTap(custom, "FIST", this.fistState, now, "double-fist");

    if (mp === "ILoveYou") {
      if (this.iloveStartedAt === 0) this.iloveStartedAt = now;
      else if (now - this.iloveStartedAt > ILY_HOLD_MS && now - this.lastEvent > COOLDOWN_MS) {
        this.fire("ilove-you", now);
        this.iloveStartedAt = now + 99999;
      }
    } else {
      this.iloveStartedAt = 0;
    }

    if (mp === "Thumb_Up" && this.prevMp !== "Thumb_Up" && now - this.lastEvent > COOLDOWN_MS) {
      this.fire("thumb-up-mp", now);
    }
    if (mp === "Thumb_Down" && this.prevMp !== "Thumb_Down" && now - this.lastEvent > COOLDOWN_MS) {
      this.fire("thumb-down-mp", now);
    }

    this.prevCustom = custom;
    this.prevMp = mp ?? "None";
  }

  private detectDoubleTap(
    current: GestureType,
    target: GestureType,
    state: DoubleTapState,
    now: number,
    event: SignatureEvent,
  ): void {
    const isTarget = current === target;
    const wasTarget = this.prevCustom === target;

    if (isTarget && !wasTarget) {
      state.inTap = true;
    }
    if (!isTarget && wasTarget && state.inTap) {
      state.inTap = false;
      const sinceLast = now - state.lastReleaseAt;
      if (sinceLast > 80 && sinceLast < DOUBLE_TAP_WINDOW_MS && now - this.lastEvent > COOLDOWN_MS) {
        this.fire(event, now);
      }
      state.lastReleaseAt = now;
    }
  }

  private fire(event: SignatureEvent, now: number): void {
    this.lastEvent = now;
    this.listener?.(event);
  }
}
