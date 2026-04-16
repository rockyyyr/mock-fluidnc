# Mock FluidNC Product Requirements Document

## 1. Summary

Mock FluidNC is a NodeJS port and simulator of the FluidNC firmware runtime. It is intended to run on a development Mac as a faithful simulated FluidNC instance for building, testing, and validating custom CNC user interfaces. Windows support is intentionally deferred until there is a Windows test environment.

The product should preserve FluidNC's command, configuration, motion, job, and status behavior wherever possible, while explicitly excluding hardware-specific behavior and FluidNC's built-in WebUI.

Mock FluidNC must never control motors, spindles, lasers, relays, GPIO, or any real machine. Its purpose is to accept the same kinds of commands a UI would send to FluidNC, maintain realistic machine state, simulate movement over time, and report status accurately enough that UI developers can rely on it during development.

## 2. Goals

- Provide a NodeJS-based FluidNC-compatible simulator for local UI development.
- Accept motion commands through FluidNC-compatible interfaces and command formats.
- Parse and execute G-code with FluidNC-compatible behavior.
- Simulate machine position, modal state, planner state, feed rates, coordinate systems, homing, jogging, pausing, resuming, resets, alarms, and file-based jobs.
- Report machine status in the same style and with the same semantics expected from FluidNC.
- Load FluidNC-style YAML machine configuration files where practical.
- Support deterministic and repeatable simulations for automated UI tests.
- Run on a development Mac without microcontroller dependencies.
- Keep the implementation entirely in NodeJS, using portable OS APIs only.

## 3. Non-Goals

- Do not implement FluidNC's built-in WebUI.
- Do not read physical input pins.
- Do not write physical output pins.
- Do not control motors, stepper drivers, spindles, lasers, coolant pumps, relays, probes, or any machine hardware.
- Do not use microcontroller APIs, ESP-IDF APIs, Arduino APIs, FreeRTOS, low-level memory access, GPIO libraries, or native hardware drivers.
- Do not attempt electrical, timing-pulse, or interrupt-level simulation.
- Do not provide safety guarantees for real CNC operation.
- Do not require users to flash firmware or connect physical devices.

## 4. Target Users

- UI developers building custom FluidNC senders, dashboards, machine controls, or job monitors.
- QA engineers writing automated tests for CNC control UIs.
- FluidNC integrators who need a predictable local development target.
- Contributors porting FluidNC behavior from C++ into a maintainable NodeJS architecture.

## 5. Primary Use Cases

1. A UI developer starts Mock FluidNC locally, connects their sender UI, and sees the same connection, greeting, command responses, and status reports they expect from FluidNC.
2. A developer streams G-code to Mock FluidNC and watches simulated machine position, state, progress, feed, spindle state, and job lifecycle update over time.
3. A developer sends jog commands and sees realistic jog behavior, including accepted commands, rejected commands, position changes, cancellation, and status changes.
4. A developer homes the simulated machine and sees homing state transitions, machine coordinate updates, alarm clearing, and post-homing status behavior.
5. A developer loads a FluidNC YAML config and tests how their UI behaves with different axes, limits, travel ranges, kinematics, and settings.
6. A test suite runs Mock FluidNC in deterministic simulated-time mode to validate UI behavior without waiting for real machine time.

## 6. Product Scope

### 6.1 Included

- G-code parser and command execution.
- FluidNC and Grbl-style command protocol behavior.
- Real-time commands, including status query, feed hold, cycle start, reset, and jog cancel where applicable.
- Machine state model.
- Motion planning simulation.
- Position reporting.
- Homing simulation.
- Jogging.
- Running G-code files.
- Coordinate systems and offsets.
- Modal state tracking.
- Alarms and errors.
- Settings and configuration.
- Local virtual file storage for uploaded or mounted G-code files.
- OS-visible macOS virtual serial transport.
- FluidNC-compatible WebSocket command channel.
- FluidNC-compatible HTTP server command and file-management API.
- Virtual spindle, coolant, and accessory state reporting without hardware output.
- Logging suitable for debugging UI interactions.
- Automated test hooks and a testing API for simulated machine events.

### 6.2 Excluded

- FluidNC built-in WebUI and its static assets.
- Windows-specific virtual serial implementation until a Windows test environment is available.
- Wi-Fi, Bluetooth, mDNS, captive portal behavior, and real network interface management.
- OTA firmware updates and real firmware update behavior.
- Physical pin reads, including limit switches, control pins, probes, door inputs, user inputs, and hardware event pins.
- Physical pin writes, including step pulses, direction pins, enables, relays, PWM, I2S output, UART driver control, SPI driver control, DAC output, and user outputs.
- ESP32-specific storage, timers, interrupts, watchdogs, NVS, and file systems.
- Native microcontroller-compatible binary builds.

## 7. Compatibility Requirements

Mock FluidNC should prioritize compatibility at the UI contract level. Exact internal implementation parity with FluidNC C++ is not required when an equivalent NodeJS implementation can produce the same externally observable behavior.

### 7.1 Command Compatibility

The simulator must support:

- Line-oriented G-code commands.
- FluidNC/Grbl system commands, including common `$` commands.
- Status query command `?`.
- Feed hold command `!`.
- Cycle start/resume command `~`.
- Soft reset behavior.
- Jog commands, including `$J=...`.
- Homing command `$H`.
- G-code file run commands.
- Configuration and settings commands needed by sender UIs.

The simulator should return FluidNC-compatible success, error, and alarm responses.

The simulator must support the following commands used by the target custom UI:

| UI command | Raw command | Required simulator behavior |
| --- | --- | --- |
| Unlock | `$x` | Clear unlockable alarm state and return to the appropriate post-unlock state. Commands should be case-insensitive where FluidNC is case-insensitive. |
| Home | `$h` | Start simulated homing. |
| Status | `?` | Return a FluidNC-compatible status report. |
| Reset | `\x18` | Perform FluidNC-compatible soft reset behavior. |
| Hold | `!` | Enter feed hold where allowed. |
| Resume | `~` | Resume from hold or continue cycle where allowed. |
| Run file | `$sd/run=/` | Run a file from the virtual file area using the path suffix after `/`. |
| List files | `$sd/list` | List files in the virtual file area using FluidNC-compatible output. |
| Delete file | `$sd/delete=/` | Delete a file from the virtual file area using the path suffix after `/`. |
| Jog | `$J=` | Accept and execute FluidNC-compatible jog commands. |
| Wait for jog | `\x10` | Support the FluidNC jog wait real-time command expected by the UI. |
| Emergency stop | `\x84` | Enter an emergency-stop or critical alarm state compatible with FluidNC behavior. |
| Motor enable | `$me` | Enable motors in virtual state only. |
| Motor disable | `$md` | Disable motors in virtual state only. |
| Feedrate override reset | `\x90` | Reset feedrate override to 100%. |
| Feedrate override plus | `\x91` | Increase feedrate override by the FluidNC-compatible increment. |
| Feedrate override minus | `\x92` | Decrease feedrate override by the FluidNC-compatible increment. |
| Spindle override reset | `\x99` | Reset spindle override to 100%. |
| Spindle override plus | `\x9A` | Increase spindle override by the FluidNC-compatible increment. |
| Spindle override minus | `\x9B` | Decrease spindle override by the FluidNC-compatible increment. |
| Spindle override stop | `\x9E` | Toggle or stop spindle output according to FluidNC-compatible behavior, represented as virtual spindle state only. |
| Air override | `\xA0` | Toggle or override virtual air/flood output according to FluidNC-compatible behavior. |
| Mist override | `\xA1` | Toggle or override virtual mist output according to FluidNC-compatible behavior. |

### 7.2 Status Compatibility

The simulator must emit status reports compatible with FluidNC sender expectations, including:

- Current machine state.
- Machine position.
- Work position or offsets when configured.
- Feed and speed values.
- Buffer/planner indicators where applicable.
- Alarm state.
- Hold, run, idle, home, jog, and file-job states.

Exact field ordering should match FluidNC where practical, especially for fields commonly parsed by sender UIs.

### 7.3 Configuration Compatibility

The simulator should load FluidNC-style YAML configuration files and use them to define:

- Axes.
- Motors.
- Travel ranges.
- Homing behavior.
- Kinematics.
- Feed and seek limits.
- Acceleration.
- Machine units.
- Spindle/coolant capabilities as virtual state only.

Pin-related configuration may be accepted for compatibility but must not perform physical IO. Unsupported hardware-specific config should produce clear warnings instead of crashing unless FluidNC itself would reject the config.

## 8. Functional Requirements

### 8.1 Runtime

- The application must run under NodeJS on macOS.
- Windows support should remain a future portability goal, but Windows-specific serial implementation is out of scope until it can be tested.
- The application should expose a CLI entry point.
- The application should support startup with a selected config file.
- The application should support startup with a selected virtual workspace or data directory.
- The runtime must not depend on native microcontroller APIs.
- The runtime should support graceful shutdown.

### 8.2 Connection Interfaces

At minimum, the simulator must provide one command transport suitable for UI development. Preferred transports are:

- OS-visible macOS virtual serial port transport that can be opened by an existing NodeJS `SerialPort` client without code changes.
- FluidNC-compatible WebSocket command channel.
- FluidNC-compatible HTTP command and file-management server.
- TCP socket that behaves like a serial/telnet command stream.
- Standard input/output mode for scripts and tests.

The virtual serial transport is the preferred compatibility path for existing sender UIs that use NodeJS `SerialPort`. On macOS, the simulator should create and print an OS-visible pseudo-terminal path that the UI can open as a normal serial port.

The simulator may use serial mock bindings internally for its own unit tests, but that must not be the primary integration strategy for external UIs because it would require the UI process to opt into a mock binding. For no-code-change UI compatibility, the UI must see something that behaves like a normal operating-system serial port.

WebSocket, HTTP command endpoints, serial, TCP, and stdio should share the same command/protocol engine wherever possible. FluidNC's `Channel` abstraction in `Source/FluidNC/src/Channel.h`, `Serial.cpp`, `WebUI__DO_NOT_IMPLEMENT/WSChannel.*`, and `WebUI__DO_NOT_IMPLEMENT/WebUIServer.*` should be treated as the source reference for transport behavior.

The first production milestone should define which non-serial interface is canonical for automation. Multiple transports may share the same protocol engine.

### 8.3 Machine State

The simulator must maintain:

- Machine state: idle, run, hold, jog, home, alarm, check, sleep, door, and other FluidNC-equivalent states where relevant.
- Machine position.
- Work coordinate position.
- Coordinate system offsets.
- Tool length offset.
- Modal parser state.
- Active units.
- Active distance mode.
- Feed rate.
- Spindle speed command.
- Virtual spindle state.
- Virtual coolant state.
- Planner queue state.
- Job state.
- Alarm and error state.

### 8.4 Motion Simulation

The simulator must:

- Convert supported G-code motion commands into simulated movement.
- Simulate linear moves.
- Simulate arc moves.
- Respect units, absolute/relative modes, feed rates, rapid moves, coordinate systems, and offsets.
- Update position continuously during movement, not only at command completion.
- Produce status reports that reflect in-progress movement.
- Support configurable simulation speed.
- Support real-time mode, where simulated time tracks wall-clock time.
- Support deterministic mode, where tests can advance simulated time manually or run as fast as possible.
- Avoid step-pulse-level simulation unless needed for externally visible behavior.

### 8.5 Homing

Because there are no physical limit inputs, homing must be simulated from configuration and virtual machine state.

The simulator must:

- Support `$H` homing command behavior.
- Simulate homing state transitions.
- Move axes according to configured homing behavior where practical.
- Establish machine coordinates after homing.
- Clear relevant alarms after successful homing.
- Support startup alarm behavior when homing is required.
- Support deterministic homing completion for automated tests.

Limit switch pins should be treated as virtual configuration only. The simulator may model virtual limit locations derived from axis travel ranges, but it must not read real pins.

### 8.6 Jogging

The simulator must:

- Accept FluidNC-compatible jog commands.
- Validate jog commands against machine state and soft limits where enabled.
- Simulate jog motion over time.
- Support jog cancellation.
- Report jog state and position during jogging.
- Return compatible errors for invalid jog commands.

### 8.7 G-code Files and Jobs

The simulator must:

- Provide a virtual file area for G-code files.
- Run G-code files from the virtual file area.
- Track active file, progress, elapsed time, and completion state where practical.
- Support pause, resume, cancel, reset, and alarm behavior during jobs.
- Preserve sender-visible response semantics while streaming file contents through the same command engine used for direct commands.

### 8.8 Alarms, Errors, and Limits

The simulator must:

- Produce compatible parser errors.
- Produce compatible alarm states.
- Support soft limits based on configured travel.
- Simulate hard-limit behavior only through explicit virtual test hooks or configured virtual events, not through physical input pins.
- Handle reset and unlock behavior consistently with FluidNC.
- Make unsupported hardware behavior visible through warnings or no-op virtual state, not silent crashes.

### 8.9 Virtual Hardware State

Commands that normally affect hardware outputs should update virtual state only.

Examples:

- Spindle commands update virtual spindle direction, enable state, and speed.
- Coolant commands update virtual flood/mist state.
- Laser/plasma/spindle modes may be represented as virtual state if needed for status and UI behavior.
- User output commands may be accepted only if required for compatibility, but they must not write physical pins.

Commands that normally read hardware inputs should use explicit virtual state only.

Examples:

- Probe commands should either be unsupported in the first milestone or driven by a configurable virtual probe model.
- Door, hold, reset, and cycle-start inputs should be controlled by commands or test hooks, not pins.
- Limit inputs should be simulated from machine travel or test hooks.

### 8.10 Testing API

The simulator must expose a testing API that allows UI tests and development tools to trigger machine events that would normally come from physical inputs.

The testing API must support triggering:

- Limit switch events.
- Probe events.
- Fault pin events.
- Emergency stop events.
- Safety door open and safety door close events.

The testing API should also support clearing or resetting virtual event state where FluidNC behavior allows it.

Testing API events must flow through the same machine-state, alarm, hold, status, and reporting paths as real FluidNC events would. They must not bypass the simulator by directly mutating final UI-facing state without exercising the relevant behavior.

The testing API may be exposed through one or more development-only transports, such as an HTTP API, WebSocket API, or in-process test helper. The transport must be clearly separated from FluidNC-compatible command transports so custom UI tests can choose between black-box protocol testing and simulator-specific event injection.

### 8.11 FluidNC HTTP and WebSocket Server

The simulator must implement FluidNC-compatible WebSocket communication and HTTP server behavior as local NodeJS services. This is separate from implementing FluidNC's bundled WebUI application.

The WebSocket server must:

- Accept browser or UI WebSocket clients using FluidNC-compatible connection behavior.
- Treat each WebSocket connection as a command channel.
- Support sending command output, status reports, and asynchronous messages over the WebSocket.
- Handle real-time commands received over WebSocket without waiting for a full G-code line.
- Follow FluidNC source behavior for client identifiers and page/session routing where sender-visible.

The HTTP server must:

- Support FluidNC-compatible command endpoints, including `/command` and `/command_silent`.
- Support command query parameters used by FluidNC clients, including `cmd`, `commandText`, `plain`, and `PAGEID` where applicable.
- Route commands through the same protocol engine used by serial and WebSocket transports.
- Support file-management endpoints represented in FluidNC's HTTP server, including local virtual file listing, upload, delete, rename, and SD-style virtual file operations where practical.
- Support FluidNC-compatible web command responses such as `ESP` command JSON/text responses where practical.
- Provide compatibility behavior for login/session endpoints where required by clients, but no real security guarantee is required for the simulator.

The HTTP server must not:

- Serve FluidNC's bundled WebUI static application as the product UI.
- Perform OTA firmware updates.
- Manage Wi-Fi, Bluetooth, mDNS, DNS, captive portal, or real device networking.
- Access physical SD cards or embedded flash. All file operations must use the simulator's virtual file area.

## 9. Non-Functional Requirements

### 9.1 Accuracy

- Position reporting should be accurate to FluidNC-compatible precision.
- Parser behavior should match FluidNC for commonly used commands.
- Motion timing should be close enough for UI development in real-time mode.
- Deterministic mode should produce repeatable results independent of host CPU speed.

### 9.2 Portability

- The simulator must run on supported macOS development machines.
- File paths and line endings must be handled portably.
- Core modules should avoid unnecessary OS-specific behavior so Windows support can be added later, but Windows-specific transports are not required for the current implementation.

### 9.3 Safety

- The simulator must not open hardware devices by default.
- The simulator must not access GPIO, serial motor controllers, USB machine controllers, or native drivers.
- Documentation and startup logs should clearly identify the process as a simulator.

### 9.4 Testability

- Core parser, machine state, motion, homing, jogging, and job execution should be unit tested.
- The runtime should support integration tests that drive commands and assert responses/status.
- Deterministic time should be available for tests.
- A testing API should allow tests to inject virtual limit, probe, fault, emergency-stop, and safety-door events.
- Golden tests should compare selected behavior against FluidNC fixtures where available.

### 9.5 Maintainability

- Code should be organized around clear subsystems: protocol, parser, machine state, planner, motion simulation, config, virtual file system, HTTP, WebSocket, and transports.
- Hardware-specific behavior should be isolated behind explicit virtual abstractions.
- FluidNC source files under `Source/FluidNC` should be used as the behavioral reference, not modified as part of the NodeJS port.

## 10. Suggested Architecture

### 10.1 Core Modules

- `protocol`: accepts command lines and real-time commands, emits responses and status reports.
- `gcode`: parses G-code and maintains modal parser state.
- `machine`: owns high-level machine state, alarms, offsets, settings, and virtual hardware state.
- `motion`: plans and simulates movement over time.
- `kinematics`: converts between machine coordinates and axis/motor concepts where needed.
- `config`: loads and validates FluidNC-style YAML configuration.
- `files`: provides virtual local storage for G-code files.
- `http`: implements FluidNC-compatible HTTP command and file endpoints.
- `websocket`: implements FluidNC-compatible WebSocket command channels.
- `transports`: exposes macOS virtual serial, TCP, stdio, or other development interfaces.
- `time`: provides wall-clock and deterministic simulation clocks.
- `testing`: exposes controlled hooks for deterministic status, virtual limits, virtual probe events, and job assertions.

### 10.2 Design Principles

- Preserve FluidNC's externally observable behavior before preserving internal structure.
- Keep hardware IO impossible by design.
- Prefer pure TypeScript/JavaScript modules for core behavior.
- Keep transports thin and protocol-agnostic.
- Make simulation time explicit.
- Make unsupported behavior obvious.

## 11. Milestones

### Milestone 1: Project Foundation

- NodeJS project scaffold in `Port/`.
- TypeScript or JavaScript runtime decision documented.
- CLI entry point.
- Basic config loading.
- Basic command loop over macOS virtual serial, HTTP/WebSocket skeletons, stdio, or TCP.
- Greeting and basic `ok`/`error` responses.
- Initial status report support.

### Milestone 2: Parser and Machine State

- G-code parser for common motion and modal commands.
- Machine state model.
- Coordinate systems and offsets.
- Settings command support for common sender workflows.
- Unit tests for parser and state transitions.

### Milestone 3: Motion Simulation

- Linear motion simulation.
- Arc motion simulation.
- Feed and rapid behavior.
- Real-time status updates during movement.
- Deterministic time mode.
- Soft-limit validation.

### Milestone 4: Homing and Jogging

- `$H` homing simulation.
- Startup alarm behavior where configured.
- Jog command support.
- Jog cancellation.
- Homing/jogging tests.
- Initial testing API support for virtual limit and safety-door events.

### Milestone 5: File Jobs

- Virtual file storage.
- G-code file execution.
- Job progress tracking.
- Pause/resume/cancel behavior.
- Integration tests with representative G-code files.

### Milestone 6: FluidNC Compatibility Expansion

- Broader `$` command coverage.
- More complete status fields.
- Virtual spindle/coolant behavior.
- Macro and startup command behavior where applicable.
- Full target UI command list support, including override real-time commands, motor enable/disable, emergency stop, and SD file commands.
- FluidNC-compatible HTTP and WebSocket command surfaces.
- Full testing API support for limit, probe, fault pin, emergency-stop, and safety-door events.
- Compatibility test fixtures based on FluidNC source and example files.

## 12. Acceptance Criteria

The first broadly useful release should be considered acceptable when:

- A custom FluidNC UI can connect to Mock FluidNC on a development machine.
- The UI can query status and receive FluidNC-compatible status reports.
- The UI can send common G-code motion commands and observe accurate simulated movement.
- The UI can home the machine.
- The UI can jog the machine.
- The UI can run a G-code file from the virtual file area.
- The simulator handles pause, resume, cancel, reset, alarm, and unlock flows in a sender-compatible way.
- The simulator supports the target custom UI command list documented in this PRD.
- The simulator exposes macOS virtual serial, FluidNC-compatible WebSocket, and FluidNC-compatible HTTP command/file interfaces.
- Tests or development tools can trigger virtual limit, probe, fault pin, emergency-stop, and safety-door events through the testing API.
- No real hardware IO occurs.
- The simulator runs on macOS.
- Automated tests cover parser behavior, motion simulation, homing, jogging, and file-job execution.

## 13. Open Questions

1. Which macOS pseudo-terminal library or strategy should be used for the virtual serial transport?
2. Which FluidNC HTTP/WebSocket endpoints are required by the target custom UI for the first useful release?
3. What minimum FluidNC version or commit should be treated as the compatibility target?
4. Which sender UI should be used as the primary compatibility test client?
5. Should probing be unsupported initially, or should it use a configurable virtual probe model?
6. What transport should the testing API use first: HTTP, WebSocket, in-process helpers, or another mechanism?
7. How exact does timing need to be for the first release: UI-plausible movement or close matching of FluidNC planner timing?
8. Which FluidNC WebUI server behaviors should be implemented for API compatibility even though the bundled WebUI app itself is excluded?
9. Should settings persistence behave like FluidNC NVS storage, or should it use simple local JSON/YAML files?
10. Beyond event injection, should the simulator expose extra introspection APIs for tests, or strictly limit observations to FluidNC-compatible command/status behavior?
