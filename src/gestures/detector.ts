import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { classify, type GestureType, type ClassificationResult } from "./classifier";

export type { GestureType } from "./classifier";

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
}

export interface DetectionResult {
  hand: GestureState | null;
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
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
}

export function detect(video: HTMLVideoElement, timestamp: number): DetectionResult {
  let hand: GestureState | null = null;

  if (handLandmarker) {
    const results = handLandmarker.detectForVideo(video, timestamp);
    if (results.landmarks.length > 0) {
      const lm = results.landmarks[0];
      const classification = classify(lm);
      const indexTip = lm[8];
      const thumbTip = lm[4];
      const wrist = lm[0];

      hand = {
        type: classification.type,
        confidence: results.handedness[0]?.[0]?.score ?? 0,
        landmarks: lm,
        indexTip: { x: indexTip.x, y: indexTip.y, z: indexTip.z ?? 0 },
        thumbTip: { x: thumbTip.x, y: thumbTip.y, z: thumbTip.z ?? 0 },
        wrist: { x: wrist.x, y: wrist.y, z: wrist.z ?? 0 },
        pinchRatio: classification.pinchRatio,
        handScale: classification.handScale,
        classification,
      };
    }
  }

  return { hand };
}
