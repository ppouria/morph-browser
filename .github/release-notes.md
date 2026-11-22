# Morph Browser 1.7.0

This release exposes Morph Browser to AI clients through MCP.

## MCP

- New **MCP** tab starts a local Streamable HTTP MCP server on `127.0.0.1` with a bearer token.
  Enable it, choose the port, rotate the token, and copy the generated client config from the tab.
- Profile tools: list, read, create, edit, delete, launch and stop profiles.
- Browser tools: navigate, ARIA snapshot, screenshot, click, type, press keys, evaluate JavaScript,
  manage tabs, history, reload and wait. Browser control uses the open-source `playwright-core`
  package attached to the running profile's DevTools port.
- The server is built with the official Model Context Protocol SDK. It never binds to a non-loopback
  address, and every request requires the token. Disable it at any time; turning it off does not close
  running profiles.
- The tab includes HTTP client config and a `npx -y mcp-remote` stdio bridge for clients that need
  one.

## From 1.6.0

- Extensions tab with built-in ad/tracker and tab-snoozer extensions.
- Background networking, component updates, sync and metrics are disabled to cut proxy traffic.
- Based-on-IP timezone fallback, searchable timezone list, windowed fullscreen and total traffic.

## Limits

The MCP token grants powerful local control. Keep it private. Browser-level fixes cannot hide
TLS/JA3, HTTP/2 fingerprints, WebGL capability limits or behaviour. Do not use this project to bypass
identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.7.0-windows-setup.exe` or portable
- macOS: `morph-browser-1.7.0-macos-arm64.dmg` / `morph-browser-1.7.0-macos-x64.dmg`
- Linux: `morph-browser-1.7.0-linux-x86_64.AppImage` or `morph-browser-1.7.0-linux-amd64.deb`

Profile data is kept on update and uninstall.
