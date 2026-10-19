// Deterministic helpers shared by the profile list and the editor overview.

export function hashHue(seed) {
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function avatarColor(seed) {
  const hue = hashHue(seed);
  return `hsl(${hue}, 62%, 46%)`;
}

export function initialOf(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

export function proxyLabel(proxy) {
  return proxy ? `${proxy.host}:${proxy.port}` : 'Direct connection';
}

const KERNEL_PREFIX = {
  chrome: 'Chrome',
  cft: 'Chrome',
  chromium: 'Chromium',
  ungoogled: 'Chromium',
  fingerprint: 'Chrome',
  brave: 'Brave',
  thorium: 'Thorium',
  firefox: 'Firefox',
};

export function versionLabel(kernel, version) {
  const prefix = KERNEL_PREFIX[kernel] || 'Chrome';
  if (!version) return kernel === 'chrome' ? 'System Chrome' : 'Latest build';
  if (version === 'latest') return `${prefix} latest`;
  return `${prefix} ${version}`;
}

export function chromeLabel(profile) {
  if (profile.browserVersion) return versionLabel(profile.kernel, profile.browserVersion);
  return profile.kernel === 'chrome' || !profile.kernel ? 'System Chrome' : versionLabel(profile.kernel, 'latest');
}

export function groupOptions(profiles) {
  return [...new Set(profiles.map((profile) => profile.group).filter(Boolean))]
    .sort()
    .map((group) => ({ value: group, label: group }));
}
