const fs = require('node:fs');
const path = require('node:path');

const CANDIDATE_PATHS = {
  thorium: {
    linux: ['/usr/bin/thorium-browser', '/usr/bin/thorium', '/opt/thorium/thorium', '/opt/thorium-browser/thorium'],
    win32: [
      path.join(process.env.LOCALAPPDATA || '', 'Thorium', 'Application', 'thorium.exe'),
      'C:\\Program Files\\Thorium\\Application\\thorium.exe',
    ],
    darwin: ['/Applications/Thorium.app/Contents/MacOS/Thorium'],
  },
  brave: {
    linux: ['/usr/bin/brave-browser', '/usr/bin/brave', '/opt/brave.com/brave/brave'],
    win32: [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ],
    darwin: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
  },
};

function onPath(names) {
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const name of names) {
    for (const dir of dirs) {
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).isFile()) return file;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

// Some Chromium forks publish no stable download API, so the kernel uses an installed copy.
function detectExecutable(kind, platform = process.platform) {
  const names = kind === 'brave' ? ['brave-browser', 'brave'] : ['thorium-browser', 'thorium'];
  const fromPath = onPath(names);
  if (fromPath) return fromPath;
  const paths = (CANDIDATE_PATHS[kind] || {})[platform] || [];
  return paths.find((file) => fs.existsSync(file)) || null;
}

function createSystemManager({ kind, platform = process.platform }) {
  return {
    // The entry stays visible even when the browser is missing so the launch error can explain it.
    listVersions: async () => ['latest'],
    ensureBrowser: async () => {
      const exe = detectExecutable(kind, platform);
      if (!exe) throw new Error(`No ${kind} installation found. Install it or set a custom binary for this profile.`);
      return exe;
    },
    listInstalled: () => (detectExecutable(kind, platform) ? ['latest'] : []),
    removeInstalled: () => {
      throw new Error('installed builds are managed outside the app');
    },
  };
}

module.exports = { createSystemManager, detectExecutable, CANDIDATE_PATHS };
