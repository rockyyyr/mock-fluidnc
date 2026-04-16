import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadConfig } from "../src/config/ConfigLoader.js";
import { MachineState } from "../src/machine/MachineState.js";
import { FluidProtocol } from "../src/protocol/FluidProtocol.js";
import { formatFluidNcTerminalStartup, fluidNcGreetingLine } from "../src/protocol/terminalOutput.js";
import { BufferedOutput } from "../src/transports/BufferedOutput.js";

describe("FluidNC-style terminal output", () => {
  it("formats the standard FluidNC greeting line", () => {
    assert.equal(fluidNcGreetingLine(), "Grbl 1.1f [FluidNC mock-fluidnc 0.1.0 (node-simulator) '$' for help]");
  });

  it("includes config, machine, transport, and inert hardware log lines", async () => {
    const config = await loadConfig(resolve("../Source/config.example.yaml"));
    const lines = formatFluidNcTerminalStartup(config, {
      workspace: "/tmp/mock-fluidnc",
      tcpHost: "127.0.0.1",
      tcpPort: 4000,
      httpHost: "127.0.0.1",
      httpPort: 8080,
      wsPort: 8081,
      stdio: false,
      serialEnabled: true,
      serialPath: "/dev/ttys123"
    });

    assert.ok(lines.includes("Grbl 1.1f [FluidNC mock-fluidnc 0.1.0 (node-simulator) '$' for help]"));
    assert.ok(lines.includes("[MSG:INFO: Machine 6 Pack StepStick XYZABC]"));
    assert.ok(lines.includes("[MSG:INFO: Board 6 Pack]"));
    assert.ok(lines.includes("[MSG:INFO: Kinematic system: Cartesian]"));
    assert.ok(lines.includes("[MSG:INFO: TCP command stream 127.0.0.1:4000]"));
    assert.ok(lines.includes("[MSG:INFO: HTTP started on http://127.0.0.1:8080]"));
    assert.ok(lines.includes("[MSG:INFO: WebSocket channel ws://127.0.0.1:8081]"));
    assert.ok(lines.includes("[MSG:INFO: macOS virtual serial path /dev/ttys123]"));
    assert.ok(lines.some((line) => line.includes("[MSG:WARN: Accepted hardware-related config section 'i2so'")));
  });

  it("reports the same startup log through $SS", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output, {
      startupLog: () => ["[MSG:INFO: FluidNC startup line]", "[MSG:INFO: Machine Test]"]
    });

    protocol.receive("$SS\n");

    assert.match(output.text(), /\[MSG:INFO: FluidNC startup line\]/);
    assert.match(output.text(), /\[MSG:INFO: Machine Test\]/);
  });
});
