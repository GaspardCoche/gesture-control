export type Mode = "inspect" | "draw" | "spotlight" | "console" | "measure";

const ALL_MODES: Mode[] = ["inspect", "draw", "spotlight", "console", "measure"];

export class ModeManager {
  current: Mode = "inspect";
  private listeners: Array<(mode: Mode) => void> = [];

  cycle() {
    const idx = ALL_MODES.indexOf(this.current);
    this.current = ALL_MODES[(idx + 1) % ALL_MODES.length];
    this.notify();
  }

  set(mode: Mode) {
    this.current = mode;
    this.notify();
  }

  onChange(fn: (mode: Mode) => void) {
    this.listeners.push(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn(this.current);
  }
}
