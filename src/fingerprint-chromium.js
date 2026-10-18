const { createGithubKernel } = require('./github-kernel');

const REPO = 'adryfish/fingerprint-chromium';

const CANDIDATES = {
  linux: [{ re: /_linux\.tar\.xz$/i, kind: 'tarxz' }, { re: /\.AppImage$/i, kind: 'appimage' }],
  win32: [{ re: /_windows_x64\.zip$/i, kind: 'zip' }],
  darwin: [{ re: /\.dmg$/i, kind: 'dmg' }],
};

// A patched Chromium that spoofs the fingerprint inside the browser instead of through DevTools.
function createFingerprintManager(options) {
  return createGithubKernel({
    ...options,
    repoFor: () => REPO,
    tagPattern: /^(\d+\.\d+\.\d+\.\d+)/,
    candidates: (platform) => CANDIDATES[platform] || [],
  });
}

module.exports = { createFingerprintManager, REPO, CANDIDATES };
