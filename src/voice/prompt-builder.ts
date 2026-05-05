import type { ElementInfo } from "../overlay/dom-inspector";

export function buildPrompt(
  element: ElementInfo,
  transcript: string,
  pageUrl: string,
  pageTitle: string,
): string {
  const ts = new Date().toISOString();
  const styles = Object.entries(element.computedStyles)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  const attrs = Object.entries(element.attributes)
    .map(([k, v]) => `  ${k}="${v}"`)
    .join("\n");

  return `## UI Feedback Report

**Page:** ${pageTitle} (${pageUrl})
**Timestamp:** ${ts}

### Selected Element
- **Tag:** <${element.tag}>
- **ID:** ${element.id || "(none)"}
- **Classes:** ${element.classes.length ? element.classes.join(", ") : "(none)"}
- **Dimensions:** ${Math.round(element.rect.width)}x${Math.round(element.rect.height)} at (${Math.round(element.rect.x)}, ${Math.round(element.rect.y)})
- **Text content:** "${element.text}"
- **Depth:** ${element.depth} | **Children:** ${element.children}

### Computed Styles
${styles || "  (none)"}

### Attributes
${attrs || "  (none)"}

### User Feedback (Voice)
> ${transcript}

### Context
The user selected this element on the page using a gesture-based inspection tool
and dictated the above voice note describing an issue or desired change.

### Requested Action
Based on the element details and the user's voice feedback above, please:
1. Identify what the user wants changed
2. Suggest specific CSS/HTML/JS changes to fix the issue
3. Provide code snippets ready to apply
`;
}
