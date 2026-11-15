const http = require('node:http');
const { Server } = require('proxy-chain');
const { startChain } = require('./chain');
const { timezoneForCountry } = require('./timezones');

function upstreamUrl({ type, host, port, username, password }) {
  const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : '';
  return `${type}://${auth}${host}:${port}`;
}

// Chromium gets a local proxy with no login. This relay adds the login when it talks to the real proxy,
// so the password never reaches Chromium and no auth dialog pops up.
async function startRelay(proxy, { onTraffic } = {}) {
  const upstream = upstreamUrl(proxy);
  const server = new Server({
    host: '127.0.0.1',
    port: 0,
    prepareRequestFunction: () => ({ upstreamProxyUrl: upstream }),
  });
  await server.listen();
  if (onTraffic) {
    // proxy-chain counts the client-facing socket, which is exactly the traffic the profile sent
    // and received through its proxy.
    server.on('connectionClosed', ({ stats }) => {
      if (!stats) return;
      const bytes = (stats.srcRxBytes || 0) + (stats.srcTxBytes || 0);
      if (bytes > 0) onTraffic(bytes);
    });
  }
  return {
    proxyServer: `http://127.0.0.1:${server.port}`,
    close: () => server.close(true),
    server,
  };
}

// Reads one plain HTTP URL through the relay, so the answer is what the proxy really gives out.
function requestThroughRelay(relay, url, timeoutMs = 15000) {
  const { hostname, port } = new URL(relay.proxyServer);
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: hostname, port, path: url, headers: { Host: new URL(url).host } },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) return resolve(data);
          // 597 is proxy-chain's AUTH_FAILED: the proxy refused the login the relay sent.
          if (res.statusCode === 407 || res.statusCode === 597) {
            return reject(new Error('proxy rejected the username or password'));
          }
          return reject(new Error(`proxy check returned HTTP ${res.statusCode}`));
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('proxy check timed out')));
    req.on('error', reject);
  });
}

// Checks and lookups can be sent through the app-wide proxy too, so a profile proxy that is only
// reachable through the app proxy still works.
async function withProxy(proxy, upstream, work) {
  const relay = upstream ? await startChain(upstream, proxy) : await startRelay(proxy);
  try {
    return await work(relay);
  } finally {
    await relay.close().catch(() => {});
  }
}

// A quick "is this proxy alive" probe used before falling back at launch.
async function probeProxy(proxy, timeoutMs = 6000, { upstream = null } = {}) {
  try {
    return await withProxy(proxy, upstream, async (relay) => {
      await requestThroughRelay(relay, 'http://api.ipify.org/?format=json', timeoutMs);
      return true;
    });
  } catch {
    return false;
  }
}

async function checkProxy(proxy, url = 'http://api.ipify.org/?format=json', { upstream = null } = {}) {
  return withProxy(proxy, upstream, async (relay) => JSON.parse(await requestThroughRelay(relay, url)));
}

// Country, city and IP of a saved proxy, shown next to its name in the app.
async function lookupProxyLocation(proxy, { timeoutMs = 12000, upstream = null } = {}) {
  return withProxy(proxy, upstream, async (relay) => {
    try {
      const body = await requestThroughRelay(relay, 'http://ip-api.com/json/?fields=status,country,countryCode,city,query', timeoutMs);
      const data = JSON.parse(body);
      if (data.status === 'success' && data.countryCode) {
        return {
          ip: data.query || null,
          country: data.country || null,
          countryCode: String(data.countryCode).toUpperCase(),
          city: data.city || null,
          checkedAt: Date.now(),
        };
      }
    } catch {
      // Fall through to the second provider.
    }
    const body = await requestThroughRelay(relay, 'http://ipwho.is/', timeoutMs);
    const data = JSON.parse(body);
    if (!data.success || !data.country_code) throw new Error('location lookup failed');
    return {
      ip: data.ip || null,
      country: data.country || null,
      countryCode: String(data.country_code).toUpperCase(),
      city: data.city || null,
      checkedAt: Date.now(),
    };
  });
}

// Timezone, country and coordinates of the exit IP, used by the "Based on IP" modes and by the
// automatic proxy alignment. Two providers are tried because one may be blocked from some networks.
// The result is not cached: rotating proxies can change country between launches, and a stale
// timezone is worse than an extra lookup.
function normalizeGeo({ timezone, countryCode, latitude, longitude }) {
  const code = countryCode ? String(countryCode).toUpperCase() : null;
  const zone = timezone || timezoneForCountry(code);
  if (!zone && !code) return null;
  return {
    timezone: zone || null,
    countryCode: code,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function geoFromProxyLocation(proxy) {
  const location = proxy && proxy.location;
  if (!location || !location.countryCode) return null;
  return normalizeGeo({ countryCode: location.countryCode });
}

async function lookupGeo(proxy, { timeoutMs = 5000, upstream = null } = {}) {
  if (!proxy) return null;
  let value = null;
  try {
    value = await withProxy(proxy, upstream, async (relay) => {
      // Both providers are queried in parallel. A provider may be blocked for one proxy while the
      // other still answers, and waiting for each in turn would add several seconds to a launch.
      const attempts = [
        (async () => {
          const body = await requestThroughRelay(relay, 'http://ip-api.com/json/?fields=status,countryCode,timezone,lat,lon', timeoutMs);
          const data = JSON.parse(body);
          if (data.status !== 'success') return null;
          return normalizeGeo({ timezone: data.timezone, countryCode: data.countryCode, latitude: data.lat, longitude: data.lon });
        })(),
        (async () => {
          const body = await requestThroughRelay(relay, 'http://ipwho.is/', timeoutMs);
          const data = JSON.parse(body);
          if (!data || data.success === false) return null;
          return normalizeGeo({
            timezone: data.timezone && data.timezone.id,
            countryCode: data.country_code,
            latitude: data.latitude,
            longitude: data.longitude,
          });
        })(),
      ];
      const results = await Promise.allSettled(attempts);
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) return result.value;
      }
      return null;
    });
  } catch {
    value = null;
  }
  // If both IP providers are blocked by the proxy, the country recorded when the proxy was saved is
  // still a much better answer than leaving the profile on the host timezone.
  return value || geoFromProxyLocation(proxy);
}

module.exports = { startRelay, upstreamUrl, checkProxy, probeProxy, lookupGeo, lookupProxyLocation, requestThroughRelay };
