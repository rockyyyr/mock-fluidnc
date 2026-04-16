import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../src/config/ConfigLoader.js";
import { SettingsStore } from "../src/settings/SettingsStore.js";

describe("loadConfig", () => {
  it("loads the built-in default config", async () => {
    const config = await loadConfig();

    assert.equal(config.parsed.name, "Mock FluidNC");
    assert.equal(config.parsed.kinematics, "Cartesian");
    assert.deepEqual(Object.keys(config.parsed.axes), ["x", "y", "z"]);
  });

  it("normalizes FluidNC example config axes and inert hardware warnings", async () => {
    const config = await loadConfig(resolve("../Source/config.example.yaml"));

    assert.equal(config.parsed.name, "6 Pack StepStick XYZABC");
    assert.equal(config.parsed.axes.x.maxTravelMm, 300);
    assert.equal(config.parsed.axes.x.maxRateMmPerMin, 5000);
    assert.equal(config.parsed.axes.x.accelerationMmPerSec2, 100);
    assert.equal(config.parsed.axes.x.homing?.cycle, 2);
    assert.equal(config.parsed.axes.y.homing?.positiveDirection, true);
    assert.equal(config.parsed.start.mustHome, false);
    assert.ok(config.warnings.some((warning) => warning.includes("hardware-related config section 'i2so'")));
    assert.ok(config.warnings.some((warning) => warning.includes("axes.x.motor0.limit_neg_pin")));
  });

  it("accepts FluidNC default config breadth without hardware IO", async () => {
    const config = await loadConfig(resolve("../Source/FluidNC/data/config.yaml"));

    assert.equal(config.parsed.name, "Default (Test Drive no I/O)");
    assert.equal(config.parsed.axes.x.motors?.[0]?.driverType, "null_motor");
    assert.equal(config.parsed.axes.x.pulloffMm, 1);
    assert.equal(config.parsed.filesystem?.sdcard.frequency_hz, 8000000);
    assert.equal(config.parsed.probe?.checkModeStart, true);
    assert.equal(config.parsed.probe?.hardStop, false);
    assert.equal(config.parsed.parking?.axis, "Z");
    assert.equal(config.parsed.parking?.targetMposMm, -5);
    assert.equal(config.parsed.control?.faultPin, "NO_PIN");
    assert.equal(config.parsed.userOutputs?.analogHz["0"], 5000);
    assert.equal(config.parsed.planner?.plannerBlocks, 16);
    assert.deepEqual(config.validationErrors, []);
  });

  it("normalizes macros, spindle, coolant, user IO, and validation warnings", async () => {
    const config = await loadConfig(resolve("test/fixtures/full-config.yaml"));

    assert.equal(config.parsed.macros?.startupLine0, "G21");
    assert.equal(config.parsed.macros?.afterUnlock, "G4 P0.1");
    assert.equal(config.parsed.spindle?.type, "PWM");
    assert.equal(config.parsed.spindle?.laserMode, true);
    assert.equal(config.parsed.spindle?.maxRpm, 24000);
    assert.equal(config.parsed.coolant?.hasFlood, true);
    assert.equal(config.parsed.coolant?.hasMist, false);
    assert.equal(config.parsed.userInputs?.digitalPins["0"], "gpio.36:low");
    assert.equal(config.parsed.userOutputs?.analogPins["0"], "gpio.25");
    assert.equal(config.parsed.hardware?.stepping !== undefined, true);
    assert.ok(config.warnings.some((warning) => warning.includes("hardware-related config section 'sdcard'")));
    assert.ok(config.warnings.some((warning) => warning.includes("spindle.PWM.output_pin")));
    assert.deepEqual(config.validationErrors, []);
  });

  it("keeps copy-ready workspace examples valid", async () => {
    const config = await loadConfig(resolve("examples/config.example.yaml"));
    const settings = new SettingsStore(undefined, JSON.parse(await readFile(resolve("examples/settings.example.json"), "utf8")));

    assert.equal(config.parsed.name, "Mock FluidNC Full Example");
    assert.equal(config.parsed.spindle?.type, "PWM");
    assert.equal(config.parsed.coolant?.hasFlood, true);
    assert.equal(config.parsed.probe?.checkModeStart, true);
    assert.equal(config.parsed.parking?.enable, true);
    assert.deepEqual(config.validationErrors, []);
    assert.equal(settings.getGrbl("10"), "2");
    assert.equal(settings.getNamed("Config/Filename"), "config.yaml");
    assert.equal(settings.snapshot().reportIntervalMs, 200);
  });
});
