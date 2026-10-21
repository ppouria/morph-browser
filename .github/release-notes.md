# Morph Browser 1.2.4

This release adds launch feedback and keeps the proxy fixes.

## Added

- The **Open** button now switches to **Opening** with a spinner and a subtle pulse while Chromium
  starts. It changes to **Stop** when the profile is running, and returns to **Open** if the launch
  fails.

## Proxy fixes from 1.2.1–1.2.3

- Plain HTTP and HTTPS both stay in the app-proxy → profile-proxy chain.
- SOCKS5 chaining works with real proxies.
- With **No fallback**, the browser opens on the configured proxy even when it is down; pages fail as
  if there is no internet and traffic never uses the system route.

## Limits

Browser-level fixes cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
rasterisation or behaviour. Use a clean, country-consistent sticky proxy and one stable identity per
account. Do not use this project to bypass identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.2.4-windows-setup.exe` or portable
- macOS: `morph-browser-1.2.4-macos-arm64.dmg` / `morph-browser-1.2.4-macos-x64.dmg`
- Linux: `morph-browser-1.2.4-linux-x86_64.AppImage` or `morph-browser-1.2.4-linux-amd64.deb`

Profile data is kept on update and uninstall.
