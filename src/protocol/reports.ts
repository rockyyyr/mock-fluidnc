import type { MachineStateSnapshot } from "../machine/MachineState.js";
import type { SettingsStore } from "../settings/SettingsStore.js";

function formatPosition(position: { x?: number; y?: number; z?: number }): string {
  return [position.x ?? 0, position.y ?? 0, position.z ?? 0].map((value) => value.toFixed(3)).join(",");
}

export function reportBuildInfo(): string[] {
  return ["[VER:Mock FluidNC 0.1.0]", "[OPT:SIM]"];
}

export function reportChannelInfo(): string[] {
  return [
    "[CHANNEL:Serial,virtual]",
    "[CHANNEL:TCP,virtual]",
    "[CHANNEL:WebSocket,virtual]",
    "[CHANNEL:HTTP,virtual]",
    "[CHANNEL:Stdio,virtual]"
  ];
}

export function reportGCodeModes(snapshot: MachineStateSnapshot): string {
  const modal = snapshot.modalState;
  const spindle = snapshot.spindleDirection === "cw" ? "M3" : snapshot.spindleDirection === "ccw" ? "M4" : "M5";
  const coolant = snapshot.mistOn ? (snapshot.airOn ? "M7 M8" : "M7") : snapshot.airOn ? "M8" : "M9";
  return `[GC:${modal.motionMode} ${modal.coordinateSystem} ${modal.plane} ${modal.units === "mm" ? "G21" : "G20"} ${
    modal.distanceMode === "absolute" ? "G90" : "G91"
  } ${modal.arcDistanceMode === "absolute" ? "G90.1" : "G91.1"} ${modal.feedMode} ${programFlowCode(modal.programFlow)} ${spindle} ${coolant} T${
    modal.selectedTool
  } F${snapshot.feedRate} S${snapshot.spindleSpeed}]`.replace(/\s+/g, " ");
}

export function reportOffsets(snapshot: MachineStateSnapshot): string[] {
  const wco = formatPosition(snapshot.workCoordinateOffset);
  return [`[G54:${wco}]`, "[G55:0.000,0.000,0.000]", "[G56:0.000,0.000,0.000]", `[G92:${wco}]`, `[TLO:${snapshot.toolLengthOffset.toFixed(3)}]`];
}

export function reportProbe(snapshot: MachineStateSnapshot): string {
  return `[PRB:${formatPosition(snapshot.probePosition)}:${snapshot.probeSucceeded ? 1 : 0}]`;
}

export function reportHelp(): string[] {
  return [
    "[HLP:$$ $# $G $I $N $x $h $J= $sd/list $sd/run=/ $sd/delete=/]",
    "[HLP:$A $E $CMD $C $X $RST $V $SS $RI $13 $MD $ME $Park $Unpark $TC $RM]",
    "[HLP:$Help $Commands/List $Settings/List $Report/Interval $SD/List]"
  ];
}

export function reportCommands(): string[] {
  return [
    "[CMD:Help,$]",
    "[CMD:Commands/List,$CMD]",
    "[CMD:Status/Report,?,$State,$T]",
    "[CMD:GrblSettings/List,$$]",
    "[CMD:GrblSettings/Get]",
    "[CMD:GrblSettings/Set]",
    "[CMD:GCode/Offsets,$#]",
    "[CMD:GCode/Modes,$G]",
    "[CMD:Build/Info,$I]",
    "[CMD:Startup/Show,$SS]",
    "[CMD:Startup/Log]",
    "[CMD:Startup/Run]",
    "[CMD:Report/Interval,$RI]",
    "[CMD:Alarm/List,$A]",
    "[CMD:Alarm/Disable,$X]",
    "[CMD:Alarm/Send]",
    "[CMD:Error/List,$E]",
    "[CMD:GCode/Check,$C]",
    "[CMD:Homing/All,$H]",
    "[CMD:Homing/Axis,$H<axis>]",
    "[CMD:Jog/Run,$J=]",
    "[CMD:Motor/Enable,$ME]",
    "[CMD:Motor/Disable,$MD]",
    "[CMD:SD/List]",
    "[CMD:SD/ListJSON]",
    "[CMD:SD/Run]",
    "[CMD:SD/Delete]",
    "[CMD:SD/Show]",
    "[CMD:SD/Rename]",
    "[CMD:SD/Status]",
    "[CMD:Files/ListGcode]",
    "[CMD:File/ShowSome]",
    "[CMD:Macros/Run,$RM]",
    "[CMD:Parking/Park]",
    "[CMD:Parking/Unpark]",
    "[CMD:ToolChange/Complete,$TC]",
    "[CMD:Channel/Info,$CI]",
    "[CMD:Grbl/Show,$GS]",
    "[CMD:GrblNames/List,$L]",
    "[CMD:Limits/Show]",
    "[CMD:Motors/Init,$MI]",
    "[CMD:Parameters/List,$PL]",
    "[CMD:Settings/Erase,$NVX]",
    "[CMD:Settings/List,$S]",
    "[CMD:Settings/ListChanged,$SC]",
    "[CMD:Settings/Restore,$RST]",
    "[CMD:Settings/Stats,$V]"
  ];
}

export function reportCommandAliases(): string[] {
  return reportCommands().map((line) => line.replace(/^\[CMD:/, "[GCMD:"));
}

export function reportAlarms(): string[] {
  return ["[ALARMS:Hard limit,Soft limit,Probe fail,Homing required,Emergency stop,Safety door,Fault pin]"];
}

export function reportErrors(): string[] {
  return ["[ERRORS:Unsupported command,Invalid command,Invalid checksum,Path escapes virtual filesystem root]"];
}

export function reportSettingsList(settings: SettingsStore): string[] {
  const snapshot = settings.snapshot();
  return [
    "[SETTINGS:begin]",
    ...Object.entries(snapshot.grbl).map(([key, value]) => `[SETTING:${key}=${value}]`),
    ...settings.listNamed().map((line) => `[SETTING:${line.slice(1)}]`),
    `[SETTING:report_interval_ms=${snapshot.reportIntervalMs}]`,
    "[SETTINGS:end]"
  ];
}

function programFlowCode(programFlow: MachineStateSnapshot["modalState"]["programFlow"]): string {
  switch (programFlow) {
    case "paused":
      return "M0";
    case "optional-stop":
      return "M1";
    case "completed-m2":
      return "M2";
    case "completed-m30":
      return "M30";
    default:
      return "";
  }
}
