# Mock FluidNC

Mock FluidNC is a NodeJS simulator for developing against a FluidNC-like controller without a microcontroller or machine hardware. It accepts FluidNC/Grbl-style commands, simulates motion and machine state, serves FluidNC-compatible HTTP and WebSocket command endpoints, and can expose a macOS pseudo-terminal for existing `SerialPort` clients.

It never reads physical input pins or writes physical output pins. Spindles, lasers, coolant, limits, probes, control pins, motors, and tool changes are represented as virtual state only.

Mock FluidNC is modeled after the original [FluidNC project](https://github.com/bdring/FluidNC).

## Requirements

- NodeJS 22 or newer.
- macOS for the virtual serial transport.
- `socat` on macOS if you want an OS-visible serial path:

```bash
brew install socat
```

Windows-specific virtual COM support is intentionally deferred until there is a Windows test environment.

## Install

```bash
npm install
npm run build
```

## Start

```bash
npm run start -- --config ../Source/config.example.yaml --workspace .mock-workspace
```

You can also put both runtime files in a workspace directory and start from that directory:

```text
.mock-workspace/config.yaml
.mock-workspace/settings.json
```

```bash
npm run start -- --workspace .mock-workspace
```

Copy-ready examples are available in `examples/config.example.yaml` and `examples/settings.example.json`.

If `config.yaml` or `settings.json` is missing, built-in defaults are used. Without `--workspace`, the app uses `~/.mock-fluidnc` only if that directory already exists; otherwise it starts with defaults.

Default endpoints:

- TCP command stream: `127.0.0.1:4000`
- HTTP server: `http://127.0.0.1:8080`
- WebSocket command channel: `ws://127.0.0.1:8081`

Enable the macOS serial pseudo-terminal:

```bash
npm run start:serial
```

You can also pass flags through npm with the required separator:

```bash
npm run start -- --serial
```

When serial is enabled, the CLI prints the UI-facing serial path. Your existing UI can open that path with its normal NodeJS `SerialPort` code.

Serial mode also creates a stable symlink at `/tmp/mock-fluidnc-serial`, so you can attach with:

```bash
npm run serial:screen
```

Use `--serial-link` to choose another stable path:

```bash
npm run start -- --serial --serial-link /tmp/my-fluidnc
```

## Useful Commands

```bash
npm test
npm run build
npm run start -- --http-port 8080 --tcp-port 4000
npm run start -- --http-port 8080 --ws-port 8081
```

FluidNC-style command examples:

```bash
curl "http://127.0.0.1:8080/command?cmd=?"
curl "http://127.0.0.1:8080/command?cmd=G0%20X10"
curl "http://127.0.0.1:8080/config.yaml"
curl -X POST "http://127.0.0.1:8080/_mock/events/limit?axis=x"
```

## Project Docs

- [Supported behavior](docs/SUPPORTED_BEHAVIOR.md)
- [Configuration compatibility](docs/CONFIGURATION.md)
- [Transport behavior](docs/TRANSPORTS.md)
- [Virtual accessories and tooling](docs/VIRTUAL_ACCESSORIES.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [PRD](docs/PRD.md)
- [Tasklist](docs/TASKLIST.md)

## Intentional Exclusions

- FluidNC's bundled WebUI static application.
- Physical GPIO, pin reads, pin writes, step pulses, PWM, relay control, SD card hardware, SPI/I2C/UART hardware, Wi-Fi, Bluetooth, OTA, mDNS, DNS, and captive portal behavior.
- Microcontroller APIs, ESP-IDF, ESP32, FreeRTOS, low-level memory access, and native firmware builds.
