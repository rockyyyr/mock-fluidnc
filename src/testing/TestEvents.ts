export type TestEventKind = "limit" | "probe" | "fault" | "estop" | "door-open" | "door-close";

export interface TestEvent {
  kind: TestEventKind;
  axis?: string;
}
