# FluidNC Configuration Compatibility

Mock FluidNC loads FluidNC-style YAML files and normalizes the parts that affect sender-visible simulation. Hardware sections are accepted for compatibility but remain inert: the simulator never opens pins, buses, drivers, extenders, displays, SD hardware, or microcontroller peripherals.

## Workspace And Config File Location

When `--workspace` is provided, Mock FluidNC looks for both runtime files in that directory:

```text
<workspace>/config.yaml
<workspace>/settings.json
```

Start with an explicit workspace:

```bash
npm run start -- --workspace .mock-workspace
```

Copy-ready examples are available in `examples/`:

```bash
mkdir -p .mock-workspace
cp examples/config.example.yaml .mock-workspace/config.yaml
cp examples/settings.example.json .mock-workspace/settings.json
```

If `<workspace>/config.yaml` is missing, Mock FluidNC uses the built-in default config. If `<workspace>/settings.json` is missing, it starts with default settings and writes `settings.json` on clean shutdown.

Settings are saved atomically by writing a temporary file and renaming it into place. Mock FluidNC also writes `<workspace>/settings.json.bak` and falls back to that backup if the primary settings file is empty or invalid.

If `--workspace` is omitted, Mock FluidNC checks for `~/.mock-fluidnc`. If that directory exists, it is used as the workspace and the same `config.yaml` / `settings.json` rules apply. If it does not exist, Mock FluidNC uses built-in defaults and does not persist settings for that run.

`--config /path/to/config.yaml` is still supported as an explicit config override. The override only changes which YAML file is loaded; settings and virtual files still follow the workspace rules.

## Normalized Sections

- `name`, `board`, `kinematics`: Preserved for reports and simulator setup.
- `axes`: Axis travel, rates, acceleration, soft limits, homing data, motor limit pins, hard-limit flags, pull-off distances, and driver type markers are normalized.
- `stepping`, `spi`, `i2so`, `i2c`, `uart`, `uart_channel*`, `extenders`, `oled*`: Accepted as inert hardware configuration and copied into the `hardware` block.
- `sdcard` and `localfs`: Accepted as virtual filesystem configuration. Physical card pins and frequencies are preserved only as config data.
- `control`: Safety door, reset, hold, cycle-start, fault, e-stop, and macro pins are accepted as virtual event definitions.
- `coolant`: Flood, mist, and delay settings are represented as virtual accessory configuration.
- `probe`: Probe and toolsetter pins, check-mode start behavior, and hard-stop intent are represented as virtual probe configuration.
- `macros`: Startup lines, macro slots, and after-homing/reset/unlock hooks are preserved for command execution.
- `spindle`: Spindle or laser config is preserved as virtual spindle state, including RPM ranges, spin-up/down timing, laser mode, and tool-change macro data where present.
- `parking`: Parking axis, target, feed, and pullout settings are normalized for sender-visible parking behavior.
- `user_inputs` and `user_outputs`: Analog and digital pin declarations are accepted as virtual IO definitions only.
- Planner globals such as `arc_tolerance_mm`, `junction_deviation_mm`, `planner_blocks`, `report_inches`, `verbose_errors`, and `use_line_numbers` are normalized.
- `start`: `must_home`, `deactivate_parking`, and `check_limits` are normalized.

## Status Reports

`$Report/Status` and `$10` control the status position and buffer fields:

- `0`: `WPos`, no `Bf`
- `1`: `MPos`, no `Bf`
- `2`: `WPos`, with `Bf`
- `3`: `MPos`, with `Bf`

## Validation

The loader reports compatibility warnings for hardware-only sections and every `pin` or `*_pin` setting. These are informational and mean the section was accepted without physical IO.

The loader also returns validation errors for structural issues that would make simulation ambiguous, such as missing axes, negative travel, non-positive rates, non-positive steps-per-mm, or invalid planner block counts. The current validation is intentionally conservative and should be widened only when it helps match sender-visible FluidNC behavior.
