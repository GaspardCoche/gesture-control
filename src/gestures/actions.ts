import type { GestureState, GestureType } from "./detector";

export interface ActionMapping {
  gesture: GestureType;
  action: string;
  handler: (state: GestureState) => void;
}

export function createActionMap(callbacks: {
  onGrab: (x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  onRelease: () => void;
  onZoom: (delta: number) => void;
  onRotate: (angle: number) => void;
}): Map<GestureType, (state: GestureState) => void> {
  const map = new Map<GestureType, (state: GestureState) => void>();

  map.set("PINCH", (state) => {
    callbacks.onGrab(state.indexTip.x, state.indexTip.y);
  });

  map.set("POINT", (state) => {
    callbacks.onMove(state.indexTip.x, state.indexTip.y);
  });

  map.set("OPEN", () => {
    callbacks.onRelease();
  });

  map.set("SPREAD", (state) => {
    callbacks.onZoom(state.pinchDistance);
  });

  map.set("FIST", (state) => {
    const wrist = state.landmarks[0];
    const angle = Math.atan2(state.landmarks[9].x - wrist.x, state.landmarks[9].y - wrist.y);
    callbacks.onRotate(angle);
  });

  return map;
}
