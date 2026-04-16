import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsStore } from "../src/settings/SettingsStore.js";

describe("SettingsStore", () => {
  it("saves settings atomically and writes a backup", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "mock-fluidnc-settings-")), "settings.json");
    const settings = await SettingsStore.load(path);

    settings.setGrbl("10", "0");
    await settings.save();

    assert.equal(JSON.parse(readFileSync(path, "utf8")).grbl["10"], "0");
    assert.equal(JSON.parse(readFileSync(`${path}.bak`, "utf8")).grbl["10"], "0");
    assert.equal(existsSync(`${path}.${process.pid}.tmp`), false);
  });

  it("falls back to the backup when the primary settings file is empty", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "mock-fluidnc-settings-")), "settings.json");
    writeFileSync(path, "", "utf8");
    writeFileSync(
      `${path}.bak`,
      JSON.stringify({
        grbl: { "10": "0" },
        named: {},
        startupLines: ["", ""],
        reportIntervalMs: 75
      }),
      "utf8"
    );

    const settings = await SettingsStore.load(path);

    assert.equal(settings.getGrbl("10"), "0");
    assert.equal(settings.snapshot().reportIntervalMs, 75);
  });
});
