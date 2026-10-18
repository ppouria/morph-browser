const fs = require('node:fs');
const { once } = require('node:events');

// Streams a URL to disk, resuming a partial file when the server supports ranges.
async function request(url, headers) {
  // One retry covers the common case where the first connection picks an unreachable address.
  try {
    return await fetch(url, { headers, redirect: 'follow' });
  } catch {
    return fetch(url, { headers, redirect: 'follow' });
  }
}

async function downloadFile(url, dest, { onProgress = () => {}, headers = {} } = {}) {
  const have = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  const response = await request(url, { ...headers, ...(have ? { Range: `bytes=${have}-` } : {}) });

  if (response.status === 416) {
    fs.rmSync(dest, { force: true });
    throw new Error('The partial download was rejected; try again');
  }
  if (response.status === 403) {
    // Google Storage answers this way when a location or network is blocked.
    throw new Error('The download was refused (HTTP 403). The host may be blocking this network or location; try a proxy or another kernel.');
  }
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);

  const resumed = response.status === 206;
  const total = (resumed ? have : 0) + (Number(response.headers.get('content-length')) || 0);
  const out = fs.createWriteStream(dest, { flags: resumed ? 'a' : 'w' });
  let downloaded = resumed ? have : 0;
  for await (const chunk of response.body) {
    downloaded += chunk.length;
    if (!out.write(chunk)) await once(out, 'drain');
    onProgress(downloaded, total);
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  return dest;
}

module.exports = { downloadFile };
