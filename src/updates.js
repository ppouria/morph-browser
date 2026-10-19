const REPO = 'ppouria/morph-browser';
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

function versionParts(version) {
  return String(version || '')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const x = left[i] || 0;
    const y = right[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

async function latestRelease() {
  let response;
  try {
    response = await fetch(LATEST_URL, {
      headers: { 'User-Agent': 'morph-browser', Accept: 'application/vnd.github+json' },
    });
  } catch {
    throw new Error('Could not reach GitHub to check for updates');
  }
  if (response.status === 403) throw new Error('GitHub rate-limited the update check; try again later');
  if (response.status === 404) return { version: null, notes: '', url: null };
  if (!response.ok) throw new Error(`Update check returned ${response.status}`);
  const data = await response.json();
  if (!data || data.draft || data.prerelease || !data.tag_name) throw new Error('No stable release was found');
  return {
    version: String(data.tag_name).replace(/^v/i, ''),
    notes: typeof data.body === 'string' ? data.body : '',
    url: data.html_url,
  };
}

// Wraps electron-updater for packaged builds and falls back to the GitHub API in development,
// where an update can be reported but not installed.
function createUpdater({
  getSettings,
  onChange,
  isPackaged = false,
  currentVersion = '0.0.0',
  supported = true,
}) {
  const current = currentVersion;
  let state = {
    status: 'idle',
    current,
    version: null,
    notes: '',
    progress: 0,
    error: null,
    detail: '',
    canInstall: false,
    dev: !isPackaged,
    supported,
    url: null,
  };
  let autoUpdater = null;

  const publish = () => onChange({ ...state });
  const set = (patch) => {
    state = { ...state, ...patch };
    publish();
  };

  function wire() {
    if (!isPackaged) return;
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = Boolean(getSettings().updates?.autoDownload);
    autoUpdater.autoInstallOnAppQuit = Boolean(getSettings().updates?.installOnQuit);
    autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
    autoUpdater.on('update-available', (info) => set({
      status: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
      detail: `Version ${info.version} is available.`,
      canInstall: false,
      error: null,
    }));
    autoUpdater.on('update-not-available', () => set({
      status: 'not-available',
      version: null,
      error: null,
      detail: 'You are running the latest version.',
    }));
    autoUpdater.on('download-progress', (progress) => set({
      status: 'downloading',
      progress: Math.min(100, Math.round(progress.percent || 0)),
    }));
    autoUpdater.on('update-downloaded', (info) => set({
      status: 'downloaded',
      version: info.version,
      progress: 100,
      detail: `Version ${info.version} is ready to install.`,
      canInstall: true,
      error: null,
    }));
    autoUpdater.on('error', (err) => set({ status: 'error', error: err.message }));
  }

  async function check() {
    set({ status: 'checking', error: null, progress: 0 });

    // Development builds and packages that cannot install updates (deb, portable) still ask GitHub,
    // so "Check now" answers the only question that matters: is there a newer release?
    if (!isPackaged || !supported) {
      try {
        const release = await latestRelease();
        if (!release.version) {
          set({ status: 'not-available', version: null, detail: 'No stable release has been published yet.' });
        } else if (compareVersions(release.version, current) > 0) {
          set({
            status: 'available',
            version: release.version,
            notes: release.notes,
            url: release.url,
            detail: `Version ${release.version} is available on GitHub.`,
            canInstall: false,
          });
        } else {
          set({
            status: 'not-available',
            version: null,
            detail: `You are running the latest version (v${current}).`,
          });
        }
      } catch (err) {
        set({ status: 'error', error: err.message });
      }
      return;
    }

    if (!autoUpdater) set({ status: 'error', error: 'updater is not ready' });
    else {
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        set({ status: 'error', error: err.message });
      }
    }
  }

  async function download() {
    if (!supported) throw new Error('This build cannot update itself');
    if (!isPackaged) throw new Error('Updates can only be installed from the packaged app');
    if (!autoUpdater) throw new Error('updater is not ready');
    autoUpdater.autoDownload = false;
    await autoUpdater.downloadUpdate();
  }

  function install() {
    if (!supported) throw new Error('This build cannot update itself');
    if (!isPackaged) throw new Error('Updates can only be installed from the packaged app');
    if (!autoUpdater) throw new Error('updater is not ready');
    autoUpdater.quitAndInstall();
  }

  function applySettings(settings) {
    if (!autoUpdater) return;
    autoUpdater.autoDownload = Boolean(settings.updates?.autoDownload);
    autoUpdater.autoInstallOnAppQuit = Boolean(settings.updates?.installOnQuit);
  }

  return { init: wire, check, download, install, applySettings, getState: () => ({ ...state }) };
}

module.exports = { createUpdater, compareVersions, latestRelease, versionParts };
