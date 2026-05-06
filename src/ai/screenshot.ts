// Screenshot capture for Vision API.
// Uses html2canvas-pro (lazy-loaded) to render DOM to canvas → base64 PNG.
// Note: cross-origin iframes can't be captured. Same-origin only.

const MAX_DIMENSION = 1568; // Anthropic's recommended max (cost-efficient)
const QUALITY = 0.85;

export interface ScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
  base64: string;
  mediaType: "image/jpeg";
}

export async function captureRegion(target: HTMLElement | null): Promise<ScreenshotResult | null> {
  try {
    const html2canvas = (await import("html2canvas-pro")).default;
    const node = target ?? document.body;
    const canvas = await html2canvas(node, {
      scale: window.devicePixelRatio,
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      ignoreElements: (el: Element) => {
        if (el instanceof HTMLElement) {
          if (el.dataset && el.dataset.gcUi !== undefined) return true;
          if (el.closest("[data-gc-ui]")) return true;
          if (["gesture-canvas", "gesture-action-panel", "gesture-toast", "gesture-debug-hud", "video-thumb"].includes(el.id)) return true;
        }
        return false;
      },
    } as any);

    let outCanvas = canvas;
    if (canvas.width > MAX_DIMENSION || canvas.height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(canvas.width, canvas.height);
      const tmp = document.createElement("canvas");
      tmp.width = Math.round(canvas.width * scale);
      tmp.height = Math.round(canvas.height * scale);
      tmp.getContext("2d")!.drawImage(canvas, 0, 0, tmp.width, tmp.height);
      outCanvas = tmp;
    }

    const dataUrl = outCanvas.toDataURL("image/jpeg", QUALITY);
    const base64 = dataUrl.split(",")[1] || "";
    return {
      dataUrl,
      base64,
      width: outCanvas.width,
      height: outCanvas.height,
      mediaType: "image/jpeg",
    };
  } catch (err) {
    console.warn("[screenshot] capture failed:", err);
    return null;
  }
}

export async function captureViewport(): Promise<ScreenshotResult | null> {
  return captureRegion(null);
}
