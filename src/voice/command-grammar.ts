export interface StyleAction {
  kind: "style";
  property: string;
  value: string;
  label: string;
}

export interface ScaleAction {
  kind: "scale";
  property: string;
  factor: number;
  label: string;
}

export interface OffsetAction {
  kind: "offset";
  property: string;
  delta: number;
  unit: string;
  label: string;
}

export interface ClassAction {
  kind: "class";
  op: "add" | "remove" | "toggle";
  className: string;
  label: string;
}

export interface VisibilityAction {
  kind: "visibility";
  hide: boolean;
  label: string;
}

export type CommandAction = StyleAction | ScaleAction | OffsetAction | ClassAction | VisibilityAction;

export interface CommandMatch {
  action: CommandAction;
  matchedText: string;
}

const COLORS: Record<string, string> = {
  red: "#ef4444", rouge: "#ef4444",
  blue: "#3b82f6", bleu: "#3b82f6",
  green: "#10b981", vert: "#10b981",
  yellow: "#f59e0b", jaune: "#f59e0b",
  orange: "#f97316",
  purple: "#a855f7", violet: "#a855f7",
  pink: "#ec4899", rose: "#ec4899",
  black: "#000000", noir: "#000000",
  white: "#ffffff", blanc: "#ffffff",
  gray: "#6b7280", grey: "#6b7280", gris: "#6b7280",
  cyan: "#06b6d4",
  indigo: "#6366f1",
  transparent: "transparent",
};

const COLOR_KEYS = Object.keys(COLORS).join("|");

interface Rule {
  pattern: RegExp;
  build: (m: RegExpMatchArray) => CommandAction | null;
}

const RULES: Rule[] = [
  {
    pattern: new RegExp(`(?:set|make|change|colore?\\s*(?:le|la|en)?|mets?\\s*(?:le|la|en)?|change?\\s*(?:le|la|en)?)\\s*(?:background|bg|fond|arri[èe]re[\\s-]?plan)\\s*(?:to|en|in|à|au)?\\s*(${COLOR_KEYS})`, "i"),
    build: (m) => ({
      kind: "style",
      property: "backgroundColor",
      value: COLORS[m[1].toLowerCase()],
      label: `background → ${m[1]}`,
    }),
  },
  {
    pattern: new RegExp(`(?:set|make|change|colore?\\s*(?:le|la|en)?|mets?\\s*(?:le|la|en)?|change?\\s*(?:le|la|en)?)\\s*(?:text|color|couleur|texte)\\s*(?:to|en|in|à|au)?\\s*(${COLOR_KEYS})`, "i"),
    build: (m) => ({
      kind: "style",
      property: "color",
      value: COLORS[m[1].toLowerCase()],
      label: `text color → ${m[1]}`,
    }),
  },
  {
    pattern: new RegExp(`(?:make|set|rends?|mets?)\\s*(?:it|the|le|la|l[''])?\\s*(${COLOR_KEYS})$`, "i"),
    build: (m) => ({
      kind: "style",
      property: "color",
      value: COLORS[m[1].toLowerCase()],
      label: `color → ${m[1]}`,
    }),
  },
  {
    pattern: /(?:double|x2)\s*(?:the|le|la)?\s*(font|text|texte|taille|size)?/i,
    build: () => ({
      kind: "scale",
      property: "fontSize",
      factor: 2,
      label: "font-size × 2",
    }),
  },
  {
    pattern: /(?:half|halve|moiti[ée]|divise[\sr]+(?:par)?\s*2)\s*(?:the|le|la)?\s*(font|text|texte|taille|size)?/i,
    build: () => ({
      kind: "scale",
      property: "fontSize",
      factor: 0.5,
      label: "font-size × 0.5",
    }),
  },
  {
    pattern: /(?:bigger|larger|plus\s+grand|agrandir|augmente[r]?\s+(?:la\s+)?taille|increase\s+(?:font|size))/i,
    build: () => ({
      kind: "scale",
      property: "fontSize",
      factor: 1.25,
      label: "font-size × 1.25",
    }),
  },
  {
    pattern: /(?:smaller|plus\s+petit|r[ée]duire?\s+(?:la\s+)?taille|decrease\s+(?:font|size))/i,
    build: () => ({
      kind: "scale",
      property: "fontSize",
      factor: 0.8,
      label: "font-size × 0.8",
    }),
  },
  {
    pattern: /(?:more|plus\s+(?:de)?|increase|augmente[r]?)\s*(padding|marge\s+int[ée]rieure|espacement\s+int[ée]rieur)/i,
    build: () => ({
      kind: "offset",
      property: "padding",
      delta: 8,
      unit: "px",
      label: "padding +8px",
    }),
  },
  {
    pattern: /(?:less|moins\s+(?:de)?|decrease|r[ée]duire?)\s*(padding|marge\s+int[ée]rieure|espacement\s+int[ée]rieur)/i,
    build: () => ({
      kind: "offset",
      property: "padding",
      delta: -8,
      unit: "px",
      label: "padding −8px",
    }),
  },
  {
    pattern: /(?:more|plus\s+(?:de)?|increase|augmente[r]?)\s*(margin|marge(?:\s+ext[ée]rieure)?)/i,
    build: () => ({
      kind: "offset",
      property: "margin",
      delta: 8,
      unit: "px",
      label: "margin +8px",
    }),
  },
  {
    pattern: /(?:less|moins\s+(?:de)?|decrease|r[ée]duire?)\s*(margin|marge(?:\s+ext[ée]rieure)?)/i,
    build: () => ({
      kind: "offset",
      property: "margin",
      delta: -8,
      unit: "px",
      label: "margin −8px",
    }),
  },
  {
    pattern: /(?:add|ajoute[r]?|mets?)\s+(?:a\s+)?(?:border|bordure)/i,
    build: () => ({
      kind: "style",
      property: "border",
      value: "2px solid currentColor",
      label: "+ border 2px",
    }),
  },
  {
    pattern: /(?:no|enl[èe]ve[r]?\s+(?:la|le)?|remove|retire[r]?)\s*(?:border|bordure)/i,
    build: () => ({
      kind: "style",
      property: "border",
      value: "none",
      label: "− border",
    }),
  },
  {
    pattern: /(?:rounded|rond|arrondi[se]*|round)/i,
    build: () => ({
      kind: "style",
      property: "borderRadius",
      value: "12px",
      label: "border-radius 12px",
    }),
  },
  {
    pattern: /(?:circle|cercle|fully\s+round|completely\s+round)/i,
    build: () => ({
      kind: "style",
      property: "borderRadius",
      value: "50%",
      label: "border-radius 50%",
    }),
  },
  {
    pattern: /(?:square|carr[ée]|no\s+round|sans\s+arrondi)/i,
    build: () => ({
      kind: "style",
      property: "borderRadius",
      value: "0",
      label: "border-radius 0",
    }),
  },
  {
    pattern: /(?:bold|gras|fat|grasse?)/i,
    build: () => ({
      kind: "style",
      property: "fontWeight",
      value: "700",
      label: "font-weight 700",
    }),
  },
  {
    pattern: /(?:italic|italique|en\s+italique)/i,
    build: () => ({
      kind: "style",
      property: "fontStyle",
      value: "italic",
      label: "font-style italic",
    }),
  },
  {
    pattern: /(?:underline|souligne[r]?|underlined)/i,
    build: () => ({
      kind: "style",
      property: "textDecoration",
      value: "underline",
      label: "text-decoration underline",
    }),
  },
  {
    pattern: /(?:strike(?:through)?|barr[ée]|barre\s+ce)/i,
    build: () => ({
      kind: "style",
      property: "textDecoration",
      value: "line-through",
      label: "text-decoration line-through",
    }),
  },
  {
    pattern: /(?:uppercase|majuscules?|en\s+majuscules?)/i,
    build: () => ({
      kind: "style",
      property: "textTransform",
      value: "uppercase",
      label: "text-transform uppercase",
    }),
  },
  {
    pattern: /(?:lowercase|minuscules?|en\s+minuscules?)/i,
    build: () => ({
      kind: "style",
      property: "textTransform",
      value: "lowercase",
      label: "text-transform lowercase",
    }),
  },
  {
    pattern: /(?:center|centre[r]?|center[ée]|au\s+centre)/i,
    build: () => ({
      kind: "style",
      property: "textAlign",
      value: "center",
      label: "text-align center",
    }),
  },
  {
    pattern: /(?:align\s+left|à\s+gauche|gauche)/i,
    build: () => ({
      kind: "style",
      property: "textAlign",
      value: "left",
      label: "text-align left",
    }),
  },
  {
    pattern: /(?:align\s+right|à\s+droite)/i,
    build: () => ({
      kind: "style",
      property: "textAlign",
      value: "right",
      label: "text-align right",
    }),
  },
  {
    pattern: /(?:add\s+shadow|ajoute[r]?\s+(?:une\s+)?ombre|drop[\s-]shadow|with\s+shadow)/i,
    build: () => ({
      kind: "style",
      property: "boxShadow",
      value: "0 8px 24px rgba(0,0,0,0.15)",
      label: "+ box-shadow",
    }),
  },
  {
    pattern: /(?:no\s+shadow|enl[èe]ve[r]?\s+(?:l['']?)?ombre|remove\s+shadow|sans\s+ombre)/i,
    build: () => ({
      kind: "style",
      property: "boxShadow",
      value: "none",
      label: "− box-shadow",
    }),
  },
  {
    pattern: /(?:hide|cache[r]?|invisible|disparais)/i,
    build: () => ({
      kind: "visibility",
      hide: true,
      label: "hide element",
    }),
  },
  {
    pattern: /(?:show|montre[r]?|visible|fais[\s-]le[\s-]r[ée]apparaitre|r[ée]apparais)/i,
    build: () => ({
      kind: "visibility",
      hide: false,
      label: "show element",
    }),
  },
  {
    pattern: /(?:opacity\s+(?:to\s+)?(\d+(?:\.\d+)?)|opacit[ée]\s+(?:à\s+)?(\d+(?:\.\d+)?))/i,
    build: (m) => {
      const raw = m[1] ?? m[2];
      if (!raw) return null;
      const val = parseFloat(raw);
      const v = val > 1 ? val / 100 : val;
      return {
        kind: "style",
        property: "opacity",
        value: String(v),
        label: `opacity ${v}`,
      };
    },
  },
  {
    pattern: /(?:full\s+width|pleine\s+largeur|largeur\s+max)/i,
    build: () => ({
      kind: "style",
      property: "width",
      value: "100%",
      label: "width 100%",
    }),
  },
  {
    pattern: /(?:fade|estompe[r]?|atténue[r]?|transparent)/i,
    build: () => ({
      kind: "style",
      property: "opacity",
      value: "0.5",
      label: "opacity 0.5",
    }),
  },
];

export function matchCommand(transcript: string): CommandMatch | null {
  const t = transcript.trim();
  if (!t) return null;
  for (const rule of RULES) {
    const m = t.match(rule.pattern);
    if (m) {
      const action = rule.build(m);
      if (action) return { action, matchedText: m[0] };
    }
  }
  return null;
}

export const COMMAND_COUNT = RULES.length;
