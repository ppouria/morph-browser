# Morph Browser 1.2.2

This release fixes the profile ordering and keeps the 1.2.1 proxy fixes.

## Fixed

- Profiles are sorted by the most recent activity. A newly created profile starts at the top, and
  opening an older profile moves it above the rest. The Last opened column can still be sorted
  manually.

- **Plain HTTP no longer bypasses the app proxy.** HTTP requests were sent on a direct socket while
  HTTPS used the tunnel. Both now use the same app-proxy → profile-proxy chain.
- **SOCKS5 chaining works on real proxies.** The handshake is now performed on the already-tunnelled
  socket, so a SOCKS profile proxy reached through a SOCKS app proxy returns the profile exit IP
  instead of the app-proxy IP.
- **No fallback means no direct connection.** When a profile has no fallback and its proxy is
  unreachable, the launch is stopped with a clear message. Chromium is never allowed to fall back to
  the system route, and a failed relay aborts the launch.
- Proxy checks use the same fixed chain, so checking a profile proxy now reflects what the browser
  will actually use.

## From 1.2.0

- Proxy-aligned timezone, language, geolocation and `Accept-Language` from the exit country.
- Randomized fingerprints for new profiles with OS-consistent GPUs, screens and noise.
- Android emulation, per-profile fallback proxies and the app-wide proxy.

## Limits

Browser-level fixes cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
rasterisation or behaviour. Use a clean, country-consistent sticky proxy and one stable identity per
account. Do not use this project to bypass identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.2.2-windows-setup.exe` or portable
- macOS: `morph-browser-1.2.2-macos-arm64.dmg` / `morph-browser-1.2.2-macos-x64.dmg`
- Linux: `morph-browser-1.2.2-linux-x86_64.AppImage` or `morph-browser-1.2.2-linux-amd64.deb`

Profile data is kept on update and uninstall.
