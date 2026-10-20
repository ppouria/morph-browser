# Morph Browser 1.2.0

This release makes profile fingerprints follow the proxy and gives every new profile a unique,
platform-consistent identity.

## Proxy-aligned fingerprints

- When a proxy has a reachable exit IP, the profile's **Real** timezone, language, geolocation and
  `Accept-Language` follow the proxy country. A German exit now gives `Europe/Berlin`, `de-DE`,
  `navigator.languages = [de-DE, de, en-US, en]` and a matching `en` fallback.
- Country codes are mapped to real BCP47 tags (`DE → de-DE`, `BR → pt-BR`, `GB → en-GB`, ...).
- The geo lookup runs through the same app-proxy/profile-proxy chain as the browser, tries a second
  provider when the first is blocked, and is not cached so rotating proxies do not keep a stale
  timezone.
- Custom values still win. The automatic alignment can be turned off in Settings.

## Unique new profiles

- New profiles can be randomized on creation: GPU, screen, CPU, memory and font set are chosen from
  the selected OS's real-world values, and canvas, WebGL and audio noise are enabled.
- OS changes now keep the GPU and fonts consistent, so a macOS profile never reports an NVIDIA
  desktop GPU.
- Existing profiles are not changed.

## Android emulation (1.1.0)

- Android (emulated) profiles with Pixel, Galaxy and Xiaomi presets, reduced Chrome Android UA,
  Android Client Hints, touch, mobile viewport, orientation, media queries, connection, battery,
  media devices and Android fonts.

## Limits

- Browser-level alignment cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
  rasterisation or behaviour. Advanced systems such as Google or Meta can still notice
  inconsistencies. Use a clean country-consistent sticky proxy and one stable identity per account.
- Android emulation is best effort; real devices or emulators are required for strong mobile
  detection resistance.

## Install

- Windows: `morph-browser-1.2.0-windows-setup.exe` or portable
- macOS: `morph-browser-1.2.0-macos-arm64.dmg` / `morph-browser-1.2.0-macos-x64.dmg`
- Linux: `morph-browser-1.2.0-linux-x86_64.AppImage` or `morph-browser-1.2.0-linux-amd64.deb`

Profile data is kept on update and uninstall.
