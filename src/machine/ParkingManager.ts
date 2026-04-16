import type { ParkingConfig } from "../config/ConfigLoader.js";
import type { AxisPosition, MachineState } from "./MachineState.js";

export interface ParkingSnapshot {
  enabled: boolean;
  parked: boolean;
  axis?: string;
  targetMposMm?: number;
  restorePosition?: AxisPosition;
}

export class ParkingManager {
  private parked = false;
  private restorePosition: AxisPosition | undefined;

  constructor(private readonly machine: MachineState, private readonly config?: ParkingConfig) {}

  park(): ParkingSnapshot {
    if (!this.config?.enable || !this.config.axis || this.config.targetMposMm === undefined) {
      return this.snapshot();
    }
    this.restorePosition = this.machine.snapshot().machinePosition;
    const axis = this.config.axis.toLowerCase() as keyof AxisPosition;
    this.machine.setMachinePosition({ [axis]: this.config.targetMposMm } as Partial<AxisPosition>);
    this.parked = true;
    return this.snapshot();
  }

  unpark(): ParkingSnapshot {
    if (this.parked && this.restorePosition) {
      this.machine.setMachinePosition(this.restorePosition);
    }
    this.parked = false;
    return this.snapshot();
  }

  snapshot(): ParkingSnapshot {
    return {
      enabled: this.config?.enable ?? false,
      parked: this.parked,
      axis: this.config?.axis,
      targetMposMm: this.config?.targetMposMm,
      restorePosition: this.restorePosition ? { ...this.restorePosition } : undefined
    };
  }
}
