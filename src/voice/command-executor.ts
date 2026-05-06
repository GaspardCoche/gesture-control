import type { CommandAction } from "./command-grammar";

interface UndoEntry {
  element: HTMLElement;
  property: string;
  previousValue: string;
  label: string;
  timestamp: number;
}

const undoStack: UndoEntry[] = [];
const MAX_UNDO = 50;

function parsePxOrFirst(cs: CSSStyleDeclaration, prop: string): number {
  const raw = (cs as any)[prop] || "0";
  const m = String(raw).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

export function executeCommand(element: HTMLElement, action: CommandAction): { ok: boolean; message: string } {
  if (!element || !(element instanceof HTMLElement)) {
    return { ok: false, message: "Invalid element" };
  }

  const cs = getComputedStyle(element);

  switch (action.kind) {
    case "style": {
      const prop = action.property as any;
      const prev = (element.style as any)[prop] || "";
      (element.style as any)[prop] = action.value;
      pushUndo({ element, property: prop, previousValue: prev, label: action.label, timestamp: Date.now() });
      return { ok: true, message: action.label };
    }
    case "scale": {
      const prop = action.property as any;
      const current = parsePxOrFirst(cs, prop);
      const next = current * action.factor;
      const prev = (element.style as any)[prop] || "";
      (element.style as any)[prop] = `${next}px`;
      pushUndo({ element, property: prop, previousValue: prev, label: action.label, timestamp: Date.now() });
      return { ok: true, message: `${action.label} (${current.toFixed(0)} → ${next.toFixed(0)}px)` };
    }
    case "offset": {
      const prop = action.property as any;
      const current = parsePxOrFirst(cs, prop);
      const next = Math.max(0, current + action.delta);
      const prev = (element.style as any)[prop] || "";
      (element.style as any)[prop] = `${next}${action.unit}`;
      pushUndo({ element, property: prop, previousValue: prev, label: action.label, timestamp: Date.now() });
      return { ok: true, message: `${action.label} (${current.toFixed(0)} → ${next.toFixed(0)}${action.unit})` };
    }
    case "class": {
      const had = element.classList.contains(action.className);
      let nowHas: boolean;
      if (action.op === "add") { element.classList.add(action.className); nowHas = true; }
      else if (action.op === "remove") { element.classList.remove(action.className); nowHas = false; }
      else { element.classList.toggle(action.className); nowHas = !had; }
      pushUndo({
        element,
        property: `__class:${action.className}`,
        previousValue: had ? "add" : "remove",
        label: action.label,
        timestamp: Date.now(),
      });
      return { ok: true, message: `${action.label} (${nowHas ? "added" : "removed"})` };
    }
    case "visibility": {
      const prev = element.style.display || "";
      element.style.display = action.hide ? "none" : "";
      pushUndo({ element, property: "display", previousValue: prev, label: action.label, timestamp: Date.now() });
      return { ok: true, message: action.label };
    }
  }
}

function pushUndo(entry: UndoEntry): void {
  undoStack.push(entry);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

export function undoLast(): { ok: boolean; message: string } {
  const entry = undoStack.pop();
  if (!entry) return { ok: false, message: "Nothing to undo" };

  if (entry.property.startsWith("__class:")) {
    const cls = entry.property.slice(8);
    if (entry.previousValue === "add") entry.element.classList.add(cls);
    else entry.element.classList.remove(cls);
  } else {
    (entry.element.style as any)[entry.property] = entry.previousValue;
  }
  return { ok: true, message: `Undid: ${entry.label}` };
}

export function undoStackSize(): number {
  return undoStack.length;
}

export function clearUndoStack(): void {
  undoStack.length = 0;
}
