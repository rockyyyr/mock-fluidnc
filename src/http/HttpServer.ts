import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { MachineState } from "../machine/MachineState.js";
import { FluidProtocol } from "../protocol/FluidProtocol.js";
import type { ProtocolOptions } from "../protocol/types.js";
import { BufferedOutput } from "../transports/BufferedOutput.js";
import { TestEventApi } from "../testing/TestEventApi.js";
import type { TestEventKind } from "../testing/TestEvents.js";

export interface HttpServerOptions {
  host: string;
  port: number;
  machine: MachineState;
  protocolOptions?: Omit<ProtocolOptions, "lineEnding">;
  configYaml?: string;
}

export class MockFluidHttpServer {
  private server: Server | undefined;

  constructor(private readonly options: HttpServerOptions) {}

  start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request, response);
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
      throw new Error("HTTP server is not listening on a TCP address");
    }
    return `http://${address.address}:${address.port}`;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname === "/command" || url.pathname === "/command_silent") {
      const command = await this.commandFromRequest(request, url);
      if (!command) {
        this.send(response, 500, "text/plain", "Invalid command");
        return;
      }
      const output = new BufferedOutput();
      const protocol = new FluidProtocol(this.options.machine, output, { ...this.options.protocolOptions, autoReport: false });
      this.logTraffic("rx", command);
      const result = protocol.executeLine(command);
      for (const line of result.lines) {
        output.write(`${line}\r\n`);
        this.logTraffic("tx", line);
      }
      if (result.ok) {
        output.write("ok\r\n");
        this.logTraffic("tx", "ok");
      }
      this.send(response, result.ok ? 200 : 500, "text/plain", output.text());
      return;
    }

    if (url.pathname === "/login") {
      this.send(response, 200, "application/json", JSON.stringify({ status: "ok", authentication: "none" }));
      return;
    }

    if (url.pathname === "/config.yaml") {
      this.send(response, 200, "text/yaml", this.options.configYaml ?? "");
      return;
    }

    if (url.pathname === "/upload" || url.pathname === "/files") {
      await this.handleFiles(request, url, response);
      return;
    }

    if (url.pathname.startsWith("/_mock/events")) {
      this.handleTestEvent(url, response);
      return;
    }

    this.send(response, 404, "text/plain", "Not found");
  }

  private handleTestEvent(url: URL, response: ServerResponse): void {
    const api = new TestEventApi(this.options.machine);
    const parts = url.pathname.split("/").filter(Boolean);
    const eventName = parts.slice(2).join("/");
    const axis = url.searchParams.get("axis") ?? undefined;

    if (eventName === "reset") {
      this.send(response, 200, "application/json", JSON.stringify(api.reset()));
      return;
    }

    const event = eventFromPath(eventName);
    if (!event) {
      this.send(response, 404, "application/json", JSON.stringify({ ok: false, error: "Unknown test event" }));
      return;
    }

    this.send(response, 200, "application/json", JSON.stringify(api.trigger(event, axis)));
  }

  private async handleFiles(request: IncomingMessage, url: URL, response: ServerResponse): Promise<void> {
    const jobs = this.options.protocolOptions?.jobs;
    if (!jobs) {
      this.send(response, 404, "application/json", JSON.stringify({ status: "error", message: "Virtual file system unavailable" }));
      return;
    }

    const action = url.searchParams.get("action") ?? "";
    const directory = url.searchParams.get("path") ?? url.searchParams.get("dir") ?? ".";
    const filename = url.searchParams.get("filename") ?? url.searchParams.get("name");
    const targetPath = combineVirtualPath(directory, filename);

    try {
      if (request.method === "GET" && action !== "delete" && action !== "rename") {
        const files = jobs.listDetailed(directory);
        this.send(response, 200, "application/json", JSON.stringify({ status: "ok", path: normalizeVirtualPath(directory), files }));
        return;
      }

      if (request.method === "DELETE" || action === "delete" || action === "deletedir") {
        jobs.deleteFile(targetPath);
        this.send(response, 200, "application/json", JSON.stringify({ status: "ok", message: `${targetPath} deleted` }));
        return;
      }

      if (action === "rename") {
        const newName = url.searchParams.get("newname") ?? url.searchParams.get("newName");
        if (!newName) {
          this.send(response, 400, "application/json", JSON.stringify({ status: "error", message: "Missing newname" }));
          return;
        }
        const newPath = combineVirtualPath(directory, newName);
        jobs.renameFile(targetPath, newPath);
        this.send(response, 200, "application/json", JSON.stringify({ status: "ok", message: `${targetPath} renamed to ${newPath}` }));
        return;
      }

      if (request.method === "POST" || request.method === "PUT") {
        const body = await readBody(request);
        jobs.writeFile(targetPath, body);
        const files = jobs.listDetailed(directory);
        this.send(response, 200, "application/json", JSON.stringify({ status: "ok", path: normalizeVirtualPath(directory), files }));
        return;
      }

      this.send(response, 405, "application/json", JSON.stringify({ status: "error", message: "Unsupported file operation" }));
    } catch (error) {
      this.send(response, 500, "application/json", JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) }));
    }
  }

  private async commandFromRequest(request: IncomingMessage, url: URL): Promise<string | null> {
    const queryCommand = url.searchParams.get("cmd") ?? url.searchParams.get("commandText") ?? url.searchParams.get("plain");
    if (queryCommand) {
      return queryCommand;
    }
    if (request.method !== "POST" && request.method !== "PUT") {
      return null;
    }
    const body = await readBody(request);
    if (!body.trim()) {
      return null;
    }
    const params = new URLSearchParams(body);
    return params.get("cmd") ?? params.get("commandText") ?? params.get("plain") ?? body;
  }

  private send(response: ServerResponse, status: number, contentType: string, body: string): void {
    response.writeHead(status, {
      "cache-control": "no-cache",
      "content-type": contentType
    });
    response.end(body);
  }

  private logTraffic(direction: "rx" | "tx", data: string): void {
    this.options.protocolOptions?.trafficLogger?.({ channel: "http", direction, data });
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function combineVirtualPath(directory: string, filename: string | null): string {
  if (!filename) {
    return normalizeVirtualPath(directory);
  }
  const cleanDirectory = normalizeVirtualPath(directory).replace(/\/+$/, "");
  const cleanFile = filename.replace(/^\/+/, "");
  return normalizeVirtualPath(`${cleanDirectory}/${cleanFile}`);
}

function normalizeVirtualPath(path: string): string {
  const clean = path.trim() === "" ? "." : path.trim();
  if (clean === "." || clean === "/") {
    return ".";
  }
  return clean.replace(/^\/+/, "");
}

function eventFromPath(path: string): TestEventKind | undefined {
  switch (path) {
    case "limit":
      return "limit";
    case "probe":
      return "probe";
    case "fault":
      return "fault";
    case "estop":
      return "estop";
    case "safety-door/open":
      return "door-open";
    case "safety-door/close":
      return "door-close";
    default:
      return undefined;
  }
}
