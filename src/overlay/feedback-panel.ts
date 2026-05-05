import type { FeedbackStore, FeedbackItem } from "../voice/feedback-store";

export class FeedbackPanel {
  private panel: HTMLElement;
  private listEl: HTMLElement;
  private store: FeedbackStore;
  private visible = false;

  constructor(container: HTMLElement, store: FeedbackStore) {
    this.store = store;
    this.panel = document.createElement("div");
    this.panel.id = "gesture-feedback-panel";
    this.panel.style.cssText = `
      position: fixed; top: 60px; left: 16px; width: 380px; max-height: 70vh;
      background: rgba(15, 15, 20, 0.95); backdrop-filter: blur(12px);
      border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 12px;
      color: #e2e8f0; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px;
      z-index: 100003; overflow: hidden; display: none;
      pointer-events: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;

    this.panel.innerHTML = `
      <div style="padding:12px 16px;border-bottom:1px solid #27272a;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:700;font-size:13px;color:#a78bfa;">Voice Feedback</span>
        <div style="display:flex;gap:8px;">
          <button id="gfp-download" style="background:none;border:1px solid #374151;color:#94a3b8;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:10px;">Export</button>
          <button id="gfp-clear" style="background:none;border:1px solid #374151;color:#ef4444;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:10px;">Clear</button>
        </div>
      </div>
      <div id="gfp-list" style="overflow-y:auto;max-height:calc(70vh - 48px);padding:8px;"></div>
    `;

    container.appendChild(this.panel);
    this.listEl = this.panel.querySelector("#gfp-list")!;

    this.panel.querySelector("#gfp-download")!.addEventListener("click", () => {
      this.store.downloadJSON();
    });
    this.panel.querySelector("#gfp-clear")!.addEventListener("click", () => {
      this.store.clear();
      this.refresh();
    });
  }

  toggle() {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? "block" : "none";
    if (this.visible) this.refresh();
  }

  show() {
    this.visible = true;
    this.panel.style.display = "block";
    this.refresh();
  }

  hide() {
    this.visible = false;
    this.panel.style.display = "none";
  }

  refresh() {
    const items = this.store.getAll();
    if (!items.length) {
      this.listEl.innerHTML = `<div style="text-align:center;color:#475569;padding:24px;font-size:11px;">No feedback yet. Select an element and press <b>V</b> to record.</div>`;
      return;
    }

    this.listEl.innerHTML = items
      .map((item) => this.renderItem(item))
      .reverse()
      .join("");

    this.listEl.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.copy!;
        const item = items.find((i) => i.id === id);
        if (item) navigator.clipboard.writeText(item.aiPrompt);
      });
    });

    this.listEl.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.remove!;
        this.store.remove(id);
        this.refresh();
      });
    });
  }

  private renderItem(item: FeedbackItem): string {
    const time = new Date(item.timestamp).toLocaleTimeString();
    const tag = `&lt;${item.element.tag}&gt;`;
    const id = item.element.id ? `#${this.esc(item.element.id)}` : "";
    const transcript = this.esc(item.transcript.length > 80 ? item.transcript.slice(0, 77) + "..." : item.transcript);

    return `
      <div style="padding:10px;margin-bottom:6px;background:rgba(30,30,46,0.6);border-radius:8px;border:1px solid #27272a;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="color:#6366f1;font-weight:600;">${tag}${id}</span>
          <span style="color:#475569;font-size:10px;">${time}</span>
        </div>
        <div style="color:#94a3b8;font-style:italic;margin-bottom:8px;">"${transcript}"</div>
        <div style="display:flex;gap:6px;">
          <button data-copy="${item.id}" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a78bfa;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:10px;">Copy Prompt</button>
          <button data-remove="${item.id}" style="background:none;border:1px solid #374151;color:#64748b;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:10px;">Remove</button>
        </div>
      </div>
    `;
  }

  private esc(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
