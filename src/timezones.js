const { getCountry } = require('countries-and-timezones');

// When an IP geolocation provider is blocked, the proxy's saved country is still enough to avoid
// leaving the browser on the system timezone. A few countries span multiple zones, so give their
// most common proxy exit zone a stable preference.
const PRIMARY_ZONE = {
  AR: 'America/Argentina/Buenos_Aires',
  AU: 'Australia/Sydney',
  BR: 'America/Sao_Paulo',
  CA: 'America/Toronto',
  CL: 'America/Santiago',
  CN: 'Asia/Shanghai',
  CO: 'America/Bogota',
  EG: 'Africa/Cairo',
  GB: 'Europe/London',
  ID: 'Asia/Jakarta',
  IN: 'Asia/Kolkata',
  IR: 'Asia/Tehran',
  MX: 'America/Mexico_City',
  MY: 'Asia/Kuala_Lumpur',
  NZ: 'Pacific/Auckland',
  PH: 'Asia/Manila',
  PK: 'Asia/Karachi',
  RU: 'Europe/Moscow',
  SA: 'Asia/Riyadh',
  TH: 'Asia/Bangkok',
  TR: 'Europe/Istanbul',
  UA: 'Europe/Kyiv',
  US: 'America/New_York',
  VN: 'Asia/Ho_Chi_Minh',
  ZA: 'Africa/Johannesburg',
};

function validZone(zone) {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

function timezoneForCountry(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const preferred = validZone(PRIMARY_ZONE[code]);
  if (preferred) return preferred;
  const country = getCountry(code);
  return validZone(country && country.timezones && country.timezones[0]);
}

module.exports = { timezoneForCountry };
