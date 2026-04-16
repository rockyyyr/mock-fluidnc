import type { MachineState } from "../machine/MachineState.js";
import type { TestEventKind } from "./TestEvents.js";

export interface TestEventResponse {
  ok: boolean;
  event: TestEventKind | "reset";
  state: string;
  alarm?: string;
}

export class TestEventApi {
  constructor(private readonly machine: MachineState) {}

  trigger(kind: TestEventKind, axis?: string): TestEventResponse {
    switch (kind) {
      case "limit":
        this.machine.setAlarm(axis ? `Hard limit ${axis}` : "Hard limit");
        break;
      case "probe":
        this.machine.setProbeResult(this.machine.snapshot().machinePosition, true);
        break;
      case "fault":
        this.machine.setAlarm("Fault pin");
        break;
      case "estop":
        this.machine.setAlarm("Emergency stop");
        break;
      case "door-open":
        this.machine.openDoor();
        break;
      case "door-close":
        this.machine.closeDoor();
        break;
    }

    return this.response(kind);
  }

  reset(): TestEventResponse {
    this.machine.reset();
    return this.response("reset");
  }

  private response(event: TestEventKind | "reset"): TestEventResponse {
    const snapshot = this.machine.snapshot();
    return {
      ok: true,
      event,
      state: snapshot.state,
      alarm: snapshot.alarm
    };
  }
}
