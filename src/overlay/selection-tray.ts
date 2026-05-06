import { icon } from "./icons";
import { buildTaskMarkdown, downloadTask, copyTaskToClipboard, buildSelector, type CuratedElement } from "../cli/claude-task-export";

export class SelectionTray {
  private panel: HTMLElement;
  private listEl: HTMLElement;
  private items: CuratedElement[] = [];
  private intentText = "";
  private onChangeCb?: (count: number) => void;

  constructor(container: HTMLElement) {
    this.panel = document.createElement("div");
    this.panel.id = "gesture-selection-tray";
    this.panel.style.cssText = `
      position: fixed; top: 80px; left: 16px; width: 320px; max-height: calc(100vh - 100px);
      background: rgba(11,11,16,0.94); backdrop-filter: blur(20px) saturate(140%);
      -webkit-backdrop-filter: blur(20px) saturate(140%);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
      color: #f1f5f9; font-family: 'Inter', system-ui, sans-serif; font-size: 12px;
      z-index: 100002; pointer-events: auto;
      box-shadow: 0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
      display: flex; flex-direction: column;
      transition: transform .25s ease, opacity .25s ease;
      transform: translateX(0); opacity: 1;
    `;

    this.panel.innerHTML = `
      <style>
        #gesture-selection-tray .gst-btn {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          color: #cbd5e1; padding: 6px 10px; border-radius: 6px;
          font-size: 11px; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: all .12s;
          display: inline-flex; align-items: center; gap: 5px;
        }
        #gesture-selection-tray .gst-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }
        #gesture-selection-tray .gst-btn-primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none; color: white;
          box-shadow: 0 2px 8px rgba(99,102,241,0.3);
        }
        #gesture-selection-tray .gst-btn-primary:hover { filter: brightness(1.15); }
      </style>
      <div style="padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); display:flex; align-items:center; gap:8px;">
        <span style="display:inline-flex; color:#a78bfa;">${icon("layers", 14, { stroke: "#a78bfa" })}</span>
        <span style="font-weight:700; font-size:13px; flex:1;">Selection</span>
        <span id="gst-count" style="
          font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
          background: rgba(167,139,250,0.18); color: #c4b5fd; border: 1px solid rgba(167,139,250,0.3);
        ">0</span>
      </div>

      <div id="gst-list" style="overflow-y:auto; flex:1; padding:8px 10px;"></div>

      <div style="padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.06);">
        <textarea id="gst-intent" placeholder="What do you want Claude to do with these?" rows="2" style="
          width:100%; padding:8px 10px; border-radius:8px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          color: #f1f5f9; font-size: 12px; font-family: inherit; resize:none;
          line-height:1.4;
        "></textarea>
      </div>

      <div style="padding: 8px 12px 12px; display:flex; gap:6px; flex-wrap:wrap;">
        <button id="gst-send" class="gst-btn gst-btn-primary" style="flex:1;">${icon("download", 11, { stroke: "currentColor" })} Send to Claude Code</button>
        <button id="gst-copy" class="gst-btn">${icon("copy", 11, { stroke: "currentColor" })} Copy</button>
        <button id="gst-clear" class="gst-btn" style="color:#fca5a5;border-color:rgba(239,68,68,0.25);">Clear</button>
      </div>
    `;

    container.appendChild(this.panel);
    this.listEl = this.panel.querySelector("#gst-list")!;
    this.bind();
    this.refresh();
  }

  setOnChange(cb: (count: number) => void): void {
    this.onChangeCb = cb;
  }

  private bind(): void {
    const $ = (sel: string) => this.panel.querySelector(sel);
    ($("#gst-clear") as HTMLElement).addEventListener("click", () => this.clear());
    ($("#gst-send") as HTMLElement).addEventListener("click", () => this.exportToClaude(true));
    ($("#gst-copy") as HTMLElement).addEventListener("click", () => this.exportToClaude(false));
    ($("#gst-intent") as HTMLTextAreaElement).addEventListener("input", (e) => {
      this.intentText = (e.target as HTMLTextAreaElement).value;
    });
  }

  add(el: HTMLElement, info: any, note?: string): CuratedElement {
    if (this.items.some((i) => i.info.element === el)) {
      return this.items.find((i) => i.info.element === el)!;
    }
    const item: CuratedElement = {
      id: crypto.randomUUID(),
      selector: buildSelector(el),
      info,
      note,
      capturedAt: Date.now(),
    };
    this.items.push(item);
    this.refresh();
    this.onChangeCb?.(this.items.length);
    el.dataset.gestureSelectionIdx = String(this.items.length);
    return item;
  }

  remove(id: string): void {
    const found = this.items.find((i) => i.id === id);
    if (found?.info?.element) {
      delete (found.info.element as HTMLElement).dataset.gestureSelectionIdx;
    }
    this.items = this.items.filter((i) => i.id !== id);
    this.items.forEach((it, i) => {
      if (it.info?.element) (it.info.element as HTMLElement).dataset.gestureSelectionIdx = String(i + 1);
    });
    this.refresh();
    this.onChangeCb?.(this.items.length);
  }

  clear(): void {
    for (const it of this.items) {
      if (it.info?.element) delete (it.info.element as HTMLElement).dataset.gestureSelectionIdx;
    }
    this.items = [];
    this.refresh();
    this.onChangeCb?.(0);
  }

  count(): number {
    return this.items.length;
  }

  setIntent(text: string): void {
    this.intentText = text;
    const ta = this.panel.querySelector("#gst-intent") as HTMLTextAreaElement | null;
    if (ta) ta.value = text;
  }

  private refresh(): void {
    const count = this.items.length;
    (this.panel.querySelector("#gst-count") as HTMLElement).textContent = String(count);

    if (!count) {
      this.listEl.innerHTML = `<div style="text-align:center; color:#475569; padding:24px 12px; font-size:11px; line-height:1.6;">
        No selections yet.<br/>
        <span style="color:#64748b;">Pinch on elements in inspect mode to add them here.</span>
      </div>`;
      return;
    }

    this.listEl.innerHTML = this.items.map((it, i) => `
      <div data-id="${it.id}" style="
        margin-bottom: 6px; padding: 8px 10px; border-radius: 8px;
        background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.05);
        display:flex; gap:8px; align-items:flex-start;
      ">
        <span style="
          flex-shrink:0; width:20px; height:20px; border-radius:6px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6); color:white;
          font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center;
        ">${i + 1}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-family:ui-monospace,monospace; font-size:10.5px; color:#a5b4fc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${this.esc(it.selector)}</div>
          <div style="font-size:10px; color:#64748b; margin-top:2px;">
            &lt;${it.info.tag}&gt; · ${Math.round(it.info.rect.width)}×${Math.round(it.info.rect.height)}
          </div>
        </div>
        <button data-remove="${it.id}" style="
          background:none; border:none; color:#64748b; cursor:pointer;
          padding:0 4px; font-size:14px; line-height:1;
        ">×</button>
      </div>
    `).join("");

    this.listEl.querySelectorAll<HTMLElement>("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.remove(btn.dataset.remove!);
      });
    });

    this.listEl.querySelectorAll<HTMLElement>("[data-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.dataset.id!;
        const item = this.items.find((i) => i.id === id);
        if (item?.info?.element) {
          (item.info.element as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    });
  }

  private exportToClaude(download: boolean): void {
    if (!this.items.length) return;
    const md = buildTaskMarkdown({
      intent: this.intentText,
      pageUrl: location.href,
      pageTitle: document.title,
      elements: this.items,
    });
    if (download) {
      downloadTask(md);
    }
    void copyTaskToClipboard(md);
    this.flashSent();
  }

  private flashSent(): void {
    const btn = this.panel.querySelector("#gst-send") as HTMLElement;
    const orig = btn.innerHTML;
    btn.innerHTML = `${icon("check", 11, { stroke: "currentColor" })} Copied + downloaded`;
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  }

  private esc(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
