import type { NormalizedConfig } from "../config/ConfigLoader.js";
import { MachineState } from "./MachineState.js";

export interface HomingPhase {
  axis: string;
  phase: "seek" | "feed" | "pull-off" | "complete";
  target: number;
}

export class HomingSimulator {
  private phases: HomingPhase[] = [];

  constructor(private readonly machine: MachineState, private readonly config: NormalizedConfig) {}

  applyStartupAlarm(): void {
    if (this.config.start.mustHome) {
      this.machine.setAlarm("Homing required");
    }
  }

  homeAll(): void {
    this.homeAxes(Object.keys(this.config.axes));
  }

  homeAxes(axes: string[]): void {
    this.phases = [];
    this.machine.startHoming();
    const target = { ...this.machine.snapshot().machinePosition };
    for (const axis of axes) {
      const config = this.config.axes[axis];
      if (!config) {
        continue;
      }
      const key = axis as "x" | "y" | "z" | "a" | "b" | "c";
      const seekTarget = config.homing?.mposMm ?? (config.homing?.positiveDirection ? config.maxTravelMm ?? 0 : 0);
      this.phases.push({ axis, phase: "seek", target: seekTarget });
      this.phases.push({ axis, phase: "feed", target: seekTarget });
      const pullOff = config.pulloffMm ?? 0;
      const pullOffTarget = config.homing?.positiveDirection ? seekTarget - pullOff : seekTarget + pullOff;
      this.phases.push({ axis, phase: "pull-off", target: pullOffTarget });
      target[key] = pullOffTarget;
      this.phases.push({ axis, phase: "complete", target: pullOffTarget });
    }
    this.machine.setMachinePosition(target);
    this.machine.unlock();
    this.machine.setRunState("Idle");
  }

  history(): HomingPhase[] {
    return [...this.phases];
  }
}
