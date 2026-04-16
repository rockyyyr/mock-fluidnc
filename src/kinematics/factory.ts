import type { NormalizedConfig } from "../config/ConfigLoader.js";
import {
  CartesianKinematics,
  CoreXYKinematics,
  MidtbotKinematics,
  ParallelDeltaKinematics,
  WallPlotterKinematics,
  type Kinematics
} from "./Kinematics.js";

export function createKinematics(config: Pick<NormalizedConfig, "kinematics" | "kinematicsConfig">): Kinematics {
  switch (config.kinematics.toLowerCase()) {
    case "corexy":
      return new CoreXYKinematics();
    case "wallplotter":
      return new WallPlotterKinematics(numberValue(config.kinematicsConfig.width_mm) ?? 1000);
    case "midtbot":
      return new MidtbotKinematics();
    case "paralleldelta":
    case "parallel_delta":
      return new ParallelDeltaKinematics();
    case "cartesian":
    default:
      return new CartesianKinematics();
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
