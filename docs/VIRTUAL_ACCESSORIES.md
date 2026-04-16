# Virtual Accessories and Tooling

Mock FluidNC represents accessories as in-memory simulator state only. No spindle, laser, coolant, air, mist, output, relay, or tool-change behavior can reach physical IO.

## Sender-Visible State

- `M3`, `M4`, and `M5` update virtual spindle direction.
- `S` updates virtual spindle speed.
- Configured spindle type and laser mode are preserved from YAML and surfaced in the machine snapshot.
- `M7`, `M8`, and `M9` update virtual mist and flood/air coolant state.
- Real-time air and mist override bytes toggle the same virtual accessory state reported in status.
- `T` selects a tool.
- `M6` enters a virtual tool-change hold using the selected tool.
- `$TC` completes the virtual tool change and returns the simulator to idle when it was waiting in hold.
- Parking is represented by `ParkingManager`; `$park` moves the configured parking axis to its target and `$unpark` restores the saved position.

These behaviors are intentionally stateful enough for sender UIs to test workflows, but they do not model electrical timing, PWM generation, relay behavior, VFD protocols, or physical tool changers.
