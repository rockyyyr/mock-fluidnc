import type { AxisPosition } from "../machine/MachineState.js";

export interface MotorPosition {
  [motor: string]: number;
}

export interface Kinematics {
  readonly name: string;
  machineToMotors(position: AxisPosition): MotorPosition;
  motorsToMachine(position: MotorPosition): AxisPosition;
}

export class CartesianKinematics implements Kinematics {
  readonly name = "Cartesian";

  machineToMotors(position: AxisPosition): MotorPosition {
    return { ...position };
  }

  motorsToMachine(position: MotorPosition): AxisPosition {
    return {
      x: position.x ?? 0,
      y: position.y ?? 0,
      z: position.z ?? 0,
      a: position.a,
      b: position.b,
      c: position.c
    };
  }
}

export class CoreXYKinematics implements Kinematics {
  readonly name: string = "CoreXY";

  machineToMotors(position: AxisPosition): MotorPosition {
    return {
      a: position.x + position.y,
      b: position.x - position.y,
      z: position.z
    };
  }

  motorsToMachine(position: MotorPosition): AxisPosition {
    return {
      x: ((position.a ?? 0) + (position.b ?? 0)) / 2,
      y: ((position.a ?? 0) - (position.b ?? 0)) / 2,
      z: position.z ?? 0
    };
  }
}

export class WallPlotterKinematics implements Kinematics {
  readonly name = "WallPlotter";

  constructor(private readonly widthMm = 1000) {}

  machineToMotors(position: AxisPosition): MotorPosition {
    return {
      left: Math.hypot(position.x, position.y),
      right: Math.hypot(this.widthMm - position.x, position.y),
      z: position.z
    };
  }

  motorsToMachine(position: MotorPosition): AxisPosition {
    const left = position.left ?? 0;
    const right = position.right ?? 0;
    const x = (left * left - right * right + this.widthMm * this.widthMm) / (2 * this.widthMm);
    const y = Math.sqrt(Math.max(0, left * left - x * x));
    return { x, y, z: position.z ?? 0 };
  }
}

export class MidtbotKinematics extends CoreXYKinematics {
  override readonly name = "Midtbot";
}

export class ParallelDeltaKinematics implements Kinematics {
  readonly name = "ParallelDelta";

  machineToMotors(position: AxisPosition): MotorPosition {
    return {
      tower1: position.z + position.x,
      tower2: position.z - position.x / 2 + (Math.sqrt(3) / 2) * position.y,
      tower3: position.z - position.x / 2 - (Math.sqrt(3) / 2) * position.y
    };
  }

  motorsToMachine(position: MotorPosition): AxisPosition {
    const tower1 = position.tower1 ?? 0;
    const tower2 = position.tower2 ?? 0;
    const tower3 = position.tower3 ?? 0;
    const z = (tower1 + tower2 + tower3) / 3;
    const x = tower1 - z;
    const y = (tower2 - tower3) / Math.sqrt(3);
    return { x, y, z };
  }
}
