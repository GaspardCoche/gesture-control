import type { CuratedElement } from "../cli/claude-task-export";
import { buildSelector, buildTaskMarkdown, downloadTask, copyTaskToClipboard } from "../cli/claude-task-export";
import { askClaudeStream, hasApiKey } from "../ai/anthropic-client";
import type { ElementInfo } from "./dom-inspector";
import { icon } from "./icons";
import DOMPurify from "dompurify";

const DOMPURIFY_CFG: any = {
  ALLOWED_TAGS: ["pre", "code", "strong", "em", "br", "div", "span", "ul", "ol", "li", "p", "h3", "h4"],
  ALLOWED_ATTR: ["style"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
};

const TEMPLATES: Array<{ id: string; label: string; icon: string; intent: string; color: string }> = [
  { id: "a11y", label: "Accessible", icon: "accessibility", intent: "Make these elements accessible (WCAG AAA): improve contrast, add ARIA labels where missing, ensure keyboard navigation, increase touch target sizes ≥44px.", color: "#22d3ee" },
  { id: "modern", label: "Modernize", icon: "sparkle", intent: "Modernize the design of these elements: refined typography, generous whitespace, soft shadows, smooth transitions. Keep the existing structure.", color: "#a78bfa" },
  { id: "mobile", label: "Mobile-first", icon: "monitor", intent: "Make these elements mobile-friendly: stacking layout under 640px, larger tap targets, simpler hierarchy, no horizontal scroll.", color: "#f59e0b" },
  { id: "cleanup", label: "Cleanup", icon: "zap", intent: "Clean up these elements: remove redundant nesting, simplify class names, ensure semantic HTML.", color: "#10b981" },
];

export interface ActionPanelHooks {
  onApplyCss: (css: string, scopedSelectors: string[]) => { applied: number; failed: number };
  onUndo: () => boolean;
}

export class ActionPanel {
  private root: HTMLElement;
  private items: CuratedElement[] = [];
  private intentText = "";
  private aiStreamText = "";
  private streaming = false;
  private currentAbort: AbortController | null = null;
  private hooks!: ActionPanelHooks;
  private onChangeCb?: (count: number) => void;

  constructor(container: HTMLElement) {
    this.root = document.createElement("aside");
    this.root.id = "gesture-action-panel";
    this.root.style.cssText = `
      grid-area: panel;
      background: var(--bg-elev, #0d0d14);
      border-left: 1px solid var(--border, #1e1e2a);
      display: flex; flex-direction: column;
      max-height: 100%; overflow: hidden;
      font-family: 'Inter', system-ui, sans-serif;
    `;
    this.root.innerHTML = `
      <style>
        #gesture-action-panel { font-size: 12px; color: #f1f5f9; }
        #gesture-action-panel .ap-section { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        #gesture-action-panel .ap-title { display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
        #gesture-action-panel .ap-counter { background: rgba(167,139,250,0.18); color: #c4b5fd; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; border: 1px solid rgba(167,139,250,0.3); }
        #gesture-action-panel .ap-list { max-height: 180px; overflow-y: auto; }
        #gesture-action-panel .ap-row { padding: 6px 8px; border-radius: 6px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.05); margin-bottom: 4px; display: flex; align-items: flex-start; gap: 8px; }
        #gesture-action-panel .ap-idx { flex-shrink: 0; width: 18px; height: 18px; border-radius: 5px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        #gesture-action-panel .ap-row-body { flex: 1; min-width: 0; }
        #gesture-action-panel .ap-sel { font-family: ui-monospace, monospace; font-size: 10.5px; color: #a5b4fc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #gesture-action-panel .ap-meta { font-size: 9.5px; color: #64748b; margin-top: 2px; }
        #gesture-action-panel .ap-x { background: none; border: none; color: #64748b; cursor: pointer; padding: 0 4px; font-size: 14px; line-height: 1; }
        #gesture-action-panel textarea { width: 100%; padding: 8px 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 7px; color: #f1f5f9; font-size: 12px; font-family: inherit; resize: none; line-height: 1.45; }
        #gesture-action-panel textarea:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
        #gesture-action-panel .ap-tpl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 8px; }
        #gesture-action-panel .ap-tpl { padding: 6px 8px; border-radius: 6px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #cbd5e1; font-size: 10.5px; font-weight: 600; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 5px; transition: all .12s; }
        #gesture-action-panel .ap-tpl:hover { border-color: rgba(99,102,241,0.4); background: rgba(99,102,241,0.08); color: #fff; }
        #gesture-action-panel .ap-actions { display: flex; gap: 5px; flex-wrap: wrap; }
        #gesture-action-panel button.ap-btn { padding: 8px 12px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); color: #cbd5e1; font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 5px; transition: all .12s; }
        #gesture-action-panel button.ap-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #fff; }
        #gesture-action-panel button.ap-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        #gesture-action-panel button.ap-btn-primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; color: white; box-shadow: 0 2px 10px rgba(99,102,241,0.3); }
        #gesture-action-panel button.ap-btn-primary:hover:not(:disabled) { filter: brightness(1.15); }
        #gesture-action-panel button.ap-btn-success { background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.35); color: #6ee7b7; }
        #gesture-action-panel button.ap-btn-danger { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.3); color: #fca5a5; }
        #gesture-action-panel .ap-ai { padding: 12px 14px; max-height: 320px; overflow-y: auto; flex: 1; }
        #gesture-action-panel .ap-ai-empty { text-align: center; color: #475569; padding: 20px; font-size: 11px; line-height: 1.6; }
        #gesture-action-panel .ap-ai-content { font-size: 12px; line-height: 1.55; color: #e2e8f0; }
        #gesture-action-panel .ap-ai-content pre { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px 12px; margin: 6px 0; font-size: 11px; line-height: 1.5; overflow-x: auto; font-family: ui-monospace, monospace; color: #e2e8f0; white-space: pre-wrap; }
        #gesture-action-panel .ap-ai-content code { font-family: ui-monospace, monospace; background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 3px; font-size: 11px; }
        #gesture-action-panel .ap-empty-state { padding: 24px 16px; text-align: center; color: #475569; font-size: 11px; line-height: 1.6; }
        #gesture-action-panel .ap-key-status { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; padding: 1px 7px; border-radius: 999px; font-weight: 700; }
        #gesture-action-panel .ap-key-status.has { background: rgba(16,185,129,0.15); color: #6ee7b7; }
        #gesture-action-panel .ap-key-status.no { background: rgba(245,158,11,0.15); color: #fcd34d; cursor: pointer; }
      </style>

      <div class="ap-section">
        <div class="ap-title">
          <span style="display:inline-flex;align-items:center;gap:5px;">${icon("layers", 11, { stroke: "#94a3b8" })} Selection</span>
          <span class="ap-counter" id="ap-count">0</span>
        </div>
        <div class="ap-list" id="ap-list">
          <div class="ap-empty-state">Pinch elements in the page to add them here.</div>
        </div>
      </div>

      <div class="ap-section">
        <div class="ap-title">
          <span>Intent</span>
        </div>
        <textarea id="ap-intent" rows="2" placeholder="What do you want to change? (or pick a template)"></textarea>
        <div class="ap-tpl-grid">
          ${TEMPLATES.map((t) => `<button class="ap-tpl" data-tpl="${t.id}" style="--c:${t.color};">${icon(t.icon, 12, { stroke: t.color })} <span>${t.label}</span></button>`).join("")}
        </div>
      </div>

      <div class="ap-section">
        <div class="ap-title">
          <span>Action</span>
          <span id="ap-key-state"></span>
        </div>
        <div class="ap-actions">
          <button class="ap-btn ap-btn-primary" id="ap-ask">${icon("sparkle", 11, { stroke: "currentColor" })} Ask Claude</button>
          <button class="ap-btn" id="ap-export">${icon("download", 11, { stroke: "currentColor" })} .md</button>
          <button class="ap-btn" id="ap-copy">${icon("copy", 11, { stroke: "currentColor" })} Copy</button>
          <button class="ap-btn ap-btn-danger" id="ap-clear">Clear</button>
        </div>
      </div>

      <div class="ap-section" id="ap-ai-block" style="display:none;flex:1;overflow:hidden;display:flex;flex-direction:column;">
        <div class="ap-title">
          <span style="display:inline-flex;align-items:center;gap:5px;">${icon("sparkle", 11, { stroke: "#a78bfa" })} Claude</span>
          <div style="display:flex;gap:5px;">
            <button class="ap-btn ap-btn-success" id="ap-apply" style="display:none;font-size:10px;padding:5px 9px;">Apply CSS</button>
            <button class="ap-btn" id="ap-refine" style="display:none;font-size:10px;padding:5px 9px;">Refine</button>
            <button class="ap-btn ap-btn-danger" id="ap-stop" style="display:none;font-size:10px;padding:5px 9px;">Stop</button>
          </div>
        </div>
        <div class="ap-ai" id="ap-ai">
          <div class="ap-ai-empty">Ask Claude to see suggestions here.</div>
        </div>
      </div>
    `;

    container.appendChild(this.root);
    this.bind();
    this.refreshKeyState();
  }

  setHooks(h: ActionPanelHooks): void {
    this.hooks = h;
  }

  setOnChange(cb: (count: number) => void): void {
    this.onChangeCb = cb;
  }

  count(): number {
    return this.items.length;
  }

  getItems(): CuratedElement[] {
    return this.items.slice();
  }

  add(el: HTMLElement, info: ElementInfo): void {
    if (this.items.some((i) => i.info.element === el)) return;
    const item: CuratedElement = {
      id: crypto.randomUUID(),
      selector: buildSelector(el),
      info,
      capturedAt: Date.now(),
    };
    this.items.push(item);
    el.dataset.gestureSelectionIdx = String(this.items.length);
    this.refreshList();
    this.onChangeCb?.(this.items.length);
  }

  remove(id: string): void {
    const found = this.items.find((i) => i.id === id);
    if (found?.info?.element) delete (found.info.element as HTMLElement).dataset.gestureSelectionIdx;
    this.items = this.items.filter((i) => i.id !== id);
    this.items.forEach((it, i) => {
      if (it.info?.element) (it.info.element as HTMLElement).dataset.gestureSelectionIdx = String(i + 1);
    });
    this.refreshList();
    this.onChangeCb?.(this.items.length);
  }

  clear(): void {
    for (const it of this.items) {
      if (it.info?.element) delete (it.info.element as HTMLElement).dataset.gestureSelectionIdx;
    }
    this.items = [];
    this.aiStreamText = "";
    this.streaming = false;
    this.currentAbort?.abort();
    this.currentAbort = null;
    (this.root.querySelector("#ap-intent") as HTMLTextAreaElement).value = "";
    this.intentText = "";
    this.refreshList();
    this.refreshAi();
    this.onChangeCb?.(0);
  }

  setIntent(text: string): void {
    this.intentText = text;
    (this.root.querySelector("#ap-intent") as HTMLTextAreaElement).value = text;
  }

  refreshKeyState(): void {
    const el = this.root.querySelector("#ap-key-state") as HTMLElement;
    if (!el) return;
    if (hasApiKey()) {
      el.className = "ap-key-status has";
      el.textContent = "✓ AI ready";
    } else {
      el.className = "ap-key-status no";
      el.textContent = "Add API key (S)";
    }
  }

  triggerAsk(): void {
    (this.root.querySelector("#ap-ask") as HTMLElement).click();
  }

  triggerExport(): void {
    (this.root.querySelector("#ap-export") as HTMLElement).click();
  }

  private bind(): void {
    const $ = (s: string) => this.root.querySelector(s) as HTMLElement;
    const intentTa = $("#ap-intent") as HTMLTextAreaElement;

    intentTa.addEventListener("input", () => { this.intentText = intentTa.value; });

    this.root.querySelectorAll<HTMLElement>(".ap-tpl").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tpl;
        const tpl = TEMPLATES.find((t) => t.id === id);
        if (tpl) {
          this.intentText = tpl.intent;
          intentTa.value = tpl.intent;
          intentTa.focus();
        }
      });
    });

    $("#ap-ask").addEventListener("click", () => this.askClaude());
    $("#ap-stop").addEventListener("click", () => this.currentAbort?.abort());
    $("#ap-refine").addEventListener("click", () => {
      intentTa.focus();
      intentTa.placeholder = "Describe what to refine...";
    });
    $("#ap-apply").addEventListener("click", () => this.applyExtractedCss());
    $("#ap-export").addEventListener("click", () => this.exportTask(true));
    $("#ap-copy").addEventListener("click", () => this.exportTask(false));
    $("#ap-clear").addEventListener("click", () => this.clear());
  }

  private refreshList(): void {
    const list = this.root.querySelector("#ap-list") as HTMLElement;
    const counter = this.root.querySelector("#ap-count") as HTMLElement;
    counter.textContent = String(this.items.length);

    if (!this.items.length) {
      list.innerHTML = `<div class="ap-empty-state">Pinch elements in the page to add them here.</div>`;
    } else {
      list.innerHTML = this.items.map((it, i) => `
        <div class="ap-row" data-id="${it.id}">
          <span class="ap-idx">${i + 1}</span>
          <div class="ap-row-body">
            <div class="ap-sel">${this.esc(it.selector)}</div>
            <div class="ap-meta">&lt;${it.info.tag}&gt; · ${Math.round(it.info.rect.width)}×${Math.round(it.info.rect.height)}</div>
          </div>
          <button class="ap-x" data-remove="${it.id}">×</button>
        </div>
      `).join("");
      list.querySelectorAll<HTMLElement>("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", (e) => { e.stopPropagation(); this.remove(btn.dataset.remove!); });
      });
      list.querySelectorAll<HTMLElement>("[data-id]").forEach((row) => {
        row.addEventListener("click", () => {
          const it = this.items.find((i) => i.id === row.dataset.id);
          if (it?.info?.element) (it.info.element as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });
    }
  }

  private async askClaude(): Promise<void> {
    if (!hasApiKey()) {
      window.dispatchEvent(new CustomEvent("gc-open-settings"));
      return;
    }
    if (this.items.length === 0) {
      window.dispatchEvent(new CustomEvent("gc-toast", { detail: { msg: "Pinch elements first", color: "#f59e0b" } }));
      return;
    }
    const md = buildTaskMarkdown({
      intent: this.intentText,
      pageUrl: location.href,
      pageTitle: document.title,
      elements: this.items,
    });

    this.streaming = true;
    this.aiStreamText = "";
    this.currentAbort = new AbortController();
    this.refreshAi();

    await askClaudeStream(md, {
      onDelta: (chunk) => {
        this.aiStreamText += chunk;
        this.refreshAi();
      },
      onDone: () => {
        this.streaming = false;
        this.currentAbort = null;
        this.refreshAi();
      },
      onError: (msg) => {
        this.aiStreamText = `**Error:** ${msg}`;
        this.streaming = false;
        this.currentAbort = null;
        this.refreshAi();
      },
    }, this.currentAbort.signal);
  }

  private refreshAi(): void {
    const block = this.root.querySelector("#ap-ai-block") as HTMLElement;
    const ai = this.root.querySelector("#ap-ai") as HTMLElement;
    const stop = this.root.querySelector("#ap-stop") as HTMLElement;
    const apply = this.root.querySelector("#ap-apply") as HTMLElement;
    const refine = this.root.querySelector("#ap-refine") as HTMLElement;

    const hasContent = this.aiStreamText.length > 0;
    block.style.display = hasContent || this.streaming ? "flex" : "none";
    stop.style.display = this.streaming ? "inline-flex" : "none";
    apply.style.display = !this.streaming && hasContent && this.extractCss().length > 0 ? "inline-flex" : "none";
    refine.style.display = !this.streaming && hasContent ? "inline-flex" : "none";

    if (!hasContent && !this.streaming) {
      ai.innerHTML = `<div class="ap-ai-empty">Ask Claude to see suggestions here.</div>`;
      return;
    }
    const cursor = this.streaming ? `<span style="color:#a78bfa;animation:gfp-blink 1s infinite;">▍</span>` : "";
    ai.innerHTML = `<div class="ap-ai-content">${this.renderMarkdown(this.aiStreamText)}${cursor}</div>`;
  }

  private extractCss(): string[] {
    const matches = Array.from(this.aiStreamText.matchAll(/```(?:css|CSS)?\n([\s\S]*?)```/g));
    return matches.map((m) => m[1].trim()).filter((c) => c.length > 0);
  }

  private applyExtractedCss(): void {
    const blocks = this.extractCss();
    if (blocks.length === 0) return;
    const selectors = this.items.map((i) => i.selector);
    const cssCombined = blocks.join("\n\n");
    if (!this.hooks?.onApplyCss) return;
    const result = this.hooks.onApplyCss(cssCombined, selectors);
    window.dispatchEvent(new CustomEvent("gc-toast", {
      detail: { msg: `Applied: ${result.applied} rules · ${result.failed} skipped`, color: result.applied > 0 ? "#10b981" : "#f59e0b" },
    }));
  }

  private exportTask(download: boolean): void {
    if (!this.items.length) {
      window.dispatchEvent(new CustomEvent("gc-toast", { detail: { msg: "Pinch elements first", color: "#f59e0b" } }));
      return;
    }
    const md = buildTaskMarkdown({
      intent: this.intentText,
      pageUrl: location.href,
      pageTitle: document.title,
      elements: this.items,
    });
    if (download) downloadTask(md);
    void copyTaskToClipboard(md);
    window.dispatchEvent(new CustomEvent("gc-toast", { detail: { msg: download ? "Downloaded + copied" : "Copied", color: "#10b981" } }));
  }

  private renderMarkdown(text: string): string {
    if (!text) return "";
    let html = this.esc(text);
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre>${code.replace(/\n$/, "")}</pre>`);
    html = html.replace(/`([^`\n]+)`/g, `<code>$1</code>`);
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/^- (.+)$/gm, `<div style="padding-left:12px;">• $1</div>`);
    html = html.replace(/\n\n/g, "<br/><br/>");
    html = html.replace(/\n/g, "<br/>");
    return DOMPurify.sanitize(html, DOMPURIFY_CFG) as unknown as string;
  }

  private esc(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
