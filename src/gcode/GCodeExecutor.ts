import type { MachineState } from "../machine/MachineState.js";
import type { ProbeModel } from "../machine/ProbeModel.js";
import type { MotionSimulator } from "../motion/MotionSimulator.js";
import { GCodeParseError, parseGCodeLine, type GCodeWord } from "./GCodeParser.js";

export interface GCodeExecutionResult {
  handled: boolean;
  error?: string;
}

export interface GCodeExecutionOptions {
  motion?: MotionSimulator;
  motionRunState?: "Run" | "Jog" | "Home";
  probe?: ProbeModel;
}

export function executeGCodeLine(machine: MachineState, line: string, options: GCodeExecutionOptions = {}): GCodeExecutionResult {
  try {
    const parsed = parseGCodeLine(line);
    if (parsed.words.length === 0) {
      return { handled: true };
    }

    if (machine.snapshot().checkMode) {
      for (const word of parsed.words) {
        applyModalWord(machine, word, parsed.words);
      }
      return { handled: true };
    }

    for (const word of parsed.words) {
      applyModalWord(machine, word, parsed.words);
    }
    if (!hasG92(parsed.words)) {
      applyMotionEndpoint(machine, parsed.words, options.motion, options.motionRunState, options.probe);
    }

    return { handled: true };
  } catch (error) {
    if (error instanceof GCodeParseError) {
      return { handled: false, error: error.message };
    }
    throw error;
  }
}

function applyModalWord(machine: MachineState, word: GCodeWord, words: GCodeWord[]): void {
  if (word.letter === "G") {
    switch (word.value) {
      case 0:
        machine.setModalState({ motionMode: "G0" });
        return;
      case 1:
        machine.setModalState({ motionMode: "G1" });
        return;
      case 2:
        machine.setModalState({ motionMode: "G2" });
        return;
      case 3:
        machine.setModalState({ motionMode: "G3" });
        return;
      case 38.2:
      case 38.3:
      case 38.4:
      case 38.5:
        return;
      case 4:
        return;
      case 10:
        applyG10(machine, words);
        return;
      case 17:
        machine.setModalState({ plane: "G17" });
        return;
      case 18:
        machine.setModalState({ plane: "G18" });
        return;
      case 19:
        machine.setModalState({ plane: "G19" });
        return;
      case 20:
        machine.setModalState({ units: "in" });
        return;
      case 21:
        machine.setModalState({ units: "mm" });
        return;
      case 28:
        moveViaReference(machine, words, "G28");
        return;
      case 28.1:
        machine.setG28Position(machine.snapshot().machinePosition);
        return;
      case 30:
        moveViaReference(machine, words, "G30");
        return;
      case 30.1:
        machine.setG30Position(machine.snapshot().machinePosition);
        return;
      case 43.1:
        applyToolLengthOffset(machine, words);
        return;
      case 49:
        machine.setToolLengthOffset(0);
        return;
      case 53:
        return;
      case 54:
      case 55:
      case 56:
      case 57:
      case 58:
      case 59:
        machine.setModalState({ coordinateSystem: `G${word.value}` });
        return;
      case 80:
        machine.setModalState({ motionMode: "G80" });
        return;
      case 90.1:
        machine.setModalState({ arcDistanceMode: "absolute" });
        return;
      case 90:
        machine.setModalState({ distanceMode: "absolute" });
        return;
      case 91.1:
        machine.setModalState({ arcDistanceMode: "relative" });
        return;
      case 91:
        machine.setModalState({ distanceMode: "relative" });
        return;
      case 92:
        applyG92(machine, words);
        return;
      default:
        return;
    }
  }

  if (word.letter === "F") {
    machine.setFeedRate(word.value);
    return;
  }

  if (word.letter === "S") {
    machine.setSpindleSpeed(word.value);
    return;
  }

  if (word.letter === "M") {
    switch (word.value) {
      case 3:
        machine.setSpindleDirection("cw");
        return;
      case 4:
        machine.setSpindleDirection("ccw");
        return;
      case 5:
        machine.setSpindleDirection("off");
        return;
      case 6:
        machine.startToolChange();
        return;
      case 0:
        machine.setModalState({ programFlow: "paused" });
        machine.setRunState("Hold");
        return;
      case 1:
        machine.setModalState({ programFlow: "optional-stop" });
        machine.setRunState("Hold");
        return;
      case 2:
        machine.setModalState({ programFlow: "completed-m2" });
        machine.setRunState("Idle");
        return;
      case 30:
        machine.setModalState({ programFlow: "completed-m30" });
        machine.setRunState("Idle");
        return;
      case 7:
        machine.setMist(true);
        return;
      case 8:
        machine.setAir(true);
        return;
      case 9:
        machine.setAir(false);
        machine.setMist(false);
        return;
      default:
        return;
    }
  }

  if (word.letter === "T") {
    machine.setSelectedTool(word.value);
  }
}

function applyMotionEndpoint(
  machine: MachineState,
  words: GCodeWord[],
  motion?: MotionSimulator,
  motionRunState: "Run" | "Jog" | "Home" = "Run",
  probe?: ProbeModel
): void {
  const snapshot = machine.snapshot();
  const axes = axisWords(words);
  if (Object.keys(axes).length === 0) {
    return;
  }

  const nextPosition = { ...snapshot.machinePosition };
  for (const [axis, value] of Object.entries(axes)) {
    const key = axis.toLowerCase() as "x" | "y" | "z" | "a" | "b" | "c";
    nextPosition[key] = snapshot.modalState.distanceMode === "relative" ? (nextPosition[key] ?? 0) + value : value;
  }
  const probeWord = words.find((word) => word.letter === "G" && [38.2, 38.3, 38.4, 38.5].includes(word.value));
  if (probeWord) {
    probe?.run(nextPosition, probeWord.value === 38.2 || probeWord.value === 38.4, motion);
    return;
  }

  if (motion && motionRunState === "Jog") {
    if (!motion.planLinearAs(nextPosition, "Jog", false)) {
      return;
    }
    return;
  }

  if (motion && ["G0", "G1", "G2", "G3"].includes(snapshot.modalState.motionMode)) {
    const motionTarget = nextPosition;
    const planned =
      snapshot.modalState.motionMode === "G2" || snapshot.modalState.motionMode === "G3"
        ? motion.planArc(motionTarget, motionRunState)
        : motion.planLinearAs(motionTarget, motionRunState, snapshot.modalState.motionMode === "G0");
    if (!planned) {
      return;
    }
  } else {
    machine.setMachinePosition(nextPosition);
  }
}

function applyG92(machine: MachineState, words: GCodeWord[]): void {
  const snapshot = machine.snapshot();
  const axes = axisWords(words);
  const offset = { ...snapshot.workCoordinateOffset };
  for (const [axis, value] of Object.entries(axes)) {
    const key = axis.toLowerCase() as "x" | "y" | "z" | "a" | "b" | "c";
    offset[key] = (snapshot.machinePosition[key] ?? 0) - value;
  }
  machine.setWorkCoordinateOffset(offset);
}

function applyG10(machine: MachineState, words: GCodeWord[]): void {
  const lWord = words.find((word) => word.letter === "L");
  const pWord = words.find((word) => word.letter === "P");
  if (!lWord || !pWord || pWord.value !== coordinateSystemNumber(machine.snapshot().modalState.coordinateSystem)) {
    return;
  }

  const snapshot = machine.snapshot();
  const axes = axisWords(words);
  const offset = { ...snapshot.workCoordinateOffset };
  for (const [axis, value] of Object.entries(axes)) {
    const key = axis.toLowerCase() as "x" | "y" | "z" | "a" | "b" | "c";
    offset[key] = lWord.value === 20 ? (snapshot.machinePosition[key] ?? 0) - value : value;
  }
  machine.setWorkCoordinateOffset(offset);
}

function applyToolLengthOffset(machine: MachineState, words: GCodeWord[]): void {
  const zWord = words.find((word) => word.letter === "Z");
  if (zWord) {
    machine.setToolLengthOffset(zWord.value);
  }
}

function moveViaReference(machine: MachineState, words: GCodeWord[], reference: "G28" | "G30"): void {
  const axes = axisWords(words);
  if (Object.keys(axes).length > 0) {
    const snapshot = machine.snapshot();
    const intermediate = { ...snapshot.machinePosition };
    for (const [axis, value] of Object.entries(axes)) {
      const key = axis.toLowerCase() as "x" | "y" | "z" | "a" | "b" | "c";
      intermediate[key] = snapshot.modalState.distanceMode === "relative" ? (intermediate[key] ?? 0) + value : value;
    }
    machine.setMachinePosition(intermediate);
  }
  machine.setMachinePosition(reference === "G28" ? machine.snapshot().g28Position : machine.snapshot().g30Position);
}

function coordinateSystemNumber(coordinateSystem: string): number {
  return Number(coordinateSystem.slice(1)) - 53;
}

function axisWords(words: GCodeWord[]): Record<string, number> {
  const axes: Record<string, number> = {};
  for (const word of words) {
    if (["X", "Y", "Z", "A", "B", "C"].includes(word.letter)) {
      axes[word.letter] = word.value;
    }
  }
  return axes;
}

function hasG92(words: GCodeWord[]): boolean {
  return words.some((word) => word.letter === "G" && word.value === 92);
}
