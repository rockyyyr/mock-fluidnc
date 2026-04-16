import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MachineState } from "../src/machine/MachineState.js";
import { formatStatus } from "../src/protocol/status.js";

describe("formatStatus", () => {
  it("includes position, buffer, feed, offset, override, and accessory state", () => {
    const machine = new MachineState();
    machine.setMachinePosition({ x: 1, y: 2, z: 3 });
    machine.setWorkCoordinateOffset({ x: 0.5, y: 0.25, z: 0 });
    machine.setPlannerSummary(12, 64);
    machine.toggleAir();
    machine.toggleMist();

    assert.equal(
      formatStatus(machine.snapshot()),
      "<Idle|MPos:1.000,2.000,3.000|Bf:12,64|FS:0,0|WCO:0.500,0.250,0.000|Ov:100,100,100|A:FM>"
    );
  });

  it("derives work position in the machine snapshot", () => {
    const machine = new MachineState();
    machine.setMachinePosition({ x: 10, y: 20, z: 30 });
    machine.setWorkCoordinateOffset({ x: 1, y: 2, z: 3 });

    assert.deepEqual(machine.snapshot().workPosition, { x: 9, y: 18, z: 27, a: undefined, b: undefined, c: undefined });
  });

  it("formats FluidNC status mask position and buffer variants", () => {
    const machine = new MachineState();
    machine.setMachinePosition({ x: 10, y: 20, z: 30 });
    machine.setWorkCoordinateOffset({ x: 1, y: 2, z: 3 });

    assert.match(formatStatus(machine.snapshot(), { statusMask: 0 }), /^<Idle\|WPos:9\.000,18\.000,27\.000\|FS:0,0/);
    assert.match(formatStatus(machine.snapshot(), { statusMask: 1 }), /^<Idle\|MPos:10\.000,20\.000,30\.000\|FS:0,0/);
    assert.match(formatStatus(machine.snapshot(), { statusMask: 2 }), /^<Idle\|WPos:9\.000,18\.000,27\.000\|Bf:15,128\|FS:0,0/);
    assert.match(formatStatus(machine.snapshot(), { statusMask: 3 }), /^<Idle\|MPos:10\.000,20\.000,30\.000\|Bf:15,128\|FS:0,0/);
  });
});
