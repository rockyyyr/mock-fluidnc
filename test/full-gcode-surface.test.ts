import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executeGCodeLine } from "../src/gcode/GCodeExecutor.js";
import { MachineState } from "../src/machine/MachineState.js";

describe("expanded G-code surface", () => {
  it("supports dwell, plane selection, and arc center modes", () => {
    const machine = new MachineState();

    executeGCodeLine(machine, "G4 P0.1 G18 G90.1");

    assert.equal(machine.snapshot().modalState.plane, "G18");
    assert.equal(machine.snapshot().modalState.arcDistanceMode, "absolute");
  });

  it("supports coordinate system setting commands", () => {
    const machine = new MachineState();
    executeGCodeLine(machine, "G10 L2 P1 X5 Y6 Z7");

    assert.deepEqual(machine.snapshot().workCoordinateOffset, { x: 5, y: 6, z: 7 });

    machine.setMachinePosition({ x: 10, y: 20, z: 30 });
    executeGCodeLine(machine, "G10 L20 P1 X1 Y2 Z3");

    assert.deepEqual(machine.snapshot().workCoordinateOffset, { x: 9, y: 18, z: 27 });
  });

  it("supports reference position commands", () => {
    const machine = new MachineState();

    executeGCodeLine(machine, "G90 G0 X10 Y20 Z30");
    executeGCodeLine(machine, "G28.1");
    executeGCodeLine(machine, "G0 X1 Y1 Z1");
    executeGCodeLine(machine, "G28");

    assert.deepEqual(machine.snapshot().machinePosition, { x: 10, y: 20, z: 30 });
  });

  it("supports tool length offset and selected tool state", () => {
    const machine = new MachineState();

    executeGCodeLine(machine, "T4 G43.1 Z12.5");

    assert.equal(machine.snapshot().modalState.selectedTool, 4);
    assert.equal(machine.snapshot().toolLengthOffset, 12.5);

    executeGCodeLine(machine, "G49");
    assert.equal(machine.snapshot().toolLengthOffset, 0);
  });

  it("represents spindle, laser, coolant, and tool-change state as virtual state", () => {
    const machine = new MachineState();
    machine.setLaserMode(true);
    machine.setActiveSpindle("PWM");

    executeGCodeLine(machine, "S12000 M3 M8");
    assert.equal(machine.snapshot().laserMode, true);
    assert.equal(machine.snapshot().activeSpindle, "PWM");
    assert.equal(machine.snapshot().spindleDirection, "cw");
    assert.equal(machine.snapshot().spindleSpeed, 12000);
    assert.equal(machine.snapshot().airOn, true);

    executeGCodeLine(machine, "M7");
    assert.equal(machine.snapshot().mistOn, true);

    executeGCodeLine(machine, "M9 M5");
    assert.equal(machine.snapshot().airOn, false);
    assert.equal(machine.snapshot().mistOn, false);
    assert.equal(machine.snapshot().spindleDirection, "off");

    executeGCodeLine(machine, "T7 M6");
    assert.equal(machine.snapshot().modalState.selectedTool, 7);
    assert.equal(machine.snapshot().activeTool, 7);
    assert.equal(machine.snapshot().toolChangeState, "waiting");
    assert.equal(machine.snapshot().state, "Hold");

    machine.completeToolChange();
    assert.equal(machine.snapshot().toolChangeState, "complete");
    assert.equal(machine.snapshot().state, "Idle");
  });

  it("supports program flow commands", () => {
    const machine = new MachineState();

    executeGCodeLine(machine, "M0");
    assert.equal(machine.snapshot().modalState.programFlow, "paused");
    assert.equal(machine.snapshot().state, "Hold");

    executeGCodeLine(machine, "M30");
    assert.equal(machine.snapshot().modalState.programFlow, "completed-m30");
    assert.equal(machine.snapshot().state, "Idle");
  });

  it("does not move axes while check mode is active", () => {
    const machine = new MachineState();
    machine.setCheckMode(true);

    executeGCodeLine(machine, "G1 X10");

    assert.equal(machine.snapshot().machinePosition.x, 0);
    assert.equal(machine.snapshot().modalState.motionMode, "G1");
  });
});
