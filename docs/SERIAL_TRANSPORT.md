# macOS Virtual Serial Transport

Mock FluidNC's primary UI compatibility path is an OS-visible macOS pseudo-terminal. This lets an existing NodeJS `SerialPort` client open the simulator without replacing SerialPort bindings or changing UI code.

## Goal

The simulator starts a virtual serial endpoint when launched with `npm run start:serial` or `npm run start -- --serial` and prints the UI-facing device path:

```text
UI-facing serial path: /tmp/mock-fluidnc-serial
```

The UI opens that path with its normal `SerialPort` code. The simulator owns the other side of the pseudo-terminal and routes all bytes through the shared FluidNC protocol engine.

The real macOS `/dev/tty*` device is assigned dynamically, but serial mode creates a stable symlink at `/tmp/mock-fluidnc-serial` by default. Override it with:

```bash
npm run start -- --serial --serial-link /tmp/my-fluidnc
```

To attach a terminal after the simulator is running:

```bash
npm run serial:screen
```

## Data Flow

```text
UI SerialPort
  -> macOS pseudo-terminal slave path
  -> simulator pseudo-terminal master
  -> protocol engine
  -> machine state / planner / files / reports
  -> simulator pseudo-terminal master
  -> UI SerialPort
```

## Behavior

- Baud rate is accepted by the UI but ignored by the simulator.
- `\r`, `\n`, and `\r\n` line endings are accepted.
- FluidNC real-time bytes are handled immediately.
- Normal commands are buffered until a line ending.
- Responses use FluidNC-compatible serial text output.
- Open, close, and reconnect behavior must be tested.
- DTR, RTS, and flow-control handling should be no-op by default unless the target UI depends on them.

## Implementation Notes

Node does not expose `openpty` in the standard library. The current macOS implementation shells out to `socat` to create the pseudo-terminal pair and then connects one side to the shared FluidNC protocol engine. Install it with:

```bash
brew install socat
```

SerialPort mock bindings are acceptable for internal unit tests, but they are not acceptable for product integration because they require the UI process to opt into the mock binding.

Windows virtual COM support is intentionally deferred until there is a Windows test environment.
