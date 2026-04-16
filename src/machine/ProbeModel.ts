import type { AxisPosition } from "./MachineState.js";
import { MachineState } from "./MachineState.js";

export interface ProbeOptions {
  triggerPosition?: Partial<AxisPosition>;
  shouldTrigger?: boolean;
}

export class ProbeModel {
  constructor(private readonly machine: MachineState, private options: ProbeOptions = {}) {}

  configure(options: ProbeOptions): void {
    this.options = { ...this.options, ...options };
  }

  run(target: Partial<AxisPosition>, failOnMiss: boolean): boolean {
    const trigger = this.options.shouldTrigger ?? true;
    if (trigger) {
      const position = { ...target, ...this.options.triggerPosition };
      this.machine.setMachinePosition(position);
      this.machine.setProbeResult(position, true);
      return true;
    }

    this.machine.setMachinePosition(target);
    this.machine.setProbeResult(target, false);
    if (failOnMiss) {
      this.machine.setAlarm("Probe fail");
    }
    return false;
  }
}
