# Morph Browser 1.3.0

This release adds per-profile proxy traffic accounting.

## Added

- Profiles with their own proxy now record the bytes uploaded and downloaded through it. The value
  is shown in the **Traffic** column of the profile table, for example `1.5 GB`.
- The profile editor's Proxy tab shows the total and a **Reset** button. Resetting only clears the
  counter; it does not change the proxy or the profile.
- Traffic is counted for both the normal relay and the app-proxy → profile-proxy chain, including
  HTTPS bytes. Profiles that only use the app-wide proxy (without their own proxy) are not counted.
- Counts are batched and persisted, so they survive restarts and follow the profile on export/import.

## From 1.2.5

- Plain HTTP and HTTPS both stay in the app-proxy → profile-proxy chain.
- A dead proxy with **No fallback** opens a browser that behaves like it has no internet and never
  uses the system route (Chromium and Firefox).
- Newest-created profile sorting and the animated Opening button.

## Limits

Browser-level fixes cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
rasterisation or behaviour. Use a clean, country-consistent sticky proxy and one stable identity per
account. Do not use this project to bypass identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.3.0-windows-setup.exe` or portable
- macOS: `morph-browser-1.3.0-macos-arm64.dmg` / `morph-browser-1.3.0-macos-x64.dmg`
- Linux: `morph-browser-1.3.0-linux-x86_64.AppImage` or `morph-browser-1.3.0-linux-amd64.deb`

Profile data is kept on update and uninstall.
