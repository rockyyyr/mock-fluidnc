# Transports

All command transports route into the same `FluidProtocol` engine. This keeps serial, TCP, stdio, HTTP, WebSocket, and file-job behavior aligned.

The simulator logs command traffic to its console on stderr so protocol stdout streams stay clean. Trace lines include the channel and direction:

```text
[COMM serial RX] $J=G91 G21 X5 F40000
[COMM serial TX] ok
```

Manual status queries are logged, but automatic `$RI` status-report frames are not logged so the console is still readable during live UI sessions.

## macOS Virtual Serial

Run with:

```bash
npm run start:serial
```

When using the generic npm `start` script, pass CLI flags after npm's `--` separator: `npm run start -- --serial`.

The simulator uses `socat` to create a pair of pseudo-terminals. Mock FluidNC owns one side and prints the other side as the UI-facing serial path. An existing NodeJS UI can open that path with `SerialPort` without swapping bindings or changing its code.

By default, serial mode creates a stable UI-facing symlink:

```text
/tmp/mock-fluidnc-serial
```

The underlying `/dev/tty*` device still changes between runs, but this symlink stays the same. You can override it:

```bash
npm run start -- --serial --serial-link /tmp/my-fluidnc
```

Open a terminal with `screen` after the simulator is running:

```bash
npm run serial:screen
```

That script runs `screen /tmp/mock-fluidnc-serial 115200`.

Baud rate, DTR, RTS, and flow-control settings are tolerated as OS serial settings but do not affect the simulator. Bytes are processed exactly like FluidNC serial input: real-time bytes are handled immediately, line commands are buffered until `\r`, `\n`, or `\r\n`, and responses are text lines.

In-process serial mock bindings are useful for unit tests, but they are not a no-code-change integration path because the UI must opt into the mock binding. The OS-visible pseudo-terminal is the compatibility path.

## TCP

The TCP command stream defaults to `127.0.0.1:4000`. It behaves like a serial-style byte stream and writes the simulator greeting when a client connects.

## Stdio

Pass `--stdio` to read commands from standard input and write FluidNC-style responses to standard output. This is mainly for scripts and simple debugging.

## HTTP

The HTTP server defaults to `http://127.0.0.1:8080`.

Command endpoints:

- `GET|POST /command`
- `GET|POST /command_silent`
- `GET /config.yaml`

Supported command parameters:

- `cmd`
- `commandText`
- `plain`
- `PAGEID` is accepted for compatibility and ignored when a synchronous HTTP response is used.

File endpoints:

- `GET /upload?path=/`
- `POST /upload?path=/&filename=part.nc`
- `POST /upload?path=/&filename=part.nc&action=rename&newname=renamed.nc`
- `POST /upload?path=/&filename=renamed.nc&action=delete`
- `/files` supports the same virtual file actions.

Login compatibility:

- `GET|POST /login` returns a no-auth compatibility response. It is not real security.

## WebSocket

Connect to:

```text
ws://127.0.0.1:8081
```

The WebSocket listener follows FluidNC's separate command-channel port convention: it uses the HTTP port plus one by default. For example, `--http-port 8080` starts HTTP on `8080` and WebSocket on `8081`. Override it with `--ws-port` when needed.

Text and binary command frames are routed into the shared protocol engine. Server output is returned as WebSocket text frames. Real-time bytes inside binary frames are handled by the same byte parser used by serial and TCP.

## Testing API

Simulator-only event injection is intentionally separate from FluidNC-compatible command endpoints:

- `POST /_mock/events/limit?axis=x`
- `POST /_mock/events/probe`
- `POST /_mock/events/fault`
- `POST /_mock/events/estop`
- `POST /_mock/events/safety-door/open`
- `POST /_mock/events/safety-door/close`
- `POST /_mock/events/reset`
