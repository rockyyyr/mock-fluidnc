import type { AxisConfig } from "../config/ConfigLoader.js";
import type { AxisPosition } from "../machine/MachineState.js";
import { MachineState, type MachineRunState } from "../machine/MachineState.js";
import type { Clock } from "../time/Clock.js";

export interface MotionSimulatorOptions {
  clock: Clock;
  axes?: Record<string, AxisConfig>;
  rapidRateMmPerMin?: number;
}

export interface MotionTarget {
  x?: number;
  y?: number;
  z?: number;
  a?: number;
  b?: number;
  c?: number;
}

export type MotionKind = "linear" | "arc";

export interface SystemMotionOptions {
  feedRateMmPerMin: number;
  runState?: MachineRunState;
  skipSoftLimits?: boolean;
  noFeedOverride?: boolean;
  startTimeMs?: number;
}

interface ActiveMotion {
  kind: MotionKind;
  startTime: number;
  profile: MotionProfile;
  start: AxisPosition;
  end: AxisPosition;
  runState: MachineRunState;
  pausedAt?: number;
}

interface VirtualLimitHit {
  axis: keyof AxisPosition;
  position: AxisPosition;
}

interface MotionPlanOptions {
  rapid?: boolean;
  runState?: MachineRunState;
  distanceScale?: number;
  feedRateMmPerMin?: number;
  skipSoftLimits?: boolean;
  noFeedOverride?: boolean;
  startTimeMs?: number;
}

interface MotionProfile {
  distanceMm: number;
  accelerationMmPerSec2: number;
  maxVelocityMmPerSec: number;
  accelTimeSec: number;
  cruiseTimeSec: number;
  totalTimeSec: number;
  accelDistanceMm: number;
  cruiseDistanceMm: number;
}

export class MotionSimulator {
  private activeMotion: ActiveMotion | undefined;
  private completedMotionAt: number | undefined;
  private readonly rapidRateMmPerMin: number;

  constructor(private readonly machine: MachineState, private readonly options: MotionSimulatorOptions) {
    this.rapidRateMmPerMin = options.rapidRateMmPerMin ?? 3000;
  }

  planLinear(target: MotionTarget, rapid = false): boolean {
    return this.plan("linear", target, { rapid });
  }

  planLinearAs(target: MotionTarget, runState: MachineRunState, rapid = false): boolean {
    return this.plan("linear", target, { rapid, runState });
  }

  planSystemLinear(target: MotionTarget, options: SystemMotionOptions): boolean {
    return this.plan("linear", target, {
      runState: options.runState ?? "Run",
      feedRateMmPerMin: options.feedRateMmPerMin,
      skipSoftLimits: options.skipSoftLimits ?? true,
      noFeedOverride: options.noFeedOverride ?? true,
      startTimeMs: options.startTimeMs
    });
  }

  planArc(target: MotionTarget, runState: MachineRunState = "Run"): boolean {
    return this.plan("arc", target, { runState, distanceScale: 1.1 });
  }

  update(): void {
    if (!this.activeMotion) {
      this.machine.setCurrentFeedRate(0);
      return;
    }

    const now = this.options.clock.now();
    if (this.activeMotion.pausedAt !== undefined) {
      this.machine.setCurrentFeedRate(0);
      return;
    }
    const elapsed = now - this.activeMotion.startTime;
    const elapsedSec = Math.max(0, elapsed / 1000);
    const traveled = distanceAtElapsed(this.activeMotion.profile, elapsedSec);
    const progress =
      this.activeMotion.profile.distanceMm <= 0 ? 1 : Math.min(1, Math.max(0, traveled / this.activeMotion.profile.distanceMm));
    const position = interpolate(this.activeMotion.start, this.activeMotion.end, progress);
    const virtualLimitHit = this.virtualLimitHit(position, this.activeMotion);
    this.machine.setMachinePosition(virtualLimitHit?.position ?? position);
    this.updateVirtualLimitPins(virtualLimitHit?.position ?? position);
    this.machine.setCurrentFeedRate(velocityAtElapsed(this.activeMotion.profile, elapsedSec) * 60);

    if (virtualLimitHit) {
      const runState = this.activeMotion.runState;
      this.completedMotionAt = virtualLimitHitTime(this.activeMotion, virtualLimitHit.position);
      this.activeMotion = undefined;
      this.machine.setPlannerSummary(15, 128);
      this.machine.setCurrentFeedRate(0);
      if (runState === "Home") {
        this.machine.setRunState("Idle");
      } else {
        this.machine.setAlarm(`Hard limit ${String(virtualLimitHit.axis).toUpperCase()}`);
      }
      return;
    }

    if (progress >= 1) {
      this.completedMotionAt = this.activeMotion.startTime + this.activeMotion.profile.totalTimeSec * 1000;
      this.activeMotion = undefined;
      this.machine.setRunState("Idle");
      this.machine.setCurrentFeedRate(0);
      this.machine.setPlannerSummary(15, 128);
    }
  }

  isActive(): boolean {
    this.update();
    return this.activeMotion !== undefined;
  }

  consumeCompletedMotionTime(): number | undefined {
    const completedAt = this.completedMotionAt;
    this.completedMotionAt = undefined;
    return completedAt;
  }

  cancel(runState: MachineRunState = "Idle"): void {
    this.activeMotion = undefined;
    this.completedMotionAt = undefined;
    this.machine.setRunState(runState);
    this.machine.setCurrentFeedRate(0);
    this.machine.setPlannerSummary(15, 128);
  }

  hold(): void {
    this.update();
    if (!this.activeMotion || this.activeMotion.pausedAt !== undefined) {
      return;
    }
    this.activeMotion.pausedAt = this.options.clock.now();
    this.machine.setRunState("Hold");
    this.machine.setCurrentFeedRate(0);
  }

  resume(): void {
    if (!this.activeMotion || this.activeMotion.pausedAt === undefined) {
      return;
    }
    const pausedDuration = this.options.clock.now() - this.activeMotion.pausedAt;
    this.activeMotion.startTime += pausedDuration;
    this.activeMotion.pausedAt = undefined;
    this.machine.setRunState(this.activeMotion.runState);
  }

  private plan(kind: MotionKind, target: MotionTarget, options: MotionPlanOptions = {}): boolean {
    this.update();
    const snapshot = this.machine.snapshot();
    const rapid = options.rapid ?? false;
    const runState = options.runState ?? "Run";
    const requestedEnd = resolveTarget(snapshot.machinePosition, target);
    const end = runState === "Jog" ? this.constrainJogTarget(snapshot.machinePosition, requestedEnd) : requestedEnd;
    if (!options.skipSoftLimits && runState !== "Jog" && !this.validateSoftLimits(end)) {
      return false;
    }

    const distance = distanceBetween(snapshot.machinePosition, end) * (options.distanceScale ?? 1);
    if (distance <= 0) {
      return false;
    }
    const unitVector = unitVectorBetween(snapshot.machinePosition, end);
    const axisLimitedRate = this.axisLimitedRateMmPerMin(unitVector);
    const programmedRate =
      options.feedRateMmPerMin ?? (rapid ? this.rapidFeedRateMmPerMin(snapshot.machinePosition, end) : snapshot.feedRate || this.rapidRateMmPerMin);
    const override = options.noFeedOverride ? 100 : rapid ? snapshot.rapidOverride : runState === "Jog" ? 100 : snapshot.feedrateOverride;
    const overrideRate = programmedRate * (override / 100);
    const effectiveRate = !rapid && axisLimitedRate !== undefined ? Math.min(overrideRate, axisLimitedRate) : overrideRate;
    const profile = calculateMotionProfile(distance, effectiveRate, this.axisLimitedAccelerationMmPerSec2(unitVector));

    this.activeMotion = {
      kind,
      startTime: options.startTimeMs ?? this.options.clock.now(),
      profile,
      start: snapshot.machinePosition,
      end,
      runState
    };
    this.machine.setRunState(runState);
    this.machine.setPlannerSummary(14, 128);
    this.update();
    return true;
  }

  private validateSoftLimits(position: AxisPosition): boolean {
    for (const [axis, config] of Object.entries(this.options.axes ?? {})) {
      if (!config.softLimits || config.maxTravelMm === undefined) {
        continue;
      }
      const value = position[axis as keyof AxisPosition];
      if (value === undefined) {
        continue;
      }
      const limits = softLimitBounds(config);
      if (value < limits.min || value > limits.max) {
        this.machine.setAlarm("Soft limit");
        return false;
      }
    }
    return true;
  }

  private constrainJogTarget(currentPosition: AxisPosition, requestedTarget: AxisPosition): AxisPosition {
    const target = { ...requestedTarget };
    for (const [axis, config] of Object.entries(this.options.axes ?? {})) {
      if (!config.softLimits || config.maxTravelMm === undefined) {
        continue;
      }
      const key = axis as keyof AxisPosition;
      const current = currentPosition[key];
      const requested = requestedTarget[key];
      if (current === undefined || requested === undefined || requested === current) {
        continue;
      }

      const limits = softLimitBounds(config);
      const movingPositive = requested > current;
      const movingFartherOutside = (!movingPositive && current < limits.min) || (movingPositive && current > limits.max);
      if (movingFartherOutside) {
        target[key] = current;
        continue;
      }

      if (requested < limits.min) {
        target[key] = limits.min;
      } else if (requested > limits.max) {
        target[key] = limits.max;
      }
    }
    return target;
  }

  private accelerationMmPerSec2(): number {
    const accelerations = Object.values(this.options.axes ?? {})
      .map((axis) => axis.accelerationMmPerSec2)
      .filter((value): value is number => typeof value === "number" && value > 0);
    return accelerations.length > 0 ? Math.min(...accelerations) : 1000;
  }

  private rapidFeedRateMmPerMin(start: AxisPosition, end: AxisPosition): number {
    return this.axisLimitedRateMmPerMin(unitVectorBetween(start, end)) ?? this.rapidRateMmPerMin;
  }

  private axisLimitedRateMmPerMin(unitVector: AxisPosition): number | undefined {
    const axisLimitedRates = Object.values(this.options.axes ?? {})
      .map((axis) => {
        const axisId = axis.id as keyof AxisPosition;
        const component = Math.abs(unitVector[axisId] ?? 0);
        if (component <= 0 || axis.maxRateMmPerMin === undefined || axis.maxRateMmPerMin <= 0) {
          return undefined;
        }
        return axis.maxRateMmPerMin / component;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

    return axisLimitedRates.length > 0 ? Math.min(...axisLimitedRates) : undefined;
  }

  private axisLimitedAccelerationMmPerSec2(unitVector: AxisPosition): number {
    const axisLimitedAccelerations = Object.values(this.options.axes ?? {})
      .map((axis) => {
        const axisId = axis.id as keyof AxisPosition;
        const component = Math.abs(unitVector[axisId] ?? 0);
        if (component <= 0 || axis.accelerationMmPerSec2 === undefined || axis.accelerationMmPerSec2 <= 0) {
          return undefined;
        }
        return axis.accelerationMmPerSec2 / component;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

    return axisLimitedAccelerations.length > 0 ? Math.min(...axisLimitedAccelerations) : this.accelerationMmPerSec2();
  }

  private virtualLimitHit(position: AxisPosition, motion: ActiveMotion): VirtualLimitHit | undefined {
    const limitedPosition = { ...position };
    for (const [axis, config] of Object.entries(this.options.axes ?? {})) {
      if (config.softLimits || config.maxTravelMm === undefined) {
        continue;
      }
      const key = axis as keyof AxisPosition;
      const value = limitedPosition[key];
      const start = motion.start[key] ?? 0;
      const end = motion.end[key] ?? start;
      if (value === undefined) {
        continue;
      }
      const negativeLimit = -1;
      const positiveLimit = config.maxTravelMm + 1;
      if (value <= negativeLimit && end <= start) {
        limitedPosition[key] = negativeLimit;
        return { axis: key, position: limitedPosition };
      }
      if (value >= positiveLimit && end >= start) {
        limitedPosition[key] = positiveLimit;
        return { axis: key, position: limitedPosition };
      }
    }
    return undefined;
  }

  private updateVirtualLimitPins(position: AxisPosition): void {
    for (const [axis, config] of Object.entries(this.options.axes ?? {})) {
      if (config.softLimits || config.maxTravelMm === undefined) {
        this.machine.setLimitPin(axis, false);
        continue;
      }
      const value = position[axis as keyof AxisPosition];
      const active = value !== undefined && (value <= -1 || value >= config.maxTravelMm + 1);
      this.machine.setLimitPin(axis, active);
    }
  }
}

function calculateMotionProfile(distanceMm: number, feedRateMmPerMin: number, accelerationMmPerSec2: number): MotionProfile {
  if (distanceMm <= 0 || feedRateMmPerMin <= 0) {
    return emptyMotionProfile(distanceMm, accelerationMmPerSec2);
  }
  const maxVelocityMmPerSec = feedRateMmPerMin / 60;
  const accelTimeSec = maxVelocityMmPerSec / accelerationMmPerSec2;
  const accelDistanceMm = 0.5 * accelerationMmPerSec2 * accelTimeSec * accelTimeSec;
  if (2 * accelDistanceMm >= distanceMm) {
    const peakVelocityMmPerSec = Math.sqrt(distanceMm * accelerationMmPerSec2);
    const triangularAccelTimeSec = peakVelocityMmPerSec / accelerationMmPerSec2;
    return {
      distanceMm,
      accelerationMmPerSec2,
      maxVelocityMmPerSec: peakVelocityMmPerSec,
      accelTimeSec: triangularAccelTimeSec,
      cruiseTimeSec: 0,
      totalTimeSec: 2 * triangularAccelTimeSec,
      accelDistanceMm: distanceMm / 2,
      cruiseDistanceMm: 0
    };
  }
  const cruiseDistance = distanceMm - 2 * accelDistanceMm;
  const cruiseTimeSec = cruiseDistance / maxVelocityMmPerSec;
  return {
    distanceMm,
    accelerationMmPerSec2,
    maxVelocityMmPerSec,
    accelTimeSec,
    cruiseTimeSec,
    totalTimeSec: 2 * accelTimeSec + cruiseTimeSec,
    accelDistanceMm,
    cruiseDistanceMm: cruiseDistance
  };
}

function emptyMotionProfile(distanceMm: number, accelerationMmPerSec2: number): MotionProfile {
  return {
    distanceMm,
    accelerationMmPerSec2,
    maxVelocityMmPerSec: 0,
    accelTimeSec: 0,
    cruiseTimeSec: 0,
    totalTimeSec: 0,
    accelDistanceMm: 0,
    cruiseDistanceMm: 0
  };
}

function distanceAtElapsed(profile: MotionProfile, elapsedSec: number): number {
  if (profile.totalTimeSec <= 0 || elapsedSec >= profile.totalTimeSec) {
    return profile.distanceMm;
  }
  if (elapsedSec <= profile.accelTimeSec) {
    return 0.5 * profile.accelerationMmPerSec2 * elapsedSec * elapsedSec;
  }
  const cruiseEndSec = profile.accelTimeSec + profile.cruiseTimeSec;
  if (elapsedSec <= cruiseEndSec) {
    return profile.accelDistanceMm + profile.maxVelocityMmPerSec * (elapsedSec - profile.accelTimeSec);
  }
  const decelElapsedSec = elapsedSec - cruiseEndSec;
  return Math.min(
    profile.distanceMm,
    profile.accelDistanceMm +
      profile.cruiseDistanceMm +
      profile.maxVelocityMmPerSec * decelElapsedSec -
      0.5 * profile.accelerationMmPerSec2 * decelElapsedSec * decelElapsedSec
  );
}

function velocityAtElapsed(profile: MotionProfile, elapsedSec: number): number {
  if (profile.totalTimeSec <= 0 || elapsedSec <= 0 || elapsedSec >= profile.totalTimeSec) {
    return 0;
  }
  if (elapsedSec <= profile.accelTimeSec) {
    return profile.accelerationMmPerSec2 * elapsedSec;
  }
  const cruiseEndSec = profile.accelTimeSec + profile.cruiseTimeSec;
  if (elapsedSec <= cruiseEndSec) {
    return profile.maxVelocityMmPerSec;
  }
  return Math.max(0, profile.maxVelocityMmPerSec - profile.accelerationMmPerSec2 * (elapsedSec - cruiseEndSec));
}

function resolveTarget(start: AxisPosition, target: MotionTarget): AxisPosition {
  return {
    ...start,
    ...target
  };
}

function interpolate(start: AxisPosition, end: AxisPosition, progress: number): AxisPosition {
  const position: AxisPosition = {
    x: interpolateAxis(start.x, end.x, progress),
    y: interpolateAxis(start.y, end.y, progress),
    z: interpolateAxis(start.z, end.z, progress)
  };
  const a = interpolateOptionalAxis(start.a, end.a, progress);
  const b = interpolateOptionalAxis(start.b, end.b, progress);
  const c = interpolateOptionalAxis(start.c, end.c, progress);
  if (a !== undefined) {
    position.a = a;
  }
  if (b !== undefined) {
    position.b = b;
  }
  if (c !== undefined) {
    position.c = c;
  }
  return position;
}

function interpolateAxis(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function interpolateOptionalAxis(start: number | undefined, end: number | undefined, progress: number): number | undefined {
  if (start === undefined && end === undefined) {
    return undefined;
  }
  return interpolateAxis(start ?? 0, end ?? 0, progress);
}

function distanceBetween(start: AxisPosition, end: AxisPosition): number {
  const axes: Array<keyof AxisPosition> = ["x", "y", "z", "a", "b", "c"];
  const sum = axes.reduce((total, axis) => {
    const delta = (end[axis] ?? 0) - (start[axis] ?? 0);
    return total + delta * delta;
  }, 0);
  return Math.sqrt(sum);
}

function virtualLimitHitTime(motion: ActiveMotion, position: AxisPosition): number {
  const distance = distanceBetween(motion.start, motion.end);
  const hitDistance = distanceBetween(motion.start, position);
  const progress = distance <= 0 ? 1 : Math.min(1, Math.max(0, hitDistance / distance));
  return motion.startTime + motion.profile.totalTimeSec * 1000 * progress;
}

function softLimitBounds(axis: AxisConfig): { min: number; max: number } {
  const homing = axis.homing;
  const mpos = homing?.mposMm ?? 0;
  const maxTravel = axis.maxTravelMm ?? 0;
  const positiveDirection = homing?.positiveDirection ?? true;
  return positiveDirection ? { min: mpos - maxTravel, max: mpos } : { min: mpos, max: mpos + maxTravel };
}

function unitVectorBetween(start: AxisPosition, end: AxisPosition): AxisPosition {
  const distance = distanceBetween(start, end);
  if (distance <= 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: (end.x - start.x) / distance,
    y: (end.y - start.y) / distance,
    z: (end.z - start.z) / distance,
    a: optionalUnitComponent(start.a, end.a, distance),
    b: optionalUnitComponent(start.b, end.b, distance),
    c: optionalUnitComponent(start.c, end.c, distance)
  };
}

function optionalUnitComponent(start: number | undefined, end: number | undefined, distance: number): number | undefined {
  if (start === undefined && end === undefined) {
    return undefined;
  }
  return ((end ?? 0) - (start ?? 0)) / distance;
}
