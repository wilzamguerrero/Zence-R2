import assert from "node:assert/strict";
import { test } from "node:test";
import demo from "../../examples/particles.zence.json" with { type: "json" };
import { FixedClock, fixedStepSeconds } from "./clock.ts";
import { compileHydraCode, ProjectRuntime, readProject } from "./project.ts";

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

test("signal.lfo and signal.math drive particles deterministically across render rates", () => {
  const patch = {
    schemaVersion: 1,
    scene: "stage",
    nodes: [
      { id: "lfo1", kind: "signal.lfo", wave: "sine", rate: 1, amplitude: 2, offset: 1 },
      { id: "math1", kind: "signal.math", op: "clamp", factor: 2.5, bias: 0.2 },
      { id: "particles", kind: "simulation.particles", seed: 7, count: 64 },
      { id: "stage", kind: "scene.points" },
    ],
    edges: [
      { from: { node: "lfo1", port: "value" }, to: { node: "math1", port: "in" } },
      { from: { node: "math1", port: "value" }, to: { node: "particles", port: "intensity" } },
      { from: { node: "particles", port: "points" }, to: { node: "stage", port: "points" } },
    ],
  };

  function run(fps: number) {
    const runtime = new ProjectRuntime(patch);
    const clock = new FixedClock();
    for (let frame = 0; frame < fps; frame += 1) {
      clock.advance(1 / fps, () => runtime.tick());
    }
    return { snap: runtime.snapshot(), numbers: runtime.getNumbers() };
  }

  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(60), run(144));
  const check = new ProjectRuntime(patch);
  assert.equal(check.getNumber("lfo1"), 1);
  assert.equal(check.getNumber("math1"), 1);
  assert.throws(
    () => new ProjectRuntime({ ...patch, nodes: [{ id: "bad", kind: "signal.lfo", wave: "noise", rate: 1, amplitude: 1, offset: 0 }] }),
    /Invalid wave/,
  );
  assert.throws(
    () => new ProjectRuntime({ ...patch, nodes: [{ id: "bad", kind: "signal.math", op: "pow", factor: 1, bias: 0 }] }),
    /Invalid op/,
  );
});

test("cables-style timer, mapRange, smooth and hydra nodes compile deterministically", () => {
  const patch = readProject({
    schemaVersion: 1,
    scene: "stage",
    nodes: [
      { id: "timer1", kind: "signal.timer", speed: 2 },
      { id: "map1", kind: "signal.mapRange", inMin: 0, inMax: 2, outMin: 1, outMax: 5, clamp: true },
      { id: "smooth1", kind: "signal.smooth", smoothing: 0.5 },
      { id: "osc1", kind: "hydra.osc", freq: 9, sync: 0.08, offset: 0.4 },
      { id: "kaleid1", kind: "hydra.kaleid", sides: 5 },
      { id: "color1", kind: "hydra.color", r: 0.68, g: 0.4, b: 0.68 },
      { id: "out1", kind: "hydra.out", buffer: "o0" },
      { id: "particles", kind: "simulation.particles", seed: 12, count: 32 },
      { id: "stage", kind: "scene.points" },
    ],
    edges: [
      { from: { node: "timer1", port: "value" }, to: { node: "map1", port: "in" } },
      { from: { node: "map1", port: "value" }, to: { node: "smooth1", port: "in" } },
      { from: { node: "smooth1", port: "value" }, to: { node: "particles", port: "intensity" } },
      { from: { node: "particles", port: "points" }, to: { node: "stage", port: "points" } },
      { from: { node: "smooth1", port: "value" }, to: { node: "osc1", port: "mod" } },
      { from: { node: "osc1", port: "tex" }, to: { node: "kaleid1", port: "tex" } },
      { from: { node: "kaleid1", port: "tex" }, to: { node: "color1", port: "tex" } },
      { from: { node: "color1", port: "tex" }, to: { node: "out1", port: "tex" } },
    ],
  });

  const runtime = new ProjectRuntime(patch);
  for (let i = 0; i < 30; i += 1) runtime.tick();
  assert.ok(runtime.getNumber("timer1")! > 0);
  assert.ok(runtime.getNumber("map1")! >= 1 && runtime.getNumber("map1")! <= 5);
  assert.ok(runtime.getNumber("smooth1")! >= 1);

  const compiled = compileHydraCode(patch);
  assert.ok(compiled);
  assert.match(compiled, /osc\(\(\) => 9 \+ control\("smooth1"\) \* 6, 0\.08, 0\.4\)/);
  assert.match(compiled, /\.kaleid\(5\)/);
  assert.match(compiled, /\.color\(0\.68, 0\.4, 0\.68\)/);
  assert.match(compiled, /\.out\(o0\)/);
});

test("mocap body, hands, skeleton rig, bone particles and merge run deterministically", () => {
  const patch = readProject({
    schemaVersion: 1,
    scene: "stage",
    nodes: [
      { id: "body1", kind: "mocap.body", mirror: true, smoothing: 0.35, scale: 1 },
      { id: "hands1", kind: "mocap.hands", smoothing: 0.4, fingers: true, spreadGain: 1.2 },
      { id: "rig1", kind: "scene.skeletonRig", showBones: true, showJoints: true, retargetModel: true, jointSize: 1.2 },
      { id: "skelPts", kind: "particles.skeleton", seed: 7, count: 64, spread: 0.15, zone: "all", attachMode: "aura" },
      { id: "ambient", kind: "simulation.particles", seed: 11, count: 32 },
      { id: "intensity", kind: "control.number", initial: 1, min: 0, max: 4 },
      { id: "merged", kind: "particles.merge" },
      { id: "stage", kind: "scene.points" },
    ],
    edges: [
      { from: { node: "body1", port: "skeleton" }, to: { node: "hands1", port: "skeleton" } },
      { from: { node: "hands1", port: "skeleton" }, to: { node: "rig1", port: "skeleton" } },
      { from: { node: "rig1", port: "skeleton" }, to: { node: "skelPts", port: "skeleton" } },
      { from: { node: "intensity", port: "value" }, to: { node: "ambient", port: "intensity" } },
      { from: { node: "skelPts", port: "points" }, to: { node: "merged", port: "a" } },
      { from: { node: "ambient", port: "points" }, to: { node: "merged", port: "b" } },
      { from: { node: "merged", port: "points" }, to: { node: "stage", port: "points" } },
    ],
  });

  const runtime = new ProjectRuntime(patch);
  assert.equal(runtime.pointCount, 96);
  runtime.setExternalMocap({
    activity: 0.75,
    handOpen: 0.5,
    segmentsByZone: {
      all: [[{ x: 1, y: 2, z: 0 }, { x: 1, y: 3, z: 0 }]],
    },
  });
  for (let i = 0; i < 10; i += 1) runtime.tick();
  assert.equal(runtime.getNumber("body1"), 0.75);
  assert.ok(Math.abs(runtime.getNumber("hands1")! - 0.6) < 1e-6);
  const snap = runtime.snapshot();
  assert.equal(snap.length, 96);
  assert.ok(snap[0].y >= 1.5 && snap[0].y <= 3.5);
});
