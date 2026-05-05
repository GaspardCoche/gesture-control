// SVG icons - Lucide-derived, MIT licensed, no runtime dependency.
// Each icon: 24x24 viewBox, currentColor stroke, 2px width by default.
// Use via icon(name, size?, opts?) → returns string of <svg ...>.

const ICONS: Record<string, string> = {
  pointer: `<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>`,
  pinch: `<path d="M5 8c0-3 2-5 5-5s5 2 5 5"/><path d="M5 8v8a4 4 0 0 0 4 4h6"/><path d="M11 12V6"/><path d="M15 8c2 0 4 2 4 4 0 3-2 6-5 8"/>`,
  open_hand: `<path d="M9 11V6a2 2 0 1 1 4 0v5"/><path d="M13 11V4a2 2 0 1 1 4 0v9"/><path d="M17 11V6a2 2 0 1 1 4 0v9a7 7 0 0 1-7 7H10a7 7 0 0 1-7-7v-3a2 2 0 1 1 4 0v2"/>`,
  peace: `<path d="M12 12V3"/><path d="M9 12V5"/><path d="M15 12V5"/><path d="M9 12a3 3 0 0 1-6 0v-1"/><path d="M15 12c0 4 1 7 4 9"/><path d="M9 12c0 4-1 7-4 9"/>`,
  fist: `<rect x="6" y="9" width="12" height="9" rx="2"/><path d="M9 9V6a1.5 1.5 0 0 1 3 0v3"/><path d="M12 9V5a1.5 1.5 0 0 1 3 0v4"/><path d="M15 9V6a1.5 1.5 0 0 1 3 0v3"/>`,
  thumbs_up: `<path d="M7 10v12"/><path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4-9c1.66 0 3 1.34 3 3v1.88z"/>`,
  mic: `<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/>`,
  inspect: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/>`,
  pencil: `<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>`,
  ruler: `<path d="M21 14L7 0 0 7l14 14 7-7z"/><path d="M5 5l3 3"/><path d="M9 9l3 3"/><path d="M13 13l3 3"/>`,
  eye: `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
  eye_off: `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s4 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>`,
  swipe_down: `<path d="M12 4v14"/><path d="M5 13l7 7 7-7"/>`,
  swipe_up: `<path d="M12 20V6"/><path d="M5 11l7-7 7 7"/>`,
  cursor: `<path d="M12 2v6m0 8v6M2 12h6m8 0h6"/>`,
  zap: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
  sparkle: `<path d="M12 2l1.5 5L18 8.5 13.5 10 12 15l-1.5-5L6 8.5 10.5 7z"/>`,
  shield: `<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/>`,
  layers: `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`,
  download: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`,
  copy: `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  github: `<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>`,
  arrow_right: `<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`,
  check: `<polyline points="20 6 9 17 4 12"/>`,
  cpu: `<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>`,
  accessibility: `<circle cx="12" cy="4" r="2"/><path d="M19 13v-2a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v2"/><path d="M9 9v6l-2 6"/><path d="M15 9v6l2 6"/>`,
  presentation: `<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="7 11 10 8 13 11 17 7"/>`,
  code_review: `<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/>`,
  monitor: `<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>`,
};

export type IconName = keyof typeof ICONS;

export function icon(name: string, size = 18, opts: { stroke?: string; strokeWidth?: number; fill?: string } = {}): string {
  const body = ICONS[name];
  if (!body) return "";
  const stroke = opts.stroke ?? "currentColor";
  const strokeWidth = opts.strokeWidth ?? 2;
  const fill = opts.fill ?? "none";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(ICONS);
