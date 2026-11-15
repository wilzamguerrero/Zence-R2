import { FixedClock, fixedStepSeconds } from "../../../packages/engine/clock.ts";
import { ProjectRuntime } from "../../../packages/engine/project.ts";
import type { Project } from "../../../packages/engine/project.ts";
import { initialTick, loopSeconds } from "./studio.ts";

export const durationTicks = Math.round(loopSeconds / fixedStepSeconds);

export class Playback {
  project: Project;
  runtime: ProjectRuntime;
  playing = true;
  tick = 0;
  private clock = new FixedClock();

  constructor(project: Project) {
    this.project = project;
    this.runtime = new ProjectRuntime(project);
    this.seek(initialTick);
  }

  replace(project: Project, at = this.tick): void {
    const runtime = new ProjectRuntime(project);
    for (let tick = 0; tick < at; tick += 1) runtime.tick();
    this.project = project;
    this.runtime = runtime;
    this.tick = at;
    this.clock = new FixedClock();
  }

  setNumber(id: string, value: number): void {
    this.runtime.setNumber(id, value);
    this.project = {
      ...this.project,
      nodes: this.project.nodes.map((node) =>
        node.id === id && node.kind === "control.number" ? { ...node, initial: value } : node),
    };
  }

  seek(tick: number): void {
    this.replace(this.project, Math.max(0, Math.min(durationTicks, Math.round(tick))));
  }

  advance(seconds: number): void {
    if (!this.playing) return;
    this.clock.advance(seconds, () => {
      if (this.tick >= durationTicks) {
        this.runtime = new ProjectRuntime(this.project);
        this.tick = 0;
      }
      this.runtime.tick();
      this.tick += 1;
    });
  }
}
