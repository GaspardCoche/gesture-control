import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { classify, type GestureType, type ClassificationResult } from "./classifier";
import { initFaceDetector, detectGaze, type GazeState } from "./gaze";

export type { GestureType } from "./classifier";
export type { GazeState } from "./gaze";

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
  gaze: GazeState | null;
}

let handLandmarker: HandLandmarker | null = null;
let faceReady = false;
let frameCount = 0;

export async function initDetector(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
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

  try {
    await initFaceDetector(vision);
    faceReady = true;
  } catch {
    faceReady = false;
  }
}

export function detect(video: HTMLVideoElement, timestamp: number): DetectionResult {
  let hand: GestureState | null = null;
  let gaze: GazeState | null = null;

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

  if (faceReady && frameCount % 2 === 0) {
    gaze = detectGaze(video, timestamp);
  }
  frameCount++;

  return { hand, gaze };
}

export function isFaceReady(): boolean {
  return faceReady;
}
