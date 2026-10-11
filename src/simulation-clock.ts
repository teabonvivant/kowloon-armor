export class SimulationClock {
  private accumulator = 0;
  readonly step = 1 / 60;

  advance(elapsed: number, update: (step: number) => boolean): void {
    this.accumulator = Math.min(.15, this.accumulator + Math.max(0, elapsed));
    while (this.accumulator + 1e-10 >= this.step) {
      this.accumulator = Math.max(0, this.accumulator - this.step);
      if (!update(this.step)) { this.reset(); break; }
    }
  }

  reset(): void { this.accumulator = 0; }
}
