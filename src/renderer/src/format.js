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

export function chromeLabel(profile) {
  return profile.browserVersion ? `Chrome ${profile.browserVersion}` : 'System Chrome';
}

export function groupOptions(profiles) {
  return [...new Set(profiles.map((profile) => profile.group).filter(Boolean))]
    .sort()
    .map((group) => ({ value: group, label: group }));
}
