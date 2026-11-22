const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/store');
const { createMcpService } = require('../src/mcp');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

test('the MCP endpoint exposes profile tools and rejects a missing token', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morph-mcp-'));
  const store = createStore(dir);
  store.saveProfile({ name: 'MCP profile', kernel: 'chrome', os: 'windows', noProxy: true });
  const port = await freePort();
  const service = createMcpService({
    version: 'test',
    getStore: () => store,
    launchProfile: async () => {},
    stopProfile: async () => {},
    running: new Map(),
    view: (profile) => ({ ...profile, running: false, debugPort: null }),
    profileDir: () => dir,
    removeProfile: () => {},
    notify: () => {},
  });
  await service.applySettings({ enabled: true, port, token: 'test-token' });
  t.after(async () => {
    await service.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const unauthorized = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'GET' });
  assert.equal(unauthorized.status, 401);

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: 'Bearer test-token' } },
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  for (const expected of ['list_profiles', 'create_profile', 'update_profile', 'launch_profile', 'browser_navigate', 'browser_snapshot', 'browser_click', 'browser_screenshot']) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
  const result = await client.callTool({ name: 'list_profiles', arguments: {} });
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.count, 1);
  assert.equal(body.profiles[0].name, 'MCP profile');
  await client.close();
});
