# Morph Browser 1.2.3

This release adjusts what happens when a profile proxy is down and the fallback is **None**.

## Fixed

- The browser now opens on the configured proxy even when that proxy is broken or times out. Every
  request still goes through it, so pages fail as if there were no internet. Traffic is never sent on
  the system route, and the launch is not blocked.
- The proxy probe is only used to decide a configured fallback; it no longer aborts a no-fallback
  profile.
- This keeps the 1.2.1 fixes: plain HTTP and HTTPS both stay in the app-proxy → profile-proxy chain,
  and proxy checks use the same chain.

## Limits

Browser-level fixes cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
rasterisation or behaviour. Use a clean, country-consistent sticky proxy and one stable identity per
account. Do not use this project to bypass identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.2.3-windows-setup.exe` or portable
- macOS: `morph-browser-1.2.3-macos-arm64.dmg` / `morph-browser-1.2.3-macos-x64.dmg`
- Linux: `morph-browser-1.2.3-linux-x86_64.AppImage` or `morph-browser-1.2.3-linux-amd64.deb`

Profile data is kept on update and uninstall.
