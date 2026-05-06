import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { classify, type GestureType, type ClassificationResult } from "./classifier";
import * as MPRecognizer from "./gesture-recognizer";
import type { MPCategory } from "./gesture-recognizer";

export type { GestureType } from "./classifier";
export type { MPCategory } from "./gesture-recognizer";

export interface GestureState {
  type: GestureType;
  confidence: number;
  landmarks: NormalizedLandmark[];
  indexTip: { x: number; y: number; z: number };
  thumbTip: { x: number; y: number; z: number };
  wrist: { x: number; y: number; z: number };
  pinchRatio: number;
  handScale: number;
  classification: ClassificationResult;
  mp: { category: MPCategory; score: number } | null;
}

export interface DetectionResult {
  hand: GestureState | null;
  hand2: GestureState | null;
}

let handLandmarker: HandLandmarker | null = null;

export async function initDetector(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(
    `${import.meta.env.BASE_URL}mediapipe-wasm`
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  MPRecognizer.init().catch((err) => {
    console.warn("[gesture-recognizer] init failed (will run without ML gestures):", err);
  });
}

function buildState(lm: any[], handedness: number, mp: { category: MPCategory; score: number } | null): GestureState {
  const classification = classify(lm);
  const indexTip = lm[8];
  const thumbTip = lm[4];
  const wrist = lm[0];
  return {
    type: classification.type,
    confidence: handedness,
    landmarks: lm,
    indexTip: { x: indexTip.x, y: indexTip.y, z: indexTip.z ?? 0 },
    thumbTip: { x: thumbTip.x, y: thumbTip.y, z: thumbTip.z ?? 0 },
    wrist: { x: wrist.x, y: wrist.y, z: wrist.z ?? 0 },
    pinchRatio: classification.pinchRatio,
    handScale: classification.handScale,
    classification,
    mp,
  };
}

export function detect(video: HTMLVideoElement, timestamp: number): DetectionResult {
  let hand: GestureState | null = null;
  let hand2: GestureState | null = null;

  if (handLandmarker) {
    const results = handLandmarker.detectForVideo(video, timestamp);
    let mp: { category: MPCategory; score: number } | null = null;
    if (MPRecognizer.isReady()) {
      const r = MPRecognizer.recognize(video, timestamp);
      if (r) mp = { category: r.category, score: r.score };
    }
    if (results.landmarks.length > 0) {
      hand = buildState(results.landmarks[0], results.handedness[0]?.[0]?.score ?? 0, mp);
    }
    if (results.landmarks.length > 1) {
      hand2 = buildState(results.landmarks[1], results.handedness[1]?.[0]?.score ?? 0, null);
    }
  }

  return { hand, hand2 };
}
