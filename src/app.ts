import { access } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConfig } from "./config/ConfigLoader.js";
import { FileJobManager } from "./files/FileJobManager.js";
import { VirtualFileSystem } from "./files/VirtualFileSystem.js";
import { MockFluidHttpServer } from "./http/HttpServer.js";
import { HomingSimulator } from "./machine/HomingSimulator.js";
import { MachineState } from "./machine/MachineState.js";
import { ParkingManager } from "./machine/ParkingManager.js";
import { ProbeModel } from "./machine/ProbeModel.js";
import { MotionSimulator } from "./motion/MotionSimulator.js";
import { FluidProtocol } from "./protocol/FluidProtocol.js";
import { formatFluidNcTerminalStartup } from "./protocol/terminalOutput.js";
import type { ProtocolTrafficLogger } from "./protocol/types.js";
import { SettingsStore } from "./settings/SettingsStore.js";
import { BufferedOutput } from "./transports/BufferedOutput.js";
import { MacOSVirtualSerialTransport } from "./transports/MacOSVirtualSerialTransport.js";
import { StdioTransport } from "./transports/StdioTransport.js";
import { TcpTransport } from "./transports/TcpTransport.js";
import { WallClock } from "./time/Clock.js";
import { MockFluidWebSocketServer } from "./websocket/WebSocketServer.js";

export const DEFAULT_SERIAL_LINK_PATH = "/tmp/mock-fluidnc-serial";
export const DEFAULT_WORKSPACE_PATH = join(homedir(), ".mock-fluidnc");

export interface SimulatorOptions {
  configPath?: string;
  workspace?: string;
  tcpHost?: string;
  tcpPort?: number;
  httpHost?: string;
  httpPort?: number;
  wsPort?: number;
  stdio?: boolean;
  serial?: boolean;
  serialLinkPath?: string;
}

export interface SimulatorRuntime {
  machine: MachineState;
  serialPath(): string | undefined;
  startupLog(): string[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createSimulator(options: SimulatorOptions = {}): Promise<SimulatorRuntime> {
  const paths = await resolveRuntimePaths(options);
  const config = await loadConfig(paths.configPath);
  const machine = new MachineState();
  const workspace = paths.workspace;
  const files = new VirtualFileSystem(join(workspace, "files"));
  const settings = paths.settingsPath ? await SettingsStore.load(paths.settingsPath) : new SettingsStore();
  const motion = new MotionSimulator(machine, { clock: new WallClock(), axes: config.parsed.axes });
  const homing = new HomingSimulator(machine, config.parsed);
  const probe = new ProbeModel(machine);
  const parking = new ParkingManager(machine, config.parsed.parking);
  const jobs = new FileJobManager(files, machine, motion);
  machine.setLaserMode(config.parsed.spindle?.laserMode ?? false);
  if (config.parsed.spindle?.type) {
    machine.setActiveSpindle(config.parsed.spindle.type);
  }
  if (config.parsed.macros?.startupLine0 !== undefined) {
    settings.setStartupLine(0, config.parsed.macros.startupLine0);
  }
  if (config.parsed.macros?.startupLine1 !== undefined) {
    settings.setStartupLine(1, config.parsed.macros.startupLine1);
  }
  const tcpHost = options.tcpHost ?? "127.0.0.1";
  const tcpPort = options.tcpPort ?? 4000;
  const httpHost = options.httpHost ?? "127.0.0.1";
  const httpPort = options.httpPort ?? 8080;
  const wsPort = options.wsPort ?? (httpPort === 0 ? 0 : httpPort + 1);
  const trafficLogger = createConsoleTrafficLogger();
  let serial: MacOSVirtualSerialTransport | undefined;
  const startupLog = () =>
    formatFluidNcTerminalStartup(config, {
      workspace,
      tcpHost,
      tcpPort,
      httpHost,
      httpPort,
      wsPort,
      stdio: options.stdio ?? false,
      serialEnabled: options.serial ?? false,
      serialPath: serial?.clientPath()
    });
  const protocolOptions = { motion, homing, jobs, settings, probe, macros: config.parsed.macros, parking, startupLog, trafficLogger };
  const tcp = new TcpTransport({
    host: tcpHost,
    port: tcpPort,
    machine,
    protocolOptions
  });
  const http = new MockFluidHttpServer({
    host: httpHost,
    port: httpPort,
    machine,
    protocolOptions,
    configYaml: config.raw
  });
  const websocket = new MockFluidWebSocketServer({
    host: httpHost,
    port: wsPort,
    machine,
    protocolOptions
  });
  serial = options.serial
    ? new MacOSVirtualSerialTransport({ machine, protocolOptions, clientLinkPath: options.serialLinkPath ?? DEFAULT_SERIAL_LINK_PATH })
    : undefined;

  return {
    machine,
    serialPath() {
      return serial?.clientPath();
    },
    startupLog() {
      return startupLog();
    },
    async start() {
      await files.ensureRoot();
      homing.applyStartupAlarm();
      if (machine.snapshot().state !== "Alarm") {
        new FluidProtocol(machine, new BufferedOutput(), protocolOptions).runStartupBlocks();
      }
      await serial?.start();
      await tcp.start();
      await http.start();
      await websocket.start();
      if (options.stdio) {
        const protocol = new FluidProtocol(machine, { write: (data) => process.stdout.write(data) }, { ...protocolOptions, channelName: "stdio" });
        protocol.writeGreeting();
        new StdioTransport(protocol).start();
      }
    },
    async stop() {
      await settings.save();
      serial?.stop();
      await tcp.stop();
      await http.stop();
      await websocket.stop();
    }
  };
}

function createConsoleTrafficLogger(): ProtocolTrafficLogger {
  return ({ channel, direction, data }) => {
    if (data.length === 0) {
      return;
    }
    const line = data.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    process.stderr.write(`[COMM ${channel} ${direction.toUpperCase()}] ${line}\n`);
  };
}

interface RuntimePaths {
  workspace: string;
  configPath?: string;
  settingsPath?: string;
}

async function resolveRuntimePaths(options: SimulatorOptions): Promise<RuntimePaths> {
  const explicitWorkspace = options.workspace ? resolve(options.workspace) : undefined;
  const defaultWorkspaceExists = explicitWorkspace ? false : await pathExists(DEFAULT_WORKSPACE_PATH);
  const workspace = explicitWorkspace ?? (defaultWorkspaceExists ? DEFAULT_WORKSPACE_PATH : join(tmpdir(), "mock-fluidnc"));
  const persistentWorkspace = explicitWorkspace !== undefined || defaultWorkspaceExists;
  const workspaceConfigPath = join(workspace, "config.yaml");
  const configPath = options.configPath
    ? resolve(options.configPath)
    : persistentWorkspace && (await pathExists(workspaceConfigPath))
      ? workspaceConfigPath
      : undefined;

  return {
    workspace,
    configPath,
    settingsPath: persistentWorkspace ? join(workspace, "settings.json") : undefined
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
