import type { AxisPosition, MachineStateSnapshot } from "../machine/MachineState.js";

export interface StatusFormatOptions {
  statusMask?: number | string;
}

function formatAxis(value: number | undefined): string {
  return (value ?? 0).toFixed(3);
}

function formatPosition(position: AxisPosition): string {
  return [position.x, position.y, position.z].map(formatAxis).join(",");
}

function formatRate(value: number | undefined): string {
  return String(Math.max(0, Math.round(value ?? 0)));
}

export function formatStatus(snapshot: MachineStateSnapshot, options: StatusFormatOptions = {}): string {
  const statusMask = normalizeStatusMask(options.statusMask);
  const reportMachinePosition = (statusMask & 0x01) !== 0;
  const reportBuffer = (statusMask & 0x02) !== 0;
  const fields = [
    snapshot.state,
    `${reportMachinePosition ? "MPos" : "WPos"}:${formatPosition(reportMachinePosition ? snapshot.machinePosition : snapshot.workPosition)}`,
    `FS:${formatRate(snapshot.currentFeedRate)},${formatRate(snapshot.spindleSpeed)}`,
    `WCO:${formatPosition(snapshot.workCoordinateOffset)}`,
    `Ov:${snapshot.feedrateOverride},${snapshot.rapidOverride},${snapshot.spindleOverride}`
  ];
  if (reportBuffer) {
    fields.splice(2, 0, `Bf:${snapshot.plannerBlocksAvailable},${snapshot.rxBufferAvailable}`);
  }

  const accessoryState = [
    snapshot.spindleDirection === "cw" ? "S" : "",
    snapshot.spindleDirection === "ccw" ? "C" : "",
    snapshot.airOn ? "F" : "",
    snapshot.mistOn ? "M" : ""
  ].join("");
  if (accessoryState) {
    fields.push(`A:${accessoryState}`);
  }

  if (snapshot.alarm) {
    fields.push(`ALARM:${snapshot.alarm}`);
  }

  return `<${fields.join("|")}>`;
}

function normalizeStatusMask(value: number | string | undefined): number {
  const parsed = Number(value ?? 3);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 3 ? parsed : 3;
}
