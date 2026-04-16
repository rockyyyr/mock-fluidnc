import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockFluidHttpServer } from "../src/http/HttpServer.js";
import { MachineState } from "../src/machine/MachineState.js";
import { parseSocatPtyPaths } from "../src/transports/MacOSVirtualSerialTransport.js";
import { MockFluidWebSocketServer } from "../src/websocket/WebSocketServer.js";

describe("MockFluidHttpServer", () => {
  it("executes /command requests", async () => {
    const server = new MockFluidHttpServer({ host: "127.0.0.1", port: 0, machine: new MachineState() });
    await server.start();
    try {
      const response = await fetch(`${server.origin()}/command?cmd=G0`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "ok\r\n");
    } finally {
      await server.stop();
    }
  });

  it("serves the loaded config at /config.yaml", async () => {
    const configYaml = "name: HTTP Config\naxes:\n  x:\n    max_travel_mm: 10\n";
    const server = new MockFluidHttpServer({ host: "127.0.0.1", port: 0, machine: new MachineState(), configYaml });
    await server.start();
    try {
      const response = await fetch(`${server.origin()}/config.yaml`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/yaml/);
      assert.equal(await response.text(), configYaml);
    } finally {
      await server.stop();
    }
  });

  it("executes POST body command parameters", async () => {
    const machine = new MachineState();
    const server = new MockFluidHttpServer({ host: "127.0.0.1", port: 0, machine });
    await server.start();
    try {
      const response = await fetch(`${server.origin()}/command`, {
        method: "POST",
        body: new URLSearchParams({ plain: "G0 X3" })
      });
      assert.equal(response.status, 200);
      assert.equal(machine.snapshot().machinePosition.x, 3);
    } finally {
      await server.stop();
    }
  });

  it("routes WebSocket command frames through the shared protocol engine", async () => {
    const machine = new MachineState();
    const server = new MockFluidWebSocketServer({ host: "127.0.0.1", port: 0, machine });
    await server.start();
    const WebSocketConstructor = (globalThis as unknown as { WebSocket?: TestWebSocketConstructor }).WebSocket;
    assert.ok(WebSocketConstructor, "Node.js WebSocket client is unavailable");
    const socket = new WebSocketConstructor(server.origin());
    try {
      await waitForWebSocket(socket, "open");
      socket.send("G0 X4\n");
      await waitFor(() => machine.snapshot().machinePosition.x === 4);
    } finally {
      socket.close();
      await server.stop();
    }
  });

  it("parses macOS socat pseudo-terminal paths", () => {
    const output = "2026/04/14 00:00:00 socat[1] N PTY is /dev/ttys010\n2026/04/14 00:00:00 socat[1] N PTY is /dev/ttys011\n";
    assert.deepEqual(parseSocatPtyPaths(output), ["/dev/ttys010", "/dev/ttys011"]);
  });
});

interface TestWebSocket {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

type TestWebSocketConstructor = new (url: string) => TestWebSocket;

function waitForWebSocket(socket: TestWebSocket, eventName: "open" | "error"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for WebSocket ${eventName}`));
    }, 1000);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener(eventName, onEvent);
      socket.removeEventListener("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("WebSocket error"));
    };
    socket.addEventListener(eventName, onEvent);
    socket.addEventListener("error", onError);
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(predicate(), true);
}
