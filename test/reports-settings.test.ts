import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MachineState } from "../src/machine/MachineState.js";
import { FluidProtocol } from "../src/protocol/FluidProtocol.js";
import { SettingsStore } from "../src/settings/SettingsStore.js";
import { BufferedOutput } from "../src/transports/BufferedOutput.js";

describe("reports and settings", () => {
  it("supports FluidNC-style report commands", () => {
    const output = new BufferedOutput();
    const protocol = new FluidProtocol(new MachineState(), output);

    protocol.receive("$\n$A\n$E\n$CMD\n$S\n$SC\n$V\n$SS\n");

    assert.match(output.text(), /\[HLP:/);
    assert.match(output.text(), /\[ALARMS:/);
    assert.match(output.text(), /\[ERRORS:/);
    assert.match(output.text(), /\[CMD:GCode\/Modes,\$G\]/);
    assert.match(output.text(), /\[CMD:Homing\/All,\$H\]/);
    assert.match(output.text(), /\[CMD:Motor\/Enable,\$ME\]/);
    assert.match(output.text(), /\[CMD:ToolChange\/Complete,\$TC\]/);
    assert.match(output.text(), /\[SETTINGS:begin\]/);
    assert.match(output.text(), /\[SETTINGS_CHANGED:none\]/);
    assert.match(output.text(), /\[MSG:Settings entries:/);
    assert.match(output.text(), /\[MSG:Startup log unavailable in simulator\]/);
  });

  it("supports FluidNC long-form aliases for report and state commands", () => {
    const output = new BufferedOutput();
    const machine = new MachineState();
    const protocol = new FluidProtocol(machine, output);

    machine.setAlarm("Test alarm");
    protocol.receive(
      "$Alarm/Disable\n$Alarms/List\n$Build/Info\n$Channel/Info\n$Commands/List\n$Errors/List\n$GCode/Check\n$GCode/Modes\n$GCode/Offsets\n$GrblSettings/List\n$Grbl/Show\n$GrblNames/List\n$Help\n$Limits/Show\n$Motors/Init\n$Parameters/List\n$Settings/List\n$Settings/ListChanged\n$Settings/Stats\n$Startup/Show\n$State\n"
    );

    assert.equal(machine.snapshot().state, "Check");
    assert.match(output.text(), /\[ALARMS:/);
    assert.match(output.text(), /\[VER:Mock FluidNC/);
    assert.match(output.text(), /\[CHANNEL:TCP,virtual\]/);
    assert.match(output.text(), /\[CMD:Commands\/List,\$CMD\]/);
    assert.match(output.text(), /\[ERRORS:/);
    assert.match(output.text(), /\[GC:/);
    assert.match(output.text(), /\[G54:/);
    assert.match(output.text(), /\$10=/);
    assert.match(output.text(), /Grbl 1\.1f/);
    assert.match(output.text(), /\[GCMD:Help,\$\]/);
    assert.match(output.text(), /\[LIMITS:/);
    assert.match(output.text(), /\[MSG:Motors initialized\]/);
    assert.match(output.text(), /\[PARAMETERS:begin\]/);
    assert.match(output.text(), /\[SETTINGS:begin\]/);
    assert.match(output.text(), /\[SETTINGS_CHANGED:none\]/);
    assert.match(output.text(), /\[MSG:Named settings:/);
    assert.match(output.text(), /\[MSG:Startup log unavailable in simulator\]/);
    assert.match(output.text(), /<Check\|/);
    assert.doesNotMatch(output.text(), /error:Unsupported command/);
  });

  it("supports settings readback, update, startup blocks, and check mode", () => {
    const output = new BufferedOutput();
    const settings = new SettingsStore();
    const machine = new MachineState();
    const protocol = new FluidProtocol(machine, output, { settings });

    protocol.receive("$110=1234\n$110\n$N0=G21\n$N\n$C\n$13=1\n$G\n$RST\n$$\n");

    assert.match(output.text(), /\$110=1234/);
    assert.match(output.text(), /\$N0=G21/);
    assert.equal(machine.snapshot().checkMode, true);
    assert.equal(machine.snapshot().reportInches, true);
    assert.match(output.text(), /\[GC:G0 G54 G17 G21 G90 G91\.1 G94/);
    assert.match(output.text(), /\$110=0/);
  });

  it("supports FluidNC long-form report interval commands", () => {
    const output = new BufferedOutput();
    const settings = new SettingsStore();
    const protocol = new FluidProtocol(new MachineState(), output, { settings });

    protocol.receive("$Report/Interval=75\n$Report/Interval\n$RI=1\n$RI\n");

    assert.equal(settings.snapshot().reportIntervalMs, 50);
    assert.match(output.text(), /\[MSG:Report interval:75\]/);
    assert.match(output.text(), /\[MSG:Report interval:50\]/);
    assert.doesNotMatch(output.text(), /Unsupported command/);
  });

  it("supports relevant FluidNC named settings", () => {
    const output = new BufferedOutput();
    const settings = new SettingsStore();
    const protocol = new FluidProtocol(new MachineState(), output, { settings });

    protocol.receive("$Start/Message=Hello\n$Start/Message\n$Message/Level=Debug\n$Message/Level\n$Message/Level=*\n$Report/Status=2\n$Report/Status\n$FakeMaxSpindleSpeed=12000\n$FakeMaxSpindleSpeed\n$FakeLaserMode=1\n$FakeLaserMode\n");

    assert.equal(settings.getNamed("Start/Message"), "Hello");
    assert.equal(settings.getNamed("Message/Level"), "Debug");
    assert.equal(settings.getGrbl("10"), "2");
    assert.equal(settings.getGrbl("30"), "12000");
    assert.equal(settings.getGrbl("32"), "1");
    assert.match(output.text(), /\$Start\/Message=Hello/);
    assert.match(output.text(), /\$Message\/Level=Debug/);
    assert.match(output.text(), /Valid options: None Error Warning Info Debug Verbose/);
    assert.match(output.text(), /\$Report\/Status=2/);
    assert.match(output.text(), /\$FakeMaxSpindleSpeed=12000/);
    assert.match(output.text(), /\$FakeLaserMode=1/);
    assert.doesNotMatch(output.text(), /Unsupported command/);
  });

  it("rejects invalid report interval values", () => {
    const protocol = new FluidProtocol(new MachineState(), new BufferedOutput());

    assert.deepEqual(protocol.executeLine("$Report/Interval=abc"), {
      ok: false,
      lines: ["error:Bad number format"]
    });
  });

  it("rejects invalid report status values", () => {
    const protocol = new FluidProtocol(new MachineState(), new BufferedOutput());

    assert.deepEqual(protocol.executeLine("$Report/Status=4"), {
      ok: false,
      lines: ["error:Invalid report status"]
    });
  });
});
