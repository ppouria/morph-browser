const path = require('node:path');
const { createBrowserManager } = require('./browsers');
const { createCftManager } = require('./cft');
const { createChromiumManager } = require('./chromium-snapshots');
const { createUngoogledManager } = require('./ungoogled');
const { createFingerprintManager } = require('./fingerprint-chromium');

// Every kernel has its own trade-off, so the profile picks one explicitly.
const KERNEL_INFO = [
  {
    id: 'chrome',
    label: 'Google Chrome',
    description: 'Official stable builds. Widest site compatibility; on Linux the version is downloaded.',
  },
  {
    id: 'cft',
    label: 'Chrome for Testing',
    description: 'Official Google test builds for every desktop platform, one folder per version.',
  },
  {
    id: 'chromium',
    label: 'Chromium snapshot',
    description: 'Latest official open-source Chromium build from the snapshot bucket.',
  },
  {
    id: 'ungoogled',
    label: 'ungoogled-chromium',
    description: 'Open-source builds without Google integration or background services.',
  },
  {
    id: 'fingerprint',
    label: 'Fingerprint Chromium',
    description: 'Patched build that spoofs the fingerprint inside the browser, not through DevTools.',
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
