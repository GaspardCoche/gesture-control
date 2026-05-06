import type { ElementInfo } from "../overlay/dom-inspector";
import { extractData } from "../overlay/similar-finder";

export interface CuratedElement {
  id: string;
  selector: string;
  info: ElementInfo;
  note?: string;
  capturedAt: number;
}

export interface TaskExportOptions {
  intent?: string;
  pageUrl: string;
  pageTitle: string;
  elements: CuratedElement[];
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function timestampSlug(d = new Date()): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

export function buildTaskMarkdown(opts: TaskExportOptions): string {
  const lines: string[] = [];
  const ts = new Date().toISOString();

  lines.push(`# Gesture Task — ${ts}`);
  lines.push("");
  lines.push(`**Page:** ${opts.pageTitle} (${opts.pageUrl})`);
  lines.push(`**Elements curated:** ${opts.elements.length}`);
  lines.push("");

  if (opts.intent && opts.intent.trim()) {
    lines.push("## Intent");
    lines.push("");
    lines.push(opts.intent.trim());
    lines.push("");
  }

  lines.push("## Selected elements");
  lines.push("");

  opts.elements.forEach((el, i) => {
    const info = el.info;
    lines.push(`### #${i + 1} \`${el.selector}\``);
    lines.push("");
    const tag = `<${info.tag}${info.id ? ` id="${info.id}"` : ""}${info.classes.length ? ` class="${info.classes.join(" ")}"` : ""}>`;
    lines.push(`- **Tag:** \`${tag}\``);
    lines.push(`- **Position:** ${Math.round(info.rect.x)}, ${Math.round(info.rect.y)} · **Size:** ${Math.round(info.rect.width)}×${Math.round(info.rect.height)}`);
    lines.push(`- **Depth:** ${info.depth} · **Children:** ${info.children}`);
    if (info.text) {
      const trimmed = info.text.length > 120 ? info.text.slice(0, 117) + "…" : info.text;
      lines.push(`- **Text:** ${JSON.stringify(trimmed)}`);
    }
    if (Object.keys(info.computedStyles).length > 0) {
      lines.push(`- **Styles:**`);
      for (const [k, v] of Object.entries(info.computedStyles)) {
        lines.push(`  - \`${k}: ${v}\``);
      }
    }
    if (Object.keys(info.attributes).length > 0) {
      const attrs = Object.entries(info.attributes).map(([k, v]) => `${k}="${v}"`).join(" ");
      lines.push(`- **Attributes:** \`${attrs}\``);
    }
    if (el.note) {
      lines.push(`- **Note:** ${el.note}`);
    }
    if (info.element) {
      const data = extractData(info.element);
      if (data.href) lines.push(`- **Link:** ${data.href}`);
      if (data.src) lines.push(`- **Image src:** ${data.src}`);
      if (data.alt) lines.push(`- **Alt text:** ${data.alt}`);
      if (data.value) lines.push(`- **Value:** ${JSON.stringify(data.value.slice(0, 100))}`);
    }
    lines.push("");
  });

  lines.push("## Action");
  lines.push("");
  lines.push("Apply the requested changes to the elements above. For each element, output:");
  lines.push("1. The diagnosis (what's wrong / what should change)");
  lines.push("2. The exact CSS/HTML/JS snippet to apply");
  lines.push("3. A scoped CSS selector that targets the element");
  lines.push("");
  lines.push("Group related changes when they share a common pattern. Be concise.");
  lines.push("");

  return lines.join("\n");
}

export function downloadTask(markdown: string, filename?: string): void {
  const name = filename ?? `gesture-task-${timestampSlug()}.md`;
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function copyTaskToClipboard(markdown: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(markdown);
    return true;
  } catch {
    return false;
  }
}

export function buildSelector(el: HTMLElement, root: HTMLElement = document.body): string {
  if (el === root) return "body";
  if (el.id) return `#${CSS.escape(el.id)}`;
  const path: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== root && cur !== document.documentElement) {
    let segment = cur.tagName.toLowerCase();
    if (cur.id) {
      segment = `#${CSS.escape(cur.id)}`;
      path.unshift(segment);
      break;
    }
    const classes = Array.from(cur.classList).filter((c) => /^[a-z][\w-]*$/i.test(c));
    if (classes.length > 0) {
      segment += "." + classes.slice(0, 2).map((c) => CSS.escape(c)).join(".");
    }
    const parentEl: HTMLElement | null = cur.parentElement;
    if (parentEl) {
      const tagName = cur.tagName;
      const sameTag = Array.from(parentEl.children).filter((c): c is Element => c.tagName === tagName);
      if (sameTag.length > 1) {
        const idx = sameTag.indexOf(cur) + 1;
        segment += `:nth-of-type(${idx})`;
      }
    }
    path.unshift(segment);
    cur = parentEl;
    if (path.length > 6) break;
  }
  return path.join(" > ");
}
