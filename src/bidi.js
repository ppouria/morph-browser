// Minimal WebDriver BiDi client. Firefox does not speak the Chrome DevTools Protocol, so cookie
// injection and other automation go through BiDi instead.

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function discover(port, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const data = await response.json();
        if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
      } else if (response.status === 404) {
        // Firefox serves BiDi directly at /session and has no /json/version page.
        return `ws://127.0.0.1:${port}/session`;
      }
    } catch {
      // The agent is not listening yet.
    }
    await delay(250);
  }
  return `ws://127.0.0.1:${port}/session`;
}

async function open(url, timeout = 15000) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out connecting to Firefox')), timeout);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('could not connect to Firefox')); }, { once: true });
  });
  return ws;
}

function createClient(ws) {
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const job = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      const detail = typeof message.error === 'object'
        ? message.error.message
        : [message.error, message.message].filter(Boolean).join(': ');
      job.reject(new Error(detail || 'BiDi command failed'));
    } else {
      job.resolve(message.result || {});
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  return { send, close: () => ws.close() };
}

async function connect(port, { timeout = 20000 } = {}) {
  const url = await discover(port, timeout);
  const ws = await open(url, timeout);
  const client = createClient(ws);

  // Firefox accepts a single BiDi session. A socket that closed without ending its session leaves
  // it behind for a moment, so wait and retry instead of failing the import.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await client.send('session.new', { capabilities: {} });
      return client;
    } catch (err) {
      if (!/Maximum number of active sessions/i.test(err.message) || attempt >= 4) {
        client.close();
        throw err;
      }
      await delay(750);
    }
  }
}

const SAME_SITE = { Strict: 'strict', Lax: 'lax', None: 'none' };

async function setCookies(port, cookies, { timeout = 20000 } = {}) {
  if (!cookies || !cookies.length) return 0;
  const client = await connect(port, { timeout });
  try {
    for (const cookie of cookies) {
      const payload = {
        name: cookie.name,
        value: { type: 'string', value: String(cookie.value) },
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly),
      };
      if (typeof cookie.expires === 'number') payload.expiry = Math.floor(cookie.expires);
      if (cookie.sameSite) payload.sameSite = SAME_SITE[cookie.sameSite] || 'lax';
      await client.send('storage.setCookie', { cookie: payload });
    }
    return cookies.length;
  } finally {
    // Ending the session releases the single slot for the next import.
    await client.send('session.end').catch(() => {});
    client.close();
  }
}

module.exports = { connect, setCookies, discover };
