import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NormalizedConfig } from "../src/config/ConfigLoader.js";
import { executeGCodeLine } from "../src/gcode/GCodeExecutor.js";
import { HomingSimulator } from "../src/machine/HomingSimulator.js";
import { MachineState } from "../src/machine/MachineState.js";
import { ProbeModel } from "../src/machine/ProbeModel.js";
import { FluidProtocol } from "../src/protocol/FluidProtocol.js";
import { BufferedOutput } from "../src/transports/BufferedOutput.js";

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
    const machine = new MachineState();
    const homing = new HomingSimulator(machine, config);

    homing.homeAxes(["x", "y"]);

    assert.deepEqual(
      homing.history().map((phase) => phase.phase),
      ["seek", "feed", "pull-off", "complete", "seek", "feed", "pull-off", "complete"]
    );
    assert.equal(machine.snapshot().machinePosition.x, 2);
    assert.equal(machine.snapshot().machinePosition.y, 97);
  });

  it("supports per-axis homing through protocol commands", () => {
    const machine = new MachineState();
    const homing = new HomingSimulator(machine, config);
    const protocol = new FluidProtocol(machine, new BufferedOutput(), { homing });

    protocol.receive("$hx\n");

    assert.equal(machine.snapshot().machinePosition.x, 2);
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
