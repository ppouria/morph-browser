const http = require('node:http');
const net = require('node:net');
const tls = require('node:tls');
const { SocksClient } = require('socks');

const DEFAULT_TIMEOUT = 20000;

function hostPort(host, port) {
  return net.isIPv6(host) ? `[${host}]:${port}` : `${host}:${port}`;
}

function splitHostPort(value) {
  const text = String(value || '');
  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    return { host: text.slice(1, end), port: Number(text.slice(end + 2)) };
  }
  const index = text.lastIndexOf(':');
  return { host: text.slice(0, index), port: Number(text.slice(index + 1)) };
}

function authHeader(proxy) {
  if (!proxy || !proxy.username) return null;
  return `Basic ${Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64')}`;
}

function tcpConnect(host, port, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const fail = (err) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeout, () => fail(new Error(`connection to ${hostPort(host, port)} timed out`)));
    socket.once('connect', () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once('error', fail);
  });
}

function tlsWrap(socket, host, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host, rejectUnauthorized: false });
    secure.setTimeout(timeout, () => {
      secure.destroy();
      reject(new Error(`TLS handshake with ${host} timed out`));
    });
    secure.once('secureConnect', () => {
      secure.setTimeout(0);
      resolve(secure);
    });
    secure.once('error', reject);
  });
}

// Reads one HTTP response head and puts any bytes after it back on the socket, so the tunnel that
// follows starts at the right byte.
function readHead(socket, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const finish = (err, head) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.setTimeout(0);
      if (err) reject(err);
      else resolve(head);
    };
    const onError = (err) => finish(err);
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const index = buffer.indexOf('\r\n\r\n');
      if (index === -1) {
        if (buffer.length > 65536) finish(new Error('proxy response head is too large'));
        return;
      }
      const rest = buffer.subarray(index + 4);
      if (rest.length) socket.unshift(rest);
      finish(null, buffer.subarray(0, index).toString('latin1'));
    };
    const timer = setTimeout(() => finish(new Error('proxy response timed out')), timeout);
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

async function httpTunnel(proxy, host, port, timeout = DEFAULT_TIMEOUT) {
  let socket = await tcpConnect(proxy.host, proxy.port, timeout);
  try {
    if (proxy.type === 'https') socket = await tlsWrap(socket, proxy.host, timeout);
    await sendConnect(socket, proxy, host, port, timeout);
    return socket;
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

async function sendConnect(socket, proxy, host, port, timeout = DEFAULT_TIMEOUT) {
  const target = hostPort(host, port);
  const auth = authHeader(proxy);
  const lines = [`CONNECT ${target} HTTP/1.1`, `Host: ${target}`, 'Proxy-Connection: Keep-Alive'];
  if (auth) lines.push(`Proxy-Authorization: ${auth}`);
  socket.write(`${lines.join('\r\n')}\r\n\r\n`);
  const head = await readHead(socket, timeout);
  const match = /^HTTP\/1\.[01]\s+(\d{3})/.exec(head);
  if (!match) throw new Error('the proxy sent an invalid response');
  if (match[1] !== '200') throw new Error(`the proxy refused the tunnel with HTTP ${match[1]}`);
}

async function socksTunnel(proxy, host, port, { timeout = DEFAULT_TIMEOUT, socket = null } = {}) {
  const options = {
    proxy: {
      host: proxy.host,
      port: proxy.port,
      type: 5,
      ...(proxy.username ? { userId: proxy.username, password: proxy.password || '' } : {}),
    },
    destination: { host, port },
    command: 'connect',
    timeout,
  };
  if (socket) options.existing_socket = socket;
  const info = await SocksClient.createConnection(options);
  return info.socket;
}

async function proxyOnSocket(proxy, socket, host, port, timeout = DEFAULT_TIMEOUT) {
  if (proxy.type === 'socks5') return socksTunnel(proxy, host, port, { timeout, socket });
  let stream = socket;
  if (proxy.type === 'https') stream = await tlsWrap(stream, proxy.host, timeout);
  await sendConnect(stream, proxy, host, port, timeout);
  return stream;
}

async function tunnelVia(proxy, host, port, timeout = DEFAULT_TIMEOUT) {
  if (proxy.type === 'socks5') return socksTunnel(proxy, host, port, { timeout });
  return httpTunnel(proxy, host, port, timeout);
}

// Opens a tunnel to host:port through the profile proxy, and through the app-wide proxy first when
// one is configured. The order is: this app -> upstream proxy -> profile proxy -> destination.
async function chainTunnel(upstream, proxy, host, port, timeout = DEFAULT_TIMEOUT) {
  if (!upstream) {
    if (!proxy) return tcpConnect(host, port, timeout);
    return tunnelVia(proxy, host, port, timeout);
  }
  if (!proxy) return tunnelVia(upstream, host, port, timeout);
  const hop = await tunnelVia(upstream, proxy.host, proxy.port, timeout);
  try {
    return await proxyOnSocket(proxy, hop, host, port, timeout);
  } catch (err) {
    hop.destroy();
    throw err;
  }
}

function cleanHeaders(input, { proxyAuth, host }) {
  const headers = { ...input };
  delete headers['proxy-connection'];
  delete headers['proxy-authorization'];
  headers.host = host;
  headers.connection = 'close';
  if (proxyAuth) {
    const auth = authHeader(proxyAuth);
    if (auth) headers['proxy-authorization'] = auth;
  }
  return headers;
}

function sendGatewayError(res, err) {
  if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
  res.end(`proxy chain error: ${err.message}`);
}

// A local HTTP proxy that forwards every request through the app proxy and then the profile proxy.
function startChain(upstream, proxy, { timeout = DEFAULT_TIMEOUT } = {}) {
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    return socket;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const absolute = /^https?:\/\//i.test(req.url || '');
      const target = new URL(absolute ? req.url : `http://${req.headers.host}${req.url}`);
      const port = Number(target.port) || 80;
      const destination = { host: target.hostname, port };

      if (proxy && proxy.type !== 'socks5') {
        const hop = upstream
          ? await tunnelVia(upstream, proxy.host, proxy.port, timeout)
          : await tcpConnect(proxy.host, proxy.port, timeout);
        const stream = proxy.type === 'https'
          ? await tlsWrap(track(hop), proxy.host, timeout)
          : track(hop);
        const headers = cleanHeaders(req.headers, { proxyAuth: proxy, host: target.host });
        const upstreamReq = http.request({
          method: req.method,
          host: proxy.host,
          port: proxy.port,
          path: target.href,
          headers,
          agent: false,
          createConnection: () => stream,
        }, (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
          upstreamRes.pipe(res);
        });
        upstreamReq.on('error', (err) => sendGatewayError(res, err));
        req.pipe(upstreamReq);
        return;
      }

      const tunnel = await chainTunnel(upstream, proxy, destination.host, destination.port, timeout);
      track(tunnel);
      const headers = cleanHeaders(req.headers, { host: target.host });
      const upstreamReq = http.request({
        method: req.method,
        host: destination.host,
        port: destination.port,
        path: `${target.pathname}${target.search}`,
        headers,
        agent: false,
        createConnection: () => tunnel,
      }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(res);
      });
      upstreamReq.on('error', (err) => sendGatewayError(res, err));
      req.pipe(upstreamReq);
    } catch (err) {
      sendGatewayError(res, err);
    }
  });

  server.on('connect', async (req, client, head) => {
    track(client);
    try {
      const { host, port } = splitHostPort(req.url);
      const tunnel = await chainTunnel(upstream, proxy, host, port, timeout);
      track(tunnel);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) tunnel.write(head);
      client.pipe(tunnel);
      tunnel.pipe(client);
      client.on('error', () => tunnel.destroy());
      tunnel.on('error', () => client.destroy());
    } catch (err) {
      client.end(`HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n${err.message}`);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        proxyServer: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => {
          for (const socket of sockets) socket.destroy();
          server.close(() => done());
        }),
      });
    });
  });
}

module.exports = { startChain, chainTunnel, httpTunnel, tlsWrap, splitHostPort };
