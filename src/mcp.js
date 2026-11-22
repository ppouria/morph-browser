const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpExpressApp } = require('@modelcontextprotocol/sdk/server/express.js');
const { chromium } = require('playwright-core');
const { z } = require('zod');

const PROXY_TYPES = ['http', 'https', 'socks5'];
const KERNELS = ['chrome', 'cft', 'chromium', 'ungoogled', 'fingerprint', 'brave', 'thorium', 'firefox'];
const OS_LIST = ['windows', 'macos', 'linux', 'android'];

const proxySchema = z.object({
  type: z.enum(PROXY_TYPES).optional().describe('Proxy protocol; defaults to http'),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
}).nullable().optional();

function text(value) {
  return {
    content: [{
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    }],
  };
}

function failure(message) {
  return { isError: true, content: [{ type: 'text', text: String(message) }] };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createMcpService({
  version = '1.0.0',
  getStore,
  launchProfile,
  stopProfile,
  running,
  view,
  profileDir,
  removeProfile,
  notify,
}) {
  const connections = new Map(); // profile id -> { browser, port }
  const activePages = new Map(); // profile id -> page

  function store() {
    return getStore();
  }

  function fullProfile(profile) {
    return { ...profile, ...view(profile) };
  }

  function summary(profile) {
    const run = running.get(profile.id);
    return {
      id: profile.id,
      number: profile.number,
      name: profile.name,
      group: profile.group,
      tags: profile.tags,
      kernel: profile.kernel,
      os: profile.os,
      browserVersion: profile.browserVersion,
      proxy: profile.proxy,
      noProxy: Boolean(profile.noProxy),
      fallback: profile.fallback,
      startUrls: profile.startUrls,
      running: Boolean(run),
      debugPort: run ? run.debugPort : null,
      lastOpenedAt: profile.lastOpenedAt,
      proxyUsageBytes: profile.proxyUsageBytes || 0,
    };
  }

  function runningIds() {
    return [...running.keys()];
  }

  function resolveProfile(profileId, { requireRunning = false } = {}) {
    const database = store();
    let id = profileId;
    if (!id) {
      const ids = runningIds();
      if (requireRunning && ids.length !== 1) {
        throw new Error(ids.length === 0
          ? 'No profile is running. Launch a profile first.'
          : `Several profiles are running (${ids.join(', ')}); pass profile_id.`);
      }
      if (ids.length === 1) id = ids[0];
      else if (ids.length > 1) throw new Error(`Several profiles are running (${ids.join(', ')}); pass profile_id.`);
    }
    if (!id) throw new Error('profile_id is required');
    const profile = database.getProfile(id);
    if (!profile) throw new Error(`Profile ${id} was not found`);
    if (requireRunning && !running.has(id)) throw new Error(`Profile “${profile.name}” is not running`);
    return profile;
  }

  async function connect(profileId) {
    const entry = running.get(profileId);
    if (!entry) throw new Error('The profile is not running');
    const cached = connections.get(profileId);
    if (cached && cached.port === entry.debugPort) return cached;
    if (cached) await cached.browser.close().catch(() => {});
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${entry.debugPort}`, {
      timeout: 15000,
    });
    const record = { browser, port: entry.debugPort };
    connections.set(profileId, record);
    browser.on('disconnected', () => {
      if (connections.get(profileId)?.browser === browser) connections.delete(profileId);
    });
    return record;
  }

  async function pageFor(profileId, index = null, { create = false } = {}) {
    const record = await connect(profileId);
    const contexts = record.browser.contexts();
    const context = contexts[0];
    if (!context) throw new Error('The running browser has no browser context');
    const pages = context.pages().filter((page) => !page.isClosed());
    if (index !== null && index !== undefined) {
      if (!Number.isInteger(index) || index < 0 || index >= pages.length) {
        throw new Error(`Tab index ${index} does not exist (${pages.length} tab(s) open)`);
      }
      activePages.set(profileId, pages[index]);
      return pages[index];
    }
    const active = activePages.get(profileId);
    if (active && !active.isClosed() && pages.includes(active)) return active;
    if (pages.length) {
      activePages.set(profileId, pages[0]);
      return pages[0];
    }
    if (!create) throw new Error('The profile has no open page');
    const page = await context.newPage();
    activePages.set(profileId, page);
    return page;
  }

  async function profileAndPage(args, options = {}) {
    const profile = resolveProfile(args.profile_id, { requireRunning: true });
    const page = await pageFor(profile.id, args.tab_index ?? null, options);
    return { profile, page };
  }

  function proxyInput(input) {
    if (!input) return null;
    return {
      type: input.type || 'http',
      host: input.host,
      port: input.port,
      username: input.username || '',
      password: input.password || '',
      location: null,
    };
  }

  function createServer() {
    const server = new McpServer({ name: 'morph-browser', version });

    const tool = (name, description, inputSchema, handler) => {
      server.registerTool(name, { description, inputSchema }, async (args) => {
        try {
          return await handler(args || {});
        } catch (err) {
          return failure(err && err.message ? err.message : err);
        }
      });
    };

    tool('list_profiles', 'List every Morph Browser profile with its proxy and running state.', {}, async () => {
      const profiles = store().listProfiles().map(summary);
      return text({ count: profiles.length, profiles });
    });

    tool('get_profile', 'Read one profile, including its full proxy and fingerprint configuration.', {
      profile_id: z.string().describe('Profile id'),
    }, async ({ profile_id }) => {
      const profile = resolveProfile(profile_id);
      return text({ profile: fullProfile(profile) });
    });

    tool('create_profile', 'Create a profile. It is not launched automatically.', {
      name: z.string().min(1).max(100),
      kernel: z.enum(KERNELS).optional(),
      os: z.enum(OS_LIST).optional(),
      group: z.string().optional(),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
      start_urls: z.array(z.string()).optional(),
      proxy: proxySchema,
      no_proxy: z.boolean().optional().describe('Open directly and ignore the app-wide proxy'),
      browser_version: z.string().optional(),
      fingerprint: z.any().optional().describe('Partial fingerprint object; omitted fields use defaults'),
    }, async (args) => {
      const input = {
        name: args.name,
        kernel: args.kernel || 'chrome',
        os: args.os || 'windows',
        group: args.group || '',
        tags: args.tags || [],
        notes: args.notes || '',
        startUrls: args.start_urls || [],
        proxy: args.no_proxy ? null : proxyInput(args.proxy),
        noProxy: Boolean(args.no_proxy),
        browserVersion: args.browser_version || '',
      };
      if (args.fingerprint) input.fingerprint = args.fingerprint;
      const profile = store().saveProfile(input);
      notify();
      return text({ profile: fullProfile(profile) });
    });

    tool('update_profile', 'Edit profile fields. Omitted fields keep their current value.', {
      profile_id: z.string(),
      name: z.string().min(1).max(100).optional(),
      kernel: z.enum(KERNELS).optional(),
      os: z.enum(OS_LIST).optional(),
      group: z.string().optional(),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
      start_urls: z.array(z.string()).optional(),
      proxy: proxySchema,
      no_proxy: z.boolean().optional(),
      browser_version: z.string().optional(),
      fingerprint: z.any().optional(),
    }, async (args) => {
      const existing = resolveProfile(args.profile_id);
      const patch = { ...existing };
      if (args.name !== undefined) patch.name = args.name;
      if (args.kernel !== undefined) patch.kernel = args.kernel;
      if (args.os !== undefined) patch.os = args.os;
      if (args.group !== undefined) patch.group = args.group;
      if (args.tags !== undefined) patch.tags = args.tags;
      if (args.notes !== undefined) patch.notes = args.notes;
      if (args.start_urls !== undefined) patch.startUrls = args.start_urls;
      if (args.browser_version !== undefined) patch.browserVersion = args.browser_version;
      if (args.fingerprint !== undefined) patch.fingerprint = args.fingerprint;
      if (args.no_proxy === true) {
        patch.noProxy = true;
        patch.proxy = null;
      } else if (args.proxy !== undefined) {
        patch.proxy = proxyInput(args.proxy);
        patch.noProxy = false;
      } else if (args.no_proxy === false) {
        patch.noProxy = false;
      }
      const profile = store().saveProfile(patch);
      notify();
      return text({ profile: fullProfile(profile) });
    });

    tool('delete_profile', 'Delete a stopped profile and its browser data. Stop it first if needed.', {
      profile_id: z.string(),
    }, async ({ profile_id }) => {
      if (running.has(profile_id)) throw new Error('Stop the profile before deleting it');
      if (!store().getProfile(profile_id)) throw new Error('Profile not found');
      removeProfile(profile_id);
      return text({ deleted: profile_id });
    });

    tool('launch_profile', 'Launch a profile and wait until Chromium is ready. Returns its debug port.', {
      profile_id: z.string(),
    }, async ({ profile_id }) => {
      if (!store().getProfile(profile_id)) throw new Error('Profile not found');
      await launchProfile(profile_id);
      const entry = running.get(profile_id);
      return text({ launched: Boolean(entry), debugPort: entry ? entry.debugPort : null, profile: summary(store().getProfile(profile_id)) });
    });

    tool('stop_profile', 'Stop a running profile.', {
      profile_id: z.string(),
    }, async ({ profile_id }) => {
      await stopProfile(profile_id);
      const deadline = Date.now() + 12000;
      while (running.has(profile_id) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (running.has(profile_id)) throw new Error('The profile did not stop within 12 seconds');
      return text({ stopped: true });
    });

    tool('browser_status', 'Show the running profiles and the open tabs in the selected browser.', {
      profile_id: z.string().optional(),
    }, async ({ profile_id }) => {
      const profile = resolveProfile(profile_id, { requireRunning: true });
      const record = await connect(profile.id);
      const context = record.browser.contexts()[0];
      const pages = context ? context.pages().filter((page) => !page.isClosed()) : [];
      const active = activePages.get(profile.id);
      return text({
        profile: summary(profile),
        tabs: await Promise.all(pages.map(async (page, index) => ({
          index,
          url: page.url(),
          title: await page.title().catch(() => ''),
          active: page === active,
        }))),
      });
    });

    tool('browser_navigate', 'Navigate the active tab to a URL and wait for DOM content.', {
      url: z.string().describe('http(s) URL'),
      profile_id: z.string().optional(),
    }, async ({ url, profile_id }) => {
      if (!/^https?:/i.test(url)) throw new Error('Only http and https URLs are allowed');
      const { profile, page } = await profileAndPage({ profile_id });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return text({ profile: profile.id, url: page.url(), title: await page.title().catch(() => '') });
    });

    tool('browser_snapshot', 'Return the page URL, title and an ARIA snapshot of accessible elements. Call this before clicking.', {
      profile_id: z.string().optional(),
      tab_index: z.number().int().min(0).optional(),
    }, async (args) => {
      const { page } = await profileAndPage(args);
      const title = await page.title().catch(() => '');
      let aria = '';
      try {
        aria = await page.locator('body').ariaSnapshot();
      } catch {
        aria = await page.locator('body').innerText().catch(() => '');
      }
      const value = `URL: ${page.url()}\nTitle: ${title}\n\n${String(aria).slice(0, 30000)}`;
      return text(value);
    });

    tool('browser_screenshot', 'Capture a PNG screenshot of the active page. Useful when the ARIA tree is ambiguous.', {
      profile_id: z.string().optional(),
      full_page: z.boolean().optional(),
    }, async ({ profile_id, full_page }) => {
      const { page } = await profileAndPage({ profile_id });
      const png = await page.screenshot({ type: 'png', fullPage: Boolean(full_page) });
      return {
        content: [
          { type: 'text', text: `Screenshot of ${page.url()}` },
          { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
        ],
      };
    });

    tool('browser_click', 'Click an element by CSS selector or visible text, or click coordinates.', {
      selector: z.string().optional(),
      text: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      profile_id: z.string().optional(),
    }, async ({ selector: css, text: label, x, y, profile_id }) => {
      const { page } = await profileAndPage({ profile_id });
      if (css) await page.locator(css).first().click({ timeout: 10000 });
      else if (label) await page.getByText(label, { exact: false }).first().click({ timeout: 10000 });
      else if (Number.isFinite(x) && Number.isFinite(y)) await page.mouse.click(x, y);
      else throw new Error('Pass selector, text, or x and y');
      return text({ clicked: css || label || `${x},${y}`, url: page.url() });
    });

    tool('browser_type', 'Fill an input/contenteditable or type into the focused element. Optionally press Enter.', {
      text: z.string(),
      selector: z.string().optional(),
      submit: z.boolean().optional(),
      profile_id: z.string().optional(),
    }, async ({ text: value, selector: css, submit, profile_id }) => {
      const { page } = await profileAndPage({ profile_id });
      if (css) {
        const field = page.locator(css).first();
        await field.fill(value, { timeout: 10000 });
        if (submit) await field.press('Enter');
      } else {
        await page.keyboard.type(value);
        if (submit) await page.keyboard.press('Enter');
      }
      return text({ typed: css ? 'field' : 'keyboard', submitted: Boolean(submit) });
    });

    tool('browser_press', 'Press a keyboard key on the active page.', {
      key: z.string().describe('Playwright key name, e.g. Enter, Escape, ArrowDown'),
      profile_id: z.string().optional(),
    }, async ({ key, profile_id }) => {
      const { page } = await profileAndPage({ profile_id });
      await page.keyboard.press(key);
      return text({ pressed: key });
    });

    tool('browser_evaluate', 'Run a JavaScript expression in the page and return its JSON value. For inspection/debugging.', {
      expression: z.string(),
      profile_id: z.string().optional(),
    }, async ({ expression, profile_id }) => {
      const { page } = await profileAndPage({ profile_id });
      const result = await page.evaluate(expression);
      let rendered;
      try {
        rendered = JSON.stringify(result, null, 2);
      } catch {
        rendered = String(result);
      }
      return text(rendered === undefined ? 'undefined' : rendered.slice(0, 30000));
    });

    tool('browser_tabs', 'List, open, select or close browser tabs.', {
      action: z.enum(['list', 'new', 'select', 'close']),
      profile_id: z.string().optional(),
      index: z.number().int().min(0).optional(),
      url: z.string().optional(),
    }, async ({ action, profile_id, index, url }) => {
      const profile = resolveProfile(profile_id, { requireRunning: true });
      const record = await connect(profile.id);
      const context = record.browser.contexts()[0];
      if (!context) throw new Error('No browser context');
      if (action === 'list') {
        return text(await Promise.all(context.pages().map(async (page, i) => ({
          index: i, url: page.url(), title: await page.title().catch(() => ''),
        }))));
      }
      if (action === 'new') {
        const page = await context.newPage();
        if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        activePages.set(profile.id, page);
        return text({ index: context.pages().indexOf(page), url: page.url() });
      }
      const pages = context.pages().filter((page) => !page.isClosed());
      if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw new Error('Tab index does not exist');
      if (action === 'select') {
        activePages.set(profile.id, pages[index]);
        await pages[index].bringToFront().catch(() => {});
        return text({ selected: index, url: pages[index].url() });
      }
      await pages[index].close();
      const remaining = context.pages().filter((page) => !page.isClosed());
      if (remaining.length) activePages.set(profile.id, remaining[0]);
      return text({ closed: index, remaining: remaining.length });
    });

    tool('browser_go_back', 'Go back in the active tab.', { profile_id: z.string().optional() }, async ({ profile_id }) => {
      const { page } = await profileAndPage({ profile_id });
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
      return text({ url: page.url() });
    });

    tool('browser_go_forward', 'Go forward in the active tab.', { profile_id: z.string().optional() }, async ({ profile_id }) => {
      const { page } = await profileAndPage({ profile_id });
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: 30000 });
      return text({ url: page.url() });
    });

    tool('browser_reload', 'Reload the active tab.', { profile_id: z.string().optional() }, async ({ profile_id }) => {
      const { page } = await profileAndPage({ profile_id });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      return text({ url: page.url() });
    });

    tool('browser_wait', 'Wait for a number of milliseconds (maximum 30 seconds).', {
      ms: z.number().int().min(0).max(30000),
    }, async ({ ms }) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return text({ waited: ms });
    });

    return server;
  }

  let httpServer = null;
  let config = null;
  let status = { running: false, port: null, enabled: false, error: null };

  function authMiddleware(expectedToken) {
    return (req, res, next) => {
      const header = String(req.headers.authorization || '');
      const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
      const token = bearer || String(req.query.token || '');
      if (!token || !safeEqual(token, expectedToken)) {
        res.status(401).json({ error: 'invalid MCP token' });
        return;
      }
      next();
    };
  }

  function buildApp() {
    const app = createMcpExpressApp({ host: '127.0.0.1' });
    app.use(authMiddleware(config.token));
    app.post('/mcp', async (req, res) => {
      const server = createServer();
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
          transport.close().catch(() => {});
          server.close().catch(() => {});
        });
      } catch (err) {
        console.error('MCP request:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
        }
      }
    });
    const methodNotAllowed = (req, res) => {
      res.writeHead(405).end(JSON.stringify({
        jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null,
      }));
    };
    app.get('/mcp', methodNotAllowed);
    app.delete('/mcp', methodNotAllowed);
    return app;
  }

  async function start(nextConfig) {
    await stop();
    config = {
      enabled: Boolean(nextConfig.enabled),
      port: Number(nextConfig.port) || 19777,
      token: String(nextConfig.token || ''),
    };
    if (!config.enabled) {
      status = { running: false, port: config.port, enabled: false, error: null };
      return status;
    }
    if (!config.token) throw new Error('MCP token is missing');
    const app = buildApp();
    await new Promise((resolve, reject) => {
      const server = http.createServer(app);
      server.once('error', reject);
      server.listen(config.port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        httpServer = server;
        resolve();
      });
    });
    status = { running: true, port: config.port, enabled: true, error: null };
    return status;
  }

  async function stop() {
    if (httpServer) {
      const server = httpServer;
      httpServer = null;
      await new Promise((resolve) => server.close(() => resolve()));
    }
    // Do not call browser.close(): it would close the profile's Chromium. Playwright connections
    // are only dropped when the browser disconnects or this process exits.
    activePages.clear();
    status = { running: false, port: config ? config.port : null, enabled: false, error: null };
  }

  async function applySettings(settings) {
    const wanted = settings && settings.mcp ? settings.mcp : (settings || {});
    try {
      return await start(wanted);
    } catch (err) {
      status = {
        running: false,
        port: Number(wanted.port) || 19777,
        enabled: Boolean(wanted.enabled),
        error: err.message,
      };
      return status;
    }
  }

  return {
    applySettings,
    stop,
    getStatus: () => ({ ...status, url: status.running ? `http://127.0.0.1:${status.port}/mcp` : null }),
  };
}

module.exports = { createMcpService };
