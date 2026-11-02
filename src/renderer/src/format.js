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

// The regional-indicator pair renders as the Apple/Noto flag emoji for the country.
export function countryFlag(code) {
  const value = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return '';
  return String.fromCodePoint(...[...value].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

export function proxyLocationText(proxy, { withCity = false } = {}) {
  const location = proxy && proxy.location;
  if (!location || !location.countryCode) return '';
  const parts = [countryFlag(location.countryCode), location.countryCode];
  if (withCity && location.city) parts.push(`· ${location.city}`);
  return parts.filter(Boolean).join(' ');
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${Math.max(0, Math.round(value))} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let exponent = Math.floor(Math.log(value) / Math.log(1024));
  let unit = Math.min(units.length - 1, Math.max(0, exponent - 1));
  let amount = value / 1024 ** (unit + 1);
  // 1048469 bytes is 1023.99 KB; show it as 1 MB instead of 1024 KB.
  if (amount >= 1023.95 && unit < units.length - 1) {
    unit += 1;
    amount = value / 1024 ** (unit + 1);
  }
  const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits).replace(/\.0+$/, '')} ${units[unit]}`;
}
