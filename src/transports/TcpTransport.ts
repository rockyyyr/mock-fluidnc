import { createServer, type Server } from "node:net";
import { MachineState } from "../machine/MachineState.js";
import { FluidProtocol } from "../protocol/FluidProtocol.js";
import type { ProtocolOptions } from "../protocol/types.js";

export interface TcpTransportOptions {
  host: string;
  port: number;
  machine: MachineState;
  protocolOptions?: Omit<ProtocolOptions, "lineEnding">;
}

export class TcpTransport {
  private server: Server | undefined;

  constructor(private readonly options: TcpTransportOptions) {}

  start(): Promise<void> {
    this.server = createServer((socket) => {
      const protocol = new FluidProtocol(this.options.machine, {
        write: (data) => socket.write(data)
      }, { ...this.options.protocolOptions, channelName: this.options.protocolOptions?.channelName ?? "tcp" });
      protocol.writeGreeting();
      socket.on("data", (chunk) => protocol.receive(chunk));
      socket.on("close", () => protocol.dispose());
      socket.on("error", () => protocol.dispose());
    });

    return new Promise((resolvePromise, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.options.port, this.options.host, () => resolvePromise());
    });
  }

  stop(): Promise<void> {
    if (!this.server) {
      return Promise.resolve();
    }
    return new Promise((resolvePromise, reject) => {
      this.server?.close((error) => (error ? reject(error) : resolvePromise()));
    });
  }
}
