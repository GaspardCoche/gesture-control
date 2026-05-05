import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

export type GestureType = "PINCH" | "POINT" | "FIST" | "OPEN" | "SPREAD" | "PEACE" | "NONE";

export interface GestureState {
  type: GestureType;
  confidence: number;
  landmarks: NormalizedLandmark[];
  indexTip: { x: number; y: number; z: number };
  thumbTip: { x: number; y: number; z: number };
  pinchDistance: number;
}

let handLandmarker: HandLandmarker | null = null;

export async function initDetector(): Promise<HandLandmarker> {
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
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return handLandmarker;
}

export function detect(video: HTMLVideoElement, timestamp: number): GestureState | null {
  if (!handLandmarker) return null;

  const results = handLandmarker.detectForVideo(video, timestamp);
  if (!results.landmarks.length) return null;

  const lm = results.landmarks[0];
  const indexTip = lm[8];
  const thumbTip = lm[4];

  const pinchDistance = Math.hypot(
    indexTip.x - thumbTip.x,
    indexTip.y - thumbTip.y,
    indexTip.z - thumbTip.z
  );

  const type = classifyGesture(lm, pinchDistance);

  return {
    type,
    confidence: results.handedness[0]?.[0]?.score ?? 0,
    landmarks: lm,
    indexTip: { x: indexTip.x, y: indexTip.y, z: indexTip.z },
    thumbTip: { x: thumbTip.x, y: thumbTip.y, z: thumbTip.z },
    pinchDistance,
  };
}

function classifyGesture(lm: NormalizedLandmark[], pinchDist: number): GestureType {
  if (pinchDist < 0.04) return "PINCH";

  const fingerTips = [lm[8], lm[12], lm[16], lm[20]];
  const fingerMcps = [lm[5], lm[9], lm[13], lm[17]];

  const extended = fingerTips.filter((tip, i) => tip.y < fingerMcps[i].y);

  if (extended.length === 0) return "FIST";
  if (extended.length === 1 && fingerTips[0].y < fingerMcps[0].y) return "POINT";
  if (extended.length === 2 && fingerTips[0].y < fingerMcps[0].y && fingerTips[1].y < fingerMcps[1].y) return "PEACE";
  if (extended.length === 4) {
    const spread = Math.abs(lm[8].x - lm[20].x);
    return spread > 0.15 ? "SPREAD" : "OPEN";
  }

  return "NONE";
}
