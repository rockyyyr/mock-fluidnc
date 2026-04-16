import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSimulator } from "../src/app.js";

describe("createSimulator", () => {
  it("loads config.yaml and persists settings.json inside an explicit workspace", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "mock-fluidnc-workspace-"));
    writeFileSync(
      join(workspace, "config.yaml"),
      `name: Workspace Machine
axes:
  x:
    max_travel_mm: 42
`,
      "utf8"
    );

    const simulator = await createSimulator({ workspace, tcpPort: 0, httpPort: 0, wsPort: 0 });

    assert.ok(simulator.startupLog().some((line) => line.includes("Machine Workspace Machine")));
    assert.ok(simulator.startupLog().some((line) => line.includes(`Configuration file:${join(workspace, "config.yaml")}`)));

    await simulator.stop();

    assert.equal(existsSync(join(workspace, "settings.json")), true);
  });

  it("serves workspace config.yaml through the app HTTP server", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "mock-fluidnc-workspace-"));
    const configYaml = `name: Served Workspace Machine
axes:
  x:
    max_travel_mm: 42
`;
    writeFileSync(join(workspace, "config.yaml"), configYaml, "utf8");
    const httpPort = await unusedPort();
    const simulator = await createSimulator({ workspace, tcpPort: 0, httpPort, wsPort: 0 });

    await simulator.start();
    try {
      const response = await fetch(`http://127.0.0.1:${httpPort}/config.yaml`);

      assert.equal(response.status, 200);
      assert.equal(await response.text(), configYaml);
    } finally {
      await simulator.stop();
    }
  });

  it("uses the default config when workspace config.yaml is missing", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "mock-fluidnc-workspace-"));
    const simulator = await createSimulator({ workspace, tcpPort: 0, httpPort: 0, wsPort: 0 });

    assert.ok(simulator.startupLog().some((line) => line.includes("Using default configuration")));
    assert.ok(simulator.startupLog().some((line) => line.includes("Machine Mock FluidNC")));

    await simulator.stop();
  });

  it("loads $10=0 from workspace settings for app-level status reports", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "mock-fluidnc-workspace-"));
    writeFileSync(
      join(workspace, "settings.json"),
      JSON.stringify({
        grbl: { "10": "0" },
        named: {},
        startupLines: ["", ""],
        reportIntervalMs: 200
      }),
      "utf8"
    );
    const httpPort = await unusedPort();
    const simulator = await createSimulator({ workspace, tcpPort: 0, httpPort, wsPort: 0 });

    await simulator.start();
    try {
      const response = await fetch(`http://127.0.0.1:${httpPort}/command?cmd=?`);
      const body = await response.text();

      assert.match(body, /^<Idle\|WPos:/);
      assert.doesNotMatch(body, /\|Bf:/);
    } finally {
      await simulator.stop();
    }
  });
});

function unusedPort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!address || typeof address === "string") {
          reject(new Error("No TCP port was assigned"));
          return;
        }
        resolve(address.port);
      });
    });
  });
}
