import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { MachineState } from "../machine/MachineState.js";
import { FluidProtocol } from "../protocol/FluidProtocol.js";
import type { ProtocolOptions } from "../protocol/types.js";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export class MinimalWebSocketChannel {
  private protocol: FluidProtocol;
  private buffer = Buffer.alloc(0);

  constructor(private readonly socket: Duplex, machine: MachineState, options?: Omit<ProtocolOptions, "lineEnding">) {
    this.protocol = new FluidProtocol(machine, {
      write: (data) => this.sendText(typeof data === "string" ? data : Buffer.from(data).toString("utf8"))
    }, { ...options, channelName: options?.channelName ?? "websocket" });
    this.protocol.writeGreeting();
    this.socket.on("close", () => this.protocol.dispose());
    this.socket.on("error", () => this.protocol.dispose());
  }

  receiveFrame(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= 2) {
      const opcode = this.buffer[0] & 0x0f;
      const masked = (this.buffer[1] & 0x80) !== 0;
      let length = this.buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < offset + 2) {
          return;
        }
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        this.socket.end();
        return;
      }

      const maskLength = masked ? 4 : 0;
      const frameLength = offset + maskLength + length;
      if (this.buffer.length < frameLength) {
        return;
      }

      if (opcode === 0x8) {
        this.socket.end();
        return;
      }

      let payload = this.buffer.subarray(offset + maskLength, frameLength);
      if (masked) {
        const mask = this.buffer.subarray(offset, offset + 4);
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }
      this.buffer = this.buffer.subarray(frameLength);

      if (opcode !== 0x1 && opcode !== 0x2) {
        continue;
      }
      this.protocol.receive(payload);
    }
  }

  private sendText(text: string): void {
    const payload = Buffer.from(text, "utf8");
    if (payload.length <= 125) {
      this.socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
      return;
    }
    if (payload.length <= 65535) {
      const header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(payload.length, 2);
      this.socket.write(Buffer.concat([header, payload]));
    }
  }
}

export interface WebSocketServerOptions {
  host: string;
  port: number;
  machine: MachineState;
  protocolOptions?: Omit<ProtocolOptions, "lineEnding">;
}

export class MockFluidWebSocketServer {
  private server: Server | undefined;

  constructor(private readonly options: WebSocketServerOptions) {}

  start(): Promise<void> {
    this.server = createServer((request, response) => {
      rejectPlainHttpRequest(response);
    });
    this.server.on("upgrade", (request, socket) => {
      if (!handleWebSocketUpgrade(request, socket, this.options.machine, this.options.protocolOptions)) {
        socket.destroy();
      }
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

  origin(): string {
    const address = this.server?.address();
    if (!address || typeof address === "string") {
      throw new Error("WebSocket server is not listening on a TCP address");
    }
    return `ws://${address.address}:${address.port}`;
  }
}

export function handleWebSocketUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  machine: MachineState,
  options?: Omit<ProtocolOptions, "lineEnding">
): boolean {
  const key = request.headers["sec-websocket-key"];
  if (!key || Array.isArray(key)) {
    return false;
  }

  const accept = createHash("sha1").update(`${key}${WS_GUID}`).digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      ""
    ].join("\r\n")
  );

  const channel = new MinimalWebSocketChannel(socket, machine, options);
  socket.on("data", (chunk) => channel.receiveFrame(Buffer.from(chunk)));
  return true;
}

function rejectPlainHttpRequest(response: ServerResponse): void {
  response.writeHead(426, {
    "cache-control": "no-cache",
    "content-type": "text/plain"
  });
  response.end("WebSocket upgrade required");
}
