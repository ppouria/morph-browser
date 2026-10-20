const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyOverrides } = require('../src/cdp');

test('mobile emulation installs metrics, touch and media overrides', async () => {
  const calls = [];
  const conn = { send: async (method, params) => { calls.push([method, params]); } };
  await applyOverrides(conn, 'session', {
    emulation: {
      mobile: { width: 412, height: 915, dpr: 2.625, maxTouchPoints: 5, cpu: 9, ram: 8 },
    },
  });
  const methods = calls.map(([method]) => method);
  assert.ok(methods.includes('Emulation.setDeviceMetricsOverride'));
  assert.ok(methods.includes('Emulation.setTouchEmulationEnabled'));
  assert.ok(methods.includes('Emulation.setEmitTouchEventsForMouse'));
  assert.ok(methods.includes('Emulation.setEmulatedMedia'));
  const metrics = calls.find(([method]) => method === 'Emulation.setDeviceMetricsOverride')[1];
  assert.equal(metrics.mobile, true);
  assert.equal(metrics.width, 412);
  assert.equal(metrics.deviceScaleFactor, 2.625);
});
