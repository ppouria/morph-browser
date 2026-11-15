const { test } = require('node:test');
const assert = require('node:assert/strict');
const { timezoneForCountry } = require('../src/timezones');

test('a country maps to a usable representative timezone', () => {
  assert.equal(timezoneForCountry('DE'), 'Europe/Berlin');
  assert.equal(timezoneForCountry('de'), 'Europe/Berlin');
  assert.equal(timezoneForCountry('US'), 'America/New_York');
  assert.equal(timezoneForCountry('JP'), 'Asia/Tokyo');
  assert.equal(timezoneForCountry('XX'), null);
  assert.equal(timezoneForCountry(''), null);
});
