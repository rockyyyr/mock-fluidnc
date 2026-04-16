# FluidNC Source Notes

These files are the current source-reference anchors for compatibility work:

- `Source/FluidNC/src/Channel.h` and `Channel.cpp`: line buffering, real-time characters, output behavior, and channel registration.
- `Source/FluidNC/src/Serial.cpp`: polling multiple command channels.
- `Source/FluidNC/src/RealtimeCmd.*`: real-time command byte behavior.
- `Source/FluidNC/src/Report.cpp`: greeting, status reports, modal reports, build info, and parser state output.
- `Source/FluidNC/src/ProcessSettings.cpp`: `$` command registration and settings command behavior.
- `Source/FluidNC/src/FileCommands.cpp`: SD and local file commands.
- `Source/FluidNC/src/WebUI__DO_NOT_IMPLEMENT/WSChannel.*`: WebSocket as a command channel.
- `Source/FluidNC/src/WebUI__DO_NOT_IMPLEMENT/WebUIServer.*`: `/command`, `/command_silent`, `PAGEID`, login/session compatibility, upload, and file endpoint behavior.

Current compatibility priorities:

- Preserve sender-visible command, status, and file behavior before matching internal C++ structure.
- Treat serial, WebSocket, HTTP, TCP, stdio, and file/macro channels as adapters into one protocol engine.
- Keep WebUI API compatibility separate from serving the bundled WebUI app.
- Accept hardware configuration as virtual/inert state and never perform physical IO.

