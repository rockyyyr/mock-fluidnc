import type { SimulatorConfig } from "../config/ConfigLoader.js";

const MOCK_FLUIDNC_VERSION = "0.1.0";

export interface TerminalStartupOptions {
  workspace: string;
  tcpHost: string;
  tcpPort: number;
  httpHost: string;
  httpPort: number;
  wsPort: number;
  stdio: boolean;
  serialEnabled: boolean;
  serialPath?: string;
}

export function fluidNcGreetingLine(): string {
  return `Grbl 1.1f [FluidNC mock-fluidnc ${MOCK_FLUIDNC_VERSION} (node-simulator) '$' for help]`;
}

export function formatFluidNcTerminalStartup(config: SimulatorConfig, options: TerminalStartupOptions): string[] {
  const parsed = config.parsed;
  const axes = Object.values(parsed.axes);
  const lines = [
    "",
    fluidNcGreetingLine(),
    "[MSG:INFO: FluidNC mock-fluidnc https://github.com/bdring/FluidNC-compatible-simulator]",
    "[MSG:INFO: Mock FluidNC simulator - no hardware IO]",
    `[MSG:INFO: Local filesystem is ${options.workspace}]`,
    config.source ? `[MSG:INFO: Configuration file:${config.source}]` : "[MSG:INFO: Using default configuration]",
    `[MSG:INFO: Machine ${parsed.name}]`,
    `[MSG:INFO: Board ${parsed.board ?? "None"}]`,
    `[MSG:INFO: Kinematic system: ${parsed.kinematics}]`,
    `[MSG:INFO: Axis count ${axes.length}]`,
    ...axes.map((axis) => `[MSG:INFO: Axis ${axis.id.toUpperCase()} (0,${(axis.maxTravelMm ?? 0).toFixed(3)})]`),
    ...axes.flatMap((axis) =>
      (axis.motors ?? []).flatMap((motor) => [
        `[MSG:INFO:   ${axis.id.toUpperCase()} ${motor.id}]`,
        `[MSG:INFO:     Driver:${motor.driverType ?? "virtual"} HardLimits:${motor.hardLimits ? "on" : "off"} Pulloff:${(motor.pulloffMm ?? 0).toFixed(3)}]`
      ])
    ),
    `[MSG:INFO: Stepping:${String(parsed.hardware?.stepping && isRecord(parsed.hardware.stepping) ? parsed.hardware.stepping.engine ?? "virtual" : "virtual")}]`,
    `[MSG:INFO: Planner blocks:${parsed.planner?.plannerBlocks ?? 15}]`,
    `[MSG:INFO: Probe:${configuredPin(parsed.probe?.pin) ? "configured virtual" : "not configured"}]`,
    `[MSG:INFO: Coolant flood:${parsed.coolant?.hasFlood ? "virtual" : "off"} mist:${parsed.coolant?.hasMist ? "virtual" : "off"}]`,
    `[MSG:INFO: Spindle:${parsed.spindle?.type ?? "virtual"} Laser:${parsed.spindle?.laserMode ? "on" : "off"}]`,
    `[MSG:INFO: Parking:${parsed.parking?.enable ? `${parsed.parking.axis ?? "?"} ${parsed.parking.targetMposMm ?? 0}` : "disabled"}]`,
    `[MSG:INFO: TCP command stream ${options.tcpHost}:${options.tcpPort}]`,
    `[MSG:INFO: HTTP started on http://${options.httpHost}:${options.httpPort}]`,
    `[MSG:INFO: WebSocket channel ws://${options.httpHost}:${options.wsPort}]`,
    `[MSG:INFO: Stdio ${options.stdio ? "enabled" : "disabled"}]`,
    serialLine(options),
    ...config.warnings.map((warning) => `[MSG:WARN: ${warning}]`),
    ...config.validationErrors.map((error) => `[MSG:ERR: ${error}]`)
  ];

  if (parsed.start.mustHome) {
    lines.push("[MSG:INFO: Homing required before motion]");
  }

  return lines;
}

function serialLine(options: TerminalStartupOptions): string {
  if (!options.serialEnabled) {
    return "[MSG:INFO: macOS virtual serial disabled (run `npm run start:serial` or `npm run start -- --serial` to enable)]";
  }
  return options.serialPath
    ? `[MSG:INFO: macOS virtual serial path ${options.serialPath}]`
    : "[MSG:WARN: macOS virtual serial enabled but no path is available]";
}

function configuredPin(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "" && value.toUpperCase() !== "NO_PIN";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
