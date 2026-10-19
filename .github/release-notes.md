# Morph Browser 1.0.0

First stable release of Morph Browser, a local multi-profile browser manager. Each profile keeps
its own cookies, storage, cache, proxy and fingerprint.

## Features

- Isolated profiles with groups, tags, notes, numeric ids, 2FA codes and session tab restore.
- Google Chrome, Chrome for Testing, Chromium snapshot, ungoogled-chromium, Fingerprint Chromium,
  Brave, Thorium and Firefox, with on-demand downloads and a build manager.
- Fingerprint controls for user-agent, OS, timezone, language, screen, WebGL, WebGPU, hardware,
  fonts, noise and WebRTC. Fingerprint Chromium applies them natively.
- Saved proxies with bulk import, exit IP/country/city lookup and flags, plus a per-profile fallback
  proxy that is used when the main proxy is unreachable.
- Optional app-wide proxy. Every profile is routed through it, and a profile's own proxy is chained
  after it: app proxy → profile proxy → site. Profiles without a proxy use the app proxy directly.
- Local start page with exit IP, location, WebRTC and service reachability, plus the profile note and
  number. Tabs are restored on the next launch.
- Update checks from GitHub Releases for every build, with automatic updates in the AppImage, the
  Windows installer and signed macOS builds.
- MIT license, copyright line in the app, and an English README.

## Fixes

- "Check now" now asks GitHub on deb and portable builds too, and reports "You are running the latest
  version" when there is no newer release.
- macOS: correct build sizes (BSD du), and .app bundles resolve to their real executable.
- Windows: installed Firefox and Brave are used where downloads are not offered.
- Linux: Chrome packages unpack without dpkg-deb (ar + tar fallback), zip archives unpack without
  unzip (tar or python fallback), and arm64 kernels no longer download x64 builds.
- The Details column no longer repeats a group as a tag.
- Dropdowns stay open while scrolling.
- Sidebar shows version, MIT license and copyright on one line.

## Install

Download the installer for your system from the assets below. Profile data is kept on update and
uninstall.

- Windows: `morph-browser-1.0.0-windows-setup.exe` or portable
- macOS: `morph-browser-1.0.0-macos-arm64.dmg` / `morph-browser-1.0.0-macos-x64.dmg`
- Linux: `morph-browser-1.0.0-linux-x86_64.AppImage` or `morph-browser-1.0.0-linux-amd64.deb`
