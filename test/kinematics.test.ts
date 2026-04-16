import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createKinematics } from "../src/kinematics/factory.js";
import { CoreXYKinematics, ParallelDeltaKinematics, WallPlotterKinematics } from "../src/kinematics/Kinematics.js";

describe("kinematics", () => {
  it("supports Cartesian passthrough", () => {
    const kinematics = createKinematics({ kinematics: "Cartesian", kinematicsConfig: {} });

    assert.deepEqual(kinematics.machineToMotors({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  });

  it("supports CoreXY transforms", () => {
    const kinematics = new CoreXYKinematics();
    const motors = kinematics.machineToMotors({ x: 10, y: 2, z: 3 });

    assert.deepEqual(motors, { a: 12, b: 8, z: 3 });
    assert.deepEqual(kinematics.motorsToMachine(motors), { x: 10, y: 2, z: 3 });
  });

  it("supports WallPlotter transforms", () => {
    const kinematics = new WallPlotterKinematics(100);
    const motors = kinematics.machineToMotors({ x: 50, y: 50, z: 0 });

    assert.equal(Number(motors.left.toFixed(3)), 70.711);
    assert.equal(Number(kinematics.motorsToMachine(motors).x.toFixed(3)), 50);
  });

  it("supports Midtbot and ParallelDelta factory selection", () => {
    assert.equal(createKinematics({ kinematics: "Midtbot", kinematicsConfig: {} }).name, "Midtbot");
    assert.equal(createKinematics({ kinematics: "ParallelDelta", kinematicsConfig: {} }).name, "ParallelDelta");
  });

  it("supports ParallelDelta reversible sender-visible transform", () => {
    const kinematics = new ParallelDeltaKinematics();
    const machine = kinematics.motorsToMachine(kinematics.machineToMotors({ x: 3, y: 4, z: 5 }));

    assert.equal(Number(machine.x.toFixed(3)), 3);
    assert.equal(Number(machine.y.toFixed(3)), 4);
    assert.equal(Number(machine.z.toFixed(3)), 5);
  });
});
