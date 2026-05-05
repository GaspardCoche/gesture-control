interface LogEntry {
  level: "log" | "warn" | "error" | "info" | "action";
  message: string;
  timestamp: number;
}

export class ConsolePanel {
  panel: HTMLElement;
  private entries: LogEntry[] = [];
  private maxEntries = 80;
  private originalConsole: Record<string, Function> = {};
  private listEl!: HTMLElement;
  visible = false;

  constructor(container: HTMLElement) {
    this.panel = document.createElement("div");
    this.panel.id = "gesture-console-panel";
    this.panel.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; width: 420px; height: 320px;
      background: rgba(10, 10, 15, 0.95); backdrop-filter: blur(12px);
      border: 1px solid rgba(34, 211, 238, 0.3); border-radius: 12px;
      color: #e2e8f0; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px;
      z-index: 100001; display: none; pointer-events: none;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); overflow: hidden;
      flex-direction: column;
    `;

    this.panel.innerHTML = `
      <div style="padding:8px 14px;border-bottom:1px solid #27272a;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#22d3ee;font-weight:700;font-size:12px;">Console</span>
        <span style="color:#475569;font-size:10px;" id="gesture-console-count">0 entries</span>
      </div>
      <div id="gesture-console-list" style="flex:1;overflow-y:auto;padding:6px 0;"></div>
      <div style="padding:6px 14px;border-top:1px solid #27272a;">
        <span style="color:#64748b;font-size:10px;">FIST: clear | PINCH: toggle borders | SPREAD: toggle spacing</span>
      </div>
    `;

    container.appendChild(this.panel);
    this.listEl = this.panel.querySelector("#gesture-console-list")!;
    this.interceptConsole();
  }

  show() {
    this.visible = true;
    this.panel.style.display = "flex";
    this.renderEntries();
  }

  hide() {
    this.visible = false;
    this.panel.style.display = "none";
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  clear() {
    this.entries = [];
    this.renderEntries();
  }

  logAction(message: string) {
    this.addEntry({ level: "action", message, timestamp: Date.now() });
  }

  private interceptConsole() {
    const levels = ["log", "warn", "error", "info"] as const;
    for (const level of levels) {
      this.originalConsole[level] = console[level].bind(console);
      (console as any)[level] = (...args: unknown[]) => {
        this.originalConsole[level](...args);
        const message = args.map((a) =>
          typeof a === "object" ? JSON.stringify(a, null, 1) : String(a)
        ).join(" ");
        this.addEntry({ level, message, timestamp: Date.now() });
      };
    }
  }

  private addEntry(entry: LogEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    if (this.visible) {
      this.appendEntry(entry);
      this.listEl.scrollTop = this.listEl.scrollHeight;
    }
    const countEl = this.panel.querySelector("#gesture-console-count");
    if (countEl) countEl.textContent = `${this.entries.length} entries`;
  }

  private appendEntry(entry: LogEntry) {
    const div = document.createElement("div");
    div.style.cssText = `padding:3px 14px;border-bottom:1px solid #1e1e2e;word-break:break-all;`;

    const colors: Record<string, string> = {
      log: "#94a3b8", warn: "#f59e0b", error: "#ef4444", info: "#22d3ee", action: "#10b981",
    };

    const time = new Date(entry.timestamp).toLocaleTimeString("en", { hour12: false });
    div.innerHTML = `<span style="color:#475569;">${time}</span> <span style="color:${colors[entry.level]};">[${entry.level}]</span> ${escapeHtml(entry.message)}`;
    this.listEl.appendChild(div);
  }

  private renderEntries() {
    this.listEl.innerHTML = "";
    for (const entry of this.entries) this.appendEntry(entry);
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
