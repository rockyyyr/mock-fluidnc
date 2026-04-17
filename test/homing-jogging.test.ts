import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NormalizedConfig } from "../src/config/ConfigLoader.js";
import { HomingSimulator } from "../src/machine/HomingSimulator.js";
import { MachineState } from "../src/machine/MachineState.js";
import { FluidProtocol } from "../src/protocol/FluidProtocol.js";
import { BufferedOutput } from "../src/transports/BufferedOutput.js";
import { MotionSimulator } from "../src/motion/MotionSimulator.js";
import { ManualClock } from "../src/time/Clock.js";

const config: NormalizedConfig = {
  name: "test",
  kinematics: "Cartesian",
  kinematicsConfig: {},
  axes: {
    x: { id: "x", maxTravelMm: 300, softLimits: false, homing: { mposMm: 10 } },
    y: { id: "y", maxTravelMm: 300, softLimits: false, homing: { mposMm: 20 } },
    z: { id: "z", maxTravelMm: 100, softLimits: false, homing: { mposMm: 30 } }
  },
  start: { mustHome: true }
};

describe("homing and jogging", () => {
  it("applies startup alarm when homing is required", () => {
    const machine = new MachineState();
    new HomingSimulator(machine, config).applyStartupAlarm();

    assert.equal(machine.snapshot().state, "Alarm");
    assert.equal(machine.snapshot().alarm, "Homing required");
  });

  it("homes all axes to configured virtual positions", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock, axes: config.axes });
    const homing = new HomingSimulator(machine, config, { clock, motion });

    homing.applyStartupAlarm();
    homing.homeAll();

    assert.equal(machine.snapshot().state, "Home");
    clock.advance(1000);
    homing.update();
    assert.equal(machine.snapshot().state, "Home");
    assert.ok(machine.snapshot().machinePosition.x > 0);
    assert.ok(machine.snapshot().machinePosition.x < 10);

    clock.advance(30000);
    homing.update();
    assert.equal(machine.snapshot().state, "Idle");
    assert.deepEqual(machine.snapshot().machinePosition, { x: 10, y: 20, z: 30 });
  });

  it("executes homing commands through the protocol", () => {
    const output = new BufferedOutput();
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock, axes: config.axes });
    const homing = new HomingSimulator(machine, config, { clock, motion });
    const protocol = new FluidProtocol(machine, output, { homing, motion });

    protocol.receive("$h\n");

    assert.equal(machine.snapshot().state, "Home");
    assert.match(output.text(), /\[MSG:Homing started\]/);
    clock.advance(30000);
    protocol.receive("?");
    assert.equal(machine.snapshot().state, "Idle");
    assert.deepEqual(machine.snapshot().machinePosition, { x: 10, y: 20, z: 30 });
    assert.match(output.text(), /\[MSG:Homing complete\]/);
    assert.doesNotMatch(output.text(), /not implemented/i);
  });

  it("executes per-axis homing commands through the protocol", () => {
    const output = new BufferedOutput();
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock, axes: config.axes });
    const homing = new HomingSimulator(machine, config, { clock, motion });
    const protocol = new FluidProtocol(machine, output, { homing, motion });

    protocol.receive("$hX\n");

    assert.equal(machine.snapshot().state, "Home");
    clock.advance(15000);
    protocol.receive("?");
    assert.equal(machine.snapshot().state, "Idle");
    assert.equal(machine.snapshot().machinePosition.x, 10);
    assert.equal(machine.snapshot().machinePosition.y, 0);
    assert.match(output.text(), /\[MSG:Homing X complete\]/);
    assert.doesNotMatch(output.text(), /not implemented/i);
  });

  it("reports homing feedrate through the shared motion simulator", () => {
    const output = new BufferedOutput();
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, { clock, axes: config.axes });
    const homing = new HomingSimulator(machine, config, { clock, motion });
    const protocol = new FluidProtocol(machine, output, { homing, motion });

    protocol.receive("$hX\n");
    clock.advance(500);
    protocol.receive("?");

    assert.equal(machine.snapshot().state, "Home");
    assert.match(output.text(), /\|FS:[1-9]\d*,0\|/);
  });

  it("executes jog commands through the protocol and waits for completion", () => {
    const clock = new ManualClock();
    const machine = new MachineState();
    machine.setFeedRate(60);
    const motion = new MotionSimulator(machine, { clock });
    const protocol = new FluidProtocol(machine, new BufferedOutput(), { motion });

    protocol.receive("$J=G91 X1 F60\n");
    assert.equal(machine.snapshot().state, "Jog");

    clock.advance(1100);
    protocol.receive(Buffer.from([0x10]));

    assert.equal(machine.snapshot().state, "Idle");
    assert.equal(machine.snapshot().machinePosition.x, 1);
  });

  it("treats jog commands as feed moves with the requested F word", () => {
    const output = new BufferedOutput();
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        y: { id: "y", maxRateMmPerMin: 24000, accelerationMmPerSec2: 10000, softLimits: false }
      }
    });
    const protocol = new FluidProtocol(machine, output, { motion });

    protocol.receive("$J=G91 G21 Y-300 F1000\n");
    clock.advance(100);
    protocol.receive("?");

    assert.equal(machine.snapshot().state, "Jog");
    assert.match(output.text(), /\|FS:1000,0\|/);
    assert.doesNotMatch(output.text(), /\|FS:3000,0\|/);
    assert.doesNotMatch(output.text(), /\|FS:24000,0\|/);
  });
});
