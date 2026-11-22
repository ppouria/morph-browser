# Morph Browser 1.8.0

This release lets the MCP server serve clients beyond localhost, including Tailscale.

## MCP network binding

- The **MCP** tab now has a **Listen address**: keep `127.0.0.1` for local-only, use `0.0.0.0` for
  Tailscale/LAN, or bind a specific interface address.
- A **public address** field controls the host used in copied endpoints and client configs (for
  example a Tailscale IP or MagicDNS name).
- The tab lists detected IPv4 interfaces, including `tailscale0`, and warns when the server leaves
  loopback. The bearer token is still required for every request.
- IPv6 literals are accepted with or without brackets; the Host allow-list handles them correctly.

## Cross-platform MCP fixes

- MCP-created profiles pick the newest available cached Chromium build when no version is given, so
  creation is launch-ready on Linux and on fresh installs.
- Browser control returns a clear error for Firefox profiles; profile tools still work there.
- Windows stdio configs use `npx.cmd`.
- Detected network interfaces use the platform's `os.networkInterfaces()` data, with both string and
  numeric IPv4 family values handled.

## From 1.7.0

- Dedicated MCP tab, local server, token, client config, profile and browser tools.
- Extensions tab, background traffic reduction, per-profile proxy traffic, timezone fix and windowed
  fullscreen.

## Limits

Exposing MCP beyond localhost gives other devices access to the token-protected endpoint. Use
Tailscale ACLs or a firewall, keep the token private, and disable the server when not in use.

Browser-level fixes cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits or behaviour.
Do not use this project to bypass identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.8.0-windows-setup.exe` or portable
- macOS: `morph-browser-1.8.0-macos-arm64.dmg` / `morph-browser-1.8.0-macos-x64.dmg`
- Linux: `morph-browser-1.8.0-linux-x86_64.AppImage` or `morph-browser-1.8.0-linux-amd64.deb`

Profile data is kept on update and uninstall.
