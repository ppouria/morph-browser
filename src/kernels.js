const path = require('node:path');
const { createBrowserManager } = require('./browsers');
const { createCftManager } = require('./cft');
const { createChromiumManager } = require('./chromium-snapshots');
const { createUngoogledManager } = require('./ungoogled');
const { createFingerprintManager } = require('./fingerprint-chromium');
const { createBraveManager } = require('./brave');
const { createFirefoxManager } = require('./firefox');
const { createSystemManager } = require('./system-kernel');

// Every kernel has its own trade-off, so the profile picks one explicitly.
const KERNEL_INFO = [
  {
    id: 'chrome',
    label: 'Google Chrome',
    prefix: 'Chrome',
    description: 'Official stable builds. Widest site compatibility; on Linux the version is downloaded.',
  },
  {
    id: 'cft',
    label: 'Chrome for Testing',
    prefix: 'Chrome',
    description: 'Official Google test builds for every desktop platform, one folder per version.',
  },
  {
    id: 'chromium',
    label: 'Chromium snapshot',
    prefix: 'Chromium',
    description: 'Latest official open-source Chromium build from the snapshot bucket.',
  },
  {
    id: 'ungoogled',
    label: 'ungoogled-chromium',
    prefix: 'Chromium',
    description: 'Open-source builds without Google integration or background services.',
  },
  {
    id: 'fingerprint',
    label: 'Fingerprint Chromium',
    prefix: 'Chrome',
    description: 'Patched build that spoofs the fingerprint inside the browser, not through DevTools.',
  },
  {
    id: 'brave',
    label: 'Brave',
    prefix: 'Brave',
    description: 'Chromium with Shields. Linux and macOS builds download; Windows uses an installed Brave or a custom path.',
  },
  {
    id: 'thorium',
    label: 'Thorium',
    prefix: 'Thorium',
    description: 'Chromium fork with no public download API. Uses an installed Thorium or a custom binary.',
  },
  {
    id: 'firefox',
    label: 'Firefox',
    prefix: 'Firefox',
    description: 'Gecko engine. UA, languages, timezone and WebRTC are spoofed; canvas, WebGL and fonts stay real.',
  },
];

const KERNELS = KERNEL_INFO.map((entry) => entry.id);

function createKernelRegistry({
  cacheDir,
  platform = process.platform,
  arch = process.arch,
  onProgress = () => {},
}) {
  const managers = {
    chrome: createBrowserManager({ cacheDir: path.join(cacheDir, 'chrome'), platform, arch, onProgress }),
    cft: createCftManager({ cacheDir: path.join(cacheDir, 'cft'), platform, arch, onProgress }),
    chromium: createChromiumManager({ cacheDir: path.join(cacheDir, 'chromium'), platform, arch, onProgress }),
    ungoogled: createUngoogledManager({ cacheDir: path.join(cacheDir, 'ungoogled'), platform, arch, onProgress }),
    fingerprint: createFingerprintManager({ cacheDir: path.join(cacheDir, 'fingerprint'), platform, arch, onProgress }),
    brave: createBraveManager({ cacheDir: path.join(cacheDir, 'brave'), platform, arch, onProgress }),
    thorium: createSystemManager({ kind: 'thorium', platform }),
    firefox: createFirefoxManager({ cacheDir: path.join(cacheDir, 'firefox'), platform, arch, onProgress }),
  };

  function manager(kernel) {
    const found = managers[kernel];
    if (!found) throw new Error(`unknown kernel: ${kernel}`);
    return found;
  }

  return {
    listKernels: () => KERNEL_INFO,
    listVersions: (kernel = 'chrome') => manager(kernel).listVersions(),
    ensureBrowser: (kernel, version) => manager(kernel).ensureBrowser(version),
    listInstalled: (kernel = 'chrome') => manager(kernel).listInstalled(),
    removeInstalled: (kernel, version) => manager(kernel).removeInstalled(version),
  };
}

module.exports = { createKernelRegistry, KERNEL_INFO, KERNELS };
