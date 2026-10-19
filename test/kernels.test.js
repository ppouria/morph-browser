const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKernelRegistry, KERNEL_INFO } = require('../src/kernels');
const { createCftManager, parseVersions, platformKey } = require('../src/cft');
const { createChromiumManager } = require('../src/chromium-snapshots');
const { createUngoogledManager, CANDIDATES } = require('../src/ungoogled');
const { createBraveManager } = require('../src/brave');
const { createFirefoxManager, downloadUrl, writePrefs, buildArgs, firefoxUserAgent, VERSION_RE } = require('../src/firefox');
const { createSystemManager } = require('../src/system-kernel');
const { parseReleases } = require('../src/github-kernel');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pb-kernel-'));

test('the registry exposes every kernel with a description', () => {
  assert.deepEqual(KERNEL_INFO.map((kernel) => kernel.id), ['chrome', 'cft', 'chromium', 'ungoogled', 'fingerprint', 'brave', 'thorium', 'firefox']);
  for (const kernel of KERNEL_INFO) assert.ok(kernel.label && kernel.description);
});

test('the chromium snapshot kernel only offers the latest build', async () => {
  const manager = createChromiumManager({ cacheDir: tmp(), platform: 'linux', arch: 'x64' });
  assert.deepEqual(await manager.listVersions(), ['latest']);
  await assert.rejects(manager.ensureBrowser('150'), /only ships the latest/);
});

test('chrome for testing maps platforms and versions', () => {
  assert.equal(platformKey('linux', 'x64'), 'linux64');
  assert.equal(platformKey('win32', 'x64'), 'win64');
  assert.equal(platformKey('darwin', 'arm64'), 'mac-arm64');
  assert.equal(platformKey('darwin', 'x64'), 'mac-x64');

  const payload = {
    versions: [
      { version: '151.0.7000.10', downloads: { chrome: [{ platform: 'linux64', url: 'https://example.test/151.zip' }] } },
      { version: '151.0.7000.20', downloads: { chrome: [{ platform: 'linux64', url: 'https://example.test/151b.zip' }] } },
      { version: '150.0.1.2', downloads: { chrome: [{ platform: 'win64', url: 'https://example.test/150.zip' }] } },
    ],
  };
  const entries = parseVersions(payload, 'linux64');
  assert.deepEqual(entries.map((entry) => entry.version), ['151.0.7000.20', '151.0.7000.10']);
});

test('chrome for testing downloads and unpacks a build', async () => {
  const cacheDir = tmp();
  const calls = [];
  const manager = createCftManager({
    cacheDir,
    platform: 'linux',
    arch: 'x64',
    fetchVersionsImpl: async () => ({
      versions: [{ version: '151.0.7000.10', downloads: { chrome: [{ platform: 'linux64', url: 'https://example.test/151.zip' }] } }],
    }),
    download: async (url, dest) => { calls.push(url); fs.writeFileSync(dest, 'zip'); },
    extract: async (file, kind, dir) => {
      fs.mkdirSync(path.join(dir, 'chrome-linux64'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'chrome-linux64', 'chrome'), '');
    },
  });
  assert.deepEqual(await manager.listVersions(), ['151']);
  const exe = await manager.ensureBrowser('151');
  assert.ok(exe.endsWith(path.join('151.0.7000.10', 'chrome-linux64', 'chrome')));
  assert.deepEqual(manager.listInstalled(), ['151.0.7000.10']);
  assert.equal(calls.length, 1);
});

test('ungoogled picks the archive for the platform and arch', () => {
  const releases = [
    { tag_name: '155.0.8059.84-1', draft: false, prerelease: false, assets: [
      { name: 'ungoogled-chromium-155.0.8059.84-1-x86_64_linux.tar.xz', browser_download_url: 'x' },
      { name: 'ungoogled-chromium-155.0.8059.84-1-arm64_linux.tar.xz', browser_download_url: 'y' },
    ] },
  ];
  const entries = parseReleases(releases, {
    tagPattern: /^(\d+\.\d+\.\d+\.\d+)/,
    candidates: (platform, arch) => CANDIDATES[platform](arch),
    platform: 'linux',
    arch: 'arm64',
  });
  assert.equal(entries[0].version, '155.0.8059.84');
  assert.match(entries[0].asset.name, /arm64/);
});

test('the registry lists installed builds per kernel', async () => {
  const registry = createKernelRegistry({ cacheDir: tmp(), platform: 'linux', arch: 'x64' });
  assert.deepEqual(registry.listInstalled('chrome'), []);
  assert.deepEqual(registry.listInstalled('fingerprint'), []);
  assert.deepEqual(registry.listInstalled('chromium'), []);
  assert.throws(() => registry.listInstalled('nope'), /unknown kernel/);
});

test('brave uses its semantic version and platform archive', () => {
  const releases = [{
    tag_name: 'v1.97.59',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'brave-browser-1.97.59-linux-amd64.zip', browser_download_url: 'https://example.test/brave-linux.zip' },
      { name: 'Brave-Browser-x64.dmg', browser_download_url: 'https://example.test/brave.dmg' },
      { name: 'brave-browser-1.97.59-1.x86_64.rpm', browser_download_url: 'https://example.test/brave.rpm' },
    ],
  }];
  const entries = parseReleases(releases, {
    tagPattern: /^v(\d+\.\d+\.\d+)$/,
    candidates: (platform, arch) => createBraveCandidates(platform, arch),
    platform: 'linux',
    arch: 'x64',
  });
  assert.equal(entries[0].version, '1.97.59');
  assert.match(entries[0].asset.name, /linux-amd64\.zip$/);
});

function createBraveCandidates(platform, arch) {
  const { CANDIDATES: BRAVE } = require('../src/brave');
  return BRAVE[platform](arch);
}

test('firefox builds a download url per platform', () => {
  assert.match(downloadUrl('158.0', 'linux'), /linux-x86_64\/en-US\/firefox-158\.0\.tar\.xz$/);
  assert.match(downloadUrl('153.5.0esr', 'darwin'), /mac\/en-US\/Firefox%20153\.5\.0esr\.dmg$/);
  assert.throws(() => downloadUrl('158.0', 'win32'), /not offered on Windows/);
  assert.equal(VERSION_RE.test('153.5.0esr'), true);
  assert.equal(VERSION_RE.test('nightly'), false);
});

test('firefox preferences carry the proxy, user agent and language', () => {
  const dir = tmp();
  writePrefs(dir, {
    proxyServer: 'http://127.0.0.1:8899',
    userAgent: 'Mozilla/5.0 Firefox/158.0',
    languages: ['de-DE', 'de', 'en'],
    webRtc: 'disabled',
    blockGeolocation: true,
    restorePages: false,
  });
  const prefs = fs.readFileSync(path.join(dir, 'user.js'), 'utf8');
  assert.match(prefs, /network\.proxy\.type", 1/);
  assert.match(prefs, /network\.proxy\.http", "127\.0\.0\.1"/);
  assert.match(prefs, /network\.proxy\.http_port", 8899/);
  assert.match(prefs, /general\.useragent\.override/);
  assert.match(prefs, /intl\.accept_languages", "de-DE,de,en"/);
  assert.match(prefs, /media\.peerconnection\.ice\.proxy_only", true/);
  assert.match(prefs, /geo\.enabled", false/);
  assert.match(prefs, /browser\.sessionstore\.resume_from_crash", false/);
});

test('firefox command line opens the start pages in the profile', () => {
  const args = buildArgs({ profileDir: '/tmp/p', startUrls: ['https://example.com'], windowSize: { width: 1366, height: 768 } });
  assert.deepEqual(args.slice(0, 3), ['-profile', '/tmp/p', '-no-remote']);
  assert.deepEqual(args.slice(3, 7), ['-width', '1366', '-height', '768']);
  assert.equal(args[7], 'https://example.com');
  assert.match(firefoxUserAgent('windows', '158.0.1'), /Windows NT 10\.0.*Firefox\/158\.0/);
});

test('firefox downloads and unpacks a build once', async () => {
  const cacheDir = tmp();
  const manager = createFirefoxManager({
    cacheDir,
    platform: 'linux',
    fetchVersionsImpl: async () => ['158.0.1', '153.5.0esr'],
    download: async (url, dest) => fs.writeFileSync(dest, 'archive'),
    extract: async (file, kind, dir) => {
      assert.equal(kind, 'tarxz');
      fs.mkdirSync(path.join(dir, 'firefox'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'firefox', 'firefox'), '');
    },
  });
  assert.deepEqual(await manager.listVersions(), ['158.0.1', '153.5.0esr']);
  const exe = await manager.ensureBrowser('158.0.1');
  assert.ok(exe.endsWith(path.join('158.0.1', 'firefox', 'firefox')));
  assert.deepEqual(manager.listInstalled(), ['158.0.1']);
  await assert.rejects(manager.ensureBrowser('nightly'), /invalid Firefox version/);
});

test('installed-binary kernels report what is present', async () => {
  const manager = createSystemManager({ kind: 'thorium', platform: 'linux' });
  const versions = await manager.listVersions();
  assert.ok(Array.isArray(versions));
  if (!versions.length) await assert.rejects(manager.ensureBrowser(), /No thorium installation/);
});

test('linux arm64 kernels report no downloadable build', async () => {
  assert.equal(platformKey('linux', 'arm64'), null);

  const cft = createCftManager({
    cacheDir: tmp(),
    platform: 'linux',
    arch: 'arm64',
    fetchVersionsImpl: async () => ({ versions: [] }),
    download: async () => {},
    extract: async () => {},
  });
  assert.deepEqual(await cft.listVersions(), []);
  await assert.rejects(cft.ensureBrowser('150'), /no Linux arm64/);

  const snapshots = createChromiumManager({ cacheDir: tmp(), platform: 'linux', arch: 'arm64' });
  assert.deepEqual(await snapshots.listVersions(), []);
  await assert.rejects(snapshots.ensureBrowser('latest'), /not published for Linux arm64/);
});

test('firefox uses the arm64 linux archive and skips downloads on windows', async () => {
  assert.match(downloadUrl('158.0', 'linux', 'arm64'), /linux-aarch64\/en-US\/firefox-158\.0\.tar\.xz$/);

  const manager = createFirefoxManager({
    cacheDir: tmp(),
    platform: 'win32',
    fetchVersionsImpl: async () => ['158.0'],
  });
  assert.deepEqual(await manager.listVersions(), []);
  await assert.rejects(manager.ensureBrowser('158.0'), /not offered on Windows/);
});

test('ungoogled chromium picks the windows arm64 asset', () => {
  const assets = CANDIDATES.win32('arm64');
  assert.ok(assets.some((asset) => asset.re.test('ungoogled-chromium_140.0.7339.80-1.1_windows_arm64.zip')));
});
