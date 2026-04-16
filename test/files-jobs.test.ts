import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FileJobManager } from "../src/files/FileJobManager.js";
import { VirtualFileSystem } from "../src/files/VirtualFileSystem.js";
import { MachineState } from "../src/machine/MachineState.js";
import { ParkingManager } from "../src/machine/ParkingManager.js";
import { FluidProtocol } from "../src/protocol/FluidProtocol.js";
import { BufferedOutput } from "../src/transports/BufferedOutput.js";
import { MockFluidHttpServer } from "../src/http/HttpServer.js";

describe("virtual files and jobs", () => {
  it("lists, deletes, and runs virtual SD files through the protocol", () => {
    const root = mkdtempSync(join(tmpdir(), "mock-fluidnc-files-"));
    const files = new VirtualFileSystem(root);
    files.writeSync("part.nc", "G90\nG1 X5 F60\n");
    const machine = new MachineState();
    const jobs = new FileJobManager(files, machine);
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(machine, output, { jobs });

    protocol.receive("$sd/list\n");
    assert.match(output.text(), /part\.nc/);

    protocol.receive("$sd/run=/part.nc\n");
    assert.equal(machine.snapshot().machinePosition.x, 5);
    assert.equal(jobs.snapshot().state, "completed");
    assert.equal(jobs.snapshot().progress, "SD:2/2");

    protocol.receive("$sd/delete=/part.nc\n");
    assert.deepEqual(jobs.listFiles(), []);
  });

  it("supports FluidNC long-form SD and file commands", () => {
    const root = mkdtempSync(join(tmpdir(), "mock-fluidnc-long-files-"));
    const files = new VirtualFileSystem(root);
    files.writeSync("part.nc", "G90\nG1 X6 F60\n");
    files.writeSync("notes.md", "not gcode\n");
    const machine = new MachineState();
    const jobs = new FileJobManager(files, machine);
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(machine, output, { jobs });

    protocol.receive("$SD/List\n$SD/ListJSON\n$Files/ListGcode=.\n$SD/Show=part.nc\n$File/ShowSome=1,part.nc\n$File/SendJSON=part.nc\n$File/ShowHash=part.nc\n$SD/Rename=part.nc>renamed.nc\n$SD/Run=renamed.nc\n$SD/Status\n$SD/Delete=renamed.nc\n");

    assert.equal(machine.snapshot().machinePosition.x, 6);
    assert.deepEqual(jobs.listFiles(), ["notes.md"]);
    assert.match(output.text(), /part\.nc/);
    assert.match(output.text(), /"name":"part\.nc"/);
    assert.match(output.text(), /G1 X6 F60/);
    assert.match(output.text(), /"contents":"G90\\nG1 X6 F60\\n"/);
    assert.match(output.text(), /\[HASH:[0-9a-f]{64}\]/);
    assert.match(output.text(), /\[MSG:Job completed SD:2\/2\]/);
    assert.match(output.text(), /\[SD:completed,renamed\.nc,2,2\]/);
    assert.doesNotMatch(output.text(), /Unsupported command/);
  });

  it("tracks pause, resume, cancel, and alarm lifecycle hooks", () => {
    const root = mkdtempSync(join(tmpdir(), "mock-fluidnc-files-"));
    const files = new VirtualFileSystem(root);
    const machine = new MachineState();
    const jobs = new FileJobManager(files, machine);

    files.writeSync("slow.nc", "G1 X1\nG1 X2\n");
    jobs.startFile("slow.nc");
    jobs.pause();
    assert.equal(jobs.snapshot().state, "paused");
    jobs.resume();
    assert.equal(jobs.snapshot().state, "running");
    jobs.cancel();
    assert.equal(jobs.snapshot().state, "cancelled");

    files.writeSync("bad.nc", "GARBAGE\n");
    jobs.runFile("bad.nc");
    assert.equal(jobs.snapshot().state, "alarm");
    assert.equal(machine.snapshot().state, "Alarm");
  });

  it("runs configured macros and startup blocks through the protocol engine", () => {
    const machine = new MachineState();
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(machine, output, {
      macros: {
        startupLine0: "G90",
        startupLine1: "G1 X1 F60",
        macro0: "G1 X5 F60",
        afterUnlock: "G1 Y2 F60",
        raw: {}
      }
    });

    assert.equal(protocol.runStartupBlocks().ok, true);
    assert.equal(machine.snapshot().machinePosition.x, 1);

    protocol.receive("$RM=0\n");
    assert.equal(machine.snapshot().machinePosition.x, 5);

    machine.setAlarm("Test alarm");
    protocol.receive("$x\n");
    assert.equal(machine.snapshot().machinePosition.y, 2);
  });

  it("supports HTTP file list, upload, rename, and delete workflows", async () => {
    const root = mkdtempSync(join(tmpdir(), "mock-fluidnc-http-files-"));
    const files = new VirtualFileSystem(root);
    const machine = new MachineState();
    const jobs = new FileJobManager(files, machine);
    const server = new MockFluidHttpServer({ host: "127.0.0.1", port: 0, machine, protocolOptions: { jobs } });
    await server.start();
    try {
      let response = await fetch(`${server.origin()}/upload?path=/&filename=part.nc`, { method: "POST", body: "G1 X7 F60\n" });
      assert.equal(response.status, 200);
      let json = (await response.json()) as { files: Array<{ name: string }> };
      assert.deepEqual(json.files.map((file) => file.name), ["part.nc"]);

      response = await fetch(`${server.origin()}/upload?path=/&filename=part.nc&action=rename&newname=renamed.nc`, { method: "POST" });
      assert.equal(response.status, 200);

      response = await fetch(`${server.origin()}/upload`);
      json = (await response.json()) as { files: Array<{ name: string }> };
      assert.deepEqual(json.files.map((file) => file.name), ["renamed.nc"]);

      response = await fetch(`${server.origin()}/upload?path=/&filename=renamed.nc&action=delete`, { method: "POST" });
      assert.equal(response.status, 200);
      assert.deepEqual(jobs.listFiles(), []);
    } finally {
      await server.stop();
    }
  });

  it("parks and restores the configured virtual parking axis", () => {
    const machine = new MachineState();
    machine.setMachinePosition({ x: 1, y: 2, z: 3 });
    const parking = new ParkingManager(machine, { enable: true, axis: "Z", targetMposMm: -5, raw: {} });
    const protocol = new FluidProtocol(machine, new BufferedOutput(), { parking });

    protocol.receive("$park\n");
    assert.equal(machine.snapshot().machinePosition.z, -5);

    protocol.receive("$unpark\n");
    assert.deepEqual(machine.snapshot().machinePosition, { x: 1, y: 2, z: 3 });
  });
});
