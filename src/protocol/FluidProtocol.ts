import { createHash } from "node:crypto";
import { MachineState } from "../machine/MachineState.js";
import { executeGCodeLine } from "../gcode/GCodeExecutor.js";
import { HomingSimulator, type HomingCompletion } from "../machine/HomingSimulator.js";
import { MotionSimulator } from "../motion/MotionSimulator.js";
import { FileJobManager } from "../files/FileJobManager.js";
import { ProbeModel } from "../machine/ProbeModel.js";
import { ParkingManager } from "../machine/ParkingManager.js";
import { SettingsStore } from "../settings/SettingsStore.js";
import type { MacrosConfig } from "../config/ConfigLoader.js";
import {
  reportAlarms,
  reportBuildInfo,
  reportChannelInfo,
  reportCommandAliases,
  reportCommands,
  reportErrors,
  reportGCodeModes,
  reportHelp,
  reportOffsets,
  reportProbe,
  reportSettingsList
} from "./reports.js";
import { formatStatus } from "./status.js";
import { fluidNcGreetingLine } from "./terminalOutput.js";
import type { CommandResult, ProtocolOptions, ProtocolOutput, ProtocolTrafficLogger } from "./types.js";

const DEFAULT_LINE_ENDING = "\r\n";

export class FluidProtocol {
  private readonly machine: MachineState;
  private readonly output: ProtocolOutput;
  private readonly lineEnding: string;
  private readonly motion: MotionSimulator | undefined;
  private readonly homing: HomingSimulator | undefined;
  private readonly jobs: FileJobManager | undefined;
  private readonly settings: SettingsStore;
  private readonly probe: ProbeModel | undefined;
  private readonly macros: MacrosConfig | undefined;
  private readonly parking: ParkingManager | undefined;
  private readonly startupLog: (() => string[]) | undefined;
  private readonly autoReport: boolean;
  private readonly channelName: string;
  private readonly trafficLogger: ProtocolTrafficLogger | undefined;
  private lineBuffer = "";
  private macroDepth = 0;
  private autoReportTimer: ReturnType<typeof setInterval> | undefined;
  private pendingHomingCompletionMessage: string | undefined;

  constructor(machine: MachineState, output: ProtocolOutput, options: ProtocolOptions = {}) {
    this.machine = machine;
    this.output = output;
    this.lineEnding = options.lineEnding ?? DEFAULT_LINE_ENDING;
    this.motion = options.motion;
    this.homing = options.homing;
    this.jobs = options.jobs;
    this.settings = options.settings ?? new SettingsStore();
    this.probe = options.probe;
    this.macros = options.macros;
    this.parking = options.parking;
    this.startupLog = options.startupLog;
    this.autoReport = options.autoReport ?? true;
    this.channelName = options.channelName ?? "protocol";
    this.trafficLogger = options.trafficLogger;
  }

  receive(data: string | Uint8Array): void {
    const bytes = typeof data === "string" ? [...data].map((char) => char.charCodeAt(0)) : data;

    for (const byte of bytes) {
      if (this.handleRealtimeByte(byte)) {
        continue;
      }

      const char = String.fromCharCode(byte);
      if (char === "\r" || char === "\n") {
        this.flushLine();
        continue;
      }

      if (isUnsupportedRawByte(byte)) {
        this.logTraffic("rx", formatByte(byte));
        this.writeLine(unsupportedCommandError(formatByte(byte)));
        continue;
      }

      this.lineBuffer += char;
    }
  }

  executeLine(line: string): CommandResult {
    const command = line.trim();
    if (!command) {
      return { ok: true, lines: [] };
    }

    if (command === "?") {
      const completion = this.updateMotionSubsystems();
      return this.mergeResults(completion, { ok: true, lines: [this.formatCurrentStatus()] });
    }

    const normalized = command.toLowerCase();
    const parsedCommand = parseDollarCommand(command);
    const commandName = parsedCommand?.name;
    const commandValue = parsedCommand?.value;

    if (isCommandName(commandName, "x", "alarm/disable")) {
      this.machine.unlock();
      return this.mergeResults({ ok: true, lines: [] }, this.runNamedMacro("afterUnlock"));
    }

    if (normalized === "$" || isCommandName(commandName, "help")) {
      return { ok: true, lines: reportHelp() };
    }

    if (normalized === "$$" || isCommandName(commandName, "grblsettings/list")) {
      return { ok: true, lines: this.settings.listGrbl() };
    }

    if (isCommandName(commandName, "i", "build/info", "firmware/info", "esp800")) {
      return { ok: true, lines: reportBuildInfo() };
    }

    if (isCommandName(commandName, "ci", "channel/info")) {
      return { ok: true, lines: reportChannelInfo() };
    }

    if (isCommandName(commandName, "gs", "grbl/show")) {
      return { ok: true, lines: [fluidNcGreetingLine()] };
    }

    if (isCommandName(commandName, "g", "gcode/modes")) {
      return { ok: true, lines: [reportGCodeModes(this.machine.snapshot())] };
    }

    if (normalized === "$#" || isCommandName(commandName, "gcode/offsets")) {
      return { ok: true, lines: [...reportOffsets(this.machine.snapshot()), reportProbe(this.machine.snapshot())] };
    }

    if (isCommandName(commandName, "cmd", "commands/list")) {
      return { ok: true, lines: reportCommands() };
    }

    if (isCommandName(commandName, "l", "grblnames/list")) {
      return { ok: true, lines: reportCommandAliases() };
    }

    if (isCommandName(commandName, "s", "settings/list")) {
      return { ok: true, lines: reportSettingsList(this.settings) };
    }

    if (isCommandName(commandName, "sc", "settings/listchanged")) {
      return { ok: true, lines: ["[SETTINGS_CHANGED:none]"] };
    }

    if (isCommandName(commandName, "a", "alarms/list")) {
      return { ok: true, lines: reportAlarms() };
    }

    if (isCommandName(commandName, "e", "errors/list")) {
      return { ok: true, lines: reportErrors() };
    }

    if (isCommandName(commandName, "n", "startup/lines")) {
      return { ok: true, lines: this.settings.startupReport() };
    }

    if (isCommandName(commandName, "v", "settings/stats")) {
      return { ok: true, lines: this.settings.stats() };
    }

    if (isCommandName(commandName, "ss", "startup/show")) {
      return { ok: true, lines: this.startupLog?.() ?? ["[MSG:Startup log unavailable in simulator]"] };
    }

    if (isCommandName(commandName, "c", "gcode/check")) {
      const enabled = !this.machine.snapshot().checkMode;
      this.machine.setCheckMode(enabled);
      return { ok: true, lines: [`[MSG:Check mode ${enabled ? "enabled" : "disabled"}]`] };
    }

    if (isCommandName(commandName, "state", "t")) {
      const completion = this.updateMotionSubsystems();
      return this.mergeResults(completion, { ok: true, lines: [this.formatCurrentStatus()] });
    }

    if (isCommandName(commandName, "alarm/send")) {
      const alarm = commandValue ?? "0";
      this.machine.setAlarm(`Alarm ${alarm}`);
      return { ok: true, lines: [`[MSG:Alarm ${alarm}]`] };
    }

    if (isCommandName(commandName, "limits/show")) {
      return { ok: true, lines: [formatLimitReport(this.machine.snapshot().activeLimitPins)] };
    }

    if (isCommandName(commandName, "mi", "motors/init")) {
      this.machine.enableMotors();
      return { ok: true, lines: ["[MSG:Motors initialized]"] };
    }

    if (isCommandName(commandName, "pl", "parameters/list")) {
      return { ok: true, lines: ["[PARAMETERS:begin]", "[PARAMETERS:end]"] };
    }

    if (normalized === "$13" || isCommandName(commandName, "report/status")) {
      if (commandValue !== undefined) {
        return this.setReportStatus(commandValue);
      }
      if (isCommandName(commandName, "report/status")) {
        return { ok: true, lines: [`$Report/Status=${this.settings.getGrbl("10") ?? "1"}`] };
      }
      const next = !this.machine.snapshot().reportInches;
      this.machine.setReportInches(next);
      this.settings.setGrbl("13", next ? "1" : "0");
      return { ok: true, lines: [] };
    }

    if (isCommandName(commandName, "ri", "report/interval")) {
      if (commandValue === undefined) {
        return { ok: true, lines: [`[MSG:Report interval:${this.settings.snapshot().reportIntervalMs}]`] };
      }
      const interval = Number(commandValue);
      if (!Number.isInteger(interval) || interval < 0) {
        return { ok: false, lines: ["error:Bad number format"] };
      }
      this.setReportInterval(interval);
      return { ok: true, lines: [] };
    }

    if (isCommandName(commandName, "rst", "settings/restore", "nvx", "settings/erase")) {
      this.settings.restoreDefaults();
      return { ok: true, lines: [] };
    }

    if (normalized.startsWith("$n0=") || normalized.startsWith("$n1=")) {
      const index = normalized.startsWith("$n0=") ? 0 : 1;
      this.settings.setStartupLine(index, command.slice(4));
      return { ok: true, lines: [] };
    }

    const settingSet = command.match(/^\$(\d+)=(.+)$/);
    if (settingSet) {
      if (settingSet[1] === "10") {
        return this.setReportStatus(settingSet[2]);
      }
      this.settings.setGrbl(settingSet[1], settingSet[2]);
      if (settingSet[1] === "13") {
        this.machine.setReportInches(settingSet[2] === "1");
      }
      return { ok: true, lines: [] };
    }

    const settingGet = command.match(/^\$(\d+)$/);
    if (settingGet) {
      const value = this.settings.getGrbl(settingGet[1]);
      return value === undefined ? { ok: false, lines: ["error:Unknown setting"] } : { ok: true, lines: [`$${settingGet[1]}=${value}`] };
    }

    if (isCommandName(commandName, "fakemaxspindlespeed")) {
      return this.handleGrblAlias("30", "FakeMaxSpindleSpeed", commandValue);
    }

    if (isCommandName(commandName, "fakelasermode")) {
      return this.handleGrblAlias("32", "FakeLaserMode", commandValue);
    }

    const namedSetting = this.handleNamedSetting(commandName, commandValue);
    if (namedSetting) {
      return namedSetting;
    }

    if (isCommandName(commandName, "h", "home")) {
      if (this.homing) {
        this.homing.homeAll();
        this.pendingHomingCompletionMessage = "[MSG:Homing complete]";
        return { ok: true, lines: ["[MSG:Homing started]"] };
      } else {
        this.machine.startHoming();
        return this.mergeResults({ ok: true, lines: ["[MSG:Homing started]"] }, this.runNamedMacro("afterHoming"));
      }
    }

    const homeAxis = normalized.match(/^\$h([xyzabcuvw])$/);
    if (homeAxis) {
      if (this.homing) {
        this.homing.homeAxes([homeAxis[1]]);
        this.pendingHomingCompletionMessage = `[MSG:Homing ${homeAxis[1].toUpperCase()} complete]`;
        return { ok: true, lines: [`[MSG:Homing ${homeAxis[1].toUpperCase()} started]`] };
      }
      this.machine.startHoming();
      return this.mergeResults({ ok: true, lines: [`[MSG:Homing ${homeAxis[1].toUpperCase()} started]`] }, this.runNamedMacro("afterHoming"));
    }

    const longHomeAxis = command.match(/^\$Home=([xyzabcuvw])$/i);
    if (longHomeAxis) {
      if (this.homing) {
        this.homing.homeAxes([longHomeAxis[1].toLowerCase()]);
        this.pendingHomingCompletionMessage = `[MSG:Homing ${longHomeAxis[1].toUpperCase()} complete]`;
        return { ok: true, lines: [`[MSG:Homing ${longHomeAxis[1].toUpperCase()} started]`] };
      }
      this.machine.startHoming();
      return this.mergeResults({ ok: true, lines: [`[MSG:Homing ${longHomeAxis[1].toUpperCase()} started]`] }, this.runNamedMacro("afterHoming"));
    }

    const macroRun = normalized.match(/^\$rm(?:=)?([0-3])$/) ?? command.match(/^\$Macros\/Run=([0-3])$/i);
    if (macroRun) {
      return this.runMacro(Number(macroRun[1]));
    }

    if (isCommandName(commandName, "park", "parking/park")) {
      const snapshot = this.parking?.park();
      return snapshot ? { ok: true, lines: [`[MSG:Parking ${snapshot.parked ? "active" : "unavailable"}]`] } : this.unavailable("Parking");
    }

    if (isCommandName(commandName, "unpark", "parking/unpark")) {
      const snapshot = this.parking?.unpark();
      return snapshot ? { ok: true, lines: [`[MSG:Parking ${snapshot.parked ? "active" : "restored"}]`] } : this.unavailable("Parking");
    }

    if (isCommandName(commandName, "tc", "toolchange/complete")) {
      this.machine.completeToolChange();
      return { ok: true, lines: ["[MSG:Tool change complete]"] };
    }

    if (normalized.startsWith("$j=") || normalized.startsWith("$jog=")) {
      if (this.motion) {
        const jogLine = command.slice(command.indexOf("=") + 1);
        const result = executeGCodeLine(this.machine, jogLine, { motion: this.motion, motionRunState: "Jog", probe: this.probe });
        return result.handled ? { ok: true, lines: [] } : { ok: false, lines: [`error:${result.error}`] };
      }
      this.machine.startJog();
      return { ok: true, lines: [] };
    }

    if (isCommandName(commandName, "md", "motor/disable")) {
      this.machine.disableMotors();
      return { ok: true, lines: [] };
    }

    const fileCommand = this.handleFileCommand(commandName, commandValue, command);
    if (fileCommand) {
      return fileCommand;
    }

    if (isCommandName(commandName, "me", "motor/enable")) {
      this.machine.enableMotors();
      return { ok: true, lines: [] };
    }

    const logCommand = this.handleLogCommand(commandName, commandValue);
    if (logCommand) {
      return logCommand;
    }

    if (isCommandName(commandName, "slp", "system/sleep")) {
      this.machine.setRunState("Sleep");
      return { ok: true, lines: ["[MSG:Sleep]"] };
    }

    if (/^[gmtfsxyzabcijnpr]\s*[+-]?(?:\d|\.)/i.test(command) || /^[n]\d+/i.test(command)) {
      const result = executeGCodeLine(this.machine, command, { motion: this.motion, probe: this.probe });
      return result.handled ? { ok: true, lines: [] } : { ok: false, lines: [`error:${result.error}`] };
    }

    if (normalized.startsWith("$")) {
      return { ok: false, lines: [unsupportedCommandError(command)] };
    }

    return { ok: false, lines: [unsupportedCommandError(command)] };
  }

  writeGreeting(): void {
    this.writeLine("");
    this.writeLine(fluidNcGreetingLine());
    this.writeLine("[MSG:INFO: Mock FluidNC simulator - no hardware IO]");
  }

  dispose(): void {
    this.stopAutoReport();
  }

  runStartupBlocks(): CommandResult {
    const settingCommands = this.settings.startupReport()
      .map((line) => line.slice(line.indexOf("=") + 1).trim())
      .filter((line) => line.length > 0);
    const configCommands = [this.macros?.startupLine0, this.macros?.startupLine1].filter(isCommandString);
    const commands = settingCommands.length > 0 ? settingCommands : configCommands;
    return this.runCommandSequence(commands);
  }

  writeStatus(logTraffic = true): void {
    const completion = this.updateMotionSubsystems();
    for (const responseLine of completion.lines) {
      this.writeLine(responseLine, logTraffic);
    }
    this.writeLine(this.formatCurrentStatus(), logTraffic);
  }

  private flushLine(): void {
    const line = this.lineBuffer;
    this.lineBuffer = "";
    if (!line.trim()) {
      return;
    }
    this.logTraffic("rx", line);
    const result = this.executeLine(line);
    for (const responseLine of result.lines) {
      this.writeLine(responseLine);
    }
    if (result.ok) {
      this.writeLine("ok");
    } else if (!hasExplicitErrorLine(result.lines)) {
      this.writeLine("error:Invalid command");
    }
  }

  private handleRealtimeByte(byte: number): boolean {
    switch (byte) {
      case 0x3f:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.writeStatus();
        return true;
      case 0x18:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.jobs?.cancel();
        this.homing?.cancel();
        this.machine.reset();
        this.runNamedMacro("afterReset");
        this.writeGreeting();
        return true;
      case 0x21:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.jobs?.pause();
        this.motion?.hold();
        this.machine.hold();
        return true;
      case 0x7e:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.jobs?.resume();
        this.motion?.resume();
        this.machine.resume();
        return true;
      case 0x10:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.updateMotionSubsystems();
        if (this.motion?.isActive()) {
          return true;
        }
        this.machine.waitForJog();
        return true;
      case 0x84:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.homing?.cancel("Alarm");
        if (this.jobs) {
          this.jobs.alarm("Emergency stop");
        } else {
          this.machine.setAlarm("Emergency stop");
        }
        return true;
      case 0x90:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.machine.resetFeedrateOverride();
        return true;
      case 0x91:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.machine.increaseFeedrateOverride();
        return true;
      case 0x92:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.machine.decreaseFeedrateOverride();
        return true;
      case 0x99:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.machine.resetSpindleOverride();
        return true;
      case 0x9a:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.machine.increaseSpindleOverride();
        return true;
      case 0x9b:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.machine.decreaseSpindleOverride();
        return true;
      case 0x9e:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.machine.toggleSpindleStop();
        return true;
      case 0xa0:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.machine.toggleAir();
        return true;
      case 0xa1:
        this.logTraffic("rx", formatRealtimeByte(byte));
        this.machine.toggleMist();
        return true;
      default:
        return false;
    }
  }

  private writeLine(line: string, logTraffic = true): void {
    if (logTraffic) {
      this.logTraffic("tx", line);
    }
    this.output.write(`${line}${this.lineEnding}`);
  }

  private logTraffic(direction: "rx" | "tx", data: string): void {
    this.trafficLogger?.({ channel: this.channelName, direction, data });
  }

  private formatCurrentStatus(): string {
    return formatStatus(this.machine.snapshot(), { statusMask: this.settings.getGrbl("10") ?? "1" });
  }

  private updateHomingCompletion(): CommandResult {
    const completion = this.homing?.update();
    if (!completion) {
      return { ok: true, lines: [] };
    }
    const message = this.pendingHomingCompletionMessage ?? homingCompletionMessage(completion);
    this.pendingHomingCompletionMessage = undefined;
    return this.mergeResults({ ok: true, lines: [message] }, this.runNamedMacro("afterHoming"));
  }

  private updateMotionSubsystems(): CommandResult {
    const completion = this.updateHomingCompletion();
    this.motion?.update();
    this.probe?.update();
    return completion;
  }

  private runMacro(index: number): CommandResult {
    const command = this.macroCommand(index);
    if (!command) {
      return { ok: false, lines: [`error:Macro ${index} is empty`] };
    }
    return this.runCommandSequence(splitMacroCommands(command));
  }

  private runNamedMacro(name: "afterHoming" | "afterReset" | "afterUnlock"): CommandResult {
    const command = this.macros?.[name];
    return command ? this.runCommandSequence(splitMacroCommands(command)) : { ok: true, lines: [] };
  }

  private runCommandSequence(commands: string[]): CommandResult {
    if (this.macroDepth >= 8) {
      return { ok: false, lines: ["error:Macro nesting limit exceeded"] };
    }
    this.macroDepth += 1;
    const lines: string[] = [];
    try {
      for (const command of commands) {
        const result = this.executeLine(command);
        lines.push(...result.lines);
        if (!result.ok) {
          return { ok: false, lines };
        }
      }
      return { ok: true, lines };
    } finally {
      this.macroDepth -= 1;
    }
  }

  private macroCommand(index: number): string | undefined {
    switch (index) {
      case 0:
        return this.macros?.macro0;
      case 1:
        return this.macros?.macro1;
      case 2:
        return this.macros?.macro2;
      case 3:
        return this.macros?.macro3;
      default:
        return undefined;
    }
  }

  private mergeResults(first: CommandResult, second: CommandResult): CommandResult {
    return {
      ok: first.ok && second.ok,
      lines: [...first.lines, ...second.lines]
    };
  }

  private unavailable(name: string): CommandResult {
    return { ok: false, lines: [`error:${name} unavailable`] };
  }

  private setReportInterval(interval: number): void {
    this.settings.setReportInterval(interval);
    this.stopAutoReport();
    const actual = this.settings.snapshot().reportIntervalMs;
    if (!this.autoReport || actual === 0) {
      return;
    }
    this.autoReportTimer = setInterval(() => this.writeStatus(false), actual);
    this.autoReportTimer.unref?.();
  }

  private stopAutoReport(): void {
    if (!this.autoReportTimer) {
      return;
    }
    clearInterval(this.autoReportTimer);
    this.autoReportTimer = undefined;
  }

  private handleGrblAlias(key: string, name: string, value: string | undefined): CommandResult {
    if (value === undefined) {
      return { ok: true, lines: [`$${name}=${this.settings.getGrbl(key) ?? "0"}`] };
    }
    this.settings.setGrbl(key, value);
    return { ok: true, lines: [] };
  }

  private setReportStatus(value: string): CommandResult {
    const statusMask = Number(value);
    if (!Number.isInteger(statusMask) || statusMask < 0 || statusMask > 3) {
      return { ok: false, lines: ["error:Invalid report status"] };
    }
    this.settings.setGrbl("10", String(statusMask));
    return { ok: true, lines: [] };
  }

  private handleNamedSetting(name: string | undefined, value: string | undefined): CommandResult | undefined {
    if (!name) {
      return undefined;
    }
    if (value === undefined) {
      const stored = this.settings.getNamed(name);
      return stored === undefined ? undefined : { ok: true, lines: [`$${canonicalSettingName(this.settings, name)}=${stored}`] };
    }
    if (value === "*") {
      return { ok: true, lines: validOptionsForSetting(name) };
    }
    return this.settings.setNamed(name, value) ? { ok: true, lines: [] } : undefined;
  }

  private handleFileCommand(name: string | undefined, value: string | undefined, command: string): CommandResult | undefined {
    if (!name || !isFileCommandName(name)) {
      return undefined;
    }
    if (!this.jobs) {
      return this.unavailable("Virtual file system");
    }

    if (isCommandName(name, "sd/list")) {
      return { ok: true, lines: this.jobs.listFiles() };
    }
    if (isCommandName(name, "sd/listjson")) {
      return { ok: true, lines: [JSON.stringify(this.jobs.listDetailed(value ?? "."))] };
    }
    if (isCommandName(name, "files/listgcode")) {
      const entries = this.jobs
        .listDetailed(value ?? ".")
        .filter((entry) => entry.type === "file" && isGcodeFile(entry.name))
        .map((entry) => entry.path);
      return { ok: true, lines: entries };
    }
    if (isCommandName(name, "sd/delete")) {
      const path = value ?? command.slice(command.indexOf("=") + 1);
      this.jobs.deleteFile(path);
      return { ok: true, lines: [] };
    }
    if (isCommandName(name, "sd/run")) {
      const snapshot = this.jobs.runFile(value ?? command.slice(command.indexOf("=") + 1));
      return { ok: true, lines: [`[MSG:Job ${snapshot.state} ${snapshot.progress}]`] };
    }
    if (isCommandName(name, "sd/show", "file/sendjson")) {
      const contents = this.jobs.readFile(value ?? ".");
      return isCommandName(name, "file/sendjson") ? { ok: true, lines: [JSON.stringify({ contents })] } : { ok: true, lines: contents.split(/\r?\n/) };
    }
    if (isCommandName(name, "file/showsome")) {
      const [countText, ...pathParts] = (value ?? "").split(",");
      const count = Math.max(0, Number(countText) || 0);
      const contents = this.jobs.readFile(pathParts.join(","));
      return { ok: true, lines: contents.split(/\r?\n/).slice(0, count) };
    }
    if (isCommandName(name, "file/showhash")) {
      const contents = this.jobs.readFile(value ?? ".");
      return { ok: true, lines: [`[HASH:${createHash("sha256").update(contents).digest("hex")}]`] };
    }
    if (isCommandName(name, "sd/rename")) {
      const rename = splitRenameValue(value ?? "");
      if (!rename) {
        return { ok: false, lines: ["error:Bad rename format"] };
      }
      this.jobs.renameFile(rename.from, rename.to);
      return { ok: true, lines: [] };
    }
    if (isCommandName(name, "sd/status", "esp200")) {
      const snapshot = this.jobs.snapshot();
      return { ok: true, lines: [`[SD:${snapshot.state},${snapshot.activeFile ?? ""},${snapshot.completedLines},${snapshot.totalLines}]`] };
    }
    return undefined;
  }

  private handleLogCommand(name: string | undefined, value: string | undefined): CommandResult | undefined {
    if (!name || !isCommandName(name, "lm", "log/msg", "lw", "log/warn", "li", "log/info", "ld", "log/debug", "lv", "log/verbose", "mc", "msg/channel")) {
      return undefined;
    }
    const level = logLevelForCommand(name);
    return { ok: true, lines: [`[MSG:${level}: ${value ?? ""}]`] };
  }
}

function splitMacroCommands(command: string): string[] {
  return command
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isCommandString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseDollarCommand(command: string): { name: string; value?: string } | undefined {
  if (!command.startsWith("$")) {
    return undefined;
  }
  const separator = command.indexOf("=");
  const rawName = separator === -1 ? command.slice(1) : command.slice(1, separator);
  const value = separator === -1 ? undefined : command.slice(separator + 1);
  return { name: rawName.toLowerCase(), value };
}

function isCommandName(name: string | undefined, ...aliases: string[]): boolean {
  return name !== undefined && aliases.some((alias) => name === alias.toLowerCase());
}

function hasExplicitErrorLine(lines: string[]): boolean {
  return lines.some((line) => line.toLowerCase().startsWith("error:"));
}

function unsupportedCommandError(command: string): string {
  return `error:Unsupported command (${formatCommandForError(command)})`;
}

function formatCommandForError(command: string): string {
  return [...command].map((char) => formatCodePoint(char.codePointAt(0) ?? 0)).join("");
}

function formatByte(byte: number): string {
  return `0x${byte.toString(16).padStart(2, "0")}`;
}

function formatRealtimeByte(byte: number): string {
  switch (byte) {
    case 0x3f:
      return "?";
    case 0x18:
      return "0x18";
    case 0x21:
      return "!";
    case 0x7e:
      return "~";
    default:
      return formatByte(byte);
  }
}

function formatCodePoint(codePoint: number): string {
  if (codePoint >= 0x20 && codePoint <= 0x7e) {
    return String.fromCodePoint(codePoint);
  }
  if (codePoint <= 0xff) {
    return formatByte(codePoint);
  }
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function isUnsupportedRawByte(byte: number): boolean {
  return (byte >= 0x00 && byte < 0x20) || byte > 0x7e;
}

function canonicalSettingName(settings: SettingsStore, name: string): string {
  return Object.keys(settings.snapshot().named).find((candidate) => candidate.toLowerCase() === name.toLowerCase()) ?? name;
}

function validOptionsForSetting(name: string): string[] {
  if (isCommandName(name, "message/level")) {
    return ["[MSG:INFO: Valid options: None Error Warning Info Debug Verbose]"];
  }
  if (isCommandName(name, "http/enable", "http/blockduringmotion", "telnet/enable")) {
    return ["[MSG:INFO: Valid options: true false]"];
  }
  return ["[MSG:INFO: Valid options unavailable in simulator]"];
}

function homingCompletionMessage(completion: HomingCompletion): string {
  if (completion.allAxes) {
    return "[MSG:Homing complete]";
  }
  return `[MSG:Homing ${completion.axes.map((axis) => axis.toUpperCase()).join("")} complete]`;
}

function formatLimitReport(activePins: string[]): string {
  const active = new Set(activePins.map((pin) => pin.toUpperCase()));
  return `[LIMITS:${["X", "Y", "Z", "A", "B", "C"].map((axis) => `${axis}${active.has(axis) ? 1 : 0}`).join(",")}]`;
}

function isFileCommandName(name: string): boolean {
  return isCommandName(
    name,
    "sd/delete",
    "sd/list",
    "sd/listjson",
    "sd/run",
    "sd/show",
    "sd/rename",
    "sd/status",
    "esp200",
    "files/listgcode",
    "file/showhash",
    "file/sendjson",
    "file/showsome"
  );
}

function splitRenameValue(value: string): { from: string; to: string } | undefined {
  const separator = value.indexOf(">");
  if (separator === -1) {
    return undefined;
  }
  return { from: value.slice(0, separator), to: value.slice(separator + 1) };
}

function isGcodeFile(name: string): boolean {
  return /\.(?:g|gc|gco|gcode|nc|ngc|ncc|txt|cnc|tap)$/i.test(name);
}

function logLevelForCommand(name: string): string {
  if (isCommandName(name, "lw", "log/warn")) {
    return "WARN";
  }
  if (isCommandName(name, "ld", "log/debug")) {
    return "DEBUG";
  }
  if (isCommandName(name, "lv", "log/verbose")) {
    return "VERBOSE";
  }
  if (isCommandName(name, "lm", "log/msg")) {
    return "MSG";
  }
  return "INFO";
}
