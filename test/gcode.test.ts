import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MachineState } from "../src/machine/MachineState.js";
import { executeGCodeLine } from "../src/gcode/GCodeExecutor.js";
import { parseGCodeLine } from "../src/gcode/GCodeParser.js";

describe("G-code parser", () => {
  it("parses line numbers, comments, and checksums", () => {
    const parsed = parseGCodeLine("N10 G1 X1.5 Y-2.0 (move) *42 ; ignored");

    assert.equal(parsed.lineNumber, 10);
    assert.equal(parsed.checksum, 42);
    assert.deepEqual(
      parsed.words.map((word) => word.raw.toUpperCase()),
      ["G1", "X1.5", "Y-2.0"]
    );
  });

  it("updates modal state, feed, spindle, coolant, and endpoint position", () => {
    const machine = new MachineState();

    assert.equal(executeGCodeLine(machine, "G21 G91 G1 X2 F300 M3 S12000 M8").handled, true);

    const snapshot = machine.snapshot();
    assert.equal(snapshot.modalState.units, "mm");
    assert.equal(snapshot.modalState.distanceMode, "relative");
    assert.equal(snapshot.modalState.motionMode, "G1");
    assert.equal(snapshot.feedRate, 300);
    assert.equal(snapshot.spindleSpeed, 12000);
    assert.equal(snapshot.airOn, true);
    assert.equal(snapshot.machinePosition.x, 2);
  });

  it("supports coordinate system selection and G92 offsets", () => {
    const machine = new MachineState();

    executeGCodeLine(machine, "G55 G90 G0 X10 Y20 Z30");
    executeGCodeLine(machine, "G92 X1 Y2 Z3");

    const snapshot = machine.snapshot();
    assert.equal(snapshot.modalState.coordinateSystem, "G55");
    assert.deepEqual(snapshot.workCoordinateOffset, { x: 9, y: 18, z: 27 });
    assert.deepEqual(snapshot.workPosition, { x: 1, y: 2, z: 3, a: undefined, b: undefined, c: undefined });
  });

  it("returns parser errors for malformed G-code", () => {
    const machine = new MachineState();

    const result = executeGCodeLine(machine, "GARBAGE");

    assert.equal(result.handled, false);
    assert.equal(result.error, "Unsupported or malformed G-code word");
  });
});
