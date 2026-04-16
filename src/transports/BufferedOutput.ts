import type { ProtocolOutput } from "../protocol/types.js";

export class BufferedOutput implements ProtocolOutput {
  readonly chunks: Array<string | Uint8Array> = [];

  write(data: string | Uint8Array): void {
    this.chunks.push(data);
  }

  text(): string {
    return this.chunks.map((chunk) => (typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"))).join("");
  }
}
