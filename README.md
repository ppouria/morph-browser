# Morph Browser

Morph Browser runs several isolated browser profiles on one computer. Each profile keeps its own
cookies, storage, cache, proxy and fingerprint, so accounts do not share a session. Everything stays
on the local machine: there is no account, no cloud sync and no team service.

## Profiles

- Every profile has its own browser data folder, so logins, cookies and local storage are separate.
- Profiles can have a group, tags, a note and a numeric id.
- The note is shown as a chip in the list and on the profile's start page.
- A 2FA secret can be stored per profile; the current code is shown in the editor.
- Start tabs can be configured. For Chromium-based profiles, tabs that are open when a profile
  stops are restored on the next launch, with the information tab first.
- Duplicate a profile, export or import profiles as JSON, edit group and tags in bulk, or move
  profiles to the trash and restore them later.

## Browsers

- Supported kernels: Google Chrome, Chrome for Testing, Chromium snapshot, ungoogled-chromium,
  Fingerprint Chromium, Brave, Thorium and Firefox.
- Google publishes Chrome builds for Linux only, so macOS and Windows use the installed Chrome.
  Firefox has no Windows archive, so an installed Firefox or a custom binary is used there.
- Linux arm64 has no Chrome for Testing or Chromium snapshot build; the other kernels are used.
- A missing build is downloaded when a profile using it starts. The sidebar shows the progress and
  the finished task.
- Installed builds can be inspected in Settings: size, open folder, remove one build or remove all
  builds of a kernel.
- A custom binary path can be set per profile for Chromium-based browsers.
- Each profile window uses the profile name as its title. On Linux the window icon also carries the
  profile number, so windows are easy to tell apart.

## Proxy alignment

- When a proxy has a reachable exit IP, the app reads its country, timezone and coordinates. By
  default the profile's **Real** timezone, language and location follow that country: a German exit
  gives `Europe/Berlin`, `de-DE` and a German `Accept-Language`/`navigator.languages` list.
- Custom values always win, and the alignment can be switched off in Settings.
- The lookup runs through the same app-proxy/profile-proxy chain as the browser. Rotating or
  country-mixing proxies can return a different country for each request, so use country-specific
  sticky sessions when consistency matters.

## Fingerprints

- User-agent (automatic or custom), operating system, timezone, language, screen size, fonts,
  WebGL vendor/renderer, WebGPU mode, CPU cores, device memory and WebRTC policy.
- Optional noise for canvas, WebGL images, audio, media devices, client rects and speech voices.
- New profiles can be randomized on creation: a GPU, screen, CPU, memory and font set that match the
  selected OS, with canvas, WebGL and audio noise enabled. Existing profiles are not changed.
- Fingerprint Chromium applies the fingerprint inside the browser (native), which is stronger than
  the DevTools-based spoofing used for the other Chromium kernels.
- Firefox supports user-agent, language and WebRTC, but not canvas, WebGL or font spoofing. Its
  timezone is set with the POSIX `TZ` variable, so it is honoured on Linux and macOS; Windows
  Firefox may keep the system timezone.

## Android emulation

- A profile OS can be set to **Android (emulated)**. The desktop browser then reports an Android
  identity: reduced Chrome Android user agent, Client Hints (`Sec-CH-UA-Mobile`, platform, model,
  platform version, architecture, bitness and form factor), arm platform string, touch points and
  touch events, mobile viewport and DPR, portrait orientation, mobile `matchMedia` results,
  cellular connection, battery, vibration and a mobile media-device list.
- Device presets: Pixel 8, Pixel 8 Pro, Pixel 7, Galaxy S24, Galaxy S23 and Xiaomi 13. Each preset
  carries its own model, Android version, screen size, DPR, GPU and core count.
- Android is supported by the Chromium kernels only. Firefox and native Fingerprint Chromium modes
  cannot provide this identity, so Android profiles fall back to the injected emulation.
- This is a best-effort identity, not a real Android browser. TLS/JA3, HTTP/2 fingerprints, WebGL
  capability limits, font rasterisation and user behaviour still belong to the desktop browser, so
  advanced systems such as Google or Meta can still notice inconsistencies. For strong mobile
  detection resistance, use a real Android device/emulator or a cloud phone.

## Proxies

- Saved proxies and per-profile proxies are supported.
- Bulk import accepts one proxy per line in these formats:
  `host:port`, `host:port:user:pass`, `user:pass@host:port`, `socks5://user:pass@host:port`.
- Saving or checking a proxy reads its exit IP, country, city and country code, and shows a flag.
- A profile can have a fallback proxy. When the main proxy is unreachable at launch, the fallback is
  used and a warning is shown.
- A change-IP URL can be called before each launch.
- Chromium connects to a local relay, so the proxy password is never passed to the browser.

## App proxy

- Settings can route every profile through one app-level HTTP, HTTPS or SOCKS5 proxy.
- When a profile also has its own proxy, the two are chained: the browser connects to the app proxy
  first, and the profile proxy is reached through it. A profile without a proxy uses the app proxy
  directly.
- The switch turns the chain off without deleting the saved proxy.
- Proxy checks and saved-proxy location lookups use the same chain, except when checking the app
  proxy itself.

## Start page

- The first tab is a local connection check page. It shows the exit IP, location, WebRTC status and
  whether Google, YouTube, Facebook, Amazon, Cloudflare, GitHub, WhatsApp and X are reachable.
- The page shows the profile note and its number, and its tab title is the profile name.

## Settings

- Theme (system, light, dark) and table density.
- Remember window size and position.
- Open the check page on launch, and start the app when the system starts.
- Defaults for new profiles: kernel, operating system, screen, timezone, language and fingerprint
  randomisation.
- System Chromium path, installed build manager, data folder, reset settings.
- Update options: check on launch, download automatically, install on quit, or restart to update.

## Updates

- On launch the app checks the latest stable release on GitHub, downloads it when allowed, and offers
  "Restart to update".
- "Check now" always asks GitHub. On a build that cannot update itself (deb, portable) it reports the
  newer version and opens the release page instead of downloading.
- Windows uses the NSIS installer and updates in place without touching profile data.
- Linux auto-update works for the AppImage, and Windows auto-update for the installer; the .deb
  and the portable build cannot update themselves.
- macOS auto-update requires a signed build. The CI builds are unsigned, so the first launch may
  need "Open Anyway" in System Settings.

## Run from source

Requires Node.js 22 and npm.

```bash
npm install
npm start
```

On Linux, if Chromium or Electron cannot start because of the sandbox, run:

```bash
npm start -- --no-sandbox
```

## Build installers

```bash
npm run dist -- --linux
npm run dist -- --win
npm run dist -- --mac
```

The GitHub Actions workflow builds Windows (installer and portable), macOS (dmg and zip) and Linux
(AppImage and deb) when a `v*` tag is pushed.

## Data location

- Linux: `~/.config/morph-browser`
- Windows: `%APPDATA%\morph-browser`
- macOS: `~/Library/Application Support/morph-browser`

`store.json` holds profiles, proxies and settings. Browser data lives in `profiles/<id>`, downloaded
builds in `browsers/`.

## Detection risk

Morph runs official Chromium-family desktop builds. A profile separates cookies, storage and cache,
and it changes many values a page can read: user agent, Client Hints, timezone, language, screen,
WebGL strings, touch support, noise and the proxy. But the browser underneath is still a desktop
Chromium binary, so there is no guarantee that a strict site will not notice something unusual or
link two profiles together.

Some parts cannot be changed from inside the browser:

- The TLS/JA3 and HTTP/2 fingerprints of the desktop network stack.
- The real limits and behaviour of the GPU and graphics driver. Vendor and renderer strings can be
  replaced, but the capabilities stay those of the desktop machine.
- Font rendering and text metrics. The browser can claim that a font exists and can add noise, but
  it cannot draw text exactly like a different operating system.
- Desktop-only APIs, real sensor data, timing, and human behaviour.
- Debugger/automation traces and crash or GPU timing.

That means a profile is not an invisibility cloak. For better results, use a clean,
country-consistent sticky residential or mobile proxy, keep timezone and language aligned with it,
keep one stable profile per account, and avoid changing the fingerprint on every launch. Test the
profile on a fingerprint-check page before using an important account.

Never use this project to bypass a provider's identity, payment or KYC checks, or its terms of
service.

## Notes

- The app is local-only; it has no cloud sync, team management or RPA.
- Browser-level alignment cannot hide TLS/JA3, HTTP/2, WebGL capability or behaviour differences.
  Use a clean, country-consistent sticky proxy and keep one stable identity per account.
- Proxy passwords are stored in plain text for now.
- Google's download hosts are unavailable in some regions, which blocks the Chrome and Chromium
  downloads there.
- Thorium has no public binary API, so it needs an installed copy or a custom binary path.
- Fingerprint spoofing lowers the chance of linking accounts, but no tool can guarantee that a site
  will not detect automation or connect accounts through IP, behaviour or payment data.

## License

MIT. See [LICENSE](LICENSE).
