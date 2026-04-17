import type { AxisPosition } from "./MachineState.js";
import { MachineState } from "./MachineState.js";
import type { MotionSimulator } from "../motion/MotionSimulator.js";

export interface ProbeOptions {
  triggerPosition?: Partial<AxisPosition>;
  shouldTrigger?: boolean;
}

export class ProbeModel {
  private activeProbe:
    | {
        motion: MotionSimulator;
        position: Partial<AxisPosition>;
        succeeded: boolean;
        failOnMiss: boolean;
      }
    | undefined;

  constructor(private readonly machine: MachineState, private options: ProbeOptions = {}) {}

  configure(options: ProbeOptions): void {
    this.options = { ...this.options, ...options };
  }

  run(target: Partial<AxisPosition>, failOnMiss: boolean, motion?: MotionSimulator): boolean {
    const trigger = this.options.shouldTrigger ?? true;
    const position = trigger ? { ...target, ...this.options.triggerPosition } : target;

    if (motion) {
      const planned = motion.planLinearAs(position, "Run", false);
      if (planned) {
        this.activeProbe = { motion, position, succeeded: trigger, failOnMiss };
      }
      return planned && trigger;
    }

    if (trigger) {
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

  update(): void {
    if (!this.activeProbe) {
      return;
    }

    this.activeProbe.motion.update();
    if (this.activeProbe.motion.isActive()) {
      return;
    }

    const probe = this.activeProbe;
    this.activeProbe = undefined;
    this.machine.setProbeResult(probe.position, probe.succeeded);
    if (!probe.succeeded && probe.failOnMiss) {
      this.machine.setAlarm("Probe fail");
    }
  }
}
