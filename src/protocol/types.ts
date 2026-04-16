export interface ProtocolOutput {
  write(data: string | Uint8Array): void;
}

export interface CommandResult {
  ok: boolean;
  lines: string[];
}

export interface ProtocolTrafficEvent {
  channel: string;
  direction: "rx" | "tx";
  data: string;
}

export type ProtocolTrafficLogger = (event: ProtocolTrafficEvent) => void;

export interface ProtocolOptions {
  lineEnding?: string;
  motion?: import("../motion/MotionSimulator.js").MotionSimulator;
  homing?: import("../machine/HomingSimulator.js").HomingSimulator;
  jobs?: import("../files/FileJobManager.js").FileJobManager;
  settings?: import("../settings/SettingsStore.js").SettingsStore;
  probe?: import("../machine/ProbeModel.js").ProbeModel;
  macros?: import("../config/ConfigLoader.js").MacrosConfig;
  parking?: import("../machine/ParkingManager.js").ParkingManager;
  startupLog?: () => string[];
  autoReport?: boolean;
  channelName?: string;
  trafficLogger?: ProtocolTrafficLogger;
}
