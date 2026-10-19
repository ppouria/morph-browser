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
- A missing build is downloaded when a profile using it starts. The sidebar shows the progress and
  the finished task.
- Installed builds can be inspected in Settings: size, open folder, remove one build or remove all
  builds of a kernel.
- A custom binary path can be set per profile for Chromium-based browsers.
- Each profile window uses the profile name as its title. On Linux the window icon also carries the
  profile number, so windows are easy to tell apart.

## Fingerprints

- User-agent (automatic or custom), operating system, timezone, language, screen size, fonts,
  WebGL vendor/renderer, WebGPU mode, CPU cores, device memory and WebRTC policy.
- Optional noise for canvas, WebGL images, audio, media devices, client rects and speech voices.
- Fingerprint Chromium applies the fingerprint inside the browser (native), which is stronger than
  the DevTools-based spoofing used for the other Chromium kernels.
- Firefox supports user-agent, language, timezone and WebRTC, but not canvas, WebGL or font spoofing.

## Proxies

- Saved proxies and per-profile proxies are supported.
- Bulk import accepts one proxy per line in these formats:
  `host:port`, `host:port:user:pass`, `user:pass@host:port`, `socks5://user:pass@host:port`.
- Saving or checking a proxy reads its exit IP, country, city and country code, and shows a flag.
- A profile can have a fallback proxy. When the main proxy is unreachable at launch, the fallback is
  used and a warning is shown.
- A change-IP URL can be called before each launch.
- Chromium connects to a local relay, so the proxy password is never passed to the browser.

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
- Windows uses the NSIS installer and updates in place without touching profile data.
- Linux auto-update works for the AppImage. macOS auto-update requires a signed build.

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

## Notes

- The app is local-only; it has no cloud sync, team management or RPA.
- Proxy passwords are stored in plain text for now.
- Google's download hosts are unavailable in some regions, which blocks the Chrome and Chromium
  downloads there.
- Thorium has no public binary API, so it needs an installed copy or a custom binary path.
- Fingerprint spoofing lowers the chance of linking accounts, but no tool can guarantee that a site
  will not detect automation or connect accounts through IP, behaviour or payment data.

## License

MIT. See [LICENSE](LICENSE).
