const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const majorCache = new Map();

// Linux names are looked up on PATH; macOS and Windows use fixed install locations.
const LINUX_NAMES = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];

function macCandidates() {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
}

// The settings file picker can select a .app bundle; the binary inside it is what spawn needs.
const MAC_APP_BINARIES = ['Google Chrome', 'Chromium', 'Google Chrome for Testing', 'Brave Browser', 'Thorium'];
function resolveMacBundle(appPath) {
  if (!String(appPath).endsWith('.app')) return null;
  const macos = path.join(appPath, 'Contents', 'MacOS');
  for (const name of MAC_APP_BINARIES) {
    const full = path.join(macos, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function winCandidates(env) {
  const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
  return roots.map((root) => path.win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
}

// Order: user setting, then the dev download from fetch-chromium, then system installs.
function findChromium({
  configuredPath,
  vendorDir,
  platform = process.platform,
  env = process.env,
  exists = fs.existsSync,
} = {}) {
  if (configuredPath && exists(configuredPath)) {
    if (platform === 'darwin') return resolveMacBundle(configuredPath) || configuredPath;
    return configuredPath;
  }

  const vendorPointer = vendorDir && path.join(vendorDir, 'executable.txt');
  if (vendorPointer && exists(vendorPointer)) {
    const target = fs.readFileSync(vendorPointer, 'utf8').trim();
    if (exists(target)) return target;
  }

  if (platform === 'linux') {
    const dirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const name of LINUX_NAMES) {
      for (const dir of dirs) {
        const full = path.join(dir, name);
        if (exists(full)) return full;
      }
    }
    return null;
  }

  const candidates = platform === 'darwin' ? macCandidates() : winCandidates(env);
  return candidates.find((c) => exists(c)) || null;
}

// The real major version of a binary, so an automatic user-agent can never disagree with the
// Client Hints the same binary sends. Cached per executable; a failure is cached as null.
function detectBrowserMajor(executable, { run = execFileAsync } = {}) {
  if (majorCache.has(executable)) return majorCache.get(executable);
  const pending = (async () => {
    try {
      const { stdout } = await run(executable, ['--version'], { timeout: 5000 });
      const match = /(\d+)\.\d+\.\d+\.\d+/.exec(String(stdout || ''));
      return match ? match[1] : null;
    } catch {
      return null;
    }
  })();
  majorCache.set(executable, pending);
  return pending;
}

// Each profile gets its own user-data-dir. That directory is what keeps cookies, storage and cache separate.
// Everything else here is a flag Chromium can apply before the first page loads, so it needs no injection.
function buildArgs({
  profileDir,
  debugPort,
  proxyServer,
  startUrls = [],
  userAgent = null,
  acceptLanguages = null,
  windowSize = null,
  webRtcFlags = [],
  extraFlags = [],
  noSandbox = false,
}) {
  const args = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  // A downloaded build cannot carry a root-owned setuid helper, so the browser may have to run
  // without its sandbox. This is only used as a fallback after the sandboxed launch failed.
  if (noSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');
  if (proxyServer) args.push(`--proxy-server=${proxyServer}`);
  if (userAgent) args.push(`--user-agent=${userAgent}`);
  if (acceptLanguages) {
    args.push(`--accept-lang=${acceptLanguages}`);
    args.push(`--lang=${String(acceptLanguages).split(',')[0]}`);
  }
  if (windowSize) {
    args.push(`--window-size=${windowSize.width},${windowSize.height}`);
    args.push('--window-position=40,40');
  }
  args.push(...webRtcFlags, ...extraFlags);
  return args.concat(startUrls);
}

function launch({
  executable,
  profileDir,
  debugPort,
  proxyServer,
  startUrls,
  userAgent,
  acceptLanguages,
  windowSize,
  webRtcFlags,
  extraFlags = [],
  env = {},
  noSandbox = false,
}) {
  const args = buildArgs({ profileDir, debugPort, proxyServer, startUrls, userAgent, acceptLanguages, windowSize, webRtcFlags, extraFlags, noSandbox });
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...env } });

  // Chromium explains a refused start on stderr; keeping the tail makes the failure readable.
  const tail = [];
  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      tail.push(chunk);
      if (tail.join('').length > 4000) tail.splice(0, tail.length - 4);
    });
  }
  child.stderrText = () => tail.join('').trim().split('\n').slice(-4).join(' | ');
  return child;
}

// Windows needs taskkill to take the renderer and GPU processes down with the main one.
function stop(child, platform = process.platform) {
  if (platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

module.exports = { findChromium, detectBrowserMajor, buildArgs, launch, stop, resolveMacBundle };
