const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBrowserManager } = require('../src/browsers');

const HISTORY = ['150.0.7871.124', '150.0.7871.10', '149.0.1.1', '148.0.0.1', '100.0.0.1'];
// Google only serves some builds: 150.0.7871.124 is missing, so the older 150 build must be picked.
const AVAILABLE = new Set(['150.0.7871.10', '149.0.1.1', '100.0.0.1']);

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pb-browsers-'));

// Stands in for the network and dpkg: "downloads" a file and "unpacks" a fake chrome binary.
function fakeManager(cacheDir, extra = {}) {
  const calls = { downloads: [] };
  const manager = createBrowserManager({
    cacheDir,
    platform: 'linux',
    arch: 'x64',
    fetchVersions: async () => HISTORY,
    probe: async (v) => AVAILABLE.has(v),
    download: async (version, dest, onProgress) => {
      calls.downloads.push(version);
      onProgress(50, 100);
      await new Promise((r) => setTimeout(r, 20));
      fs.writeFileSync(dest, 'deb');
    },
    unpack: async (deb, dir) => {
      fs.mkdirSync(path.join(dir, 'opt', 'google', 'chrome'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'opt', 'google', 'chrome', 'chrome'), '');
    },
    ...extra,
  });
  return { manager, calls };
}

test('lists only majors that Google serves a build for, newest first', async () => {
  const { manager } = fakeManager(tmp());
  // 148 has no available build, so it is left out.
  assert.deepEqual(await manager.listVersions(), ['150', '149', '100']);
});

test('a major resolves to its newest available build', async () => {
  const dir = tmp();
  const { manager, calls } = fakeManager(dir);
  const exe = await manager.ensureBrowser('150');
  assert.deepEqual(calls.downloads, ['150.0.7871.10']);
  assert.equal(exe, path.join(dir, '150.0.7871.10', 'opt', 'google', 'chrome', 'chrome'));
  assert.ok(fs.existsSync(exe));
});

test('simultaneous requests for one build share one download', async () => {
  const { manager, calls } = fakeManager(tmp());
  const [a, b] = await Promise.all([manager.ensureBrowser('150'), manager.ensureBrowser('150')]);
  assert.equal(a, b);
  assert.equal(calls.downloads.length, 1);
});

test('a later profile reuses the build, and so does an app restart', async () => {
  const cacheDir = tmp();
  const first = fakeManager(cacheDir);
  await first.manager.ensureBrowser('150');
  await first.manager.ensureBrowser('150');
  assert.equal(first.calls.downloads.length, 1);

  const restarted = fakeManager(cacheDir);
  await restarted.manager.ensureBrowser('150');
  assert.equal(restarted.calls.downloads.length, 0);
});

test('download progress is tagged with the full build version', async () => {
  const seen = [];
  const { manager } = fakeManager(tmp(), { onProgress: (p) => seen.push(p) });
  await manager.ensureBrowser('150');
  assert.deepEqual(seen, [{ version: '150.0.7871.10', downloaded: 50, total: 100 }]);
});

test('rejects anything that is not a major version before any lookup', async () => {
  const { manager, calls } = fakeManager(tmp());
  await assert.rejects(manager.ensureBrowser('../../etc'), /invalid Chromium version/);
  await assert.rejects(manager.ensureBrowser('150.0.7871.10'), /invalid Chromium version/);
  assert.equal(calls.downloads.length, 0);
});

test('reports a major that has no available build', async () => {
  const { manager } = fakeManager(tmp());
  await assert.rejects(manager.ensureBrowser('148'), /no Chromium 148 build is available/);
});

test('lists downloaded builds and removes one', async () => {
  const dir = tmp();
  const { manager } = fakeManager(dir);
  await manager.ensureBrowser('150');
  assert.deepEqual(manager.listInstalled(), ['150.0.7871.10']);
  manager.removeInstalled('150.0.7871.10');
  assert.deepEqual(manager.listInstalled(), []);
  assert.equal(fs.existsSync(path.join(dir, '150.0.7871.10')), false);
});

test('removing rejects anything that is not a build version', () => {
  const { manager } = fakeManager(tmp());
  assert.throws(() => manager.removeInstalled('../../'), /invalid build version/);
});

test('windows and macOS list no builds yet', async () => {
  const manager = createBrowserManager({ cacheDir: tmp(), platform: 'win32', arch: 'x64', fetchVersions: async () => HISTORY });
  assert.deepEqual(await manager.listVersions(), []);
});

test('a failed version lookup is retried on the next request', async () => {
  let calls = 0;
  const manager = createBrowserManager({
    cacheDir: tmp(),
    platform: 'linux',
    arch: 'x64',
    fetchVersions: async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
      return HISTORY;
    },
    probe: async (v) => AVAILABLE.has(v),
  });
  await assert.rejects(manager.listVersions(), /offline/);
  assert.deepEqual(await manager.listVersions(), ['150', '149', '100']);
});

test('an installed build is used without asking the network', async () => {
  const dir = tmp();
  const first = fakeManager(dir);
  await first.manager.ensureBrowser('150');

  const offline = createBrowserManager({
    cacheDir: dir,
    platform: 'linux',
    arch: 'x64',
    fetchVersions: async () => { throw new Error('offline'); },
    probe: async () => { throw new Error('offline'); },
  });
  const exe = await offline.ensureBrowser('150');
  assert.match(exe, /150\.0\.7871\.10/);
});
