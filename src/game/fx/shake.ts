/** Exponentially decaying screen shake, in virtual units. */
export class ScreenShake {
  private amp = 0;
  private phase = 0;

  get amplitude(): number {
    return this.amp;
  }

  clear(): void {
    this.amp = 0;
  }

  /** Strongest impulse wins; repeated hits do not stack into nausea. */
  kick(amplitude: number): void {
    this.amp = Math.max(this.amp, amplitude);
  }

  update(dtMs: number): void {
    if (this.amp === 0) return;
    this.phase += dtMs * 0.06;
    // ~halves every 100ms of wall time; snapped to 0 once imperceptible.
    this.amp *= Math.pow(0.5, dtMs / 100);
    if (this.amp <= 0.01) this.amp = 0;
  }

  offsetX(): number {
    return Math.sin(this.phase * 3.1) * this.amp;
  }

  offsetY(): number {
    return Math.cos(this.phase * 2.3) * this.amp * 0.7;
  }
}
