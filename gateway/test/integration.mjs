import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';

const base = process.env.TEST_ORIGIN ?? 'http://localhost:8080';
const name = `Test${randomBytes(4).toString('hex')}`;
const password = randomBytes(24).toString('base64url');

async function post(path, data, cookie) {
  return fetch(base + path, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(data),
  });
}

const registered = await post('/api/register', { name, password, gender: 1 });
if (registered.status !== 201) throw new Error(`Registration failed: ${registered.status} ${await registered.text()}`);
const cookie = registered.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Missing session cookie');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const player = readFileSync(resolve(root, `.runtime/pike/players/${name}.o`), 'utf8');
if (player.includes(password) || !/^password=[a-f0-9]{64}$/m.test(player))
  throw new Error('Pike file contains the user password or lacks a private credential');
if (!player.includes('model=brwm.ani\ntexture=woman8_.tm2\n'))
  throw new Error('New character does not use the converted original appearance');
const database = new DatabaseSync(resolve(root, 'private/accounts.sqlite'));
const row = database.prepare('SELECT password_hash FROM accounts WHERE name=?').get(name);
database.close();
if (!row || typeof row.password_hash !== 'string' || !row.password_hash.startsWith('$argon2id$'))
  throw new Error('Account password was not hashed with Argon2id');
const me = await fetch(base + '/api/me', { headers: { Cookie: cookie } });
if (me.status !== 200 || (await me.json()).account.name !== name) throw new Error('Session lookup failed');
const badLogin = await post('/api/login', { name, password: 'incorrect password' });
if (badLogin.status !== 401) throw new Error('Wrong password accepted');
const goodLogin = await post('/api/login', { name, password });
if (goodLogin.status !== 200) throw new Error(`Login failed: ${goodLogin.status}`);

const ws = new WebSocket(base.replace(/^http/, 'ws') + '/api/game', { headers: { Origin: base, Cookie: cookie } });
const codes = new Set();
const churchObjects = new Set();
let startPosition;
let moved = false;
const directions = ['north', 'east', 'south', 'west'];
let nextDirection = 0;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Game timed out before a valid move')), 10_000);
  ws.on('error', reject);
  ws.on('close', code => reject(new Error(`Game closed: ${code}`)));
  ws.on('message', raw => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'line') return;
    codes.add(message.line.slice(0, 3));
    const churchObject = /^(?:003 LOCATE|019 ROTATE) (longhand|shorthand|door1|door2|door3|elevator) /.exec(message.line);
    if (churchObject) churchObjects.add(churchObject[1]);
    const location = /^003 LOCATE (\S+) X (-?\d+) Y (-?\d+) Z (-?\d+)$/.exec(message.line);
    if (location?.[1] === name) {
      const position = `${location[2]},${location[4]}`;
      if (startPosition === undefined) startPosition = position;
      else if (position !== startPosition) moved = true;
    }
    if (message.line.startsWith('000 Welcome')) {
      ws.send(JSON.stringify({ type: 'command', line: `move ${directions[nextDirection++]}` }));
    }
    if (message.line.startsWith('997 ') && nextDirection < directions.length)
      ws.send(JSON.stringify({ type: 'command', line: `move ${directions[nextDirection++]}` }));
    if (moved && codes.has('005') && codes.has('002') && codes.has('000')) {
      clearTimeout(timer); resolve();
    }
  });
});
ws.close();
if (!codes.has('005') || !codes.has('002') || !codes.has('000') || !moved) throw new Error('Missing room, welcome, or movement update');
for (const name of ['longhand', 'shorthand', 'door1', 'door2', 'door3', 'elevator'])
  if (!churchObjects.has(name)) throw new Error(`Missing church update for ${name}`);
const forbidden = new WebSocket(base.replace(/^http/, 'ws') + '/api/game', { headers: { Origin: base, Cookie: cookie } });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Login-command guard timed out')), 10_000);
  forbidden.on('error', reject);
  forbidden.on('open', () => forbidden.send(JSON.stringify({ type: 'command', line: 'login another secret' })));
  forbidden.on('close', code => {
    clearTimeout(timer);
    if (code === 1008) resolve(); else reject(new Error(`Expected policy close, got ${code}`));
  });
});
const logout = await post('/api/logout', {}, cookie);
if (logout.status !== 200) throw new Error('Logout failed');
const after = await fetch(base + '/api/me', { headers: { Cookie: cookie } });
if (after.status !== 401) throw new Error('Session survived logout');
console.log('registration, Argon2 storage, private Pike credential, session, church clock and elevator snapshot, authoritative movement, login guard, logout: OK');
