import { getApiKey, setApiKey, clearApiKey, getModel, setModel, ANTHROPIC_MODELS, testApiKey } from "../ai/anthropic-client";
import { icon } from "./icons";

export class SettingsPanel {
  private panel: HTMLElement;
  private visible = false;
  private onChangeCb?: () => void;

  constructor(container: HTMLElement) {
    this.panel = document.createElement("div");
    this.panel.id = "gesture-settings-panel";
    this.panel.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 460px; max-width: calc(100vw - 32px);
      background: rgba(11, 11, 16, 0.96); backdrop-filter: blur(24px) saturate(140%);
      -webkit-backdrop-filter: blur(24px) saturate(140%);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
      color: #f1f5f9; font-family: 'Inter', system-ui, sans-serif;
      z-index: 100004; display: none; pointer-events: auto;
      box-shadow: 0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
    `;

    this.panel.innerHTML = `
      <style>
        #gesture-settings-panel input, #gesture-settings-panel select {
          font-family: inherit;
        }
        #gesture-settings-panel input:focus, #gesture-settings-panel select:focus {
          outline: none; border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }
        #gesture-settings-panel button:not(:disabled):hover {
          filter: brightness(1.15);
        }
      </style>
      <div style="padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="display:inline-flex; align-items:center; color:#a78bfa;">${icon("sparkle", 18, { stroke: "#a78bfa" })}</span>
          <h3 style="font-size:15px; font-weight:700; letter-spacing:-0.01em; margin:0;">AI settings</h3>
        </div>
        <button id="gset-close" style="background:none; border:none; color:#64748b; cursor:pointer; font-size:20px; line-height:1; padding:0 4px;">&times;</button>
      </div>

      <div style="padding: 22px 24px; display:flex; flex-direction:column; gap:18px;">

        <div>
          <label style="font-size:11px; font-weight:600; color:#cbd5e1; text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom:6px;">Anthropic API key</label>
          <div style="display:flex; gap:8px;">
            <input id="gset-key" type="password" placeholder="sk-ant-api03-..." autocomplete="off" style="
              flex: 1; padding: 10px 12px; border-radius: 8px;
              background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
              color: #f1f5f9; font-size: 13px; font-family: ui-monospace, monospace;
            "/>
            <button id="gset-toggle-vis" type="button" title="Show/hide" style="
              padding: 0 12px; border-radius: 8px; cursor:pointer;
              background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
              color: #94a3b8;
            ">${icon("eye", 14, { stroke: "#94a3b8" })}</button>
          </div>
          <div style="font-size:11px; color:#64748b; margin-top:6px; line-height:1.5;">
            Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style="color:#a78bfa; text-decoration:none;">console.anthropic.com/settings/keys</a>. Stored only in your browser's localStorage. Never sent anywhere except api.anthropic.com.
          </div>
        </div>

        <div>
          <label style="font-size:11px; font-weight:600; color:#cbd5e1; text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom:6px;">Model</label>
          <select id="gset-model" style="
            width:100%; padding: 10px 12px; border-radius: 8px;
            background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
            color: #f1f5f9; font-size: 13px;
          ">
            ${ANTHROPIC_MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("")}
          </select>
        </div>

        <div id="gset-status" style="font-size:12px; padding: 10px 12px; border-radius: 8px; display:none;"></div>

        <div style="display:flex; gap:8px; justify-content:space-between; align-items:center; margin-top:4px;">
          <button id="gset-clear" type="button" style="
            padding: 9px 14px; border-radius: 8px; cursor:pointer;
            background: transparent; border: 1px solid rgba(239,68,68,0.3);
            color: #fca5a5; font-size: 12px; font-weight:600;
          ">Clear key</button>
          <div style="display:flex; gap:8px;">
            <button id="gset-test" type="button" style="
              padding: 9px 14px; border-radius: 8px; cursor:pointer;
              background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
              color: #f1f5f9; font-size: 12px; font-weight:600;
            ">Test</button>
            <button id="gset-save" type="button" style="
              padding: 9px 18px; border-radius: 8px; cursor:pointer;
              background: linear-gradient(135deg, #6366f1, #8b5cf6);
              border: none; color: white; font-size: 12px; font-weight:600;
              box-shadow: 0 4px 12px rgba(99,102,241,0.35);
            ">Save</button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(this.panel);
    this.bind();
    this.load();
  }

  onChange(cb: () => void): void {
    this.onChangeCb = cb;
  }

  private bind(): void {
    const $ = (sel: string) => this.panel.querySelector(sel);
    const keyInput = $("#gset-key") as HTMLInputElement;
    const modelSel = $("#gset-model") as HTMLSelectElement;
    const status = $("#gset-status") as HTMLElement;

    ($("#gset-close") as HTMLElement).addEventListener("click", () => this.hide());

    ($("#gset-toggle-vis") as HTMLElement).addEventListener("click", () => {
      keyInput.type = keyInput.type === "password" ? "text" : "password";
    });

    ($("#gset-save") as HTMLElement).addEventListener("click", () => {
      const v = keyInput.value.trim();
      if (v) setApiKey(v);
      setModel(modelSel.value);
      this.flash(status, v ? "Saved" : "Model saved (key unchanged)", "#10b981");
      this.onChangeCb?.();
      this.load();
    });

    ($("#gset-clear") as HTMLElement).addEventListener("click", () => {
      clearApiKey();
      keyInput.value = "";
      this.flash(status, "Key cleared", "#f59e0b");
      this.onChangeCb?.();
    });

    ($("#gset-test") as HTMLElement).addEventListener("click", async () => {
      const k = keyInput.value.trim();
      if (!k) {
        this.flash(status, "Paste a key first", "#ef4444");
        return;
      }
      this.flash(status, "Testing...", "#94a3b8");
      const r = await testApiKey(k);
      this.flash(status, r.ok ? `${r.msg} ✓` : `Failed: ${r.msg}`, r.ok ? "#10b981" : "#ef4444");
    });

    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
    });
  }

  private flash(el: HTMLElement, msg: string, color: string): void {
    el.textContent = msg;
    el.style.display = "block";
    el.style.color = color;
    el.style.background = `${color}15`;
    el.style.border = `1px solid ${color}40`;
  }

  private load(): void {
    const keyInput = this.panel.querySelector("#gset-key") as HTMLInputElement;
    const modelSel = this.panel.querySelector("#gset-model") as HTMLSelectElement;
    const existing = getApiKey();
    if (existing) {
      const masked = existing.slice(0, 11) + "•".repeat(20) + existing.slice(-4);
      keyInput.value = "";
      keyInput.placeholder = masked;
    } else {
      keyInput.value = "";
      keyInput.placeholder = "sk-ant-api03-...";
    }
    modelSel.value = getModel();
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.load();
    this.visible = true;
    this.panel.style.display = "block";
    setTimeout(() => (this.panel.querySelector("#gset-key") as HTMLInputElement).focus(), 50);
  }

  hide(): void {
    this.visible = false;
    this.panel.style.display = "none";
  }
}
