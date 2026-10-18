const fs = require('node:fs');
const { once } = require('node:events');

// Streams a URL to disk, resuming a partial file when the server supports ranges.
async function downloadFile(url, dest, { onProgress = () => {}, headers = {} } = {}) {
  const have = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  const response = await fetch(url, {
    headers: { ...headers, ...(have ? { Range: `bytes=${have}-` } : {}) },
    redirect: 'follow',
  });

  if (response.status === 416) {
    fs.rmSync(dest, { force: true });
    throw new Error('The partial download was rejected; try again');
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
