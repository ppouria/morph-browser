const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, latestRelease, createUpdater } = require('../src/updates');
const { autostartEntry } = require('../src/autostart');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyAutoStart } = require('../src/autostart');

test('versions compare numerically', () => {
  assert.equal(compareVersions('0.2.0', '0.2.0'), 0);
  assert.equal(compareVersions('v0.3.0', '0.2.9'), 1);
  assert.equal(compareVersions('0.2.10', '0.2.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0-beta'), 0);
  assert.equal(compareVersions('0.1.9', '0.2.0'), -1);
});

test('the latest release endpoint is read and missing releases are reported', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });

  global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ tag_name: 'v0.3.0', body: 'notes', html_url: 'https://example.test' }) });
  assert.deepEqual(await latestRelease(), { version: '0.3.0', notes: 'notes', url: 'https://example.test' });

  global.fetch = async () => ({ status: 404, ok: false });
  assert.deepEqual(await latestRelease(), { version: null, notes: '', url: null });

  global.fetch = async () => ({ status: 403, ok: false });
  await assert.rejects(latestRelease(), /rate-limited/);
});

test('development builds can detect a newer release', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ tag_name: 'v0.3.0', body: '', html_url: 'https://example.test' }),
  });

  const states = [];
  const updater = createUpdater({
    getSettings: () => ({ updates: { autoDownload: true } }),
    onChange: (state) => states.push(state),
    isPackaged: false,
    currentVersion: '0.2.0',
  });
  await updater.check();
  const last = states[states.length - 1];
  assert.equal(last.status, 'available');
  assert.equal(last.version, '0.3.0');
  assert.equal(last.canInstall, false);
  assert.throws(() => updater.install(), /packaged app/);
});

test('a missing release means up to date', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => ({ status: 404, ok: false });

  const states = [];
  const updater = createUpdater({
    getSettings: () => ({ updates: {} }),
    onChange: (state) => states.push(state),
    currentVersion: '0.2.0',
  });
  await updater.check();
  assert.equal(states[states.length - 1].status, 'not-available');
});

test('the autostart desktop entry runs the app', () => {
  const entry = autostartEntry({ exec: '"/usr/bin/morph-browser"', icon: '/tmp/icon.png' });
  assert.match(entry, /Type=Application/);
  assert.match(entry, /Exec="\/usr\/bin\/morph-browser"/);
  assert.match(entry, /Icon=\/tmp\/icon.png/);
  assert.match(entry, /X-GNOME-Autostart-enabled=true/);
});

test('linux autostart writes and removes the desktop entry', (t) => {
  if (process.platform !== 'linux') return;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-auto-'));
  const app = { getPath: () => home };
  applyAutoStart({ enabled: true, app, isPackaged: true });
  const file = path.join(home, '.config', 'autostart', 'morph-browser.desktop');
  assert.ok(fs.existsSync(file));
  applyAutoStart({ enabled: false, app, isPackaged: true });
  assert.equal(fs.existsSync(file), false);
});
