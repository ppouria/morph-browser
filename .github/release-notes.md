# Morph Browser 1.5.0

This release fixes the GitHub timezone issue and opens profiles in a maximized window.

## Fixed

- **Timezone "Based on IP"** now resolves the proxy country reliably:
  - both IP geo providers are queried in parallel, so a provider blocked by one proxy no longer costs a
    long wait;
  - when both are blocked, the country saved with the proxy is used (`DE` → `Europe/Berlin`);
  - provider timezone strings are validated before reaching Chromium.
- **Custom timezone** now has a searchable list of every IANA timezone instead of a free-text field.
- Profiles open **maximized to the host display** (windowed fullscreen), not in F11 fullscreen mode,
  so a spoofed profile screen no longer forces the window onto a different resolution.

## From 1.4.0

- Total proxy traffic on the Profiles page and per-profile traffic counters with reset.
- Explicit **No proxy** mode that ignores the app-wide proxy, plus App proxy / Custom / Saved modes.
- Newest-first sorting, the animated Opening button, and strict proxy chaining with no direct fallback.

## Limits

Browser-level fixes cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
rasterisation or behaviour. Use a clean, country-consistent sticky proxy and one stable identity per
account. Do not use this project to bypass identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.5.0-windows-setup.exe` or portable
- macOS: `morph-browser-1.5.0-macos-arm64.dmg` / `morph-browser-1.5.0-macos-x64.dmg`
- Linux: `morph-browser-1.5.0-linux-x86_64.AppImage` or `morph-browser-1.5.0-linux-amd64.deb`

Profile data is kept on update and uninstall.
