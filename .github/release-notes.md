# Morph Browser 1.6.0

This release adds an extension manager and cuts background proxy traffic.

## Extensions

- New **Extensions** tab manages unpacked Chrome extensions globally. Enabled extensions load into
  every Chromium profile before its first page through the DevTools Extensions domain, which works
  for system Chrome (Google Chrome 137+ ignores `--load-extension`).
- Built-in **Morph Traffic Saver** blocks common ad/tracker domains, pauses autoplay until the user
  interacts, pauses media in hidden tabs, and removes speculative prefetch/prerender requests.
- Built-in **Morph Tab Snoozer** discards inactive background tabs after 20 minutes.
- Add any unpacked extension folder. Disable built-ins or remove local ones. Firefox profiles do not
  use this manager.

## Less proxy traffic

- Chromium no longer fetches background component updates, sync data, metrics, crash reports, Domain
  Reliability pings or Safe Browsing updates through the profile proxy.
- Firefox prefetching, speculative connections, telemetry, studies and extension updates are
  disabled.

## From 1.5.0

- **Based on IP** timezone now resolves the proxy country even when both geo providers are blocked
  (`DE` → `Europe/Berlin`).
- Custom timezone is a searchable full IANA list.
- Profiles open in a maximized window that fills the host display instead of F11 fullscreen.
- Per-profile proxy traffic counters, total traffic, No proxy mode and the timezone fix.

## Limits

Browser-level fixes cannot hide TLS/JA3, HTTP/2 fingerprints, WebGL capability limits, font
rasterisation or behaviour. Use a clean, country-consistent sticky proxy and one stable identity per
account. Do not use this project to bypass identity, payment or KYC checks.

## Install

- Windows: `morph-browser-1.6.0-windows-setup.exe` or portable
- macOS: `morph-browser-1.6.0-macos-arm64.dmg` / `morph-browser-1.6.0-macos-x64.dmg`
- Linux: `morph-browser-1.6.0-linux-x86_64.AppImage` or `morph-browser-1.6.0-linux-amd64.deb`

Profile data is kept on update and uninstall.
