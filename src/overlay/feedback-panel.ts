import type { FeedbackStore, FeedbackItem } from "../voice/feedback-store";
import { askClaudeStream, hasApiKey } from "../ai/anthropic-client";
import { icon } from "./icons";
import DOMPurify from "dompurify";

const DOMPURIFY_CONFIG: any = {
  ALLOWED_TAGS: ["pre", "code", "strong", "em", "br", "div", "span", "ul", "ol", "li", "p"],
  ALLOWED_ATTR: ["style"],
  ALLOWED_URI_REGEXP: /^(?:about:blank)$/,
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
};

export class FeedbackPanel {
  private panel: HTMLElement;
  private listEl: HTMLElement;
  private store: FeedbackStore;
  private visible = false;
  private onOpenSettings?: () => void;
  private aiResponses: Record<string, string> = {};
  private streamingId: string | null = null;
  private currentAbort: AbortController | null = null;

  constructor(container: HTMLElement, store: FeedbackStore) {
    this.store = store;
    this.panel = document.createElement("div");
    this.panel.id = "gesture-feedback-panel";
    this.panel.style.cssText = `
      position: fixed; top: 60px; left: 16px; width: 420px; max-height: 80vh;
      background: rgba(11,11,16,0.94); backdrop-filter: blur(20px) saturate(140%);
      -webkit-backdrop-filter: blur(20px) saturate(140%);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
      color: #f1f5f9; font-family: 'Inter', system-ui, sans-serif; font-size: 12px;
      z-index: 100003; overflow: hidden; display: none;
      pointer-events: auto;
      box-shadow: 0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
    `;

    this.panel.innerHTML = `
      <style>
        @keyframes gfp-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        #gesture-feedback-panel .gfp-btn {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          color: #cbd5e1; padding: 5px 10px; border-radius: 6px;
          font-size: 11px; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: all .15s;
          display: inline-flex; align-items: center; gap: 5px;
        }
        #gesture-feedback-panel .gfp-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }
        #gesture-feedback-panel .gfp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        #gesture-feedback-panel .gfp-btn-primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none; color: white;
          box-shadow: 0 2px 8px rgba(99,102,241,0.3);
        }
        #gesture-feedback-panel .gfp-btn-primary:not(:disabled):hover { filter: brightness(1.15); }
        #gesture-feedback-panel .gfp-btn-danger { color: #fca5a5; border-color: rgba(239,68,68,0.25); }
        #gesture-feedback-panel pre {
          background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 6px; padding: 10px 12px; margin: 6px 0;
          font-size: 11px; line-height: 1.5; overflow-x: auto;
          font-family: ui-monospace, 'SF Mono', monospace; color: #e2e8f0;
          white-space: pre-wrap;
        }
        #gesture-feedback-panel code { font-family: ui-monospace, 'SF Mono', monospace; }
      </style>
      <div style="padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="display:inline-flex; align-items:center; color:#a78bfa;">${icon("mic", 14, { stroke: "#a78bfa" })}</span>
          <span style="font-weight:700; font-size:13px; letter-spacing:-0.005em;">Voice Feedback</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button id="gfp-settings" class="gfp-btn" title="AI settings (S)">${icon("sparkle", 12, { stroke: "currentColor" })} <span id="gfp-settings-label">AI</span></button>
          <button id="gfp-download" class="gfp-btn" title="Export JSON">${icon("download", 12, { stroke: "currentColor" })}</button>
          <button id="gfp-clear" class="gfp-btn gfp-btn-danger" title="Clear all">Clear</button>
        </div>
      </div>
      <div id="gfp-list" style="overflow-y:auto; max-height: calc(80vh - 56px); padding:10px;"></div>
    `;

    container.appendChild(this.panel);
    this.listEl = this.panel.querySelector("#gfp-list")!;

    this.panel.querySelector("#gfp-download")!.addEventListener("click", () => {
      this.store.downloadJSON();
    });
    this.panel.querySelector("#gfp-clear")!.addEventListener("click", () => {
      this.store.clear();
      this.aiResponses = {};
      this.refresh();
    });
    this.panel.querySelector("#gfp-settings")!.addEventListener("click", () => {
      this.onOpenSettings?.();
    });

    this.refreshKeyBadge();
  }

  setOnOpenSettings(cb: () => void): void {
    this.onOpenSettings = cb;
  }

  refreshKeyBadge(): void {
    const label = this.panel.querySelector("#gfp-settings-label") as HTMLElement | null;
    if (!label) return;
    label.textContent = hasApiKey() ? "AI ✓" : "AI";
    label.style.color = hasApiKey() ? "#10b981" : "";
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.visible = true;
    this.panel.style.display = "block";
    this.refresh();
  }

  hide(): void {
    this.visible = false;
    this.panel.style.display = "none";
  }

  refresh(): void {
    this.refreshKeyBadge();
    const items = this.store.getAll();
    if (!items.length) {
      this.listEl.innerHTML = `<div style="text-align:center; color:#475569; padding:32px 16px; font-size:12px; line-height:1.6;">
        No feedback yet.<br/>Select an element and press <kbd style="background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;font-family:ui-monospace,monospace;font-size:11px;">V</kbd> to record.</div>`;
      return;
    }

    this.listEl.innerHTML = items
      .slice()
      .reverse()
      .map((item) => this.renderItem(item))
      .join("");

    this.listEl.querySelectorAll<HTMLElement>("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.copy!;
        const item = items.find((i) => i.id === id);
        if (item) {
          navigator.clipboard.writeText(item.aiPrompt);
          btn.textContent = "Copied ✓";
          setTimeout(() => this.refresh(), 800);
        }
      });
    });

    this.listEl.querySelectorAll<HTMLElement>("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.remove!;
        delete this.aiResponses[id];
        this.store.remove(id);
        this.refresh();
      });
    });

    this.listEl.querySelectorAll<HTMLElement>("[data-ask]").forEach((btn) => {
      btn.addEventListener("click", () => this.askClaude(btn.dataset.ask!));
    });

    this.listEl.querySelectorAll<HTMLElement>("[data-stop]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.currentAbort?.abort();
      });
    });

    this.listEl.querySelectorAll<HTMLElement>("[data-copy-ai]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.copyAi!;
        const text = this.aiResponses[id];
        if (text) {
          navigator.clipboard.writeText(text);
          btn.textContent = "Copied ✓";
          setTimeout(() => this.refresh(), 800);
        }
      });
    });
  }

  private async askClaude(id: string): Promise<void> {
    if (!hasApiKey()) {
      this.onOpenSettings?.();
      return;
    }
    const item = this.store.getAll().find((i) => i.id === id);
    if (!item) return;

    this.aiResponses[id] = "";
    this.streamingId = id;
    this.currentAbort = new AbortController();
    this.refresh();

    const target = () => this.panel.querySelector(`[data-ai-out="${id}"]`) as HTMLElement | null;

    await askClaudeStream(item.aiPrompt, {
      onDelta: (chunk) => {
        this.aiResponses[id] += chunk;
        const el = target();
        if (el) el.innerHTML = this.renderMarkdown(this.aiResponses[id]) + `<span style="color:#a78bfa; animation: gfp-blink 1s infinite;">▍</span>`;
      },
      onDone: () => {
        this.streamingId = null;
        this.currentAbort = null;
        this.refresh();
      },
      onError: (msg) => {
        this.aiResponses[id] = `**Error:** ${msg}`;
        this.streamingId = null;
        this.currentAbort = null;
        this.refresh();
      },
    }, this.currentAbort.signal);
  }

  private renderItem(item: FeedbackItem): string {
    const time = new Date(item.timestamp).toLocaleTimeString();
    const tag = `&lt;${item.element.tag}&gt;`;
    const id = item.element.id ? `#${this.esc(item.element.id)}` : "";
    const transcript = this.esc(item.transcript);
    const aiText = this.aiResponses[item.id];
    const isStreaming = this.streamingId === item.id;
    const hasAI = aiText !== undefined;

    const aiBlock = hasAI
      ? `
        <div style="margin-top:10px; padding:12px; background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.18); border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:#a78bfa;">
              ${icon("sparkle", 11, { stroke: "#a78bfa" })} Claude's suggestion
            </span>
            <div style="display:flex; gap:6px;">
              ${isStreaming ? `<button data-stop class="gfp-btn gfp-btn-danger" style="padding:2px 8px;font-size:10px;">Stop</button>` : `<button data-copy-ai="${item.id}" class="gfp-btn" style="padding:2px 8px;font-size:10px;">Copy</button>`}
            </div>
          </div>
          <div data-ai-out="${item.id}" style="font-size:12px; line-height:1.55; color:#e2e8f0;">${this.renderMarkdown(aiText)}${isStreaming ? `<span style="color:#a78bfa; animation: gfp-blink 1s infinite;">▍</span>` : ""}</div>
        </div>
      `
      : "";

    return `
      <div style="padding:12px; margin-bottom:8px; background:rgba(255,255,255,0.025); border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="color:#818cf8; font-weight:600; font-family:ui-monospace,monospace; font-size:11px;">${tag}${id}</span>
          <span style="color:#475569; font-size:10px; font-family:ui-monospace,monospace;">${time}</span>
        </div>
        <div style="color:#cbd5e1; font-style:italic; font-size:12px; margin-bottom:10px; line-height:1.5;">"${transcript}"</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button data-ask="${item.id}" class="gfp-btn gfp-btn-primary" ${isStreaming ? "disabled" : ""}>
            ${icon("sparkle", 11, { stroke: "currentColor" })} ${hasAI && !isStreaming ? "Ask again" : "Ask Claude"}
          </button>
          <button data-copy="${item.id}" class="gfp-btn">${icon("copy", 11, { stroke: "currentColor" })} Copy prompt</button>
          <button data-remove="${item.id}" class="gfp-btn">Remove</button>
        </div>
        ${aiBlock}
      </div>
    `;
  }

  private renderMarkdown(text: string): string {
    if (!text) return `<em style="color:#64748b;">…</em>`;
    let html = this.esc(text);
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre>${code.replace(/\n$/, "")}</pre>`);
    html = html.replace(/`([^`\n]+)`/g, `<code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-size:11px;">$1</code>`);
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/^- (.+)$/gm, `<div style="padding-left:12px;">• $1</div>`);
    html = html.replace(/\n\n/g, "<br/><br/>");
    html = html.replace(/\n/g, "<br/>");
    return DOMPurify.sanitize(html, DOMPURIFY_CONFIG) as unknown as string;
  }

  private esc(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
