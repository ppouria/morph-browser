// Dev helper: installs the newest official Google Chrome build this system can download into vendor/chromium.
// The app looks for vendor/chromium/executable.txt before it scans system paths.
// Behind an HTTP proxy, run with NODE_USE_ENV_PROXY=1 so Node honours HTTPS_PROXY.
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserManager } = require('../src/browsers');

const vendorDir = path.join(__dirname, '..', 'vendor', 'chromium');

(async () => {
  const manager = createBrowserManager({
    cacheDir: path.join(vendorDir, 'builds'),
    onProgress: ({ version, downloaded, total }) => {
      if (total) process.stdout.write(`\rChrome ${version}: ${Math.floor((downloaded / total) * 100)}%`);
    },
  });
  const [newest] = await manager.listVersions();
  if (!newest) throw new Error('no Chrome build is available for this system');

  const executable = await manager.ensureBrowser(newest);
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.writeFileSync(path.join(vendorDir, 'executable.txt'), executable);
  console.log(`\nChrome ${newest} ready: ${executable}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
