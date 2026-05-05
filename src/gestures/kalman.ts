export interface KalmanOptions {
  sigmaA2: number;
  r: number;
  initPos: number;
}

export class KalmanCV1D {
  private pos: number;
  private vel = 0;
  private p00 = 1;
  private p01 = 0;
  private p11 = 1;
  private readonly sigmaA2: number;
  private readonly r: number;

  constructor(opts: KalmanOptions) {
    this.pos = opts.initPos;
    this.sigmaA2 = opts.sigmaA2;
    this.r = opts.r;
  }

  update(meas: number, dt: number): number {
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;
    const q00 = (this.sigmaA2 * dt4) / 4;
    const q01 = (this.sigmaA2 * dt3) / 2;
    const q11 = this.sigmaA2 * dt2;

    const predPos = this.pos + this.vel * dt;
    const predP00 = this.p00 + 2 * dt * this.p01 + dt2 * this.p11 + q00;
    const predP01 = this.p01 + dt * this.p11 + q01;
    const predP11 = this.p11 + q11;

    const innov = meas - predPos;
    const s = predP00 + this.r;
    const k0 = predP00 / s;
    const k1 = predP01 / s;

    this.pos = predPos + k0 * innov;
    this.vel = this.vel + k1 * innov;

    this.p00 = (1 - k0) * predP00;
    this.p01 = (1 - k0) * predP01;
    this.p11 = predP11 - k1 * predP01;

    return this.pos;
  }

  predict(dt: number): number {
    return this.pos + this.vel * dt;
  }

  reset(pos: number): void {
    this.pos = pos;
    this.vel = 0;
    this.p00 = 1;
    this.p01 = 0;
    this.p11 = 1;
  }

  get value(): number {
    return this.pos;
  }

  get velocity(): number {
    return this.vel;
  }
}

export class KalmanGaze2D {
  private kx: KalmanCV1D;
  private ky: KalmanCV1D;
  private lastT: number | null = null;

  constructor(sigmaA2 = 100, r = 0.0015) {
    this.kx = new KalmanCV1D({ sigmaA2, r, initPos: 0.5 });
    this.ky = new KalmanCV1D({ sigmaA2, r, initPos: 0.5 });
  }

  update(x: number, y: number, tMs: number): { x: number; y: number } {
    let dt = 1 / 30;
    if (this.lastT != null) {
      dt = Math.max(0.005, Math.min(0.2, (tMs - this.lastT) / 1000));
    }
    this.lastT = tMs;
    return {
      x: this.kx.update(x, dt),
      y: this.ky.update(y, dt),
    };
  }

  reset(x = 0.5, y = 0.5): void {
    this.kx.reset(x);
    this.ky.reset(y);
    this.lastT = null;
  }

  peek(): { x: number; y: number } {
    return { x: this.kx.value, y: this.ky.value };
  }
}
