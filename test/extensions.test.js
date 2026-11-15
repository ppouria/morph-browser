const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'extensions');

test('built-in extensions are valid Manifest V3 packages', () => {
  for (const name of ['traffic-saver', 'tab-snoozer']) {
    const dir = path.join(ROOT, name);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.ok(manifest.name);
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  }
});

test('the traffic saver ships unique declarativeNetRequest rules', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'traffic-saver', 'rules.json'), 'utf8'));
  assert.ok(rules.length >= 50);
  const ids = new Set(rules.map((rule) => rule.id));
  assert.equal(ids.size, rules.length);
  for (const rule of rules) {
    assert.equal(rule.action.type, 'block');
    assert.match(rule.condition.urlFilter, /^\|\|[a-z0-9.-]+\^$/);
  }
});
