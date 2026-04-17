import type { NormalizedConfig } from "../config/ConfigLoader.js";
import type { MotionSimulator, MotionTarget } from "../motion/MotionSimulator.js";
import type { Clock } from "../time/Clock.js";
import { WallClock } from "../time/Clock.js";
import { MachineState, type AxisPosition, type MachineRunState } from "./MachineState.js";

export interface HomingPhase {
  axis: string;
  phase: "seek" | "feed" | "pull-off" | "complete";
  target: number;
}

export interface HomingSimulatorOptions {
  clock?: Clock;
  motion?: MotionSimulator;
}

export interface HomingCompletion {
  axes: string[];
  allAxes: boolean;
}

type AxisKey = "x" | "y" | "z" | "a" | "b" | "c";
type HomingMovePhase = "seek" | "feed" | "pull-off";

interface QueuedHomingMove {
  targets: Partial<Record<AxisKey, number>>;
  rates: Partial<Record<AxisKey, number>>;
  settleMs: number;
}

interface ActiveHomingCycle {
  axes: AxisKey[];
  allAxes: boolean;
  queue: QueuedHomingMove[];
  currentMove?: QueuedHomingMove;
  settlingUntil?: number;
  completed?: HomingCompletion;
}

const AXIS_KEYS: AxisKey[] = ["x", "y", "z", "a", "b", "c"];
const DEFAULT_PULLOFF_MM = 1;
const DEFAULT_HOMING_FEED_MM_PER_MIN = 50;
const DEFAULT_HOMING_SEEK_MM_PER_MIN = 200;
const DEFAULT_HOMING_SETTLE_MS = 250;
const DEFAULT_HOMING_POSITIVE_DIRECTION = true;

export class HomingSimulator {
  private phases: HomingPhase[] = [];
  private activeCycle: ActiveHomingCycle | undefined;
  private readonly clock: Clock;
  private readonly motion: MotionSimulator | undefined;

  constructor(
    private readonly machine: MachineState,
    private readonly config: NormalizedConfig,
    options: HomingSimulatorOptions = {}
  ) {
    this.clock = options.clock ?? new WallClock();
    this.motion = options.motion;
  }

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
    const requestedAxes = normalizeRequestedAxes(axes).filter((axis) => this.config.axes[axis]);
    if (requestedAxes.length === 0) {
      this.machine.setRunState("Idle");
      return;
    }

    const allAxes = requestedAxes.length === normalizeRequestedAxes(Object.keys(this.config.axes)).length;
    const groups = homingGroups(requestedAxes, this.config, allAxes);
    const homedAxes = uniqueAxes(groups.flat());
    if (homedAxes.length === 0) {
      this.machine.setRunState("Idle");
      return;
    }
    const queue = this.buildMoveQueue(groups);
    this.activeCycle = {
      axes: homedAxes,
      allAxes,
      queue
    };
    this.machine.startHoming();
    this.startNextMove(this.clock.now());
  }

  update(): HomingCompletion | undefined {
    if (!this.activeCycle) {
      return undefined;
    }

    const now = this.clock.now();
    for (let guard = 0; guard < 100; guard += 1) {
      const cycle = this.activeCycle;
      if (!cycle) {
        return undefined;
      }

      if (cycle.completed) {
        const completion = cycle.completed;
        this.activeCycle = undefined;
        return completion;
      }

      if (cycle.settlingUntil !== undefined) {
        if (now < cycle.settlingUntil) {
          this.machine.setCurrentFeedRate(0);
          return undefined;
        }
        const settledAt = cycle.settlingUntil;
        cycle.settlingUntil = undefined;
        this.startNextMove(settledAt);
        continue;
      }

      if (!cycle.currentMove) {
        this.startNextMove(now);
        continue;
      }

      this.motion?.update();
      if (this.motion?.isActive()) {
        return undefined;
      }

      const move = cycle.currentMove;
      cycle.currentMove = undefined;
      const completedAt = this.motion?.consumeCompletedMotionTime() ?? now;
      this.machine.setRunState("Home");
      if (move.settleMs > 0) {
        const settledAt = completedAt + move.settleMs;
        if (now < settledAt) {
          cycle.settlingUntil = settledAt;
          return undefined;
        }
        this.startNextMove(settledAt);
        continue;
      }
      this.startNextMove(completedAt);
    }

    this.finishCycle();
    return this.update();
  }

  isActive(): boolean {
    this.update();
    return this.activeCycle !== undefined;
  }

  cancel(runState: MachineRunState = "Idle"): void {
    this.activeCycle = undefined;
    this.motion?.cancel(runState);
    this.machine.setRunState(runState);
    this.machine.setCurrentFeedRate(0);
  }

  history(): HomingPhase[] {
    return [...this.phases];
  }

  private buildMoveQueue(groups: AxisKey[][]): QueuedHomingMove[] {
    const queue: QueuedHomingMove[] = [];
    for (const group of groups) {
      queue.push(this.buildMove(group, "seek", (axis) => switchPosition(this.config, axis), (axis) => homingSeekRate(this.config, axis)));
      queue.push(this.buildMove(group, "pull-off", (axis) => homedPosition(this.config, axis), (axis) => homingFeedRate(this.config, axis)));
      queue.push(this.buildMove(group, "feed", (axis) => switchPosition(this.config, axis), (axis) => homingFeedRate(this.config, axis)));
      queue.push(this.buildMove(group, "pull-off", (axis) => homedPosition(this.config, axis), (axis) => homingFeedRate(this.config, axis)));
      for (const axis of group) {
        this.phases.push({ axis, phase: "complete", target: homedPosition(this.config, axis) });
      }
    }
    return queue;
  }

  private buildMove(
    axes: AxisKey[],
    phase: HomingMovePhase,
    targetForAxis: (axis: AxisKey) => number,
    rateForAxis: (axis: AxisKey) => number
  ): QueuedHomingMove {
    const targets: Partial<Record<AxisKey, number>> = {};
    const rates: Partial<Record<AxisKey, number>> = {};
    let settleMs = 0;
    for (const axis of axes) {
      const target = targetForAxis(axis);
      targets[axis] = target;
      rates[axis] = rateForAxis(axis);
      settleMs = Math.max(settleMs, homingSettleMs(this.config, axis));
      this.phases.push({ axis, phase, target });
    }
    return { targets, rates, settleMs };
  }

  private startNextMove(startTimeMs: number): void {
    if (!this.activeCycle) {
      return;
    }

    const next = this.activeCycle.queue.shift();
    if (!next) {
      this.finishCycle();
      return;
    }

    this.activeCycle.currentMove = next;
    if (!this.motion) {
      this.machine.setMachinePosition(next.targets);
      return;
    }

    const planned = this.motion.planSystemLinear(next.targets as MotionTarget, {
      runState: "Home",
      feedRateMmPerMin: vectorRate(next),
      skipSoftLimits: true,
      noFeedOverride: true,
      startTimeMs
    });
    if (!planned) {
      this.machine.setMachinePosition(next.targets);
      this.activeCycle.currentMove = undefined;
    }
  }

  private finishCycle(): void {
    if (!this.activeCycle) {
      return;
    }
    const target: Partial<AxisPosition> = {};
    for (const axis of this.activeCycle.axes) {
      target[axis] = homedPosition(this.config, axis);
    }
    this.machine.setMachinePosition(target);
    this.machine.unlock();
    this.machine.setRunState("Idle");
    this.machine.setCurrentFeedRate(0);
    this.activeCycle.completed = { axes: [...this.activeCycle.axes], allAxes: this.activeCycle.allAxes };
  }
}

function normalizeRequestedAxes(axes: string[]): AxisKey[] {
  const normalized: AxisKey[] = [];
  for (const axis of axes) {
    const key = axis.toLowerCase();
    if (isAxisKey(key) && !normalized.includes(key)) {
      normalized.push(key);
    }
  }
  return normalized;
}

function uniqueAxes(axes: AxisKey[]): AxisKey[] {
  return axes.filter((axis, index) => axes.indexOf(axis) === index);
}

function homingGroups(axes: AxisKey[], config: NormalizedConfig, allAxes: boolean): AxisKey[][] {
  if (!allAxes) {
    return [axes];
  }

  const axesWithCycles = axes
    .map((axis) => ({ axis, cycle: config.axes[axis]?.homing?.cycle }))
    .filter((entry): entry is { axis: AxisKey; cycle: number } => typeof entry.cycle === "number" && entry.cycle > 0);
  if (axesWithCycles.length === 0) {
    return [axes];
  }

  const cycles = [...new Set(axesWithCycles.map((entry) => entry.cycle))].sort((a, b) => a - b);
  return cycles.map((cycle) => axesWithCycles.filter((entry) => entry.cycle === cycle).map((entry) => entry.axis));
}

function isAxisKey(value: string): value is AxisKey {
  return AXIS_KEYS.includes(value as AxisKey);
}

function homedPosition(config: NormalizedConfig, axis: AxisKey): number {
  return config.axes[axis]?.homing?.mposMm ?? 0;
}

function switchPosition(config: NormalizedConfig, axis: AxisKey): number {
  return homedPosition(config, axis) + homingDirectionSign(config, axis) * pulloff(config, axis);
}

function vectorRate(move: QueuedHomingMove): number {
  const rateSquare = Object.values(move.rates).reduce((sum, rate) => sum + (rate ?? 0) * (rate ?? 0), 0);
  return Math.sqrt(rateSquare) || DEFAULT_HOMING_FEED_MM_PER_MIN;
}

function homingDirectionSign(config: NormalizedConfig, axis: AxisKey): number {
  return (config.axes[axis]?.homing?.positiveDirection ?? DEFAULT_HOMING_POSITIVE_DIRECTION) ? 1 : -1;
}

function pulloff(config: NormalizedConfig, axis: AxisKey): number {
  const axisConfig = config.axes[axis];
  return axisConfig?.pulloffMm ?? axisConfig?.motors?.[0]?.pulloffMm ?? DEFAULT_PULLOFF_MM;
}

function homingFeedRate(config: NormalizedConfig, axis: AxisKey): number {
  return positiveNumber(config.axes[axis]?.homing?.feedMmPerMin) ?? DEFAULT_HOMING_FEED_MM_PER_MIN;
}

function homingSeekRate(config: NormalizedConfig, axis: AxisKey): number {
  return positiveNumber(config.axes[axis]?.homing?.seekMmPerMin) ?? DEFAULT_HOMING_SEEK_MM_PER_MIN;
}

function homingSettleMs(config: NormalizedConfig, axis: AxisKey): number {
  return Math.max(0, config.axes[axis]?.homing?.settleMs ?? DEFAULT_HOMING_SETTLE_MS);
}

function positiveNumber(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}
