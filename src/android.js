// Android identities are emulated, not a real mobile browser. The values below are the surfaces a
// page can read through JavaScript and Client Hints. TLS and GPU capabilities still belong to the
// desktop binary, so this is a best-effort identity, not a guarantee against advanced detection.
const ANDROID_DEVICES = [
  {
    id: 'pixel-8',
    label: 'Pixel 8 · Android 14',
    model: 'Pixel 8',
    androidVersion: '14',
    platformVersion: '14.0.0',
    width: 412,
    height: 915,
    dpr: 2.625,
    gpuVendor: 'ARM',
    gpuRenderer: 'Mali-G715',
    cpu: 9,
    ram: 8,
  },
  {
    id: 'pixel-8-pro',
    label: 'Pixel 8 Pro · Android 14',
    model: 'Pixel 8 Pro',
    androidVersion: '14',
    platformVersion: '14.0.0',
    width: 448,
    height: 998,
    dpr: 2.625,
    gpuVendor: 'ARM',
    gpuRenderer: 'Mali-G715',
    cpu: 9,
    ram: 12,
  },
  {
    id: 'pixel-7',
    label: 'Pixel 7 · Android 14',
    model: 'Pixel 7',
    androidVersion: '14',
    platformVersion: '14.0.0',
    width: 412,
    height: 915,
    dpr: 2.625,
    gpuVendor: 'ARM',
    gpuRenderer: 'Mali-G710',
    cpu: 8,
    ram: 8,
  },
  {
    id: 'galaxy-s24',
    label: 'Galaxy S24 · Android 14',
    model: 'SM-S921B',
    androidVersion: '14',
    platformVersion: '14.0.0',
    width: 360,
    height: 780,
    dpr: 3,
    gpuVendor: 'Qualcomm',
    gpuRenderer: 'Adreno (TM) 750',
    cpu: 8,
    ram: 8,
  },
  {
    id: 'galaxy-s23',
    label: 'Galaxy S23 · Android 13',
    model: 'SM-S911B',
    androidVersion: '13',
    platformVersion: '13.0.0',
    width: 360,
    height: 780,
    dpr: 3,
    gpuVendor: 'Qualcomm',
    gpuRenderer: 'Adreno (TM) 740',
    cpu: 8,
    ram: 8,
  },
  {
    id: 'xiaomi-13',
    label: 'Xiaomi 13 · Android 13',
    model: '2211133G',
    androidVersion: '13',
    platformVersion: '13.0.0',
    width: 393,
    height: 873,
    dpr: 2.75,
    gpuVendor: 'Qualcomm',
    gpuRenderer: 'Adreno (TM) 740',
    cpu: 8,
    ram: 8,
  },
];

const DEFAULT_ANDROID = { ...ANDROID_DEVICES[0] };

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeAndroid(input) {
  const source = input || {};
  const preset = ANDROID_DEVICES.find((device) => device.id === source.device) || DEFAULT_ANDROID;
  const version = String(source.androidVersion || preset.androidVersion).trim();
  return {
    device: preset.id,
    model: String(source.model || preset.model).slice(0, 60),
    androidVersion: /^\d{1,2}(\.\d+)?$/.test(version) ? version : preset.androidVersion,
    platformVersion: String(source.platformVersion || preset.platformVersion).slice(0, 20),
    width: Math.round(clamp(source.width, 320, 1200, preset.width)),
    height: Math.round(clamp(source.height, 480, 2000, preset.height)),
    dpr: clamp(source.dpr, 1, 4, preset.dpr),
    gpuVendor: String(source.gpuVendor || preset.gpuVendor).slice(0, 40),
    gpuRenderer: String(source.gpuRenderer || preset.gpuRenderer).slice(0, 120),
    cpu: Math.round(clamp(source.cpu, 2, 32, preset.cpu)),
    ram: Math.round(clamp(source.ram, 2, 32, preset.ram)),
  };
}

module.exports = { ANDROID_DEVICES, DEFAULT_ANDROID, normalizeAndroid };
