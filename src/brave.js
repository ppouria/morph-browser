const { createGithubKernel } = require('./github-kernel');

const REPO = 'brave/brave-browser';

const CANDIDATES = {
  linux: (arch) => [{ re: new RegExp(`brave-browser-[\\d.]+-linux-${arch === 'arm64' ? 'arm64' : 'amd64'}\\.zip$`, 'i'), kind: 'zip' }],
  darwin: (arch) => [{ re: new RegExp(`Brave-Browser-${arch === 'arm64' ? 'arm64' : 'x64'}\\.dmg$`, 'i'), kind: 'dmg' }],
  win32: () => [],
};

// Brave publishes Linux and macOS archives on GitHub; Windows builds are only offered by their
// installer, so a Windows profile points at an installed Brave or a custom binary.
function createBraveManager(options) {
  return createGithubKernel({
    ...options,
    repoFor: () => REPO,
    tagPattern: /^v(\d+\.\d+\.\d+)$/,
    listByVersion: true,
    candidates: (platform, arch) => (CANDIDATES[platform] ? CANDIDATES[platform](arch) : []),
  });
}

module.exports = { createBraveManager, REPO, CANDIDATES };
