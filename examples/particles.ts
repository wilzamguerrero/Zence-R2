import { FixedClock } from "../packages/engine/clock.ts";
import { ProjectRuntime } from "../packages/engine/project.ts";
import project from "./particles.zence.json" with { type: "json" };

const runtime = new ProjectRuntime(project);
const clock = new FixedClock();

function runSecond(): void {
  for (let frame = 0; frame < 30; frame += 1) clock.advance(1 / 30, () => runtime.tick());
}

runSecond();
console.log("Intensidad 1, partícula 1", runtime.snapshot()[0]);
runtime.setNumber("intensity", 3);
runSecond();
console.log("Intensidad 3, partícula 1", runtime.snapshot()[0]);
