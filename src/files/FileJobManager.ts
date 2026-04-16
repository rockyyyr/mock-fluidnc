import { executeGCodeLine } from "../gcode/GCodeExecutor.js";
import type { MachineState } from "../machine/MachineState.js";
import type { MotionSimulator } from "../motion/MotionSimulator.js";
import { VirtualFileSystem, type VirtualFileEntry } from "./VirtualFileSystem.js";

export type FileJobState = "idle" | "running" | "paused" | "completed" | "cancelled" | "alarm";

export interface FileJobSnapshot {
  state: FileJobState;
  activeFile?: string;
  completedLines: number;
  totalLines: number;
  progress: string;
}

export class FileJobManager {
  private state: FileJobState = "idle";
  private activeFile: string | undefined;
  private activeLines: string[] = [];
  private completedLines = 0;
  private totalLines = 0;

  constructor(
    private readonly files: VirtualFileSystem,
    private readonly machine: MachineState,
    private readonly motion?: MotionSimulator
  ) {}

  listFiles(): string[] {
    return this.files.listSync(".");
  }

  listDetailed(path = "."): VirtualFileEntry[] {
    return this.files.listDetailedSync(cleanSdPath(path || "."));
  }

  writeFile(path: string, contents: string): void {
    this.files.writeSync(cleanSdPath(path), contents);
  }

  readFile(path: string): string {
    return this.files.readSync(cleanSdPath(path));
  }

  deleteFile(path: string): void {
    this.files.deleteSync(cleanSdPath(path));
  }

  renameFile(fromPath: string, toPath: string): void {
    this.files.renameSync(cleanSdPath(fromPath), cleanSdPath(toPath));
  }

  runFile(path: string): FileJobSnapshot {
    this.startFile(path);
    return this.processAll();
  }

  startFile(path: string): FileJobSnapshot {
    const cleanPath = cleanSdPath(path);
    const contents = this.files.readSync(cleanPath);
    const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
    this.state = "running";
    this.activeFile = cleanPath;
    this.activeLines = lines;
    this.completedLines = 0;
    this.totalLines = lines.length;
    return this.snapshot();
  }

  processAll(): FileJobSnapshot {
    while (this.state === "running" && this.completedLines < this.activeLines.length) {
      this.step();
    }

    if (this.state === "running" && this.completedLines >= this.activeLines.length) {
      this.state = "completed";
    }
    return this.snapshot();
  }

  step(): FileJobSnapshot {
    if (this.state !== "running") {
      return this.snapshot();
    }

    const line = this.activeLines[this.completedLines];
    if (line === undefined) {
      this.state = "completed";
      return this.snapshot();
    }

    const result = executeGCodeLine(this.machine, line, this.motion ? { motion: this.motion } : {});
    if (!result.handled) {
      this.state = "alarm";
      this.machine.setAlarm(result.error ?? "File job error");
      return this.snapshot();
    }
    this.completedLines += 1;
    if (this.completedLines >= this.activeLines.length) {
      this.state = "completed";
    }
    return this.snapshot();
  }

  pause(): void {
    if (this.state === "running") {
      this.state = "paused";
    }
  }

  resume(): void {
    if (this.state === "paused") {
      this.state = "running";
    }
  }

  cancel(): void {
    if (this.state === "running" || this.state === "paused") {
      this.state = "cancelled";
    }
  }

  alarm(message = "File job alarm"): void {
    if (this.state === "running" || this.state === "paused") {
      this.state = "alarm";
    }
    this.machine.setAlarm(message);
  }

  snapshot(): FileJobSnapshot {
    return {
      state: this.state,
      activeFile: this.activeFile,
      completedLines: this.completedLines,
      totalLines: this.totalLines,
      progress: `SD:${this.completedLines}/${this.totalLines}`
    };
  }
}

function cleanSdPath(path: string): string {
  return path.replace(/^\/+/, "");
}
