// Heuristic DOM analysis — detects repeating patterns and semantic blocks.
// 100% deterministic, no LLM. Output: a ranked list of detected "patterns" the user can select.

export type PatternKind = "list" | "grid" | "table" | "form" | "nav" | "cards" | "article" | "hero";

export interface DetectedPattern {
  kind: PatternKind;
  container: HTMLElement;
  children: HTMLElement[];
  signature: string;
  label: string;
  score: number;
}

const MIN_CHILDREN = 3;
const PARENT_DEPTH = 2;

function elementSig(el: HTMLElement, depth = PARENT_DEPTH): string {
  const path: string[] = [];
  let cur: HTMLElement | null = el;
  let d = 0;
  while (cur && d <= depth) {
    const tag = cur.tagName.toLowerCase();
    const cls = Array.from(cur.classList)
      .filter((c) => /^[a-z][\w-]*$/i.test(c) && c.length < 30)
      .sort()
      .slice(0, 3)
      .join(".");
    path.push(cls ? `${tag}.${cls}` : tag);
    cur = cur.parentElement;
    d++;
  }
  return path.join(" < ");
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
  return true;
}

function isAppUi(el: HTMLElement): boolean {
  if (el.closest("[data-gc-ui]")) return true;
  if (el.tagName === "IFRAME") return false;
  if (["SCRIPT", "STYLE", "META", "LINK", "HEAD", "NOSCRIPT"].includes(el.tagName)) return true;
  return false;
}

function ariaLabel(el: HTMLElement): string {
  return el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || "";
}

function looksLikeNavigation(el: HTMLElement, children: HTMLElement[]): boolean {
  if (el.tagName === "NAV") return true;
  if (ariaLabel(el).toLowerCase().includes("nav")) return true;
  const linkRatio = children.filter((c) => c.tagName === "A" || c.querySelector("a")).length / children.length;
  return linkRatio > 0.7 && children.length >= 3;
}

function looksLikeCards(children: HTMLElement[]): boolean {
  let withImg = 0;
  let withHeading = 0;
  for (const c of children) {
    if (c.querySelector("img")) withImg++;
    if (c.querySelector("h1, h2, h3, h4, h5, h6")) withHeading++;
  }
  const ratioImg = withImg / children.length;
  const ratioHeading = withHeading / children.length;
  return (ratioImg > 0.5 || ratioHeading > 0.5) && children.length >= 3;
}

function looksLikeArticle(el: HTMLElement): boolean {
  if (el.tagName === "ARTICLE") return true;
  const hasH = !!el.querySelector("h1, h2, h3");
  const hasP = !!el.querySelector("p");
  const hasImg = !!el.querySelector("img");
  return hasH && hasP && (hasImg || el.textContent!.length > 200);
}

function looksLikeHero(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < window.innerWidth * 0.6) return false;
  if (rect.height < 200) return false;
  const hasH1 = !!el.querySelector("h1, h2.hero, .hero h1, .hero h2");
  const hasCta = !!el.querySelector("button, a.btn, a.cta, [role='button']");
  return hasH1 && hasCta;
}

export function analyze(): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const seen = new WeakSet<HTMLElement>();

  // Tables (highest signal)
  for (const tbl of Array.from(document.querySelectorAll<HTMLTableElement>("table"))) {
    if (isAppUi(tbl) || !isVisible(tbl)) continue;
    const rows = Array.from(tbl.querySelectorAll<HTMLTableRowElement>("tbody tr, tr")).filter(isVisible);
    if (rows.length < 2) continue;
    seen.add(tbl);
    rows.forEach((r) => seen.add(r));
    patterns.push({
      kind: "table",
      container: tbl,
      children: rows,
      signature: "table",
      label: `Table · ${rows.length} rows`,
      score: 100,
    });
  }

  // Forms
  for (const f of Array.from(document.querySelectorAll<HTMLFormElement>("form"))) {
    if (isAppUi(f) || !isVisible(f)) continue;
    const inputs = Array.from(f.querySelectorAll<HTMLElement>("input, select, textarea, button")).filter(isVisible);
    if (inputs.length < 2) continue;
    seen.add(f);
    inputs.forEach((i) => seen.add(i));
    patterns.push({
      kind: "form",
      container: f,
      children: inputs,
      signature: "form",
      label: `Form · ${inputs.length} fields`,
      score: 90,
    });
  }

  // Nav containers
  for (const n of Array.from(document.querySelectorAll<HTMLElement>("nav"))) {
    if (isAppUi(n) || !isVisible(n)) continue;
    const links = Array.from(n.querySelectorAll<HTMLElement>("a, [role='link']")).filter(isVisible);
    if (links.length < 2) continue;
    seen.add(n);
    links.forEach((l) => seen.add(l));
    patterns.push({
      kind: "nav",
      container: n,
      children: links,
      signature: "nav",
      label: `Navigation · ${links.length} links`,
      score: 85,
    });
  }

  // Repeated children patterns (lists, grids, cards)
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("ul, ol, div, section, main, aside"));
  for (const c of candidates) {
    if (isAppUi(c) || !isVisible(c) || seen.has(c)) continue;
    const children = (Array.from(c.children) as HTMLElement[]).filter(isVisible);
    if (children.length < MIN_CHILDREN) continue;

    const sigCounts = new Map<string, number>();
    for (const ch of children) {
      const sig = elementSig(ch, 1);
      sigCounts.set(sig, (sigCounts.get(sig) || 0) + 1);
    }
    const sortedSigs = Array.from(sigCounts.entries()).sort((a, b) => b[1] - a[1]);
    const [topSig, topCount] = sortedSigs[0];
    if (topCount < MIN_CHILDREN) continue;
    if (topCount / children.length < 0.5) continue;

    const matchingChildren = children.filter((ch) => elementSig(ch, 1) === topSig);
    if (matchingChildren.some((m) => seen.has(m))) continue;

    const cs = getComputedStyle(c);
    const isGridLike = cs.display === "grid" || (cs.display === "flex" && cs.flexWrap === "wrap");
    const isCardLike = looksLikeCards(matchingChildren);
    const isNavLike = looksLikeNavigation(c, matchingChildren);

    let kind: PatternKind = "list";
    let label = `List · ${topCount} items`;
    let score = 60;
    if (isCardLike) {
      kind = "cards";
      label = `Cards · ${topCount}`;
      score = 75;
    } else if (isGridLike) {
      kind = "grid";
      label = `Grid · ${topCount}`;
      score = 70;
    } else if (isNavLike) {
      kind = "nav";
      label = `Nav links · ${topCount}`;
      score = 80;
    }

    seen.add(c);
    matchingChildren.forEach((ch) => seen.add(ch));
    patterns.push({
      kind,
      container: c,
      children: matchingChildren,
      signature: topSig,
      label,
      score,
    });
  }

  // Articles (single, not repeating)
  for (const art of Array.from(document.querySelectorAll<HTMLElement>("article, main > section"))) {
    if (isAppUi(art) || !isVisible(art) || seen.has(art)) continue;
    if (looksLikeArticle(art)) {
      seen.add(art);
      patterns.push({
        kind: "article",
        container: art,
        children: [art],
        signature: "article",
        label: `Article · ${(art.textContent || "").trim().split(/\s+/).length} words`,
        score: 50,
      });
    }
  }

  // Hero
  for (const h of Array.from(document.querySelectorAll<HTMLElement>("header, section, div"))) {
    if (isAppUi(h) || !isVisible(h) || seen.has(h)) continue;
    if (looksLikeHero(h)) {
      seen.add(h);
      patterns.push({
        kind: "hero",
        container: h,
        children: [h],
        signature: "hero",
        label: `Hero section`,
        score: 65,
      });
      break;
    }
  }

  return patterns.sort((a, b) => b.score - a.score).slice(0, 12);
}
