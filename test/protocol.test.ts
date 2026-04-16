import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MachineState } from "../src/machine/MachineState.js";
import { MotionSimulator } from "../src/motion/MotionSimulator.js";
import { FluidProtocol } from "../src/protocol/FluidProtocol.js";
import type { ProtocolTrafficEvent } from "../src/protocol/types.js";
import { ManualClock } from "../src/time/Clock.js";
import { BufferedOutput } from "../src/transports/BufferedOutput.js";

describe("FluidProtocol", () => {
  it("writes a simulator greeting", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    protocol.writeGreeting();

    assert.match(output.text(), /Mock FluidNC simulator/);
  });

  it("reports status for realtime status queries", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    protocol.receive("?");

    assert.equal(
      output.text(),
      "<Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000|Ov:100,100,100>\r\n"
    );
  });

  it("reports current motion feedrate in status reports", () => {
    const output = new BufferedOutput();
    const clock = new ManualClock();
    const machine = new MachineState();
    const motion = new MotionSimulator(machine, {
      clock,
      axes: {
        x: { id: "x", accelerationMmPerSec2: 10, softLimits: false }
      }
    });
    const protocol = new FluidProtocol(machine, output, { motion });

    protocol.receive("G1 F600 X20\n");
    protocol.receive("?\n");
    clock.advance(500);
    protocol.receive("?\n");
    clock.advance(2500);
    protocol.receive("?\n");

    const reports = output
      .text()
      .split(/\r?\n/)
      .filter((line) => line.startsWith("<"));
    assert.deepEqual(reports, [
      "<Run|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000|Ov:100,100,100>",
      "<Run|MPos:1.250,0.000,0.000|FS:300,0|WCO:0.000,0.000,0.000|Ov:100,100,100>",
      "<Idle|MPos:20.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000|Ov:100,100,100>"
    ]);
  });

  it("honors FluidNC report status masks for MPos, WPos, and buffer fields", () => {
    const output = new BufferedOutput();
    const machine = new MachineState();
    const protocol = new FluidProtocol(machine, output);
    machine.setMachinePosition({ x: 10, y: 20, z: 30 });
    machine.setWorkCoordinateOffset({ x: 1, y: 2, z: 3 });

    protocol.receive("$10=0\n?\n$10=1\n?\n$Report/Status=2\n?\n$10=3\n?\n");

    const reports = output
      .text()
      .split(/\r?\n/)
      .filter((line) => line.startsWith("<"));
    assert.deepEqual(reports, [
      "<Idle|WPos:9.000,18.000,27.000|FS:0,0|WCO:1.000,2.000,3.000|Ov:100,100,100>",
      "<Idle|MPos:10.000,20.000,30.000|FS:0,0|WCO:1.000,2.000,3.000|Ov:100,100,100>",
      "<Idle|WPos:9.000,18.000,27.000|Bf:15,128|FS:0,0|WCO:1.000,2.000,3.000|Ov:100,100,100>",
      "<Idle|MPos:10.000,20.000,30.000|Bf:15,128|FS:0,0|WCO:1.000,2.000,3.000|Ov:100,100,100>"
    ]);
  });

  it("dispatches basic gcode lines with ok", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    protocol.receive("G0 X1\n");

    assert.equal(output.text(), "ok\r\n");
  });

  it("handles every target UI command without corrupting realtime bytes", () => {
    const output = new BufferedOutput();
    const machine = new MachineState();
    const protocol = new FluidProtocol(machine, output);

    protocol.receive("$x\n");
    protocol.receive("$h\n");
    assert.equal(machine.snapshot().state, "Home");
    assert.match(output.text(), /\[MSG:Homing started\]/);
    assert.doesNotMatch(output.text(), /not implemented/i);

    protocol.receive("$J=G91 X1 F100\n");
    assert.equal(machine.snapshot().state, "Jog");

    protocol.receive(Buffer.from([0x10]));
    assert.equal(machine.snapshot().state, "Idle");

    protocol.receive("$md\n");
    assert.equal(machine.snapshot().motorEnabled, false);

    protocol.receive("$me\n");
    assert.equal(machine.snapshot().motorEnabled, true);

    protocol.receive(Buffer.from([0x91, 0x92, 0x90]));
    assert.equal(machine.snapshot().feedrateOverride, 100);

    protocol.receive(Buffer.from([0x9a, 0x9b, 0x99]));
    assert.equal(machine.snapshot().spindleOverride, 100);

    protocol.receive(Buffer.from([0x9e]));
    assert.equal(machine.snapshot().spindleStopped, true);

    protocol.receive(Buffer.from([0xa0, 0xa1]));
    assert.equal(machine.snapshot().airOn, true);
    assert.equal(machine.snapshot().mistOn, true);

    protocol.receive(Buffer.from([0x84]));
    assert.equal(machine.snapshot().state, "Alarm");
    assert.equal(machine.snapshot().alarm, "Emergency stop");

    protocol.receive(Buffer.from([0x18]));
    assert.equal(machine.snapshot().state, "Idle");
  });

  it("acknowledges each jog command exactly once", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    protocol.receive("$J=G91 G21 X5 F40000\n");

    assert.equal(output.text(), "ok\r\n");
  });

  it("supports FluidNC long-form motion and motor aliases", () => {
    const output = new BufferedOutput();
    const machine = new MachineState();
    const protocol = new FluidProtocol(machine, output);

    protocol.receive("$Home\n");
    assert.equal(machine.snapshot().state, "Home");

    protocol.receive("$Jog=G91 X2 F100\n");
    assert.equal(machine.snapshot().state, "Jog");

    protocol.receive("$Motor/Disable\n");
    assert.equal(machine.snapshot().motorEnabled, false);

    protocol.receive("$Motor/Enable\n");
    assert.equal(machine.snapshot().motorEnabled, true);

    protocol.receive("$Alarm/Send=7\n");
    assert.equal(machine.snapshot().state, "Alarm");
    assert.equal(machine.snapshot().alarm, "Alarm 7");

    protocol.receive("$Alarm/Disable\n");
    assert.equal(machine.snapshot().state, "Idle");
    assert.doesNotMatch(output.text(), /Unsupported command/);
  });

  it("fails unsupported dollar commands instead of silently accepting them", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    protocol.receive("$unsupported\n");

    assert.equal(output.text(), "error:Unsupported command ($unsupported)\r\n");
  });

  it("includes unsupported raw bytes in protocol errors", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    protocol.receive(Buffer.from([0xfa]));

    assert.equal(output.text(), "error:Unsupported command (0xfa)\r\n");
  });

  it("formats control characters in unsupported line command errors", () => {
    const protocol = new FluidProtocol(new MachineState(), new BufferedOutput());

    assert.deepEqual(protocol.executeLine("BAD\tCMD"), {
      ok: false,
      lines: ["error:Unsupported command (BAD0x09CMD)"]
    });
  });

  it("fails subsystem commands when the backing simulator is unavailable", () => {
    const protocol = new FluidProtocol(new MachineState(), new BufferedOutput());

    assert.deepEqual(protocol.executeLine("$sd/list"), {
      ok: false,
      lines: ["error:Virtual file system unavailable"]
    });
    assert.deepEqual(protocol.executeLine("$park"), {
      ok: false,
      lines: ["error:Parking unavailable"]
    });
  });

  it("emits automatic status reports after report interval commands", async () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    try {
      protocol.receive("$ri=1\n");

      await waitFor(() => statusReportCount(output.text()) >= 2);

      assert.match(output.text(), /ok\r\n<Idle\|/);
      assert.equal(statusReportCount(output.text()) >= 2, true);
    } finally {
      protocol.dispose();
    }
  });

  it("omits buffer fields from automatic reports when report status mask is 0", async () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    try {
      protocol.receive("$10=0\n$ri=1\n");

      await waitFor(() => statusReportCount(output.text()) >= 2);

      const reports = output
        .text()
        .split(/\r?\n/)
        .filter((line) => line.startsWith("<"));
      assert.equal(reports.length >= 2, true);
      assert.equal(reports.every((line) => line.includes("|WPos:")), true);
      assert.equal(reports.every((line) => !line.includes("|Bf:")), true);
    } finally {
      protocol.dispose();
    }
  });

  it("logs command traffic without logging automatic status reports", async () => {
    const output = new BufferedOutput();
    const traffic: ProtocolTrafficEvent[] = [];
    const protocol = new FluidProtocol(new MachineState(), output, {
      channelName: "test",
      trafficLogger: (event) => traffic.push(event)
    });

    try {
      protocol.receive("$J=G91 G21 X5 F40000\n");
      protocol.receive("$ri=1\n");

      await waitFor(() => statusReportCount(output.text()) >= 2);

      assert.deepEqual(traffic, [
        { channel: "test", direction: "rx", data: "$J=G91 G21 X5 F40000" },
        { channel: "test", direction: "tx", data: "ok" },
        { channel: "test", direction: "rx", data: "$ri=1" },
        { channel: "test", direction: "tx", data: "ok" }
      ]);
    } finally {
      protocol.dispose();
    }
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(predicate(), true);
}

function statusReportCount(text: string): number {
  return [...text.matchAll(/<[A-Za-z]+\|/g)].length;
}
