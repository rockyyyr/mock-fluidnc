export type MachineRunState =
  | "Idle"
  | "Run"
  | "Hold"
  | "Jog"
  | "Home"
  | "Alarm"
  | "Door"
  | "Check"
  | "Sleep";

export interface AxisPosition {
  x: number;
  y: number;
  z: number;
  a?: number;
  b?: number;
  c?: number;
}

export interface MachineStateSnapshot {
  state: MachineRunState;
  machinePosition: AxisPosition;
  workPosition: AxisPosition;
  workCoordinateOffset: AxisPosition;
  modalState: ModalState;
  feedRate: number;
  currentFeedRate: number;
  spindleSpeed: number;
  motorEnabled: boolean;
  checkMode: boolean;
  reportInches: boolean;
  feedrateOverride: number;
  rapidOverride: number;
  spindleOverride: number;
  spindleDirection: "off" | "cw" | "ccw";
  spindleStopped: boolean;
  laserMode: boolean;
  activeSpindle: string;
  airOn: boolean;
  mistOn: boolean;
  activeTool: number;
  toolChangeState: "idle" | "waiting" | "complete";
  toolLengthOffset: number;
  probePosition: AxisPosition;
  probeSucceeded: boolean;
  g28Position: AxisPosition;
  g30Position: AxisPosition;
  plannerBlocksAvailable: number;
  rxBufferAvailable: number;
  alarm?: string;
}

export interface ModalState {
  units: "mm" | "in";
  distanceMode: "absolute" | "relative";
  arcDistanceMode: "absolute" | "relative";
  motionMode: "G0" | "G1" | "G2" | "G3" | "G80";
  coordinateSystem: "G54" | "G55" | "G56" | "G57" | "G58" | "G59";
  plane: "G17" | "G18" | "G19";
  feedMode: "G93" | "G94";
  programFlow: "running" | "paused" | "optional-stop" | "completed-m2" | "completed-m30";
  selectedTool: number;
}

export class MachineState {
  private state: MachineRunState = "Idle";
  private machinePosition: AxisPosition = { x: 0, y: 0, z: 0 };
  private workCoordinateOffset: AxisPosition = { x: 0, y: 0, z: 0 };
  private modalState: ModalState = {
    units: "mm",
    distanceMode: "absolute",
    arcDistanceMode: "relative",
    motionMode: "G0",
    coordinateSystem: "G54",
    plane: "G17",
    feedMode: "G94",
    programFlow: "running",
    selectedTool: 0
  };
  private feedRate = 0;
  private currentFeedRate = 0;
  private spindleSpeed = 0;
  private motorEnabled = true;
  private checkMode = false;
  private reportInches = false;
  private feedrateOverride = 100;
  private rapidOverride = 100;
  private spindleOverride = 100;
  private spindleDirection: "off" | "cw" | "ccw" = "off";
  private spindleStopped = false;
  private laserMode = false;
  private activeSpindle = "default";
  private airOn = false;
  private mistOn = false;
  private activeTool = 0;
  private toolChangeState: "idle" | "waiting" | "complete" = "idle";
  private toolLengthOffset = 0;
  private probePosition: AxisPosition = { x: 0, y: 0, z: 0 };
  private probeSucceeded = false;
  private g28Position: AxisPosition = { x: 0, y: 0, z: 0 };
  private g30Position: AxisPosition = { x: 0, y: 0, z: 0 };
  private plannerBlocksAvailable = 15;
  private rxBufferAvailable = 128;
  private alarm: string | undefined;

  snapshot(): MachineStateSnapshot {
    return {
      state: this.state,
      machinePosition: { ...this.machinePosition },
      workPosition: this.workPosition(),
      workCoordinateOffset: { ...this.workCoordinateOffset },
      modalState: { ...this.modalState },
      feedRate: this.feedRate,
      currentFeedRate: this.currentFeedRate,
      spindleSpeed: this.spindleSpeed,
      motorEnabled: this.motorEnabled,
      checkMode: this.checkMode,
      reportInches: this.reportInches,
      feedrateOverride: this.feedrateOverride,
      rapidOverride: this.rapidOverride,
      spindleOverride: this.spindleOverride,
      spindleDirection: this.spindleDirection,
      spindleStopped: this.spindleStopped,
      laserMode: this.laserMode,
      activeSpindle: this.activeSpindle,
      airOn: this.airOn,
      mistOn: this.mistOn,
      activeTool: this.activeTool,
      toolChangeState: this.toolChangeState,
      toolLengthOffset: this.toolLengthOffset,
      probePosition: { ...this.probePosition },
      probeSucceeded: this.probeSucceeded,
      g28Position: { ...this.g28Position },
      g30Position: { ...this.g30Position },
      plannerBlocksAvailable: this.plannerBlocksAvailable,
      rxBufferAvailable: this.rxBufferAvailable,
      alarm: this.alarm
    };
  }

  reset(): void {
    this.state = "Idle";
    this.alarm = undefined;
    this.feedRate = 0;
    this.currentFeedRate = 0;
    this.spindleSpeed = 0;
    this.feedrateOverride = 100;
    this.spindleOverride = 100;
    this.spindleStopped = false;
    this.toolChangeState = "idle";
    this.airOn = false;
    this.mistOn = false;
  }

  setMachinePosition(position: Partial<AxisPosition>): void {
    this.machinePosition = { ...this.machinePosition, ...position };
  }

  setRunState(state: MachineRunState): void {
    this.state = state;
    if (state !== "Run" && state !== "Jog" && state !== "Home") {
      this.currentFeedRate = 0;
    }
  }

  setWorkCoordinateOffset(offset: Partial<AxisPosition>): void {
    this.workCoordinateOffset = { ...this.workCoordinateOffset, ...offset };
  }

  setModalState(modalState: Partial<ModalState>): void {
    this.modalState = { ...this.modalState, ...modalState };
  }

  setCheckMode(checkMode: boolean): void {
    this.checkMode = checkMode;
    this.state = checkMode ? "Check" : "Idle";
  }

  setReportInches(reportInches: boolean): void {
    this.reportInches = reportInches;
  }

  setFeedRate(feedRate: number): void {
    this.feedRate = feedRate;
  }

  setCurrentFeedRate(feedRate: number): void {
    this.currentFeedRate = Math.max(0, feedRate);
  }

  setSpindleSpeed(spindleSpeed: number): void {
    this.spindleSpeed = spindleSpeed;
  }

  setSpindleDirection(direction: "off" | "cw" | "ccw"): void {
    this.spindleDirection = direction;
    this.spindleStopped = direction === "off";
  }

  setLaserMode(enabled: boolean): void {
    this.laserMode = enabled;
  }

  setActiveSpindle(name: string): void {
    this.activeSpindle = name;
  }

  setAir(on: boolean): void {
    this.airOn = on;
  }

  setMist(on: boolean): void {
    this.mistOn = on;
  }

  setToolLengthOffset(offset: number): void {
    this.toolLengthOffset = offset;
  }

  setG28Position(position: Partial<AxisPosition>): void {
    this.g28Position = { ...this.g28Position, ...position };
  }

  setG30Position(position: Partial<AxisPosition>): void {
    this.g30Position = { ...this.g30Position, ...position };
  }

  setSelectedTool(tool: number): void {
    this.modalState = { ...this.modalState, selectedTool: tool };
  }

  startToolChange(tool = this.modalState.selectedTool): void {
    this.activeTool = tool;
    this.toolChangeState = "waiting";
    this.state = "Hold";
  }

  completeToolChange(): void {
    this.activeTool = this.modalState.selectedTool;
    this.toolChangeState = "complete";
    if (this.state === "Hold") {
      this.state = "Idle";
    }
  }

  setProbeResult(position: Partial<AxisPosition>, succeeded: boolean): void {
    this.probePosition = { ...this.probePosition, ...position };
    this.probeSucceeded = succeeded;
  }

  setPlannerSummary(plannerBlocksAvailable: number, rxBufferAvailable: number): void {
    this.plannerBlocksAvailable = plannerBlocksAvailable;
    this.rxBufferAvailable = rxBufferAvailable;
  }

  hold(): void {
    if (this.state === "Run" || this.state === "Jog") {
      this.state = "Hold";
    }
  }

  resume(): void {
    if (this.state === "Hold") {
      this.state = "Run";
    }
  }

  startHoming(): void {
    this.state = "Home";
  }

  startJog(): void {
    this.state = "Jog";
  }

  waitForJog(): void {
    if (this.state === "Jog") {
      this.state = "Idle";
    }
  }

  setAlarm(message: string): void {
    this.state = "Alarm";
    this.alarm = message;
  }

  openDoor(): void {
    this.state = "Door";
  }

  closeDoor(): void {
    if (this.state === "Door") {
      this.state = "Idle";
    }
  }

  unlock(): void {
    if (this.state === "Alarm") {
      this.state = "Idle";
      this.alarm = undefined;
    }
  }

  enableMotors(): void {
    this.motorEnabled = true;
  }

  disableMotors(): void {
    this.motorEnabled = false;
  }

  resetFeedrateOverride(): void {
    this.feedrateOverride = 100;
  }

  increaseFeedrateOverride(): void {
    this.feedrateOverride = Math.min(200, this.feedrateOverride + 10);
  }

  decreaseFeedrateOverride(): void {
    this.feedrateOverride = Math.max(10, this.feedrateOverride - 10);
  }

  resetSpindleOverride(): void {
    this.spindleOverride = 100;
  }

  increaseSpindleOverride(): void {
    this.spindleOverride = Math.min(200, this.spindleOverride + 10);
  }

  decreaseSpindleOverride(): void {
    this.spindleOverride = Math.max(10, this.spindleOverride - 10);
  }

  toggleSpindleStop(): void {
    this.spindleStopped = !this.spindleStopped;
  }

  toggleAir(): void {
    this.airOn = !this.airOn;
  }

  toggleMist(): void {
    this.mistOn = !this.mistOn;
  }

  private workPosition(): AxisPosition {
    return {
      x: this.machinePosition.x - this.workCoordinateOffset.x,
      y: this.machinePosition.y - this.workCoordinateOffset.y,
      z: this.machinePosition.z - this.workCoordinateOffset.z,
      a: this.optionalAxisWorkPosition("a"),
      b: this.optionalAxisWorkPosition("b"),
      c: this.optionalAxisWorkPosition("c")
    };
  }

  private optionalAxisWorkPosition(axis: "a" | "b" | "c"): number | undefined {
    const machineValue = this.machinePosition[axis];
    const offsetValue = this.workCoordinateOffset[axis];
    if (machineValue === undefined && offsetValue === undefined) {
      return undefined;
    }
    return (machineValue ?? 0) - (offsetValue ?? 0);
  }
}
