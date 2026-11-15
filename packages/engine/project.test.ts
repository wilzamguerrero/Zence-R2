import assert from "node:assert/strict";
import { test } from "node:test";
import demo from "../../examples/particles.zence.json" with { type: "json" };
import { FixedClock, fixedStepSeconds } from "./clock.ts";
import { ProjectRuntime } from "./project.ts";

test("different render rates produce the same simulation with the same seed and controls", () => {
  function run(fps: number) {
    const runtime = new ProjectRuntime(demo);
    const clock = new FixedClock();
    for (let frame = 0; frame < fps * 2; frame += 1) {
      if (frame === fps) runtime.setNumber("intensity", 3);
      clock.advance(1 / fps, () => runtime.tick());
    }
    return runtime.snapshot();
  }

  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(60), run(144));
});

test("live controls obey their range and snapshots cannot mutate simulation state", () => {
  const runtime = new ProjectRuntime(demo);
  assert.equal(runtime.setNumber("intensity", -1), 0);
  runtime.tick();
  const points = runtime.snapshot();
  assert.deepEqual(points[0], { x: 0, y: 0, z: 0 });
  points[0]!.x = 100;
  assert.equal(runtime.snapshot()[0]!.x, 0);
  assert.equal(runtime.setNumber("intensity", 5), 4);
  runtime.tick();
  assert.notDeepEqual(runtime.snapshot()[0], { x: 0, y: 0, z: 0 });
  assert.throws(() => runtime.setNumber("intensity", Number.NaN), /finite number/);
  assert.throws(() => runtime.setNumber("missing", 1), /Unknown control/);
});

test("project loader rejects malformed and mistyped graph definitions", () => {
  assert.throws(() => new ProjectRuntime({ ...demo, schemaVersion: 2 }), /Unsupported project version/);
  assert.throws(() => new ProjectRuntime({ ...demo, nodes: [...demo.nodes, demo.nodes[0]] }), /Duplicate node/);
  assert.throws(() => new ProjectRuntime({ ...demo, edges: [] }), /Missing input/);
  assert.throws(() => new ProjectRuntime({ ...demo, edges: [...demo.edges, demo.edges[0]] }), /Multiple connections/);
  const [intensity, points] = demo.edges;
  const badConnection = { from: intensity!.from, to: points!.to };
  assert.throws(() => new ProjectRuntime({ ...demo, edges: [intensity, badConnection] }), /Incompatible connection/);
  assert.throws(() => new ProjectRuntime({ ...demo, scene: "missing" }), /Scene must reference/);
});

test("clock caps catch-up work and rejects invalid elapsed time", () => {
  const clock = new FixedClock();
  const noop = () => {};
  assert.equal(clock.advance(fixedStepSeconds / 2, noop), 0);
  assert.equal(clock.advance(fixedStepSeconds / 2, noop), 1);
  assert.equal(clock.advance(10, noop), 5);
  assert.equal(clock.advance(0, noop), 0);
  assert.throws(() => clock.advance(-1, noop), /nonnegative/);
});

test("the viewport can read positions into a reused buffer", () => {
  const runtime = new ProjectRuntime(demo);
  const positions = new Float32Array(runtime.pointCount * 3);
  runtime.tick();
  runtime.writePositions(positions);
  const first = runtime.snapshot()[0]!;
  assert.deepEqual([...positions.subarray(0, 3)], [first.x, first.y, first.z].map(Math.fround));
  runtime.tick();
  runtime.writePositions(positions);
  assert.notEqual(positions[0], Math.fround(first.x));
  assert.throws(() => runtime.writePositions(new Float32Array(3)), /too small/);
});
