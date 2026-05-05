import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type GestureType = "PINCH" | "POINT" | "FIST" | "OPEN" | "PEACE" | "THUMBS_UP" | "NONE";

// ─── 3D geometry ───

function dist3d(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function angleBetween(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v1z = (a.z ?? 0) - (b.z ?? 0);
  const v2x = c.x - b.x, v2y = c.y - b.y, v2z = (c.z ?? 0) - (b.z ?? 0);
  const dot = v1x * v2x + v1y * v2y + v1z * v2z;
  const mag1 = Math.hypot(v1x, v1y, v1z);
  const mag2 = Math.hypot(v2x, v2y, v2z);
  if (mag1 < 1e-6 || mag2 < 1e-6) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI);
}

// ─── Finger detection (rotation-invariant via joint angles) ───

const FINGER_LANDMARKS = [
  { mcp: 5, pip: 6, dip: 7, tip: 8 },
  { mcp: 9, pip: 10, dip: 11, tip: 12 },
  { mcp: 13, pip: 14, dip: 15, tip: 16 },
  { mcp: 17, pip: 18, dip: 19, tip: 20 },
];

function isFingerExtended(lm: NormalizedLandmark[], finger: number): boolean {
  const f = FINGER_LANDMARKS[finger];
  const pipAngle = angleBetween(lm[f.mcp], lm[f.pip], lm[f.dip]);
  const dipAngle = angleBetween(lm[f.pip], lm[f.dip], lm[f.tip]);
  return pipAngle > 155 && dipAngle > 155;
}

function isFingerCurled(lm: NormalizedLandmark[], finger: number): boolean {
  const f = FINGER_LANDMARKS[finger];
  const pipAngle = angleBetween(lm[f.mcp], lm[f.pip], lm[f.dip]);
  return pipAngle < 110;
}

function isThumbExtended(lm: NormalizedLandmark[]): boolean {
  const mcpAngle = angleBetween(lm[1], lm[2], lm[3]);
  const ipAngle = angleBetween(lm[2], lm[3], lm[4]);
  const palmWidth = dist3d(lm[0], lm[5]);
  const thumbReach = dist3d(lm[4], lm[2]);
  return mcpAngle > 130 && ipAngle > 150 && thumbReach > palmWidth * 0.4;
}

// ─── Hand scale for adaptive thresholds ───

export function getHandScale(lm: NormalizedLandmark[]): number {
  return dist3d(lm[0], lm[9]);
}

export function getPinchRatio(lm: NormalizedLandmark[]): number {
  const d = dist3d(lm[4], lm[8]);
  const scale = getHandScale(lm);
  return scale > 0.001 ? d / scale : 1;
}

// ─── Finger state ───

export interface FingerState {
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  thumb: boolean;
  extendedCount: number;
}

export interface ClassificationResult {
  type: GestureType;
  fingers: FingerState;
  pinchRatio: number;
  handScale: number;
}

// ─── Raw classification (single frame, no smoothing) ───

function classifyRaw(lm: NormalizedLandmark[]): ClassificationResult {
  const indexExt = isFingerExtended(lm, 0);
  const middleExt = isFingerExtended(lm, 1);
  const ringExt = isFingerExtended(lm, 2);
  const pinkyExt = isFingerExtended(lm, 3);
  const thumbExt = isThumbExtended(lm);
  const extendedCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

  const fingers: FingerState = {
    index: indexExt, middle: middleExt, ring: ringExt,
    pinky: pinkyExt, thumb: thumbExt, extendedCount,
  };

  const pinchRatio = getPinchRatio(lm);
  const handScale = getHandScale(lm);

  let type: GestureType = "NONE";

  if (pinchRatio < 0.15) {
    type = "PINCH";
  } else if (extendedCount === 0 && !thumbExt) {
    type = "FIST";
  } else if (extendedCount === 0 && thumbExt) {
    type = "THUMBS_UP";
  } else if (extendedCount === 1 && indexExt && !middleExt) {
    type = "POINT";
  } else if (extendedCount === 2 && indexExt && middleExt && !ringExt && !pinkyExt) {
    type = "PEACE";
  } else if (extendedCount >= 3) {
    type = "OPEN";
  }

  return { type, fingers, pinchRatio, handScale };
}

// ─── EMA temporal smoothing with hysteresis ───

const GESTURE_KEYS: GestureType[] = ["PINCH", "POINT", "FIST", "OPEN", "PEACE", "THUMBS_UP", "NONE"];

const gestureScores: Record<GestureType, number> = {
  PINCH: 0, POINT: 0, FIST: 0, OPEN: 0, PEACE: 0, THUMBS_UP: 0, NONE: 1,
};

let currentGesture: GestureType = "NONE";
const ALPHA = 0.3;
const ACTIVATE_THRESHOLD = 0.48;
const DEACTIVATE_THRESHOLD = 0.25;

export function classify(lm: NormalizedLandmark[]): ClassificationResult {
  const raw = classifyRaw(lm);

  for (let i = 0; i < GESTURE_KEYS.length; i++) {
    gestureScores[GESTURE_KEYS[i]] *= (1 - ALPHA);
  }
  gestureScores[raw.type] += ALPHA;

  let best: GestureType = "NONE";
  let bestScore = 0;
  for (let i = 0; i < GESTURE_KEYS.length; i++) {
    if (gestureScores[GESTURE_KEYS[i]] > bestScore) {
      bestScore = gestureScores[GESTURE_KEYS[i]];
      best = GESTURE_KEYS[i];
    }
  }

  if (best !== currentGesture && bestScore > ACTIVATE_THRESHOLD) {
    currentGesture = best;
  } else if (gestureScores[currentGesture] < DEACTIVATE_THRESHOLD) {
    currentGesture = "NONE";
  }

  raw.type = currentGesture;
  return raw;
}

export function resetClassifier() {
  for (let i = 0; i < GESTURE_KEYS.length; i++) {
    gestureScores[GESTURE_KEYS[i]] = GESTURE_KEYS[i] === "NONE" ? 1 : 0;
  }
  currentGesture = "NONE";
}
