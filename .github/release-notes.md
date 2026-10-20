# Morph Browser 1.1.0

This release adds an Android mobile identity to profiles and keeps the 1.0.0 feature set.

## Android emulation

- Profiles can use an **Android (emulated)** OS with Pixel 8, Pixel 8 Pro, Pixel 7, Galaxy S24,
  Galaxy S23 and Xiaomi 13 presets.
- The browser reports a reduced Chrome Android user agent, Android Client Hints (`Sec-CH-UA-Mobile`,
  platform, model, platform version, architecture, bitness and form factor), an arm platform string,
  touch points and touch events, a mobile viewport and DPR, portrait orientation, mobile
  `matchMedia` results, a cellular connection, battery, vibration and a mobile media-device list.
- Android font availability, WebGL vendor/renderer, CPU and memory follow the selected device.
- Android uses the Chromium kernels. Firefox and the native Fingerprint Chromium mode cannot provide
  this identity, so Android profiles use the injected emulation.
- This is a best-effort identity. TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
  rasterisation and behaviour still come from the desktop browser, so advanced systems such as
  Google or Meta can still notice inconsistencies. Use a real Android device/emulator or a cloud
  phone when strong mobile detection resistance is required.

## Features from 1.0.0

- Isolated profiles with groups, tags, notes, numeric ids, 2FA codes and session tab restore.
- Chrome, Chrome for Testing, Chromium snapshot, ungoogled-chromium, Fingerprint Chromium, Brave,
  Thorium and Firefox kernels, with on-demand downloads and a build manager.
- Desktop fingerprint controls for user-agent, OS, timezone, language, screen, WebGL, WebGPU,
  hardware, fonts, noise and WebRTC.
- Saved proxies with bulk import, location and flags, plus a per-profile fallback proxy.
- Optional app-wide proxy with chaining: app proxy → profile proxy → site.
- Connection check page, GitHub update checks and automatic updates for AppImage, Windows installer
  and signed macOS builds.
- MIT license and an English README.

## Install

- Windows: `morph-browser-1.1.0-windows-setup.exe` or portable
- macOS: `morph-browser-1.1.0-macos-arm64.dmg` / `morph-browser-1.1.0-macos-x64.dmg`
- Linux: `morph-browser-1.1.0-linux-x86_64.AppImage` or `morph-browser-1.1.0-linux-amd64.deb`

Profile data is kept on update and uninstall.
