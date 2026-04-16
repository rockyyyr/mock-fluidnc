# Supported Behavior

This document describes the current implemented surface.

## Command Transports

- TCP command stream.
- Stdio command stream.
- HTTP `/command` and `/command_silent`.
- HTTP `/config.yaml` for the active loaded YAML config.
- HTTP `/upload` and `/files` virtual file endpoints.
- WebSocket command channel.
- macOS virtual serial pseudo-terminal through `socat`.
- Console communication trace for received commands and emitted responses on serial, TCP, stdio, HTTP, and WebSocket channels. Automatic `$RI` status reports are intentionally omitted from this trace.

## Real-Time Commands

- `?` status report.
- `$RI` and `$Report/Interval` automatic status reporting on persistent command channels.
- `\x18` soft reset.
- `!` hold.
- `~` resume.
- `\x10` jog wait.
- `\x84` emergency stop.
- `\x90`, `\x91`, `\x92` feedrate override controls.
- `\x99`, `\x9A`, `\x9B`, `\x9E` spindle override controls.
- `\xA0`, `\xA1` air/flood and mist controls.

## System Commands

- `$x`
- `$Alarm/Disable`
- `$Alarms/List`
- `$Alarm/Send=...`
- `$h`
- `$Home`
- `$J=...`
- `$Jog=...`
- `$me`
- `$Motor/Enable`
- `$md`
- `$Motor/Disable`
- `$$`
- `$GrblSettings/List`
- `$I`
- `$Build/Info`
- `$G`
- `$GCode/Modes`
- `$#`
- `$GCode/Offsets`
- `$CMD`
- `$Commands/List`
- `$Channel/Info`
- `$Grbl/Show`
- `$GrblNames/List`
- `$Limits/Show`
- `$Motors/Init`
- `$Parameters/List`
- `$sd/list`
- `$SD/List`
- `$SD/ListJSON`
- `$sd/run=/...`
- `$SD/Run=...`
- `$sd/delete=/...`
- `$SD/Delete=...`
- `$SD/Show=...`
- `$SD/Rename=old>new`
- `$SD/Status`
- `$Files/ListGcode=...`
- `$File/ShowSome=lines,path`
- `$File/SendJSON=...`
- `$File/ShowHash=...`
- `$RM=0` through `$RM=3`
- `$Macros/Run=0` through `$Macros/Run=3`
- `$park`
- `$unpark`
- `$TC`

## Settings Commands

- `$S` and `$Settings/List`
- `$SC` and `$Settings/ListChanged`
- `$RST`, `$Settings/Restore`, `$NVX`, and `$Settings/Erase`
- `$V` and `$Settings/Stats`
- `$SS` and `$Startup/Show`
- `$RI` and `$Report/Interval`
- `$30`, `$32`, `$FakeMaxSpindleSpeed`, and `$FakeLaserMode`
- `$Start/Message`
- `$Firmware/Build`
- `$Report/Status` and `$10` status masks for `MPos`/`WPos` and `Bf` reporting.
- `$Config/Filename`
- `$Message/Level`
- `$HTTP/Enable`
- `$HTTP/Port`
- `$HTTP/BlockDuringMotion`
- `$Telnet/Enable`
- `$Hostname`
- `$SD/FallbackCS`

## G-code

- Line numbers, comments, and checksum suffixes.
- `G0`, `G1`, `G2`, `G3`, `G4`
- `G10 L2`, `G10 L20`
- `G17`, `G18`, `G19`
- `G20`, `G21`
- `G28`, `G28.1`, `G30`, `G30.1`
- `G38.2`, `G38.3`, `G38.4`, `G38.5`
- `G43.1`, `G49`, `G53`
- `G54` through `G59`
- `G80`, `G90`, `G91`, `G90.1`, `G91.1`
- `G92`
- `F`, `S`, `T`
- `M0`, `M1`, `M2`, `M3`, `M4`, `M5`, `M6`, `M7`, `M8`, `M9`, `M30`

## Virtual Files, Jobs, And Macros

- `$sd/list`, `$sd/run=/...`, and `$sd/delete=/...`
- HTTP upload, list, rename, and delete workflows through `/upload` and `/files`
- Startup block execution
- Configured macro execution through `$RM=0` to `$RM=3`
- Job pause, resume, cancel, reset, alarm, and completion tracking

## Configuration

- FluidNC-style YAML loading.
- Axes, motors, kinematics, homing, limits, planner, macros, spindle, coolant, probe, parking, filesystem, control, user input, and user output sections.
- Pin, bus, driver, extender, and hardware sections are accepted as virtual or inert configuration only.

## Intentional Exclusions

- FluidNC's bundled WebUI static app.
- Physical input pin reads and physical output pin writes.
- Real motor, spindle, laser, coolant, relay, SD hardware, SPI/I2C/UART, Wi-Fi, Bluetooth, OTA, mDNS, DNS, and captive portal behavior.
- Windows virtual COM support until it can be tested.

## Testing API

Simulator-only event injection is available under `/_mock/events/...`:

- `POST /_mock/events/limit?axis=x`
- `POST /_mock/events/probe`
- `POST /_mock/events/fault`
- `POST /_mock/events/estop`
- `POST /_mock/events/safety-door/open`
- `POST /_mock/events/safety-door/close`
- `POST /_mock/events/reset`
