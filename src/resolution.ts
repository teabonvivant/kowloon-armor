export class AdaptiveResolution {
  scale = 1;
  private slow = 0; private fast = 0;
  reset(): void { this.scale = 1; this.slow = 0; this.fast = 0; }
  sample(seconds: number): boolean {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 2) { this.slow = 0; this.fast = 0; return false; }
    this.slow = seconds > 1 / 42 ? this.slow + seconds : 0;
    this.fast = seconds < 1 / 55 ? this.fast + seconds : 0;
    const next = this.slow >= 2 ? Math.max(.6, this.scale - .1) : this.fast >= 6 ? Math.min(1, this.scale + .1) : this.scale;
    if (next === this.scale) return false;
    this.scale = Math.round(next * 10) / 10; this.slow = 0; this.fast = 0; return true;
  }
}
