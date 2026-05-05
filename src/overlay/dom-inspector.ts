export interface ElementInfo {
  tag: string;
  id: string;
  classes: string[];
  rect: DOMRect;
  computedStyles: Record<string, string>;
  attributes: Record<string, string>;
  text: string;
  depth: number;
  children: number;
}

const IGNORE_IDS = new Set([
  "gesture-canvas", "gesture-hud", "gesture-inspector-panel",
  "gesture-console-panel", "gesture-video-feed", "gesture-overlay-root",
]);

export class DOMInspector {
  panel: HTMLElement;
  selectedElement: HTMLElement | null = null;
  hoveredElement: HTMLElement | null = null;
  debugBorders = false;
  debugSpacing = false;

  constructor(container: HTMLElement) {
    this.panel = document.createElement("div");
    this.panel.id = "gesture-inspector-panel";
    this.panel.style.cssText = `
      position: fixed; bottom: 16px; left: 16px; width: 340px; max-height: 420px;
      background: rgba(15, 15, 20, 0.95); backdrop-filter: blur(12px);
      border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 12px;
      color: #e2e8f0; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px;
      z-index: 100001; overflow-y: auto; padding: 0; display: none;
      pointer-events: none; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;
    container.appendChild(this.panel);
  }

  private _lastHitTest = 0;
  private _lastHitEl: HTMLElement | null = null;

  getElementAt(x: number, y: number): HTMLElement | null {
    const now = performance.now();
    if (now - this._lastHitTest < 50) return this._lastHitEl;
    this._lastHitTest = now;
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      if (el instanceof HTMLElement && !this.isOverlay(el)) {
        this._lastHitEl = el;
        return el;
      }
    }
    this._lastHitEl = null;
    return null;
  }

  hover(el: HTMLElement | null): DOMRect | null {
    this.hoveredElement = el;
    if (!el) return null;
    return el.getBoundingClientRect();
  }

  select(el: HTMLElement | null) {
    this.selectedElement = el;
    if (!el) {
      this.panel.style.display = "none";
      return;
    }
    const info = this.getInfo(el);
    this.renderPanel(info);
    this.panel.style.display = "block";
  }

  toggleDebugBorders() {
    this.debugBorders = !this.debugBorders;
    document.body.classList.toggle("gesture-debug-borders", this.debugBorders);
  }

  toggleDebugSpacing() {
    this.debugSpacing = !this.debugSpacing;
    document.body.classList.toggle("gesture-debug-spacing", this.debugSpacing);
  }

  hideSelected() {
    if (this.selectedElement) {
      this.selectedElement.style.display =
        this.selectedElement.style.display === "none" ? "" : "none";
    }
  }

  getTagLabel(el: HTMLElement): string {
    let label = el.tagName.toLowerCase();
    if (el.id) label += `#${el.id}`;
    if (el.classList.length) label += `.${[...el.classList].join(".")}`;
    return label.length > 50 ? label.slice(0, 47) + "..." : label;
  }

  getInfo(el: HTMLElement): ElementInfo {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    const styleKeys = [
      "display", "position", "width", "height",
      "margin", "padding", "border",
      "color", "background-color", "font-size", "font-weight", "font-family",
      "flex-direction", "justify-content", "align-items", "gap",
      "grid-template-columns", "grid-template-rows",
      "opacity", "z-index", "overflow", "border-radius",
    ];

    const computedStyles: Record<string, string> = {};
    for (const key of styleKeys) {
      const val = cs.getPropertyValue(key);
      if (val && val !== "none" && val !== "normal" && val !== "auto" && val !== "0px" && val !== "rgba(0, 0, 0, 0)") {
        computedStyles[key] = val;
      }
    }

    const attributes: Record<string, string> = {};
    for (const attr of el.attributes) {
      if (attr.name !== "style" && attr.name !== "class" && attr.name !== "id") {
        attributes[attr.name] = attr.value.length > 60 ? attr.value.slice(0, 57) + "..." : attr.value;
      }
    }

    let depth = 0;
    let parent = el.parentElement;
    while (parent) { depth++; parent = parent.parentElement; }

    return {
      tag: el.tagName.toLowerCase(),
      id: el.id,
      classes: [...el.classList],
      rect,
      computedStyles,
      attributes,
      text: (el.textContent || "").trim().slice(0, 80),
      depth,
      children: el.children.length,
    };
  }

  private renderPanel(info: ElementInfo) {
    const { tag, id, classes, rect, computedStyles, attributes, text, depth, children } = info;

    let html = `<div style="padding:12px 14px;border-bottom:1px solid #27272a;">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
    html += `<span style="color:#a78bfa;font-weight:700;font-size:13px;">&lt;${tag}&gt;</span>`;
    html += `<span style="color:#475569;font-size:10px;">depth ${depth} | ${children} children</span>`;
    html += `</div>`;
    if (id) html += `<div style="color:#6366f1;margin-top:4px;">#${escapeHtml(id)}</div>`;
    if (classes.length) html += `<div style="color:#22d3ee;margin-top:2px;">.${classes.map(escapeHtml).join(" .")}</div>`;
    html += `</div>`;

    html += `<div style="padding:10px 14px;border-bottom:1px solid #27272a;">`;
    html += `<div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Box Model</div>`;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">`;
    html += `<span>x: ${Math.round(rect.x)}</span><span>y: ${Math.round(rect.y)}</span>`;
    html += `<span>w: ${Math.round(rect.width)}</span><span>h: ${Math.round(rect.height)}</span>`;
    html += `</div></div>`;

    const styleEntries = Object.entries(computedStyles);
    if (styleEntries.length) {
      html += `<div style="padding:10px 14px;border-bottom:1px solid #27272a;">`;
      html += `<div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Computed Styles</div>`;
      for (const [k, v] of styleEntries) {
        html += `<div style="display:flex;justify-content:space-between;padding:1px 0;">`;
        html += `<span style="color:#94a3b8;">${k}</span>`;
        const isColor = v.startsWith("rgb") || v.startsWith("#");
        if (isColor) {
          html += `<span style="display:flex;align-items:center;gap:4px;">`;
          html += `<span style="width:10px;height:10px;border-radius:2px;background:${escapeHtml(v)};border:1px solid #444;display:inline-block;"></span>`;
          html += `<span style="color:#e2e8f0;">${escapeHtml(v)}</span></span>`;
        } else {
          html += `<span style="color:#e2e8f0;">${escapeHtml(v)}</span>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }

    const attrEntries = Object.entries(attributes);
    if (attrEntries.length) {
      html += `<div style="padding:10px 14px;border-bottom:1px solid #27272a;">`;
      html += `<div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Attributes</div>`;
      for (const [k, v] of attrEntries) {
        html += `<div><span style="color:#f59e0b;">${k}</span>=<span style="color:#10b981;">"${escapeHtml(v)}"</span></div>`;
      }
      html += `</div>`;
    }

    if (text) {
      html += `<div style="padding:10px 14px;color:#64748b;font-size:11px;font-style:italic;">`;
      html += `"${escapeHtml(text)}"`;
      html += `</div>`;
    }

    this.panel.innerHTML = html;
  }

  private isOverlay(el: HTMLElement): boolean {
    let node: HTMLElement | null = el;
    while (node) {
      if (IGNORE_IDS.has(node.id)) return true;
      node = node.parentElement;
    }
    return false;
  }
}

export function getXPath(el: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    let idx = 1;
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.tagName === node.tagName) idx++;
      sib = sib.previousElementSibling;
    }
    parts.unshift(`${node.tagName.toLowerCase()}[${idx}]`);
    node = node.parentElement;
  }
  return "/html/body/" + parts.join("/");
}

export function getCssSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== document.body && parts.length < 4) {
    let sel = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    if (node.classList.length) {
      sel += "." + [...node.classList].slice(0, 2).join(".");
    }
    parts.unshift(sel);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
