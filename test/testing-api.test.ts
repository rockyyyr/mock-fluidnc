import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockFluidHttpServer } from "../src/http/HttpServer.js";
import { MachineState } from "../src/machine/MachineState.js";

describe("testing API", () => {
  it("injects virtual events over HTTP", async () => {
    const machine = new MachineState();
    const server = new MockFluidHttpServer({ host: "127.0.0.1", port: 0, machine });
    await server.start();
    try {
      let response = await postJson(`${server.origin()}/_mock/events/limit?axis=x`);
      assert.equal(response.state, "Alarm");
      assert.equal(response.alarm, "Hard limit x");

      response = await postJson(`${server.origin()}/_mock/events/reset`);
      assert.equal(response.state, "Idle");

      response = await postJson(`${server.origin()}/_mock/events/safety-door/open`);
      assert.equal(response.state, "Door");

      response = await postJson(`${server.origin()}/_mock/events/safety-door/close`);
      assert.equal(response.state, "Idle");

      response = await postJson(`${server.origin()}/_mock/events/probe`);
      assert.equal(response.event, "probe");
      assert.equal(response.state, "Idle");
      assert.equal(machine.snapshot().probeSucceeded, true);

      response = await postJson(`${server.origin()}/_mock/events/fault`);
      assert.equal(response.alarm, "Fault pin");

      response = await postJson(`${server.origin()}/_mock/events/estop`);
      assert.equal(response.alarm, "Emergency stop");
    } finally {
      await server.stop();
    }
  });
});

async function postJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: "POST" });
  assert.equal(response.status, 200);
  return (await response.json()) as Record<string, unknown>;
}
