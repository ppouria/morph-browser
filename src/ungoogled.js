const { createGithubKernel } = require('./github-kernel');

const REPOS = {
  linux: 'ungoogled-software/ungoogled-chromium-portablelinux',
  win32: 'ungoogled-software/ungoogled-chromium-windows',
  darwin: 'ungoogled-software/ungoogled-chromium-macos',
};

const CANDIDATES = {
  linux: (arch) => (arch === 'arm64'
    ? [{ re: /arm64_linux\.tar\.xz$/i, kind: 'tarxz' }]
    : [{ re: /x86_64_linux\.tar\.xz$/i, kind: 'tarxz' }]),
  win32: (arch) => [{ re: new RegExp(`_windows_${arch === 'arm64' ? 'arm64' : 'x64'}\\.zip$`, 'i'), kind: 'zip' }],
  darwin: (arch) => [{ re: new RegExp(`_${arch === 'arm64' ? 'arm64' : 'x86_64'}-macos\\.dmg$`, 'i'), kind: 'dmg' }],
};

// Chromium without Google integration: no Safe Browsing, no Google services, no phone home.
function createUngoogledManager(options) {
  return createGithubKernel({
    ...options,
    repoFor: (platform) => REPOS[platform] || REPOS.linux,
    tagPattern: /^(\d+\.\d+\.\d+\.\d+)/,
    candidates: (platform, arch) => (CANDIDATES[platform] ? CANDIDATES[platform](arch) : []),
  });
}

module.exports = { createUngoogledManager, REPOS, CANDIDATES };
