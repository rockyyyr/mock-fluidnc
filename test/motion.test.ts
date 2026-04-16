import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MachineState } from "../src/machine/MachineState.js";
import { MotionSimulator } from "../src/motion/MotionSimulator.js";
import { ManualClock } from "../src/time/Clock.js";
import { executeGCodeLine } from "../src/gcode/GCodeExecutor.js";

describe("MotionSimulator", () => {
  it("simulates linear movement over deterministic time", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock });

    machine.setFeedRate(60);
    motion.planLinear({ x: 1, y: 0, z: 0 });

    assert.equal(machine.snapshot().state, "Run");
    clock.advance(500);
    motion.update();
    assert.ok(Math.abs(machine.snapshot().machinePosition.x - 0.5) < 0.002);

    clock.advance(502);
    motion.update();
    assert.equal(machine.snapshot().machinePosition.x, 1);
    assert.equal(machine.snapshot().state, "Idle");
  });

  it("simulates arc endpoint movement over deterministic time", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock });

    machine.setFeedRate(60);
    motion.planArc({ x: 1, y: 0, z: 0 });

    clock.advance(1102);
    motion.update();
    assert.equal(machine.snapshot().machinePosition.x, 1);
  });

  it("applies feedrate overrides to planned movement", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock });

    machine.setFeedRate(60);
    machine.increaseFeedrateOverride();
    motion.planLinear({ x: 1, y: 0, z: 0 });

    clock.advance(500);
    motion.update();
    assert.ok(machine.snapshot().machinePosition.x > 0.5);
  });

  it("tracks current feedrate through acceleration, cruise, deceleration, and idle", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: { id: "x", accelerationMmPerSec2: 10, softLimits: false }
      }
    });

    machine.setFeedRate(600);
    motion.planLinear({ x: 20, y: 0, z: 0 });
    assert.equal(machine.snapshot().currentFeedRate, 0);

    clock.advance(500);
    motion.update();
    assert.equal(Math.round(machine.snapshot().currentFeedRate), 300);

    clock.advance(500);
    motion.update();
    assert.equal(Math.round(machine.snapshot().currentFeedRate), 600);

    clock.advance(1000);
    motion.update();
    assert.equal(Math.round(machine.snapshot().currentFeedRate), 600);

    clock.advance(500);
    motion.update();
    assert.equal(Math.round(machine.snapshot().currentFeedRate), 300);

    clock.advance(500);
    motion.update();
    assert.equal(machine.snapshot().state, "Idle");
    assert.equal(machine.snapshot().currentFeedRate, 0);
  });

  it("uses configured axis max rate for rapid moves", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        y: { id: "y", maxRateMmPerMin: 24000, accelerationMmPerSec2: 10000, softLimits: false }
      }
    });

    executeGCodeLine(machine, "G0 Y300", { motion });
    clock.advance(100);
    motion.update();

    assert.equal(Math.round(machine.snapshot().currentFeedRate), 24000);
  });

  it("caps diagonal rapid moves by the slowest participating axis", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: { id: "x", maxRateMmPerMin: 11000, accelerationMmPerSec2: 1000000, softLimits: false },
        y: { id: "y", maxRateMmPerMin: 24000, accelerationMmPerSec2: 1000000, softLimits: false }
      }
    });

    executeGCodeLine(machine, "G0 X100 Y100", { motion });
    clock.advance(100);
    motion.update();

    assert.equal(Math.round(machine.snapshot().currentFeedRate), 15556);
  });

  it("caps diagonal feed moves by configured axis max rates", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: { id: "x", maxRateMmPerMin: 11000, accelerationMmPerSec2: 1000000, softLimits: false },
        y: { id: "y", maxRateMmPerMin: 24000, accelerationMmPerSec2: 1000000, softLimits: false }
      }
    });

    executeGCodeLine(machine, "G1 F24000 X100 Y100", { motion });
    clock.advance(100);
    motion.update();

    assert.equal(Math.round(machine.snapshot().currentFeedRate), 15556);
  });

  it("scales diagonal acceleration so no axis exceeds its acceleration limit", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: { id: "x", maxRateMmPerMin: 100000, accelerationMmPerSec2: 1000, softLimits: false },
        y: { id: "y", maxRateMmPerMin: 100000, accelerationMmPerSec2: 2400, softLimits: false }
      }
    });

    executeGCodeLine(machine, "G1 F60000 X100 Y100", { motion });
    clock.advance(100);
    motion.update();

    assert.equal(Math.round(machine.snapshot().currentFeedRate), 8485);
  });

  it("reports zero current feedrate while held", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock });

    machine.setFeedRate(60);
    motion.planLinear({ x: 2 });
    clock.advance(500);
    motion.hold();

    assert.equal(machine.snapshot().state, "Hold");
    assert.equal(machine.snapshot().currentFeedRate, 0);
  });

  it("validates soft limits", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: { id: "x", maxTravelMm: 1, softLimits: true }
      }
    });

    assert.equal(motion.planLinear({ x: 2 }), false);
    assert.equal(machine.snapshot().state, "Alarm");
  });

  it("constrains jogs to soft limits instead of alarming", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: {
          id: "x",
          maxTravelMm: 10,
          maxRateMmPerMin: 600,
          accelerationMmPerSec2: 1000,
          softLimits: true,
          homing: { positiveDirection: false, mposMm: 0 }
        }
      }
    });

    machine.setFeedRate(600);
    assert.equal(motion.planLinearAs({ x: 20 }, "Jog"), true);

    clock.advance(2000);
    motion.update();

    assert.equal(machine.snapshot().state, "Idle");
    assert.equal(machine.snapshot().alarm, undefined);
    assert.equal(machine.snapshot().machinePosition.x, 10);
  });

  it("cancels jog axes that are already outside soft limits and moving farther out", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    machine.setMachinePosition({ x: 12 });
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: {
          id: "x",
          maxTravelMm: 10,
          maxRateMmPerMin: 600,
          accelerationMmPerSec2: 1000,
          softLimits: true,
          homing: { positiveDirection: false, mposMm: 0 }
        }
      }
    });

    machine.setFeedRate(600);
    assert.equal(motion.planLinearAs({ x: 13 }, "Jog"), false);

    motion.update();

    assert.equal(machine.snapshot().state, "Idle");
    assert.equal(machine.snapshot().alarm, undefined);
    assert.equal(machine.snapshot().machinePosition.x, 12);
  });

  it("uses FluidNC homing direction when calculating soft-limit bounds", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: {
          id: "x",
          maxTravelMm: 10,
          maxRateMmPerMin: 600,
          accelerationMmPerSec2: 1000,
          softLimits: true,
          homing: { positiveDirection: true, mposMm: 0 }
        }
      }
    });

    machine.setFeedRate(600);
    assert.equal(motion.planLinearAs({ x: -20 }, "Jog"), true);

    clock.advance(2000);
    motion.update();

    assert.equal(machine.snapshot().state, "Idle");
    assert.equal(machine.snapshot().alarm, undefined);
    assert.equal(machine.snapshot().machinePosition.x, -10);
  });

  it("can be driven through G-code execution", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock });

    executeGCodeLine(machine, "G1 F60 X1", { motion });
    clock.advance(1002);
    motion.update();

    assert.equal(machine.snapshot().machinePosition.x, 1);
  });
});
