# Morph Browser 1.2.5

This release completes the cross-platform proxy audit.

## Fixed

- **Firefox no longer falls back to a direct connection.** Firefox defaults
  `network.proxy.failover_direct` to true; profiles now set it to false, so a broken proxy behaves
  like no internet on Windows, macOS and Linux too.
- Confirmed the same proxy path on all three platforms: plain HTTP and HTTPS stay in the
  app-proxy → profile-proxy chain, SOCKS5 chaining works, proxy checks use the same chain, and with
  **No fallback** a dead proxy never switches to the system route.
- The proxy chain tests (HTTP, SOCKS5, dead proxy) run on Windows, macOS and Linux in CI.

## Limits

Browser-level fixes cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
rasterisation or behaviour. Use a clean, country-consistent sticky proxy and one stable identity per
account. Do not use this project to bypass identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.2.5-windows-setup.exe` or portable
- macOS: `morph-browser-1.2.5-macos-arm64.dmg` / `morph-browser-1.2.5-macos-x64.dmg`
- Linux: `morph-browser-1.2.5-linux-x86_64.AppImage` or `morph-browser-1.2.5-linux-amd64.deb`

Profile data is kept on update and uninstall.
