export const fixedStepSeconds = 1 / 60;
const maxStepsPerFrame = 5;

export class FixedClock {
  private remainder = 0;

  // Limit catch-up work after a suspended tab or overloaded frame.
  advance(elapsedSeconds: number, step: () => void): number {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      throw new RangeError("Elapsed time must be finite and nonnegative");
    }

    this.remainder += Math.min(elapsedSeconds, maxStepsPerFrame * fixedStepSeconds);
    const steps = Math.min(maxStepsPerFrame, Math.floor((this.remainder + 1e-12) / fixedStepSeconds));
    for (let index = 0; index < steps; index += 1) {
      step();
      this.remainder = Math.max(0, this.remainder - fixedStepSeconds);
    }
    return steps;
  }
}
