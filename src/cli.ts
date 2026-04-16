#!/usr/bin/env node
import { createSimulator } from "./app.js";

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

const tcpPort = Number(valueAfter("--tcp-port") ?? 4000);
const httpPort = Number(valueAfter("--http-port") ?? 8080);
const wsPortValue = valueAfter("--ws-port");
const wsPort = wsPortValue === undefined ? (httpPort === 0 ? 0 : httpPort + 1) : Number(wsPortValue);
const configPath = valueAfter("--config");
const workspace = valueAfter("--workspace");
const serialLinkPath = valueAfter("--serial-link");
const stdio = process.argv.includes("--stdio");
const serial = process.argv.includes("--serial");

const simulator = await createSimulator({
  configPath,
  workspace,
  tcpPort,
  httpPort,
  wsPort,
  stdio,
  serial,
  serialLinkPath
});

await simulator.start();
for (const line of simulator.startupLog()) {
  console.log(line);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void simulator.stop().finally(() => process.exit(0));
  });
}
