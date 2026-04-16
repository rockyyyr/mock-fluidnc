import { FluidProtocol } from "../protocol/FluidProtocol.js";

export class StdioTransport {
  constructor(private readonly protocol: FluidProtocol) {}

  start(): void {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => this.protocol.receive(chunk));
    process.stdin.resume();
  }
}
