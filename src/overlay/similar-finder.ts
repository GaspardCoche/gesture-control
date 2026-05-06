// Easy Scraper-style: find elements that share structural pattern with a target.
// Uses tag + sorted classes signature, optionally constrained by parent ancestor signature.

function elementSignature(el: HTMLElement, parentDepth = 2): string {
  const path: string[] = [];
  let cur: HTMLElement | null = el;
  let depth = 0;
  while (cur && depth <= parentDepth) {
    const tag = cur.tagName.toLowerCase();
    const cls = Array.from(cur.classList)
      .filter((c) => /^[a-z][\w-]*$/i.test(c) && c.length < 30)
      .sort()
      .join(".");
    path.push(cls ? `${tag}.${cls}` : tag);
    cur = cur.parentElement;
    depth++;
  }
  return path.join(" < ");
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) return false;
  return true;
}

export function findSimilar(target: HTMLElement, ignore: (el: HTMLElement) => boolean): HTMLElement[] {
  const sig = elementSignature(target, 2);
  if (!sig) return [];

  const tag = target.tagName.toLowerCase();
  const candidates = Array.from(document.getElementsByTagName(tag)) as HTMLElement[];
  const matches: HTMLElement[] = [];
  for (const c of candidates) {
    if (c === target) continue;
    if (ignore(c)) continue;
    if (!isVisible(c)) continue;
    if (elementSignature(c, 2) === sig) matches.push(c);
  }
  return matches;
}

export function buildSelectorPattern(target: HTMLElement): string {
  const path: string[] = [];
  let cur: HTMLElement | null = target;
  let depth = 0;
  while (cur && cur.tagName !== "BODY" && depth < 4) {
    const tag = cur.tagName.toLowerCase();
    const cls = Array.from(cur.classList)
      .filter((c) => /^[a-z][\w-]*$/i.test(c) && c.length < 30 && !/^(active|hover|focus|selected)$/.test(c))
      .slice(0, 2)
      .map((c) => `.${CSS.escape(c)}`)
      .join("");
    path.unshift(cls ? `${tag}${cls}` : tag);
    cur = cur.parentElement;
    depth++;
  }
  return path.join(" > ");
}

export function extractData(el: HTMLElement): Record<string, string> {
  const data: Record<string, string> = {};
  const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 500);
  if (text) data.text = text;
  if (el.tagName === "A") {
    const href = (el as HTMLAnchorElement).href;
    if (href) data.href = href;
  }
  if (el.tagName === "IMG") {
    const src = (el as HTMLImageElement).src;
    const alt = (el as HTMLImageElement).alt;
    if (src) data.src = src;
    if (alt) data.alt = alt;
  }
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const v = (el as HTMLInputElement).value;
    if (v) data.value = v;
  }
  const childA = el.querySelector("a") as HTMLAnchorElement | null;
  if (childA && !data.href) data.href = childA.href;
  const childImg = el.querySelector("img") as HTMLImageElement | null;
  if (childImg && !data.src) data.src = childImg.src;
  return data;
}
