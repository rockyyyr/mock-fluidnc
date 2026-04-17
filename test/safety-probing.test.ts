import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NormalizedConfig } from "../src/config/ConfigLoader.js";
import { executeGCodeLine } from "../src/gcode/GCodeExecutor.js";
import { HomingSimulator } from "../src/machine/HomingSimulator.js";
import { MachineState } from "../src/machine/MachineState.js";
import { ProbeModel } from "../src/machine/ProbeModel.js";
import { MotionSimulator } from "../src/motion/MotionSimulator.js";
import { FluidProtocol } from "../src/protocol/FluidProtocol.js";
import { BufferedOutput } from "../src/transports/BufferedOutput.js";
import { ManualClock } from "../src/time/Clock.js";

const config: NormalizedConfig = {
  name: "safety",
  kinematics: "Cartesian",
  kinematicsConfig: {},
  axes: {
    x: { id: "x", maxTravelMm: 100, softLimits: false, pulloffMm: 2, homing: { mposMm: 0, positiveDirection: false } },
    y: { id: "y", maxTravelMm: 100, softLimits: false, pulloffMm: 3, homing: { mposMm: 100, positiveDirection: true } }
  },
  start: { mustHome: false }
};

describe("homing, probing, and safety fidelity", () => {
  it("records homing seek, feed, pull-off, and complete phases", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock, axes: config.axes });
    const homing = new HomingSimulator(machine, config, { clock, motion });

    homing.homeAxes(["x", "y"]);

    assert.deepEqual(
      homing.history().map((phase) => phase.phase),
      ["seek", "seek", "pull-off", "pull-off", "feed", "feed", "pull-off", "pull-off", "complete", "complete"]
    );
    clock.advance(1000);
    homing.update();
    assert.ok(machine.snapshot().machinePosition.x < 0);
    assert.ok(machine.snapshot().machinePosition.y > 0);

    clock.advance(60000);
    homing.update();
    assert.equal(machine.snapshot().machinePosition.x, 0);
    assert.equal(machine.snapshot().machinePosition.y, 100);
  });

  it("supports per-axis homing through protocol commands", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock, axes: config.axes });
    const homing = new HomingSimulator(machine, config, { clock, motion });
    const protocol = new FluidProtocol(machine, new BufferedOutput(), { homing, motion });

    protocol.receive("$hx\n");

    assert.equal(machine.snapshot().state, "Home");
    clock.advance(10000);
    protocol.receive("?");
    assert.equal(machine.snapshot().machinePosition.x, 0);
    assert.equal(machine.snapshot().machinePosition.y, 0);
  });

  it("supports successful and failing virtual probe cycles", () => {
    const machine = new MachineState();
    const probe = new ProbeModel(machine, { triggerPosition: { z: -1 }, shouldTrigger: true });

    executeGCodeLine(machine, "G38.2 Z-5", { probe });
    assert.equal(machine.snapshot().probeSucceeded, true);
    assert.equal(machine.snapshot().probePosition.z, -1);

    probe.configure({ shouldTrigger: false });
    executeGCodeLine(machine, "G38.2 Z-5", { probe });
    assert.equal(machine.snapshot().state, "Alarm");
    assert.equal(machine.snapshot().alarm, "Probe fail");
  });

  it("runs probing motion through the shared motion simulator", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock });
    const probe = new ProbeModel(machine, { triggerPosition: { z: -1 }, shouldTrigger: true });

    executeGCodeLine(machine, "G38.2 Z-5 F60", { motion, probe });

    assert.equal(machine.snapshot().state, "Run");
    assert.equal(machine.snapshot().probeSucceeded, false);
    clock.advance(500);
    motion.update();
    assert.equal(machine.snapshot().state, "Run");
    assert.ok(machine.snapshot().machinePosition.z < 0);
    assert.ok(machine.snapshot().machinePosition.z > -1);

    clock.advance(2000);
    motion.update();
    probe.update();
    assert.equal(machine.snapshot().state, "Idle");
    assert.equal(machine.snapshot().probeSucceeded, true);
    assert.equal(machine.snapshot().probePosition.z, -1);
  });

  it("supports safety door, fault, and e-stop recovery behavior", () => {
    const machine = new MachineState();
    machine.openDoor();
    assert.equal(machine.snapshot().state, "Door");
    machine.closeDoor();
    assert.equal(machine.snapshot().state, "Idle");

    machine.setAlarm("Fault pin");
    machine.unlock();
    assert.equal(machine.snapshot().state, "Idle");

    machine.setAlarm("Emergency stop");
    machine.unlock();
    assert.equal(machine.snapshot().state, "Idle");
  });
});
