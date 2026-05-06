import { FilesetResolver, GestureRecognizer as MPGestureRecognizer } from "@mediapipe/tasks-vision";

export type MPCategory =
  | "None"
  | "Closed_Fist"
  | "Open_Palm"
  | "Pointing_Up"
  | "Thumb_Down"
  | "Thumb_Up"
  | "Victory"
  | "ILoveYou";

export interface MPGestureResult {
  category: MPCategory;
  score: number;
  handedness: string;
}

let recognizer: MPGestureRecognizer | null = null;
let initPromise: Promise<void> | null = null;
let lastTimestamp = -1;

export function isReady(): boolean {
  return recognizer !== null;
}

export async function init(): Promise<void> {
  if (recognizer) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      `${import.meta.env.BASE_URL}mediapipe-wasm`
    );
    recognizer = await MPGestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
  })();
  return initPromise;
}

export function recognize(video: HTMLVideoElement, timestamp: number): MPGestureResult | null {
  if (!recognizer) return null;
  const ts = Math.floor(timestamp);
  if (ts <= lastTimestamp) return null;
  lastTimestamp = ts;
  try {
    const result = recognizer.recognizeForVideo(video, ts);
    if (!result.gestures || result.gestures.length === 0 || result.gestures[0].length === 0) return null;
    const top = result.gestures[0][0];
    const handedness = result.handedness?.[0]?.[0]?.categoryName ?? "Right";
    return {
      category: top.categoryName as MPCategory,
      score: top.score,
      handedness,
    };
  } catch {
    return null;
  }
}
