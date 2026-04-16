import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MachineState } from "../src/machine/MachineState.js";
import { MotionSimulator } from "../src/motion/MotionSimulator.js";
import { ManualClock } from "../src/time/Clock.js";
import { FluidProtocol } from "../src/protocol/FluidProtocol.js";
import { BufferedOutput } from "../src/transports/BufferedOutput.js";

describe("planner and motion fidelity", () => {
  it("models acceleration and deceleration in movement duration", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    machine.setFeedRate(60);
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: { id: "x", accelerationMmPerSec2: 1, softLimits: false }
      }
    });

    motion.planLinear({ x: 1 });
    clock.advance(1002);
    motion.update();

    assert.ok(machine.snapshot().machinePosition.x < 1);
  });

  it("models feed hold deceleration and resume as a paused motion", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    machine.setFeedRate(60);
    const motion = new MotionSimulator(machine, { clock });
    const protocol = new FluidProtocol(machine, new BufferedOutput(), { motion });

    motion.planLinear({ x: 2 });
    clock.advance(500);
    protocol.receive("!");
    const heldX = machine.snapshot().machinePosition.x;
    assert.equal(machine.snapshot().state, "Hold");

    clock.advance(5000);
    motion.update();
    assert.equal(machine.snapshot().machinePosition.x, heldX);

    protocol.receive("~");
    clock.advance(2000);
    motion.update();
    assert.equal(machine.snapshot().machinePosition.x, 2);
    assert.equal(machine.snapshot().state, "Idle");
  });

  it("models planner buffer availability in status reports", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    machine.setFeedRate(60);
    const motion = new MotionSimulator(machine, { clock });
    const protocol = new FluidProtocol(machine, new BufferedOutput(), { motion });

    motion.planLinear({ x: 1 });
    assert.equal(machine.snapshot().plannerBlocksAvailable, 14);

    clock.advance(1002);
    motion.update();
    assert.equal(machine.snapshot().plannerBlocksAvailable, 15);
  });

  it("keeps numeric precision stable", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    machine.setFeedRate(120);
    const motion = new MotionSimulator(machine, { clock });

    motion.planLinear({ x: 1 / 3 });
    clock.advance(1000);
    motion.update();

    assert.equal(Number(machine.snapshot().machinePosition.x.toFixed(3)), 0.333);
  });
});
