# Mock FluidNC Tasklist

This tasklist is the working implementation backlog for Mock FluidNC. The PRD defines what the project should become; this file defines the order I will build it in.

This is a full-project tasklist, not only an MVP list. Milestones 1-10 produce the first useful simulator for the target custom UI. Later milestones close the broader FluidNC compatibility surface while continuing to exclude FluidNC's built-in WebUI and all physical input/output behavior.

## Operating Decisions

- Use TypeScript for the port.
- Target current NodeJS LTS on macOS.
- Keep Windows portability in mind, but defer Windows-specific implementation until there is a Windows test environment.
- Keep the FluidNC source under `Source/FluidNC` as a read-only behavioral reference.
- Implement externally observable FluidNC behavior first, not a line-by-line C++ translation.
- Make hardware IO impossible by design.
- Implement an OS-visible macOS virtual serial transport as the primary UI-compatibility transport.
- Implement FluidNC-compatible WebSocket and HTTP server communication surfaces from the source reference.
- Implement stdio and TCP command transports as automation and debugging transports.
- Add a separate HTTP testing API for event injection.
- Keep the FluidNC-compatible command protocol separate from simulator-only test/introspection APIs.
- Prefer deterministic core modules with explicit time control.
- Treat the custom UI command list in the PRD as the first compatibility contract.
- Treat "full scope" as UI-observable FluidNC behavior parity, excluding WebUI, networking features tied only to WebUI, microcontroller APIs, and physical pin IO.

## Milestone 1: Project Foundation

- [x] Create NodeJS and TypeScript project scaffold.
- [x] Add package scripts for build, test, lint or typecheck, and start.
- [x] Add baseline source layout:
  - [x] `src/protocol`
  - [x] `src/machine`
  - [x] `src/gcode`
  - [x] `src/motion`
  - [x] `src/config`
  - [x] `src/files`
  - [x] `src/http`
  - [x] `src/transports`
  - [x] `src/websocket`
  - [x] `src/testing`
  - [x] `src/time`
- [x] Add unit test framework.
- [x] Add basic CLI entry point.
- [x] Add simulator startup banner that clearly identifies the process as a simulator.
- [x] Add default config loading.
- [x] Add FluidNC-style status formatter skeleton.
- [x] Add macOS virtual serial transport design spike.
- [x] Add stdio command transport.
- [x] Add TCP command transport.
- [x] Add HTTP server skeleton.
- [x] Add WebSocket server skeleton.
- [x] Add basic command dispatch with `ok` and `error` responses.
- [x] Add initial tests for startup, command dispatch, and status output.

## Milestone 2: Protocol and Target UI Commands

- [x] Implement real-time byte command handling.
- [x] Support status query `?`.
- [x] Support reset `\x18`.
- [x] Support hold `!`.
- [x] Support resume `~`.
- [x] Support unlock `$x`.
- [x] Support home `$h` dispatch.
- [x] Support jog command prefix `$J=`.
- [x] Support jog wait `\x10`.
- [x] Support emergency stop `\x84`.
- [x] Support motor enable `$me` as virtual state.
- [x] Support motor disable `$md` as virtual state.
- [x] Support feedrate override reset `\x90`.
- [x] Support feedrate override plus `\x91`.
- [x] Support feedrate override minus `\x92`.
- [x] Support spindle override reset `\x99`.
- [x] Support spindle override plus `\x9A`.
- [x] Support spindle override minus `\x9B`.
- [x] Support spindle override stop `\x9E`.
- [x] Support air override `\xA0`.
- [x] Support mist override `\xA1`.
- [x] Add protocol tests for every target UI command.

## Milestone 3: Machine State and Status

- [x] Define machine states: idle, run, hold, jog, home, alarm, door, check, sleep.
- [x] Define alarm and error model.
- [x] Track machine position.
- [x] Track work position.
- [x] Track coordinate offsets.
- [x] Track modal parser state.
- [x] Track feed and spindle speed.
- [x] Track virtual spindle state.
- [x] Track virtual coolant and air/mist state.
- [x] Track motor enabled/disabled virtual state.
- [x] Track planner or buffer summary state.
- [x] Format FluidNC-compatible status reports.
- [x] Add tests for state transitions and status formatting.

## Milestone 4: Configuration

- [x] Load FluidNC-style YAML config files.
- [x] Parse axes.
- [x] Parse travel ranges.
- [x] Parse homing settings.
- [x] Parse feed and seek limits.
- [x] Parse acceleration settings.
- [x] Parse kinematics selection.
- [x] Accept pin-related config without performing IO.
- [x] Report clear warnings for unsupported hardware-specific settings.
- [x] Add tests using `Source/config.example.yaml` and representative machine configs.

## Milestone 5: G-code Parser

- [x] Parse line numbers, comments, checksums where applicable.
- [x] Parse modal G-code groups.
- [x] Support units: `G20`, `G21`.
- [x] Support distance modes: `G90`, `G91`.
- [x] Support motion modes: `G0`, `G1`, `G2`, `G3`.
- [x] Support coordinate systems and offsets.
- [x] Support feedrate commands.
- [x] Support spindle speed and basic spindle commands as virtual state.
- [x] Support coolant commands as virtual state.
- [x] Return compatible parser errors.
- [x] Add parser tests from FluidNC fixtures where practical.

## Milestone 6: Motion Simulation

- [x] Implement explicit simulation clock.
- [x] Implement real-time clock mode.
- [x] Implement deterministic clock mode.
- [x] Simulate linear moves.
- [x] Simulate arc moves.
- [x] Apply feedrate and rapid move behavior.
- [x] Apply feedrate overrides.
- [x] Update position continuously during motion.
- [x] Reflect active motion in status reports.
- [x] Validate soft limits.
- [x] Add motion timing and position tests.

## Milestone 7: Homing and Jogging

- [x] Implement startup alarm behavior when homing is required.
- [x] Implement `$h` homing sequence simulation.
- [x] Derive virtual homing targets from config.
- [x] Clear unlockable alarms after successful homing.
- [x] Implement `$J=` jog parsing.
- [x] Simulate jog motion.
- [x] Implement jog cancellation behavior.
- [x] Implement jog wait behavior.
- [x] Validate jogs against state and soft limits.
- [x] Add homing and jogging tests.

## Milestone 8: Virtual File System and Jobs

- [x] Implement virtual file area.
- [x] Support `$sd/list`.
- [x] Support `$sd/delete=/...`.
- [x] Support `$sd/run=/...`.
- [x] Stream file lines through the same protocol engine as direct commands.
- [x] Track active file.
- [x] Track file progress.
- [x] Support job pause, resume, cancel, reset, alarm, and completion.
- [x] Add integration tests with representative G-code files.

## Milestone 9: Testing API

- [x] Add HTTP testing API server.
- [x] Add endpoint to trigger limit switch events.
- [x] Add endpoint to trigger probe events.
- [x] Add endpoint to trigger fault pin events.
- [x] Add endpoint to trigger emergency stop events.
- [x] Add endpoint to trigger safety door open events.
- [x] Add endpoint to trigger safety door close events.
- [x] Add endpoints to clear or reset virtual event state where appropriate.
- [x] Ensure injected events flow through normal machine-state and reporting paths.
- [x] Add integration tests for every injected event.

## Milestone 10: Compatibility Hardening

- [x] Compare key behavior against FluidNC source and fixtures.
- [x] Inventory WebSocket and HTTP behavior from `Source/FluidNC/src/WebUI__DO_NOT_IMPLEMENT/WSChannel.*` and `WebUIServer.*`.
- [x] Add golden status report tests.
- [x] Add command response golden tests.
- [x] Add job lifecycle golden tests.
- [x] Expand `$` settings command coverage needed by sender UIs.
- [x] Document supported commands and known gaps.
- [x] Document testing API.
- [x] Add example configs and example G-code files.

## Milestone 11: FluidNC Reports and Settings Surface

- [x] Inventory FluidNC report and settings commands from `Source/FluidNC/src`.
- [x] Support settings readback commands used by FluidNC senders.
- [x] Support settings update commands where they affect simulated behavior.
- [x] Support parser state report commands.
- [x] Support coordinate offset report commands.
- [x] Support build/info report commands.
- [x] Support startup block report and update behavior where applicable.
- [x] Support current modal state reporting.
- [x] Support alarm, error, and help text compatibility where practical.
- [x] Persist simulator settings in a portable local file.
- [x] Add golden tests for reports and settings output.

## Milestone 12: Full G-code Surface

- [x] Inventory supported FluidNC G-code and M-code commands from the source reference.
- [x] Support dwell commands.
- [x] Support plane selection.
- [x] Support arc center modes where applicable.
- [x] Support coordinate system selection.
- [x] Support coordinate system setting commands.
- [x] Support temporary and persistent offsets.
- [x] Support machine-coordinate motion.
- [x] Support return-to-reference-position commands where FluidNC supports them.
- [x] Support tool length offset behavior.
- [x] Support program flow commands relevant to streamed and file jobs.
- [x] Support spindle, laser, coolant, and accessory M-codes as virtual state.
- [x] Support check mode.
- [x] Add parser and execution tests for the full supported G-code surface.

## Milestone 13: Planner and Motion Fidelity

- [x] Match FluidNC planner behavior closely enough for sender-visible timing and state.
- [x] Model acceleration and deceleration.
- [x] Model junction handling or cornering behavior at a sender-visible level.
- [x] Model feed hold deceleration and resume behavior.
- [x] Model rapid override behavior if exposed by FluidNC.
- [x] Model planner buffer availability in status reports.
- [x] Handle multi-segment arcs consistently.
- [x] Validate numeric precision and rounding against FluidNC expectations.
- [x] Add long-running motion and override interaction tests.

## Milestone 14: Kinematics Coverage

- [x] Inventory FluidNC kinematics implementations.
- [x] Support Cartesian kinematics.
- [x] Support CoreXY kinematics.
- [x] Support WallPlotter kinematics if sender-visible behavior requires it.
- [x] Support Midtbot kinematics if sender-visible behavior requires it.
- [x] Support ParallelDelta kinematics if sender-visible behavior requires it.
- [x] Load kinematics-specific config values.
- [x] Add kinematics-specific position and soft-limit tests.

## Milestone 15: Homing, Limits, Probing, and Safety Fidelity

- [x] Match FluidNC homing cycles more closely for multi-axis machines.
- [x] Support homing pull-off and seek/feed phases at a sender-visible level.
- [x] Support per-axis homing configuration.
- [x] Support virtual hard-limit behavior through testing API events.
- [x] Support virtual probe cycles through a configurable probe model.
- [x] Support probe success and probe failure behavior.
- [x] Support safety door state transitions.
- [x] Support fault pin events.
- [x] Support emergency-stop recovery behavior.
- [x] Add golden tests for homing, limits, probing, door, fault, and e-stop flows.

## Milestone 16: FluidNC Configuration Breadth

- [x] Inventory FluidNC configuration handlers.
- [x] Accept and validate full FluidNC-style YAML structure where practical.
- [x] Support axes, motors, kinematics, homing, limits, planner, macros, spindle, coolant, and filesystem settings.
- [x] Accept pin definitions as virtual or inert configuration.
- [x] Accept bus, driver, extender, and hardware sections without performing physical IO.
- [x] Produce compatibility warnings for hardware-only config sections.
- [x] Match FluidNC validation errors where practical.
- [x] Add config parser golden tests using FluidNC example configs.

## Milestone 17: Jobs, Files, Macros, and Startup Behavior

- [x] Expand SD/file command compatibility beyond the target UI subset.
- [x] Support file upload or file placement workflow needed by sender UIs.
- [x] Support HTTP file list, upload, delete, and rename workflows represented by FluidNC's server.
- [x] Support directory listing formats expected by FluidNC clients.
- [x] Support macros where they affect command execution.
- [x] Support startup commands or startup blocks.
- [x] Support job lifecycle edge cases: reset during file, alarm during file, hold during file, door during file.
- [x] Support parking behavior where FluidNC exposes it.
- [x] Add integration tests for file and macro workflows.

## Milestone 18: Spindle, Laser, Coolant, and Tooling Virtualization

- [x] Inventory FluidNC spindle and tool-changing behavior.
- [x] Represent spindle modes as virtual state.
- [x] Represent laser mode as virtual state.
- [x] Represent coolant modes as virtual state.
- [x] Represent air and mist overrides as virtual state.
- [x] Represent tool change flows where sender-visible.
- [x] Represent parking/tool-change interactions where FluidNC exposes them.
- [x] Ensure no virtual accessory behavior can access physical IO.
- [x] Add tests for virtual spindle, laser, coolant, air, mist, and tooling state.

## Milestone 19: HTTP, WebSocket, Serial, and Client Compatibility

- [x] Implement OS-visible macOS virtual serial transport.
- [x] On macOS, expose a pseudo-terminal slave path that existing `SerialPort` clients can open.
- [x] Provide a stable macOS serial symlink at `/tmp/mock-fluidnc-serial` for repeatable UI and `screen` usage.
- [x] Print the UI-facing serial path at simulator startup.
- [x] Document why in-process serial mock bindings are only for tests and not sufficient for no-code-change UI compatibility.
- [x] Implement FluidNC-compatible WebSocket channel behavior.
- [x] Run the WebSocket command channel on the FluidNC-style HTTP port plus one by default.
- [x] Support WebSocket clients as command channels that share the common protocol engine.
- [x] Support WebSocket real-time byte handling.
- [x] Support WebSocket output, status reports, current-client identifiers, and page/session routing where sender-visible.
- [x] Implement FluidNC-compatible HTTP server behavior.
- [x] Support `/command` and `/command_silent`.
- [x] Support `cmd`, `commandText`, `plain`, and `PAGEID` request parameters.
- [x] Route HTTP commands through the shared protocol engine.
- [x] Support HTTP command responses for `ESP`/web command workflows where practical.
- [x] Support local virtual file and SD-style HTTP file endpoints represented by FluidNC source.
- [x] Provide login/session compatibility responses where clients expect them, without treating simulator auth as real security.
- [x] Do not serve FluidNC's bundled WebUI static app as the product UI.
- [x] Do not implement OTA, Wi-Fi management, Bluetooth, mDNS, DNS, or captive portal behavior.
- [x] Harden stdio transport.
- [x] Harden TCP transport as serial/telnet-style command stream.
- [x] Validate newline, buffering, partial-write, and real-time byte behavior.
- [x] Validate serial open, close, reconnect, baud-rate tolerance, flow-control defaults, and real-time byte handling.
- [x] Validate HTTP and WebSocket behavior against the FluidNC source reference.
- [x] Validate concurrent status polling during jobs.
- [x] Add simulator lifecycle controls for automated tests.
- [x] Test against the target custom UI command contract.
- [x] Test against at least one additional FluidNC-compatible sender if practical.

## Milestone 20: Documentation and Release Readiness

- [x] Write user-facing README.
- [x] Document installation and startup.
- [x] Document command transports.
- [x] Document FluidNC-compatible HTTP and WebSocket endpoints.
- [x] Document config loading.
- [x] Document virtual file area.
- [x] Document testing API.
- [x] Document supported FluidNC compatibility surface.
- [x] Document intentional exclusions.
- [x] Document known differences from FluidNC.
- [x] Add release checklist.
- [x] Add CI workflow if repository hosting supports it.

## Milestone 21: FluidNC-Style Terminal Startup Output

- [x] Add the missing terminal startup-output parity item after user review.
- [x] Replace CLI-only simulator banner with FluidNC-style terminal boot output.
- [x] Print the standard FluidNC/Grbl greeting line in terminal output.
- [x] Include FluidNC-style `[MSG:INFO:]`, `[MSG:WARN:]`, and `[MSG:ERR:]` startup log lines.
- [x] Include loaded config file, machine name, board, kinematics, axes, motors, planner, probe, coolant, spindle, parking, and transport state in startup output.
- [x] Include macOS virtual serial path in startup output when serial is enabled.
- [x] Reuse the same FluidNC-style greeting for command-channel reset/connect greetings.
- [x] Return the terminal startup log through `$SS`.
- [x] Add tests for terminal startup output formatting.

## Milestone 22: Command Action Completion Audit

- [x] Audit accepted protocol commands for placeholder, silent no-op, or "not implemented" responses.
- [x] Replace the `$h` placeholder response with a real homing action and completion/start messages.
- [x] Support per-axis `$hX` homing through the same protocol path.
- [x] Fail unknown `$...` commands explicitly instead of silently returning `ok`.
- [x] Fail subsystem commands explicitly when their simulator subsystem is not configured.
- [x] Expand `$CMD` reporting so the supported command action list matches the current protocol surface.
- [x] Add regression tests for homing, unsupported command handling, unavailable subsystem handling, and command reports.

## Milestone 23: FluidNC Long-Form Command Aliases

- [x] Audit `Source/docs/commands-and-settings.md` for simulator-relevant long-form command names.
- [x] Add long-form aliases for reports, state, homing, jogging, motors, alarms, settings, macros, files, and SD jobs.
- [x] Add virtual responses for sender-visible helper commands such as `$Channel/Info`, `$Grbl/Show`, `$GrblNames/List`, `$Limits/Show`, `$Motors/Init`, and `$Parameters/List`.
- [x] Add relevant named settings such as `$Start/Message`, `$Firmware/Build`, `$Report/Status`, `$Config/Filename`, `$Message/Level`, `$HTTP/Enable`, `$HTTP/Port`, `$Hostname`, and `$SD/FallbackCS`.
- [x] Apply `$Report/Status` and `$10` to status report `MPos`/`WPos` and `Bf` output.
- [x] Implement `$RI` and `$Report/Interval` as automatic status report timers on persistent command channels.
- [x] Keep GPIO, heap, Wi-Fi/radio, Bluetooth, WebUI, XModem, UART passthrough, and microcontroller-only commands unsupported.
- [x] Add regression tests for long-form command aliases, named settings, and long-form SD/file workflows.

## Milestone 24: Communication Trace Output

- [x] Add console logging for commands received from serial, TCP, stdio, HTTP, and WebSocket channels.
- [x] Add console logging for responses emitted by the simulator on those channels.
- [x] Label communication trace lines with channel name and RX/TX direction.
- [x] Keep automatic `$RI` status-report frames out of console communication trace noise.
- [x] Add regression coverage for traffic logging and automatic status-report suppression.

## Full-Scope Completion Criteria

- [x] The target custom UI command contract can use Mock FluidNC as its simulator without code changes.
- [x] Common FluidNC sender workflows work through FluidNC-compatible serial, WebSocket, HTTP, TCP, or stdio command transports.
- [x] FluidNC-style config files load without hardware IO.
- [x] Motion, homing, jogging, jobs, alarms, reports, overrides, and virtual accessory states are sender-visible and test-covered.
- [x] FluidNC-compatible HTTP and WebSocket server behavior is implemented from the source reference, excluding the bundled WebUI application and real embedded-device services.
- [x] Testing API can inject virtual machine events without bypassing normal state transitions.
- [x] Unsupported behavior is limited to documented exclusions: built-in WebUI, physical IO, and microcontroller-specific internals.
- [x] Known differences from FluidNC are documented with rationale.
- [x] `npm start` prints FluidNC-style terminal startup output instead of only a simulator service banner.
- [x] Console output can trace sender-visible command traffic without flooding on automatic status reports.

## Current Next Step

- [x] Start Milestone 1 by scaffolding the TypeScript project in `Port/`.
- [x] Start Milestone 2 by implementing full target UI real-time and system command handling.
- [x] Start Milestone 3 by expanding machine state and FluidNC-compatible status reporting.
- [x] Start Milestone 4 by loading and normalizing FluidNC-style YAML config files.
- [x] Start Milestone 5 by replacing placeholder G-code parsing with modal command parsing.
- [x] Start Milestone 6 by adding explicit clocks and time-based motion simulation.
- [x] Start Milestone 7 by building homing and jogging on top of the motion simulator.
- [x] Start Milestone 8 by implementing virtual file storage and SD-style job execution.
- [x] Start Milestone 9 by exposing simulator-only event injection over HTTP.
- [x] Start Milestone 10 by adding compatibility fixtures, command inventories, and docs for supported behavior.
- [x] Start Milestone 11 by expanding FluidNC report and settings command coverage from `ProcessSettings.cpp` and `Report.cpp`.
- [x] Start Milestone 12 by expanding G-code and M-code modal coverage.
- [x] Start Milestone 13 by improving planner and motion fidelity.
- [x] Start Milestone 14 by adding kinematics adapters and config-aware transformations.
- [x] Start Milestone 15 by improving homing, probing, safety door, fault, and e-stop flows.
- [x] Start Milestone 16 by widening FluidNC YAML config parsing and validation.
- [x] Start Milestone 17 by expanding file, macro, startup, and parking workflows.
- [x] Start Milestone 18 by making spindle, laser, coolant, and tooling state explicit.
- [x] Start Milestone 19 by hardening HTTP, WebSocket, TCP, stdio, and macOS serial transports.
- [x] Start Milestone 20 by writing user-facing docs and release checklist.
- [x] Start Milestone 21 by adding FluidNC-style terminal startup output.
- [x] Start Milestone 22 by completing the command-action audit surfaced during serial testing.
- [x] Start Milestone 23 by implementing simulator-relevant FluidNC long-form command aliases.
- [x] Start Milestone 24 by adding console communication trace output.
