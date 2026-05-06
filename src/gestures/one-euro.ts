// OneEuroFilter — Casiez, Roussel, Vogel (2012)
// "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
// Adaptive smoothing: low cutoff when slow (smooth jitter), high cutoff when fast (no lag).

class LowPass {
  private y: number | null = null;
  private a = 0;

  setAlpha(a: number): void {
    this.a = a;
  }

  filter(x: number): number {
    if (this.y === null) {
      this.y = x;
      return x;
    }
    this.y = this.a * x + (1 - this.a) * this.y;
    return this.y;
  }

  hatX(): number | null {
    return this.y;
  }

  reset(): void {
    this.y = null;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuro {
  private xFilter = new LowPass();
  private dxFilter = new LowPass();
  private lastTime: number | null = null;

  constructor(
    private minCutoff = 1.0,
    private beta = 0.007,
    private dCutoff = 1.0,
  ) {}

  filter(x: number, tMs: number): number {
    let dt = 1 / 60;
    if (this.lastTime !== null) {
      dt = Math.max(0.001, Math.min(0.2, (tMs - this.lastTime) / 1000));
    }
    this.lastTime = tMs;

    const prev = this.xFilter.hatX();
    const dx = prev === null ? 0 : (x - prev) / dt;

    this.dxFilter.setAlpha(alpha(this.dCutoff, dt));
    const edx = this.dxFilter.filter(dx);

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    this.xFilter.setAlpha(alpha(cutoff, dt));
    return this.xFilter.filter(x);
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }

  setParams(minCutoff: number, beta: number, dCutoff = 1.0): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }
}

export class OneEuro2D {
  private fx: OneEuro;
  private fy: OneEuro;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.fx = new OneEuro(minCutoff, beta, dCutoff);
    this.fy = new OneEuro(minCutoff, beta, dCutoff);
  }

  filter(x: number, y: number, tMs: number): { x: number; y: number } {
    return {
      x: this.fx.filter(x, tMs),
      y: this.fy.filter(y, tMs),
    };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }

  setParams(minCutoff: number, beta: number, dCutoff = 1.0): void {
    this.fx.setParams(minCutoff, beta, dCutoff);
    this.fy.setParams(minCutoff, beta, dCutoff);
  }
}
