export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

export class CanvasOverlay {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  strokes: Stroke[] = [];
  currentStroke: Point[] = [];
  trail: Point[] = [];
  cursor: Point = { x: 0, y: 0 };
  smoothCursor: Point = { x: 0, y: 0 };
  gazeCursor: Point = { x: 0, y: 0 };
  gazeVisible = false;
  scrollIndicator = 0;
  measurePoints: Point[] = [];
  highlightRect: DOMRect | null = null;
  highlightTag = "";
  isDrawing = false;
  recordingActive = false;

  private readonly SMOOTHING = 0.22;
  private readonly TRAIL_LEN = 14;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "gesture-canvas";
    this.canvas.style.cssText =
      "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;pointer-events:none;";
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + "px";
    this.canvas.style.height = window.innerHeight + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  updateCursor(nx: number, ny: number) {
    this.cursor.x = (1 - nx) * window.innerWidth;
    this.cursor.y = ny * window.innerHeight;
    this.smoothCursor.x += (this.cursor.x - this.smoothCursor.x) * this.SMOOTHING;
    this.smoothCursor.y += (this.cursor.y - this.smoothCursor.y) * this.SMOOTHING;
    this.trail.push({ ...this.smoothCursor });
    if (this.trail.length > this.TRAIL_LEN) this.trail.shift();
  }

  startStroke() {
    this.isDrawing = true;
    this.currentStroke = [];
  }

  addStrokePoint() {
    if (!this.isDrawing) return;
    this.currentStroke.push({ ...this.smoothCursor });
  }

  endStroke() {
    if (this.currentStroke.length > 2) {
      this.strokes.push({ points: [...this.currentStroke], color: "#f59e0b", width: 3 });
    }
    this.currentStroke = [];
    this.isDrawing = false;
  }

  undoStroke() {
    this.strokes.pop();
  }

  clearAll() {
    this.strokes = [];
    this.currentStroke = [];
    this.measurePoints = [];
    this.highlightRect = null;
    this.trail = [];
  }

  setHighlight(rect: DOMRect | null, tag = "") {
    this.highlightRect = rect;
    this.highlightTag = tag;
  }

  addMeasurePoint() {
    if (this.measurePoints.length >= 2) this.measurePoints = [];
    this.measurePoints.push({ ...this.smoothCursor });
  }

  addMeasurePointAt(x: number, y: number) {
    if (this.measurePoints.length >= 2) this.measurePoints = [];
    this.measurePoints.push({ x, y });
  }

  updateGazeCursor(nx: number, ny: number) {
    this.gazeCursor.x = nx * window.innerWidth;
    this.gazeCursor.y = ny * window.innerHeight;
    this.gazeVisible = true;
  }

  setScrollIndicator(amount: number) {
    this.scrollIndicator = amount;
  }

  render(activeGesture: string, mode: string, eyeTrackingOn = false) {
    const { ctx } = this;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    if (this.highlightRect) {
      const r = this.highlightRect;
      ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      ctx.setLineDash([]);
      const dimText = `${Math.round(r.width)} x ${Math.round(r.height)}`;
      ctx.font = "11px system-ui, sans-serif";
      const tw = ctx.measureText(dimText).width;
      ctx.fillStyle = "rgba(99, 102, 241, 0.9)";
      roundRect(ctx, r.x - 4, r.y - 22, tw + 8, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(dimText, r.x, r.y - 8);
      if (this.highlightTag) {
        const tagW = ctx.measureText(this.highlightTag).width;
        ctx.fillStyle = "rgba(30, 30, 46, 0.9)";
        roundRect(ctx, r.x + r.width - tagW - 12, r.y + r.height + 4, tagW + 12, 18, 4);
        ctx.fill();
        ctx.fillStyle = "#a78bfa";
        ctx.fillText(this.highlightTag, r.x + r.width - tagW - 6, r.y + r.height + 17);
      }
      this.renderBoxGuides(r);
    }

    for (const s of this.strokes) this.renderStroke(s.points, s.color, s.width);
    if (this.currentStroke.length > 1) {
      this.renderStroke(this.currentStroke, "#f59e0b", 4);
    }

    if (this.measurePoints.length >= 2) {
      const [a, b] = this.measurePoints;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "#f472b6";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const p of [a, b]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#f472b6";
        ctx.fill();
      }
      const dist = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const label = `${dist}px`;
      ctx.font = "bold 13px system-ui, sans-serif";
      const lw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(244, 114, 182, 0.9)";
      roundRect(ctx, mx - lw / 2 - 6, my - 20, lw + 12, 22, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, mx - lw / 2, my - 3);
    } else if (this.measurePoints.length === 1 && mode === "measure") {
      const p = this.measurePoints[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f472b6";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(this.smoothCursor.x, this.smoothCursor.y);
      ctx.strokeStyle = "rgba(244, 114, 182, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.strokeStyle = "rgba(99, 102, 241, 0.25)";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    if (this.trail.length > 0) {
      const { x, y } = this.smoothCursor;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = mode === "draw"
        ? "rgba(245,158,11,0.15)"
        : mode === "measure"
          ? "rgba(244,114,182,0.15)"
          : "rgba(99,102,241,0.15)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = mode === "draw"
        ? "#f59e0b"
        : mode === "measure"
          ? "#f472b6"
          : "#6366f1";
      ctx.fill();
      if (activeGesture === "PINCH") {
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (this.recordingActive && this.trail.length > 0) {
      const { x, y } = this.smoothCursor;
      const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 300);
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (eyeTrackingOn && this.gazeVisible) {
      const gx = this.gazeCursor.x;
      const gy = this.gazeCursor.y;
      ctx.beginPath();
      ctx.arc(gx, gy, 18, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(34, 211, 238, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx, gy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34, 211, 238, 0.7)";
      ctx.fill();
    }

    if (this.scrollIndicator !== 0) {
      const cx = w / 2;
      const intensity = Math.min(Math.abs(this.scrollIndicator) / 30, 1);
      const alpha = 0.2 + intensity * 0.5;
      ctx.fillStyle = `rgba(99, 102, 241, ${alpha})`;
      if (this.scrollIndicator > 0) {
        for (let i = 0; i < 3; i++) {
          const y = h - 40 + i * 12;
          ctx.beginPath();
          ctx.moveTo(cx - 20, y);
          ctx.lineTo(cx, y + 8);
          ctx.lineTo(cx + 20, y);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
          ctx.stroke();
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const y = 40 - i * 12;
          ctx.beginPath();
          ctx.moveTo(cx - 20, y);
          ctx.lineTo(cx, y - 8);
          ctx.lineTo(cx + 20, y);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
          ctx.stroke();
        }
      }
    }
  }

  private renderStroke(points: Point[], color: string, width: number) {
    if (points.length < 2) return;
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  private renderBoxGuides(r: DOMRect) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(0, r.y);
    ctx.lineTo(window.innerWidth, r.y);
    ctx.moveTo(0, r.y + r.height);
    ctx.lineTo(window.innerWidth, r.y + r.height);
    ctx.moveTo(r.x, 0);
    ctx.lineTo(r.x, window.innerHeight);
    ctx.moveTo(r.x + r.width, 0);
    ctx.lineTo(r.x + r.width, window.innerHeight);
    ctx.strokeStyle = "rgba(99, 102, 241, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
