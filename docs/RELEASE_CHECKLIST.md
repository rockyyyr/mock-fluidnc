# Release Checklist

Use this before tagging or handing the simulator to a UI project.

## Verification

- Run `npm install` from a clean checkout.
- Run `npm test`.
- Run `npm run build`.
- Start the simulator with a representative FluidNC config:

```bash
npm run start -- --config ../Source/config.example.yaml --workspace .mock-workspace
```

- Verify HTTP command response:

```bash
curl "http://127.0.0.1:8080/command?cmd=?"
```

- Verify HTTP file workflow with `/upload`.
- Verify WebSocket command flow against `ws://127.0.0.1:8081`.
- On macOS with `socat` installed, run `npm run start:serial` and confirm `/tmp/mock-fluidnc-serial` can be opened by a NodeJS `SerialPort` client or `npm run serial:screen`.

## Compatibility Review

- Confirm the target UI command list in the PRD is still covered by tests.
- Confirm supported behavior and known exclusions are documented.
- Confirm no code path opens GPIO, SPI, I2C, UART hardware, PWM, relays, or microcontroller APIs.
- Confirm Windows-specific virtual serial remains documented as deferred.
- Confirm FluidNC's bundled WebUI assets are not served.

## Packaging

- Confirm `package.json` version and license.
- Confirm `dist/` is regenerated from current TypeScript sources.
- Confirm examples still load.
- Confirm docs mention any known behavior differences discovered during testing.
