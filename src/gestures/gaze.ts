import { FaceLandmarker, type FaceLandmarkerResult, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { KalmanGaze2D } from "./kalman";

export interface GazeState {
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  blinkLeft: boolean;
  blinkRight: boolean;
  bothBlink: boolean;
  confidence: number;
}

let faceLandmarker: FaceLandmarker | null = null;
const gazeFilter = new KalmanGaze2D(100, 0.0015);
let inBlink = false;

export async function initFaceDetector(wasmFileset: unknown): Promise<FaceLandmarker> {
  faceLandmarker = await FaceLandmarker.createFromOptions(wasmFileset as any, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  return faceLandmarker;
}

export function detectGaze(video: HTMLVideoElement, timestamp: number): GazeState | null {
  if (!faceLandmarker) return null;

  const result = faceLandmarker.detectForVideo(video, timestamp);
  if (!result.faceLandmarks?.length) return null;

  const landmarks = result.faceLandmarks[0];
  const raw = computeGazeFromIris(landmarks);
  const blink = computeBlink(result);

  if (blink.bothBlink) {
    inBlink = true;
    const held = gazeFilter.peek();
    return {
      x: held.x,
      y: held.y,
      rawX: raw.x,
      rawY: raw.y,
      ...blink,
      confidence: 0,
    };
  }

  if (inBlink) {
    gazeFilter.reset(raw.x, raw.y);
    inBlink = false;
  }

  const filtered = gazeFilter.update(raw.x, raw.y, timestamp);

  return {
    x: filtered.x,
    y: filtered.y,
    rawX: raw.x,
    rawY: raw.y,
    ...blink,
    confidence: 1,
  };
}

export function resetGazeFilter(): void {
  gazeFilter.reset();
  inBlink = false;
}

function computeGazeFromIris(lm: NormalizedLandmark[]): { x: number; y: number } {
  const leftIris = lm[468];
  const rightIris = lm[473];
  const leftOuter = lm[33];
  const leftInner = lm[133];
  const rightInner = lm[362];
  const rightOuter = lm[263];

  const leftEyeWidth = Math.abs(leftOuter.x - leftInner.x);
  const leftGazeX = leftEyeWidth > 0.001
    ? (leftIris.x - leftInner.x) / leftEyeWidth
    : 0.5;

  const rightEyeWidth = Math.abs(rightOuter.x - rightInner.x);
  const rightGazeX = rightEyeWidth > 0.001
    ? (rightIris.x - rightInner.x) / rightEyeWidth
    : 0.5;

  const leftTop = lm[159];
  const leftBottom = lm[145];
  const rightTop = lm[386];
  const rightBottom = lm[374];

  const leftEyeH = Math.abs(leftTop.y - leftBottom.y);
  const leftGazeY = leftEyeH > 0.001
    ? (leftIris.y - leftTop.y) / leftEyeH
    : 0.5;

  const rightEyeH = Math.abs(rightTop.y - rightBottom.y);
  const rightGazeY = rightEyeH > 0.001
    ? (rightIris.y - rightTop.y) / rightEyeH
    : 0.5;

  const SENSITIVITY_X = 2.5;
  const SENSITIVITY_Y = 2.0;

  let gazeX = ((leftGazeX + rightGazeX) / 2 - 0.5) * SENSITIVITY_X + 0.5;
  let gazeY = ((leftGazeY + rightGazeY) / 2 - 0.5) * SENSITIVITY_Y + 0.5;

  gazeX = 1 - gazeX;

  return {
    x: Math.max(0, Math.min(1, gazeX)),
    y: Math.max(0, Math.min(1, gazeY)),
  };
}

const BLINK_THRESHOLD = 0.4;

function computeBlink(result: FaceLandmarkerResult): {
  blinkLeft: boolean;
  blinkRight: boolean;
  bothBlink: boolean;
} {
  if (!result.faceBlendshapes?.length) {
    return { blinkLeft: false, blinkRight: false, bothBlink: false };
  }

  const categories = result.faceBlendshapes[0].categories;
  const get = (name: string) => categories.find(c => c.categoryName === name)?.score ?? 0;

  const blinkLeft = get("eyeBlinkLeft") > BLINK_THRESHOLD;
  const blinkRight = get("eyeBlinkRight") > BLINK_THRESHOLD;

  return {
    blinkLeft,
    blinkRight,
    bothBlink: blinkLeft && blinkRight,
  };
}
