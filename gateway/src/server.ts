import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createConnection, type Socket } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { Accounts, PublicError, type Account } from './accounts.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.env.PORT ?? 8080);
const pikePort = Number(process.env.PIKE_PORT ?? 15318);
const origin = process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const host = '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(pikePort) || pikePort < 1 || pikePort > 65535)
  throw new Error('Invalid PORT or PIKE_PORT');
if (!/^https?:\/\/[^/]+$/.test(origin)) throw new Error('PUBLIC_ORIGIN must be a single HTTP(S) origin');
const secureCookie = origin.startsWith('https://');
const accounts = new Accounts(process.env.PRIVATE_DIR ?? resolve(root, 'private'),
  process.env.PIKE_PLAYERS_DIR ?? resolve(root, '.runtime/pike/players'),
  process.env.LEGACY_PLAYERS_DIR ?? resolve(root, 'Server/players'));
const peers = new Map<number, WebSocket>();
const attempts = new Map<string, { count: number; since: number }>();

function cookie(req: IncomingMessage): string | undefined {
  return req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('ps2mud_session='))?.slice(15);
}

function send(res: ServerResponse, status: number, body: object, extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(JSON.stringify(body));
}

function setCookie(token: string): string {
  return `ps2mud_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secureCookie ? '; Secure' : ''}`;
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
    throw new PublicError(415, 'Expected application/json');
  let text = '';
  for await (const chunk of req) {
    text += chunk.toString('utf8');
    if (text.length > 4096) throw new PublicError(413, 'Request too large');
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new PublicError(400, 'Invalid JSON object'); }
}

function limit(req: IncomingMessage): void {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.since > 60_000) { attempts.set(ip, { count: 1, since: now }); return; }
  if (++entry.count > 20) throw new PublicError(429, 'Too many attempts');
}

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? '/', origin).pathname;
    if (req.method === 'GET' && path === '/health') { send(res, 200, { ok: true }); return; }
    if (req.method === 'GET' && path === '/api/me') {
      const account = accounts.session(cookie(req));
      if (!account) throw new PublicError(401, 'Not signed in');
      send(res, 200, { account }); return;
    }
    if (req.method !== 'POST' || !['/api/register', '/api/login', '/api/logout'].includes(path))
      throw new PublicError(404, 'Not found');
    if (req.headers.origin !== origin) throw new PublicError(403, 'Invalid origin');
    if (path === '/api/logout') {
      const token = cookie(req);
      const account = accounts.session(token);
      accounts.logout(token);
      if (account) peers.get(account.id)?.close(1000, 'Signed out');
      send(res, 200, { ok: true }, { 'Set-Cookie': setCookie('') + '; Max-Age=0' }); return;
    }
    limit(req);
    const input = await body(req);
    if (typeof input.name !== 'string' || typeof input.password !== 'string')
      throw new PublicError(400, 'Name and password are required');
    const result = path === '/api/register'
      ? await accounts.register(input.name, input.password, input.gender as number)
      : await accounts.login(input.name, input.password);
    send(res, path === '/api/register' ? 201 : 200, { account: result.account },
      { 'Set-Cookie': setCookie(result.token) });
  } catch (error) {
    if (error instanceof PublicError) send(res, error.status, { error: error.message });
    else { console.error('HTTP request failed', error); send(res, 500, { error: 'Internal error' }); }
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', origin).pathname;
  const account = accounts.session(cookie(req));
  if (path !== '/api/game' || req.headers.origin !== origin || !account) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, ws => bridge(ws, account));
});

function bridge(ws: WebSocket, account: Account): void {
  peers.get(account.id)?.close(1000, 'Replaced by new connection');
  peers.set(account.id, ws);
  let upstream: Socket;
  let authenticated = false;
  let pending = '';
  upstream = createConnection({ host, port: pikePort });
  upstream.setTimeout(30_000, () => { if (!authenticated) upstream.destroy(new Error('Pike login timeout')); });
  upstream.on('connect', () => upstream.write(`login ${account.name} ${accounts.pikeCredential(account)}\n`));
  upstream.on('data', chunk => {
    pending += chunk.toString('utf8');
    if (pending.length > 1_000_000) { upstream.destroy(new Error('Pike response too large')); return; }
    let end: number;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end).replace(/\r$/, '');
      pending = pending.slice(end + 1);
      if (line.startsWith('987 ')) { ws.close(1011, 'Pike login failed'); upstream.end(); return; }
      if (line.startsWith('000 Welcome')) { authenticated = true; upstream.setTimeout(0); }
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 1_000_000) { ws.close(1009, 'Client too slow'); upstream.destroy(); return; }
      ws.send(JSON.stringify({ type: 'line', line }));
    }
  });
  upstream.on('error', error => { console.error('Pike connection failed', error.message); ws.close(1011, 'World unavailable'); });
  upstream.on('close', () => { if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'World disconnected'); });
  ws.on('message', (data, binary) => {
    if (binary) { ws.close(1003, 'Text required'); return; }
    let input: unknown;
    try { input = JSON.parse(data.toString()); } catch { ws.close(1007, 'Invalid JSON'); return; }
    if (!input || typeof input !== 'object' || !('type' in input) || !('line' in input) ||
        input.type !== 'command' || typeof input.line !== 'string' ||
        input.line.length > 1024 || /[\r\n\x00-\x1f]/.test(input.line) ||
        /^login(?:\s|$)/i.test(input.line)) {
      ws.close(1008, 'Invalid command'); return;
    }
    if (!authenticated) { ws.send(JSON.stringify({ type: 'error', error: 'World login pending' })); return; }
    if (!upstream.write(`${input.line}\n`)) ws.close(1013, 'World busy');
  });
  ws.on('close', () => { upstream.destroy(); if (peers.get(account.id) === ws) peers.delete(account.id); });
  ws.on('error', () => upstream.destroy());
}

server.listen(port, host, () => console.log(`Gateway listening on ${host}:${port} for ${origin}`));
