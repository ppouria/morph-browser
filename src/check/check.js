// Connection check page. Everything here runs inside the launched profile, so every request goes
// through that profile's proxy, DNS and fingerprint.

const SERVICES = [
  { id: 'google', label: 'Google', url: 'https://www.google.com/generate_204' },
  { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/' },
  { id: 'amazon', label: 'Amazon', url: 'https://www.amazon.com/' },
  { id: 'cloudflare', label: 'Cloudflare', url: 'https://www.cloudflare.com/cdn-cgi/trace' },
  { id: 'github', label: 'GitHub', url: 'https://github.com/' },
  { id: 'whatsapp', label: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  { id: 'x', label: 'X', url: 'https://x.com/' },
];

const $ = (selector) => document.querySelector(selector);

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function row(term, value) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value === undefined || value === null || value === '' ? '—' : String(value);
  return [dt, dd];
}

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16);
}

function canvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 60;
    const context = canvas.getContext('2d');
    context.textBaseline = 'top';
    context.font = '16px Arial';
    context.fillStyle = '#f60';
    context.fillRect(0, 0, 220, 60);
    context.fillStyle = '#069';
    context.fillText('Browser Manager check', 4, 8);
    context.fillStyle = 'rgba(102, 204, 0, 0.7)';
    context.fillText('fingerprint', 8, 30);
    return hash(canvas.toDataURL());
  } catch {
    return 'unavailable';
  }
}

function webglInfo() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { vendor: 'unavailable', renderer: 'unavailable' };
    const vendor = gl.getParameter(gl.VENDOR);
    const renderer = gl.getParameter(gl.RENDERER);
    const unmasked = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: unmasked ? gl.getParameter(unmasked.UNMASKED_VENDOR_WEBGL) : vendor,
      renderer: unmasked ? gl.getParameter(unmasked.UNMASKED_RENDERER_WEBGL) : renderer,
    };
  } catch {
    return { vendor: 'unavailable', renderer: 'unavailable' };
  }
}

async function lookupIp() {
  // Providers differ a lot by region, so try several and keep the first usable answer.
  try {
    const data = await fetchJson('https://ipwho.is/');
    if (data && data.success !== false && data.ip) {
      return {
        ip: data.ip,
        place: [data.city, data.region, data.country].filter(Boolean).join(', '),
        country: data.country,
        isp: data.connection && data.connection.isp,
        asn: data.connection && data.connection.asn ? `AS${data.connection.asn}` : '',
        timezone: data.timezone && data.timezone.id,
        coordinates: data.latitude ? `${data.latitude}, ${data.longitude}` : '',
        source: 'ipwho.is',
      };
    }
  } catch {
    // Try the next provider.
  }

  try {
    const data = await fetchJson('http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,isp,org,as,timezone,lat,lon,query');
    if (data.status === 'success') {
      return {
        ip: data.query,
        place: [data.city, data.regionName, data.country].filter(Boolean).join(', '),
        country: data.country,
        isp: data.isp || data.org,
        asn: data.as,
        timezone: data.timezone,
        coordinates: `${data.lat}, ${data.lon}`,
        source: 'ip-api.com',
      };
    }
  } catch {
    // Try the next provider.
  }

  try {
    const data = await fetchJson('https://ipapi.co/json/');
    if (data.ip && !data.error) {
      return {
        ip: data.ip,
        place: [data.city, data.region, data.country_name].filter(Boolean).join(', '),
        country: data.country_name,
        isp: data.org,
        asn: data.asn,
        timezone: data.timezone,
        coordinates: data.latitude ? `${data.latitude}, ${data.longitude}` : '',
        source: 'ipapi.co',
      };
    }
  } catch {
    // Try the next provider.
  }

  try {
    const data = await fetchJson('https://ipinfo.io/json');
    if (data.ip) {
      return {
        ip: data.ip,
        place: [data.city, data.region, data.country].filter(Boolean).join(', '),
        country: data.country,
        isp: data.org,
        asn: '',
        timezone: data.timezone,
        coordinates: data.loc,
        source: 'ipinfo.io',
      };
    }
  } catch {
    // Fall back to an IP-only provider.
  }

  try {
    const data = await fetchJson('https://api.ipify.org?format=json');
    if (data.ip) {
      return {
        ip: data.ip,
        place: 'Location provider unavailable',
        country: '',
        isp: '',
        asn: '',
        timezone: '',
        coordinates: '',
        source: 'api.ipify.org',
      };
    }
  } catch {
    // Give up below.
  }

  return null;
}

async function reach(service) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(service.url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal, redirect: 'follow' });
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - started), error: err.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

function webrtcCheck() {
  return new Promise((resolve) => {
    if (typeof RTCPeerConnection === 'undefined') {
      resolve({ supported: false, blocked: true, addresses: [] });
      return;
    }
    const addresses = new Set();
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    } catch {
      resolve({ supported: true, blocked: true, addresses: [] });
      return;
    }

    const finish = () => {
      try { pc.close(); } catch { /* already closed */ }
      resolve({ supported: true, blocked: addresses.size === 0, addresses: [...addresses] });
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const parts = event.candidate.candidate.split(' ');
      if (parts[4]) addresses.add(parts[4]);
    };
    pc.createDataChannel('check');
    pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => {});
    setTimeout(finish, 4000);
  });
}

function renderIdentity() {
  const webgl = webglInfo();
  const details = $('#identity');
  details.replaceChildren(...[
    row('User-Agent', navigator.userAgent),
    row('Platform', navigator.platform),
    row('Languages', (navigator.languages || [navigator.language]).join(', ')),
    row('Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone),
    row('Screen', `${screen.width} × ${screen.height} (${window.devicePixelRatio}x)`),
    row('CPU cores', navigator.hardwareConcurrency),
    row('Device memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'not exposed'),
    row('WebGL vendor', webgl.vendor),
    row('WebGL renderer', webgl.renderer),
    row('Canvas hash', canvasFingerprint()),
    row('Client Hints', navigator.userAgentData ? navigator.userAgentData.platform : 'not exposed'),
  ].flat());
}

async function renderIp(result) {
  const ipNode = $('#ip');
  const geoNode = $('#geo');
  const detail = $('#ip-detail');

  if (!result) {
    ipNode.textContent = 'Unavailable';
    geoNode.textContent = 'No IP provider answered. The proxy may be down or blocking requests.';
    detail.replaceChildren();
    return;
  }

  ipNode.textContent = result.ip;
  geoNode.textContent = result.place || 'Unknown location';
  detail.replaceChildren(...[
    row('Country', result.country),
    row('ISP', result.isp),
    row('ASN', result.asn),
    row('Timezone', result.timezone),
    row('Coordinates', result.coordinates),
    row('Source', result.source),
  ].flat());
}

async function renderServices() {
  const host = $('#services');
  host.replaceChildren();

  const nodes = new Map();
  for (const service of SERVICES) {
    const card = document.createElement('div');
    card.className = 'service pending';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = service.label;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = 'checking…';
    card.append(name, meta);
    host.append(card);
    nodes.set(service.id, { card, meta });
  }

  await Promise.all(SERVICES.map(async (service) => {
    const result = await reach(service);
    const node = nodes.get(service.id);
    node.card.className = `service ${result.ok ? 'ok' : 'bad'}`;
    node.meta.textContent = result.ok ? `reachable · ${result.ms} ms` : `${result.error} · ${result.ms} ms`;
  }));
}

async function renderWebrtc(result, ip) {
  const host = $('#webrtc');
  host.replaceChildren();
  const status = document.createElement('div');
  if (!result.supported) {
    status.textContent = 'Blocked — RTCPeerConnection is not available.';
  } else if (result.blocked) {
    status.textContent = 'No candidate leaked. WebRTC is filtered.';
  } else if (ip && result.addresses.includes(ip.ip)) {
    status.textContent = 'Candidates match the exit IP.';
  } else if (ip) {
    status.textContent = `Candidates differ from the exit IP (${ip.ip}) — check the WebRTC policy.`;
  } else {
    status.textContent = `Leaked ${result.addresses.length} address${result.addresses.length > 1 ? 'es' : ''}.`;
  }
  host.append(status);

  if (result.addresses.length) {
    const list = document.createElement('div');
    list.className = 'ips';
    for (const address of result.addresses) {
      const pill = document.createElement('span');
      pill.className = 'pill mono';
      pill.textContent = address;
      list.append(pill);
    }
    host.append(list);
  }
}

let lastSummary = '';

function buildSummary(ip, webrtc) {
  const lines = [`Connection check — ${new Date().toLocaleString()}`];
  lines.push(`IP: ${ip ? `${ip.ip} (${ip.place})` : 'unavailable'}`);
  if (ip) lines.push(`ISP: ${ip.isp || '—'} / ASN: ${ip.asn || '—'}`);
  lines.push(`Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  lines.push(`User-Agent: ${navigator.userAgent}`);
  lines.push(`WebRTC: ${webrtc.blocked ? 'no candidates' : webrtc.addresses.join(', ')}`);
  return lines.join('\n');
}

async function run() {
  $('#stamp').textContent = `last run ${new Date().toLocaleTimeString()}`;
  renderIdentity();

  const [ip, webrtc] = await Promise.all([lookupIp(), webrtcCheck()]);
  await renderIp(ip);
  await renderWebrtc(webrtc, ip);
  lastSummary = buildSummary(ip, webrtc);

  await renderServices();
}

$('#refresh').addEventListener('click', () => { run().catch(() => {}); });

$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lastSummary || 'nothing to copy yet');
    $('#copy-hint').textContent = 'Copied';
    setTimeout(() => { $('#copy-hint').textContent = ''; }, 2000);
  } catch {
    $('#copy-hint').textContent = 'Clipboard is blocked';
  }
});

run().catch(() => {});
