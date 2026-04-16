import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileJobManager } from "../src/files/FileJobManager.js";
import { VirtualFileSystem } from "../src/files/VirtualFileSystem.js";
import { MachineState } from "../src/machine/MachineState.js";
import { FluidProtocol } from "../src/protocol/FluidProtocol.js";
import { BufferedOutput } from "../src/transports/BufferedOutput.js";

describe("compatibility golden tests", () => {
  it("matches the baseline status report shape", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    protocol.receive("?");

    assert.equal(output.text(), "<Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000|Ov:100,100,100>\r\n");
  });

  it("matches baseline command report responses", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    protocol.receive("$$\n$I\n$G\n$#\n$CMD\n");

    assert.match(output.text(), /\$10=1/);
    assert.match(output.text(), /\[VER:Mock FluidNC 0\.1\.0\]/);
    assert.match(output.text(), /\[GC:G0 G54 G17 G21 G90 G91\.1 G94 M5 M9 T0 F0 S0\]/);
    assert.match(output.text(), /\[G54:0\.000,0\.000,0\.000\]/);
    assert.match(output.text(), /\[CMD:SD\/Run\]/);
  });

  it("matches baseline file job lifecycle output", () => {
    const root = mkdtempSync(join(tmpdir(), "mock-fluidnc-golden-"));
    const files = new VirtualFileSystem(root);
    files.writeSync("part.nc", "G90\nG1 X1\n");
    const machine = new MachineState();
    const jobs = new FileJobManager(files, machine);
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(machine, output, { jobs });

    protocol.receive("$sd/run=/part.nc\n");

    assert.match(output.text(), /\[MSG:Job completed SD:2\/2\]/);
    assert.equal(machine.snapshot().machinePosition.x, 1);
  });
});
