import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";

export interface SimulatorConfig {
  source?: string;
  raw: string;
  parsed: NormalizedConfig;
  warnings: string[];
  validationErrors: string[];
}

export interface NormalizedConfig {
  board?: string;
  name: string;
  kinematics: string;
  kinematicsConfig: Record<string, unknown>;
  axes: Record<string, AxisConfig>;
  planner?: PlannerConfig;
  filesystem?: FilesystemConfig;
  macros?: MacrosConfig;
  spindle?: SpindleConfig;
  coolant?: CoolantConfig;
  probe?: ProbeConfig;
  parking?: ParkingConfig;
  control?: ControlConfig;
  userInputs?: UserIoConfig;
  userOutputs?: UserIoConfig;
  hardware?: Record<string, unknown>;
  start: {
    mustHome: boolean;
    deactivateParking?: boolean;
    checkLimits?: boolean;
  };
}

export interface AxisConfig {
  id: string;
  stepsPerMm?: number;
  maxRateMmPerMin?: number;
  accelerationMmPerSec2?: number;
  maxTravelMm?: number;
  softLimits: boolean;
  pulloffMm?: number;
  homing?: HomingConfig;
  motors?: MotorConfig[];
}

export interface HomingConfig {
  cycle?: number;
  positiveDirection?: boolean;
  mposMm?: number;
  feedMmPerMin?: number;
  seekMmPerMin?: number;
  settleMs?: number;
  seekScaler?: number;
  feedScaler?: number;
}

export interface MotorConfig {
  id: string;
  limitNegPin?: string;
  limitPosPin?: string;
  limitAllPin?: string;
  hardLimits: boolean;
  pulloffMm?: number;
  driverType?: string;
  driverConfig: Record<string, unknown>;
}

export interface PlannerConfig {
  arcToleranceMm?: number;
  junctionDeviationMm?: number;
  plannerBlocks?: number;
  reportInches: boolean;
  verboseErrors: boolean;
  useLineNumbers: boolean;
}

export interface FilesystemConfig {
  sdcard: Record<string, unknown>;
  localfs: Record<string, unknown>;
}

export interface MacrosConfig {
  startupLine0?: string;
  startupLine1?: string;
  macro0?: string;
  macro1?: string;
  macro2?: string;
  macro3?: string;
  afterHoming?: string;
  afterReset?: string;
  afterUnlock?: string;
  raw: Record<string, unknown>;
}

export interface SpindleConfig {
  type?: string;
  laserMode: boolean;
  minRpm?: number;
  maxRpm?: number;
  spinupMs?: number;
  spindownMs?: number;
  m6Macro?: string;
  raw: Record<string, unknown>;
}

export interface CoolantConfig {
  floodPin?: string;
  mistPin?: string;
  delayMs?: number;
  hasFlood: boolean;
  hasMist: boolean;
  raw: Record<string, unknown>;
}

export interface ProbeConfig {
  pin?: string;
  toolsetterPin?: string;
  checkModeStart: boolean;
  hardStop: boolean;
  raw: Record<string, unknown>;
}

export interface ParkingConfig {
  enable: boolean;
  axis?: string;
  targetMposMm?: number;
  rateMmPerMin?: number;
  pulloutDistanceMm?: number;
  pulloutRateMmPerMin?: number;
  raw: Record<string, unknown>;
}

export interface ControlConfig {
  safetyDoorPin?: string;
  resetPin?: string;
  feedHoldPin?: string;
  cycleStartPin?: string;
  faultPin?: string;
  estopPin?: string;
  macros: Record<string, string | undefined>;
  raw: Record<string, unknown>;
}

export interface UserIoConfig {
  analogPins: Record<string, string | undefined>;
  analogHz: Record<string, number | undefined>;
  digitalPins: Record<string, string | undefined>;
  raw: Record<string, unknown>;
}

const DEFAULT_CONFIG = `name: Mock FluidNC
axes:
  x:
    max_travel_mm: 300
  y:
    max_travel_mm: 300
  z:
    max_travel_mm: 100
`;

export async function loadConfig(configPath?: string): Promise<SimulatorConfig> {
  if (!configPath) {
    return normalizeConfig(DEFAULT_CONFIG);
  }

  const source = resolve(configPath);
  return {
    source,
    ...normalizeConfig(await readFile(source, "utf8"))
  };
}

function normalizeConfig(raw: string): Omit<SimulatorConfig, "source"> {
  const document = parse(raw) as Record<string, unknown> | null;
  const root = isRecord(document) ? document : {};
  const axesRoot = isRecord(root.axes) ? root.axes : {};
  const warnings = collectHardwareWarnings(root);
  const axes = normalizeAxes(axesRoot);
  const validationErrors = validateConfig(root, axes);
  const startRoot = isRecord(root.start) ? root.start : {};

  return {
    raw,
    parsed: {
      board: stringValue(root.board),
      name: stringValue(root.name) ?? "Mock FluidNC",
      kinematics: normalizeKinematics(root.kinematics),
      kinematicsConfig: normalizeKinematicsConfig(root.kinematics),
      axes,
      planner: normalizePlanner(root),
      filesystem: normalizeFilesystem(root),
      macros: normalizeMacros(root.macros),
      spindle: normalizeSpindle(root),
      coolant: normalizeCoolant(root.coolant),
      probe: normalizeProbe(root.probe),
      parking: normalizeParking(root.parking),
      control: normalizeControl(root.control),
      userInputs: normalizeUserIo(root.user_inputs),
      userOutputs: normalizeUserIo(root.user_outputs),
      hardware: normalizeHardware(root),
      start: {
        mustHome: booleanValue(startRoot.must_home, false),
        deactivateParking: booleanValue(startRoot.deactivate_parking, false),
        checkLimits: booleanValue(startRoot.check_limits, true)
      }
    },
    warnings,
    validationErrors
  };
}

function normalizeAxes(axesRoot: Record<string, unknown>): Record<string, AxisConfig> {
  const axes: Record<string, AxisConfig> = {};
  for (const [id, value] of Object.entries(axesRoot)) {
    if (!isAxisId(id) || !isRecord(value)) {
      continue;
    }

    const motors = normalizeMotors(value);

    axes[id] = {
      id,
      stepsPerMm: numberValue(value.steps_per_mm),
      maxRateMmPerMin: numberValue(value.max_rate_mm_per_min),
      accelerationMmPerSec2: numberValue(value.acceleration_mm_per_sec2),
      maxTravelMm: numberValue(value.max_travel_mm),
      softLimits: booleanValue(value.soft_limits, false),
      pulloffMm: motors[0]?.pulloffMm,
      homing: normalizeHoming(value.homing),
      motors
    };
  }
  return axes;
}

function normalizeMotors(axisRoot: Record<string, unknown>): MotorConfig[] {
  const motors: MotorConfig[] = [];
  for (const [id, value] of Object.entries(axisRoot)) {
    if (!/^motor\d+$/i.test(id) || !isRecord(value)) {
      continue;
    }
    const driver = firstDriverEntry(value, ["limit_neg_pin", "limit_pos_pin", "limit_all_pin", "hard_limits", "pulloff_mm"]);
    motors.push({
      id,
      limitNegPin: stringValue(value.limit_neg_pin),
      limitPosPin: stringValue(value.limit_pos_pin),
      limitAllPin: stringValue(value.limit_all_pin),
      hardLimits: booleanValue(value.hard_limits, false),
      pulloffMm: numberValue(value.pulloff_mm),
      driverType: driver?.[0],
      driverConfig: driver?.[1] ?? {}
    });
  }
  return motors.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeHoming(value: unknown): HomingConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    cycle: numberValue(value.cycle),
    positiveDirection: booleanValue(value.positive_direction, false),
    mposMm: numberValue(value.mpos_mm),
    feedMmPerMin: numberValue(value.feed_mm_per_min),
    seekMmPerMin: numberValue(value.seek_mm_per_min),
    settleMs: numberValue(value.settle_ms),
    seekScaler: numberValue(value.seek_scaler),
    feedScaler: numberValue(value.feed_scaler)
  };
}

function normalizeKinematics(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value)) {
    return Object.keys(value)[0] ?? "Cartesian";
  }
  return "Cartesian";
}

function normalizeKinematicsConfig(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    const firstKey = Object.keys(value)[0];
    const config = firstKey ? value[firstKey] : {};
    return isRecord(config) ? config : {};
  }
  return {};
}

function normalizePlanner(root: Record<string, unknown>): PlannerConfig {
  return {
    arcToleranceMm: numberValue(root.arc_tolerance_mm),
    junctionDeviationMm: numberValue(root.junction_deviation_mm),
    plannerBlocks: numberValue(root.planner_blocks),
    reportInches: booleanValue(root.report_inches, false),
    verboseErrors: booleanValue(root.verbose_errors, false),
    useLineNumbers: booleanValue(root.use_line_numbers, false)
  };
}

function normalizeFilesystem(root: Record<string, unknown>): FilesystemConfig {
  return {
    sdcard: isRecord(root.sdcard) ? root.sdcard : {},
    localfs: isRecord(root.localfs) ? root.localfs : {}
  };
}

function normalizeMacros(value: unknown): MacrosConfig {
  const raw = isRecord(value) ? value : {};
  return {
    startupLine0: stringValue(raw.startup_line0),
    startupLine1: stringValue(raw.startup_line1),
    macro0: stringValue(raw.macro0) ?? stringValue(raw.Macro0),
    macro1: stringValue(raw.macro1) ?? stringValue(raw.Macro1),
    macro2: stringValue(raw.macro2) ?? stringValue(raw.Macro2),
    macro3: stringValue(raw.macro3) ?? stringValue(raw.Macro3),
    afterHoming: stringValue(raw.after_homing),
    afterReset: stringValue(raw.after_reset),
    afterUnlock: stringValue(raw.after_unlock),
    raw
  };
}

function normalizeSpindle(root: Record<string, unknown>): SpindleConfig {
  const raw = findSpindleRoot(root);
  const type = raw ? Object.keys(raw).find((key) => isRecord(raw[key])) : undefined;
  const config = type && raw && isRecord(raw[type]) ? raw[type] : raw ?? {};
  return {
    type,
    laserMode: booleanValue(config.laser_mode, booleanValue(config.is_laser, false)),
    minRpm: numberValue(config.min_rpm) ?? numberValue(config.minRPM),
    maxRpm: numberValue(config.max_rpm) ?? numberValue(config.maxRPM),
    spinupMs: numberValue(config.spinup_ms),
    spindownMs: numberValue(config.spindown_ms),
    m6Macro: stringValue(config.m6_macro),
    raw: raw ?? {}
  };
}

function findSpindleRoot(root: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isRecord(root.spindle)) {
    return root.spindle;
  }
  const entry = Object.entries(root).find(([key, value]) => /^spindle\d*$/i.test(key) && isRecord(value));
  return entry && isRecord(entry[1]) ? entry[1] : undefined;
}

function normalizeCoolant(value: unknown): CoolantConfig {
  const raw = isRecord(value) ? value : {};
  const floodPin = stringValue(raw.flood_pin);
  const mistPin = stringValue(raw.mist_pin);
  return {
    floodPin,
    mistPin,
    delayMs: numberValue(raw.delay_ms),
    hasFlood: isConfiguredPin(floodPin),
    hasMist: isConfiguredPin(mistPin),
    raw
  };
}

function normalizeProbe(value: unknown): ProbeConfig {
  const raw = isRecord(value) ? value : {};
  return {
    pin: stringValue(raw.pin),
    toolsetterPin: stringValue(raw.toolsetter_pin),
    checkModeStart: booleanValue(raw.check_mode_start, false),
    hardStop: booleanValue(raw.hard_stop, false),
    raw
  };
}

function normalizeParking(value: unknown): ParkingConfig {
  const raw = isRecord(value) ? value : {};
  return {
    enable: booleanValue(raw.enable, false),
    axis: stringValue(raw.axis),
    targetMposMm: numberValue(raw.target_mpos_mm),
    rateMmPerMin: numberValue(raw.rate_mm_per_min),
    pulloutDistanceMm: numberValue(raw.pullout_distance_mm),
    pulloutRateMmPerMin: numberValue(raw.pullout_rate_mm_per_min),
    raw
  };
}

function normalizeControl(value: unknown): ControlConfig {
  const raw = isRecord(value) ? value : {};
  return {
    safetyDoorPin: stringValue(raw.safety_door_pin),
    resetPin: stringValue(raw.reset_pin),
    feedHoldPin: stringValue(raw.feed_hold_pin),
    cycleStartPin: stringValue(raw.cycle_start_pin),
    faultPin: stringValue(raw.fault_pin),
    estopPin: stringValue(raw.estop_pin),
    macros: {
      macro0: stringValue(raw.macro0_pin),
      macro1: stringValue(raw.macro1_pin),
      macro2: stringValue(raw.macro2_pin),
      macro3: stringValue(raw.macro3_pin)
    },
    raw
  };
}

function normalizeUserIo(value: unknown): UserIoConfig {
  const raw = isRecord(value) ? value : {};
  const analogPins: Record<string, string | undefined> = {};
  const analogHz: Record<string, number | undefined> = {};
  const digitalPins: Record<string, string | undefined> = {};
  for (const [key, child] of Object.entries(raw)) {
    const analogPin = key.match(/^analog(\d+)_pin$/i);
    const analogFrequency = key.match(/^analog(\d+)_hz$/i);
    const digitalPin = key.match(/^digital(\d+)_pin$/i);
    if (analogPin) {
      analogPins[analogPin[1]] = stringValue(child);
    } else if (analogFrequency) {
      analogHz[analogFrequency[1]] = numberValue(child);
    } else if (digitalPin) {
      digitalPins[digitalPin[1]] = stringValue(child);
    }
  }
  return { analogPins, analogHz, digitalPins, raw };
}

function normalizeHardware(root: Record<string, unknown>): Record<string, unknown> {
  const hardwareKeys = [
    "stepping",
    "spi",
    "i2so",
    "i2c",
    "uart",
    "uart_channel",
    "uart_channel0",
    "uart_channel1",
    "extenders",
    "oled",
    "oled0"
  ];
  const hardware: Record<string, unknown> = {};
  for (const key of hardwareKeys) {
    if (root[key] !== undefined) {
      hardware[key] = root[key];
    }
  }
  return hardware;
}

function collectHardwareWarnings(root: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const hardwareSections = [
    "stepping",
    "spi",
    "i2so",
    "i2c",
    "uart",
    "uart_channel",
    "uart_channel0",
    "uart_channel1",
    "extenders",
    "control",
    "coolant",
    "probe",
    "sdcard",
    "user_outputs",
    "user_inputs"
  ];
  for (const section of hardwareSections) {
    if (root[section] !== undefined) {
      warnings.push(`Accepted hardware-related config section '${section}' as virtual/inert configuration.`);
    }
  }
  collectPinWarnings(root, [], warnings);
  return [...new Set(warnings)];
}

function validateConfig(root: Record<string, unknown>, axes: Record<string, AxisConfig>): string[] {
  const errors: string[] = [];
  if (Object.keys(axes).length === 0) {
    errors.push("No axes were configured.");
  }
  for (const [axis, config] of Object.entries(axes)) {
    if (config.maxTravelMm !== undefined && config.maxTravelMm < 0) {
      errors.push(`Axis '${axis}' max_travel_mm must be zero or greater.`);
    }
    if (config.maxRateMmPerMin !== undefined && config.maxRateMmPerMin <= 0) {
      errors.push(`Axis '${axis}' max_rate_mm_per_min must be greater than zero.`);
    }
    if (config.stepsPerMm !== undefined && config.stepsPerMm <= 0) {
      errors.push(`Axis '${axis}' steps_per_mm must be greater than zero.`);
    }
  }
  const plannerBlocks = numberValue(root.planner_blocks);
  if (plannerBlocks !== undefined && plannerBlocks <= 0) {
    errors.push("planner_blocks must be greater than zero.");
  }
  return errors;
}

function collectPinWarnings(value: unknown, path: string[], warnings: string[]): void {
  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (key === "pin" || key.endsWith("_pin")) {
      warnings.push(`Accepted pin setting '${childPath.join(".")}' without physical IO.`);
    }
    collectPinWarnings(child, childPath, warnings);
  }
}

function firstDriverEntry(value: Record<string, unknown>, excludedKeys: string[]): [string, Record<string, unknown>] | undefined {
  for (const [key, child] of Object.entries(value)) {
    if (excludedKeys.includes(key)) {
      continue;
    }
    return [key, isRecord(child) ? child : {}];
  }
  return undefined;
}

function isConfiguredPin(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "" && value.toUpperCase() !== "NO_PIN";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAxisId(value: string): boolean {
  return ["x", "y", "z", "a", "b", "c", "u", "v", "w"].includes(value.toLowerCase());
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }
  return fallback;
}
