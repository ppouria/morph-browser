# Morph Browser 1.4.0

This release adds total proxy traffic and an explicit no-proxy mode.

## Added

- The Profiles page shows **Total proxy traffic**, the combined count for every profile with a
  proxy, next to the table.
- The profile editor now has four proxy modes:
  - **No proxy** opens a direct connection and ignores the app-wide proxy.
  - **App proxy** keeps no profile proxy but still uses the app-wide proxy when it is enabled.
  - **Custom** and **Saved** use that proxy through the normal chain.
- The table labels a no-proxy profile as **No proxy**, and shows **App proxy** for profiles that
  inherit the app-wide proxy.

## Fixed

- Traffic recorded just before a profile stops is flushed within about half a second instead of
  waiting for the next periodic write.

## From 1.3.0

- Per-profile traffic counters, the Traffic column, and the Reset button in the editor.
- From 1.2.5: strict proxy chaining, no direct fallback for Chromium and Firefox, newest-first
  sorting and the animated Opening button.

## Limits

Browser-level fixes cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
rasterisation or behaviour. Use a clean, country-consistent sticky proxy and one stable identity per
account. Do not use this project to bypass identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.4.0-windows-setup.exe` or portable
- macOS: `morph-browser-1.4.0-macos-arm64.dmg` / `morph-browser-1.4.0-macos-x64.dmg`
- Linux: `morph-browser-1.4.0-linux-x86_64.AppImage` or `morph-browser-1.4.0-linux-amd64.deb`

Profile data is kept on update and uninstall.
