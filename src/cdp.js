// Talks to a running Chromium over DevTools. Used to set cookies and the fingerprint before a
// page loads: every page target is paused while its overrides are installed, then released.

async function waitForBrowser(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      // Chromium is still starting, so keep polling.
    }
    if (Date.now() > deadline) throw new Error('Chromium did not open its DevTools port');
    await new Promise((r) => setTimeout(r, 300));
  }
}

// A small JSON-RPC client over one DevTools WebSocket. Requests may carry a session id, which is
// how commands reach one page while the socket stays browser-wide.
function openConnection(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const ready = new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => fail(new Error('could not connect to Chromium DevTools')), { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();

  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method) {
      for (const callback of listeners.get(message.method) || []) {
        callback(message.params, message.sessionId);
      }
    }
  });

  return ready.then(() => ({
    send(method, params = {}, sessionId) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(method, callback) {
      listeners.set(method, [...(listeners.get(method) || []), callback]);
    },
    close() {
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    },
  }));
}

// The overrides a page needs before its first script runs. Each one is optional: an older Chromium
// may not know a domain, and that must not stop the profile from opening.
async function applyOverrides(conn, sessionId, { script, emulation }) {
  const attempt = async (method, params) => {
    try {
      await conn.send(method, params, sessionId);
    } catch {
      // Unsupported in this Chromium build; the flag-level fallback still applies.
    }
  };
  if (script) {
    // Without Page.enable the registration is accepted but never runs, so the whole injected
    // fingerprint would silently do nothing.
    await attempt('Page.enable', {});
    await attempt('Page.addScriptToEvaluateOnNewDocument', { source: script });
  }
  if (emulation.timezone) await attempt('Emulation.setTimezoneOverride', { timezoneId: emulation.timezone });
  if (emulation.locale) await attempt('Emulation.setLocaleOverride', { locale: emulation.locale });
  // Overriding the user-agent here (not only with a flag) also rewrites Sec-CH-UA, so the headers
  // and navigator.userAgentData agree with the profile instead of the real binary.
  if (emulation.userAgent) {
    await attempt('Emulation.setUserAgentOverride', {
      userAgent: emulation.userAgent,
      acceptLanguage: emulation.acceptLanguage,
      platform: emulation.platform,
      userAgentMetadata: emulation.userAgentMetadata,
    });
  }
  if (emulation.geolocation) {
    await attempt('Emulation.setGeolocationOverride', {
      latitude: emulation.geolocation.latitude,
      longitude: emulation.geolocation.longitude,
      accuracy: emulation.geolocation.accuracy || 100,
    });
  }
}

// Connects, installs the overrides on every page (including tabs opened later), sets cookies and
// opens the start URLs. The connection stays open for the life of the profile: closing it would
// detach the page sessions and let new tabs start without the fingerprint.
async function prepareBrowser(port, { cookies = [], startUrls = [], script = '', emulation = {} }) {
  const wsUrl = await waitForBrowser(port);
  const conn = await openConnection(wsUrl);
  const pendingUrls = new Map();
  const attached = new Map();

  conn.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
    const task = (async () => {
      try {
        if (targetInfo.type === 'page') {
          await applyOverrides(conn, sessionId, { script, emulation });
        }
      } finally {
        const url = pendingUrls.get(targetInfo.targetId);
        if (url) pendingUrls.delete(targetInfo.targetId);
        try {
          await conn.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
        } catch {
          // The target may already be gone.
        }
        if (url) await conn.send('Page.navigate', { url }, sessionId).catch(() => {});
      }
    })();
    attached.set(targetInfo.targetId, task);
  });

  try {
    for (const origin of emulation.grantGeolocation || []) {
      await conn.send('Browser.grantPermissions', { origin, permissions: ['geolocation'] }).catch(() => {});
    }

    // waitForDebuggerOnStart pauses each new page just long enough to install the overrides.
    await conn.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });

    if (cookies.length) await conn.send('Storage.setCookies', { cookies });

    for (const url of startUrls) {
      const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
      pendingUrls.set(targetId, url);
      // The attach event installs the overrides and then navigates; waiting keeps the tab order.
      for (let i = 0; i < 100 && !attached.has(targetId); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (attached.has(targetId)) await attached.get(targetId);
    }
  } catch (err) {
    conn.close();
    throw err;
  }

  return { close: () => conn.close(), conn };
}

module.exports = { prepareBrowser, openConnection, waitForBrowser, applyOverrides };
