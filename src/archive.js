const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const BINARY_NAMES = {
  linux: ['chrome', 'chromium', 'brave', 'brave-browser', 'thorium', 'thorium-browser', 'firefox'],
  win32: ['chrome.exe', 'chromium.exe', 'brave.exe', 'thorium.exe', 'firefox.exe'],
  darwin: ['Google Chrome for Testing', 'Chromium', 'Brave Browser', 'Thorium', 'firefox', 'chrome', 'chromium'],
};

function walk(dir, depth = 0) {
  if (depth > 5) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, depth + 1));
    else files.push(full);
  }
  return files;
}

// Archives differ between kernels and versions, so the executable is located by name.
function findExecutable(dir, platform) {
  const names = BINARY_NAMES[platform] || BINARY_NAMES.linux;
  return walk(dir).find((file) => names.includes(path.basename(file))) || null;
}

async function extractArchive(file, kind, dir, platform) {
  fs.mkdirSync(dir, { recursive: true });

  if (kind === 'tarxz') {
    await execFileAsync('tar', ['-xJf', file, '-C', dir], { timeout: 240000 });
    return;
  }
  if (kind === 'tarbz2') {
    await execFileAsync('tar', ['-xjf', file, '-C', dir], { timeout: 240000 });
    return;
  }
  if (kind === 'zip') {
    try {
      await execFileAsync('unzip', ['-q', file, '-d', dir], { timeout: 240000 });
    } catch (err) {
      if (err.code === 'ENOENT') await execFileAsync('tar', ['-xf', file, '-C', dir], { timeout: 240000 });
      else throw err;
    }
    return;
  }
  if (kind === 'appimage') {
    const target = path.join(dir, 'chromium.AppImage');
    fs.copyFileSync(file, target);
    fs.chmodSync(target, 0o755);
    return;
  }
  if (kind === 'dmg') {
    if (platform !== 'darwin') throw new Error('A dmg build can only be unpacked on macOS');
    const mount = path.join(dir, '.mount');
    fs.mkdirSync(mount, { recursive: true });
    await execFileAsync('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, file]);
    try {
      const app = fs.readdirSync(mount).find((name) => name.endsWith('.app'));
      if (!app) throw new Error('No application bundle inside the dmg');
      fs.cpSync(path.join(mount, app), path.join(dir, app), { recursive: true });
    } finally {
      await execFileAsync('hdiutil', ['detach', mount]).catch(() => {});
    }
    return;
  }
  throw new Error(`Unsupported archive type: ${kind}`);
}

module.exports = { extractArchive, findExecutable, walk, BINARY_NAMES };
