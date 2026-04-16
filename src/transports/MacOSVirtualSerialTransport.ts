import { createReadStream, createWriteStream, type ReadStream, type WriteStream } from "node:fs";
import { lstat, rm } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { MachineState } from "../machine/MachineState.js";
import { FluidProtocol } from "../protocol/FluidProtocol.js";
import type { ProtocolOptions } from "../protocol/types.js";

export interface MacOSVirtualSerialTransportOptions {
  machine: MachineState;
  protocolOptions?: Omit<ProtocolOptions, "lineEnding">;
  socatPath?: string;
  clientLinkPath?: string;
}

export interface MacOSVirtualSerialPaths {
  simulatorPath: string;
  clientPath: string;
}

export class MacOSVirtualSerialTransport {
  private process: ChildProcessWithoutNullStreams | undefined;
  private input: ReadStream | undefined;
  private output: WriteStream | undefined;
  private paths: MacOSVirtualSerialPaths | undefined;
  private protocol: FluidProtocol | undefined;

  constructor(private readonly options: MacOSVirtualSerialTransportOptions) {}

  async start(): Promise<MacOSVirtualSerialPaths> {
    if (process.platform !== "darwin") {
      return Promise.reject(new Error("macOS virtual serial transport is only supported on darwin."));
    }

    if (this.options.clientLinkPath) {
      await removeStaleSymlink(this.options.clientLinkPath);
    }

    const socat = this.options.socatPath ?? "socat";
    this.process = spawn(socat, ["-d", "-d", "pty,raw,echo=0", clientPtyArgument(this.options.clientLinkPath)]);
    const discovered: string[] = [];

    return new Promise((resolvePromise, reject) => {
      const fail = (error: Error) => {
        this.stop();
        reject(error);
      };

      this.process?.once("error", fail);
      this.process?.once("exit", (code) => {
        if (!this.paths) {
          fail(new Error(`socat exited before creating ptys${code === null ? "" : ` with code ${code}`}`));
        }
      });
      this.process?.stderr.on("data", (chunk) => {
        for (const path of parseSocatPtyPaths(chunk.toString("utf8"))) {
          discovered.push(path);
        }
        if (discovered.length >= 2 && !this.paths) {
          this.paths = { simulatorPath: discovered[0], clientPath: this.options.clientLinkPath ?? discovered[1] };
          this.attach(this.paths.simulatorPath);
          resolvePromise(this.paths);
        }
      });
    });
  }

  stop(): void {
    this.input?.destroy();
    this.output?.destroy();
    this.protocol?.dispose();
    this.process?.kill();
    this.input = undefined;
    this.output = undefined;
    this.protocol = undefined;
    this.process = undefined;
    this.paths = undefined;
  }

  clientPath(): string | undefined {
    return this.paths?.clientPath;
  }

  private attach(path: string): void {
    this.input = createReadStream(path);
    this.output = createWriteStream(path);
    this.protocol = new FluidProtocol(
      this.options.machine,
      {
        write: (data) => this.output?.write(data)
      },
      { ...this.options.protocolOptions, channelName: this.options.protocolOptions?.channelName ?? "serial" }
    );
    this.protocol.writeGreeting();
    this.input.on("data", (chunk) => this.protocol?.receive(chunk));
    this.input.on("close", () => this.protocol?.dispose());
  }
}

export function parseSocatPtyPaths(output: string): string[] {
  return [...output.matchAll(/PTY is (\/dev\/\S+)/g)].map((match) => match[1]);
}

function clientPtyArgument(clientLinkPath: string | undefined): string {
  return clientLinkPath ? `pty,raw,echo=0,link=${clientLinkPath}` : "pty,raw,echo=0";
}

async function removeStaleSymlink(path: string): Promise<void> {
  try {
    const details = await lstat(path);
    if (!details.isSymbolicLink()) {
      throw new Error(`Serial link path already exists and is not a symlink: ${path}`);
    }
    await rm(path);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
