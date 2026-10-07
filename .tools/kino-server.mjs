#!/usr/bin/env node
// Local fork server (not part of upstream): the static game files plus a small
// account API for saving progress, with Discord sign-in (OAuth2 code flow).
//   node .tools/kino-server.mjs [port]
// Environment:
//   KINO_HOME         page served at "/" (default home.html)
//   KINO_DATA         directory for profiles and sessions (default ~/.local/share/kino)
//   DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET  from the Discord developer portal;
//                     sign-in is disabled without them (keep the secret out of git)
//   KINO_PUBLIC_URL   public https address, used for the OAuth redirect
import { createReadStream, statSync, mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { extname, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..', 'export', 'web');
const PORT = Number(process.argv[2]) || 5190;
const HOME = '/' + (process.env.KINO_HOME || 'home.html').replace(/^\/+/, '');
const DATA = resolve(process.env.KINO_DATA || join(homedir(), '.local', 'share', 'kino'));
const DISCORD_ID = process.env.DISCORD_CLIENT_ID || '', DISCORD_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const PUBLIC_URL = (process.env.KINO_PUBLIC_URL || '').replace(/\/$/, '');
const ENABLED = !!(DISCORD_ID && DISCORD_SECRET && PUBLIC_URL);
const REDIRECT = PUBLIC_URL + '/api/auth/discord/callback';
const SESSION_DAYS = 90, MAX_BODY = 256 * 1024;
mkdirSync(join(DATA, 'profiles'), { recursive: true });

const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.webp':'image/webp','.wasm':'application/wasm','.yml':'text/yaml; charset=utf-8','.wav':'audio/wav','.ogg':'audio/ogg',
  '.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};

// ---- Storage (small JSON files, written atomically) -------------------------
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, value) => { const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(value)); renameSync(tmp, file); };
// Map rewards (profile.rewards, e.g. the Cheese Cube camo) only ever get added: an upload from a tab with an older copy
// keeps the ones already saved.
function keepRewards(doc, old) {
  const K = 'kino.mods.progression';
  try {
    const was = JSON.parse(old?.keys?.[K] ?? '{}').rewards; if (!was || !doc.keys?.[K]) return;
    const p = JSON.parse(doc.keys[K]); p.rewards = { ...was, ...p.rewards }; doc.keys[K] = JSON.stringify(p);
  } catch {}
}
const SESSIONS = join(DATA, 'sessions.json');
const sessions = new Map(Object.entries(readJson(SESSIONS, {})));
const saveSessions = () => writeJson(SESSIONS, Object.fromEntries(sessions));
const userFile = sub => join(DATA, 'profiles', createHash('sha256').update(String(sub)).digest('hex').slice(0, 32) + '.json');

// ---- Discord OAuth2 ------------------------------------------------------------
async function discordUser(code) {
  const token = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: DISCORD_ID, client_secret: DISCORD_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT }) });
  if (!token.ok) throw new Error('token exchange HTTP ' + token.status);
  const { access_token } = await token.json();
  const me = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: 'Bearer ' + access_token } });
  if (!me.ok) throw new Error('user lookup HTTP ' + me.status);
  const u = await me.json();
  return { sub: 'discord:' + u.id, name: u.global_name || u.username, username: u.username,
    picture: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id) >> 22n) % 6n}.png` };
}

// ---- HTTP helpers ------------------------------------------------------------
const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const secure = req => req.headers['x-forwarded-proto'] === 'https' || /"scheme":"https"/.test(req.headers['cf-visitor'] || '');
function body(req) {
  return new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { fail(new Error('invalid JSON')); } });
    req.on('error', fail);
  });
}
function session(req) {
  const id = cookies(req).kino_session, s = id && sessions.get(id);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(id); saveSessions(); return null; }
  return { id, ...s };
}

async function api(req, res, url) {
  // Cross-site writes are refused; the game only calls its own origin.
  if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: 'cross-origin request' });
  if (url === '/api/config' && req.method === 'GET') return send(res, 200, { signIn: ENABLED ? 'discord' : null, publicUrl: PUBLIC_URL || null });
  if (url === '/api/me' && req.method === 'GET') {
    const s = session(req); if (s) remember(s);
    return send(res, 200, s ? { signedIn: true, name: s.name, picture: s.picture, username: s.username || null, id: pubId(s.sub) } : { signedIn: false });
  }
  // Step 1: send the player to Discord with a one-time state value.
  if (url === '/api/auth/discord' && req.method === 'GET') {
    if (!ENABLED) return send(res, 503, { error: 'Discord sign-in is not configured on this server' });
    const state = randomBytes(18).toString('base64url');
    const to = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({ client_id: DISCORD_ID, response_type: 'code', redirect_uri: REDIRECT, scope: 'identify', state, prompt: 'none' });
    res.writeHead(302, { Location: to, 'Set-Cookie': `kino_oauth=${state}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure(req) ? '; Secure' : ''}`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  // Step 2: Discord sends them back with a code; check state, exchange, start a session.
  if (url === '/api/auth/discord/callback' && req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams, back = (msg) => { res.writeHead(302, { Location: '/' + (msg ? '?signin=' + encodeURIComponent(msg) : ''), 'Set-Cookie': 'kino_oauth=; Path=/api/auth; Max-Age=0', 'Cache-Control': 'no-store' }); res.end(); };
    if (q.get('error')) return back('cancelled');
    if (!q.get('code') || !q.get('state') || q.get('state') !== cookies(req).kino_oauth) return back('expired');
    let user; try { user = await discordUser(q.get('code')); } catch (e) { console.error('discord sign-in:', e.message); return back('failed'); }
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, { ...user, expires: Date.now() + SESSION_DAYS * 864e5 }); saveSessions();
    res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store', 'Set-Cookie': [
      `kino_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure(req) ? '; Secure' : ''}`, 'kino_oauth=; Path=/api/auth; Max-Age=0'] });
    return res.end();
  }
  if (url === '/api/auth/logout' && req.method === 'POST') {
    const s = session(req); if (s) { sessions.delete(s.id); saveSessions(); }
    return send(res, 200, { signedIn: false }, { 'Set-Cookie': 'kino_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }
  if (url.startsWith('/api/rooms/') && req.method === 'GET') {
    const room = rooms.get(url.slice(11).toUpperCase());
    return room ? send(res, 200, { code: room.code, page: room.page, map: room.map, players: room.players.size, max: MAX_PLAYERS }) : send(res, 404, { error: 'No game with that code' });
  }
  if (url === '/api/profile') {
    const s = session(req); if (!s) return send(res, 401, { error: 'not signed in' });
    const file = userFile(s.sub);
    if (req.method === 'GET') return send(res, 200, existsSync(file) ? readJson(file, {}) : {});
    if (req.method === 'PUT') {
      let doc; try { doc = await body(req); } catch (e) { return send(res, 400, { error: e.message }); }
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return send(res, 400, { error: 'expected an object' });
      keepRewards(doc, readJson(file, {}));
      writeJson(file, { ...doc, account: { name: s.name, id: s.sub }, savedAt: Date.now() });
      return send(res, 200, { ok: true });
    }
  }
  if (url.startsWith('/api/social')) return socialApi(req, res, url);
  return send(res, 404, { error: 'unknown endpoint' });
}

// ---- Friends ------------------------------------------------------------------
// social.json: users {sub: {name, username, picture, pid, seen}}, friends {sub: [sub]}, requests {toSub: [fromSub]}.
// Players are addressed by `pid`, a hash of their account (Discord ids stay on the server). Presence comes from the
// social socket (/api/social/ws) that the menu and game pages keep open while signed in: online (menu) or in game
// (map, co-op room). Changes are pushed to friends: {t:'presence'|'request'|'friends'|'invite'}.
const SOCIAL = join(DATA, 'social.json');
const social = readJson(SOCIAL, { users: {}, friends: {}, requests: {} });
let socialTimer = 0; const saveSocial = () => { clearTimeout(socialTimer); socialTimer = setTimeout(() => writeJson(SOCIAL, social), 300); };
const pubId = sub => createHash('sha256').update('kino-friend:' + sub).digest('base64url').slice(0, 12);
function remember(s) {
  const u = social.users[s.sub] ??= {}, before = JSON.stringify(u);
  Object.assign(u, { name: s.name, picture: s.picture, pid: pubId(s.sub) }); if (s.username) u.username = s.username;
  if (JSON.stringify(u) !== before) saveSocial();
}
const subOf = pid => Object.keys(social.users).find(k => social.users[k].pid === pid);
const friendsOf = sub => social.friends[sub] ??= [];
const presence = new Map();   // sub -> Set of {sock, status}
function statusOf(sub) {
  const conns = [...(presence.get(sub) ?? [])];
  if (!conns.length) return { status: 'offline', seen: social.users[sub]?.seen ?? null };
  const g = conns.map(c => c.status).find(x => x.status === 'game');
  if (!g) return { status: 'online', where: conns.some(c => c.status.status === 'menu') ? 'menu' : 'launcher' };   // launcher: the Rind desktop app
  const room = g.room && rooms.get(g.room);
  return { status: 'game', map: g.mapName || g.map || null, room: room ? room.code : null, page: room ? room.page : null,
    players: room ? room.players.size : null, joinable: !!room && room.players.size < MAX_PLAYERS };
}
const view = sub => { const u = social.users[sub] ?? {}; return { id: u.pid, name: u.name, username: u.username ?? null, picture: u.picture, ...statusOf(sub) }; };
const push = (sub, msg) => { for (const c of presence.get(sub) ?? []) wsSend(c.sock, msg); };
const notifyFriends = sub => { const v = view(sub); for (const f of friendsOf(sub)) push(f, { t: 'presence', friend: v }); };
function socialState(sub) {
  return { me: view(sub), friends: friendsOf(sub).map(view), incoming: (social.requests[sub] ?? []).map(view),
    outgoing: Object.entries(social.requests).filter(([, from]) => from.includes(sub)).map(([to]) => view(to)) };
}
function findUser(q, self) {
  q = String(q || '').trim().replace(/^@/, '').toLowerCase(); if (!q) return null;
  const all = Object.entries(social.users).filter(([k]) => k !== self);
  const by = f => all.filter(([, u]) => f(u));
  for (const list of [by(u => u.pid?.toLowerCase() === q), by(u => u.username?.toLowerCase() === q), by(u => u.name?.toLowerCase() === q)])
    if (list.length === 1) return list[0][0]; else if (list.length > 1) return 'many';
  return null;
}
function befriend(a, b) {
  if (!friendsOf(a).includes(b)) friendsOf(a).push(b); if (!friendsOf(b).includes(a)) friendsOf(b).push(a);
  for (const [x, y] of [[a, b], [b, a]]) social.requests[x] = (social.requests[x] ?? []).filter(f => f !== y);
  saveSocial(); push(a, { t: 'friends' }); push(b, { t: 'friends' });
}
async function socialApi(req, res, url) {
  const s = session(req); if (!s) return send(res, 401, { error: 'Sign in to use friends' });
  remember(s); const me = s.sub;
  if (url === '/api/social' && req.method === 'GET') return send(res, 200, socialState(me));
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  let b; try { b = await body(req); } catch (e) { return send(res, 400, { error: e.message }); }
  const other = b.id ? subOf(String(b.id)) : null;
  if (url === '/api/social/request') {
    const to = b.id ? other : findUser(b.name, me);
    if (to === 'many') return send(res, 409, { error: 'Several players have that name: use their username' });
    if (!to || to === me) return send(res, 404, { error: 'No player with that name has signed in here' });
    if (friendsOf(me).includes(to)) return send(res, 200, { ok: true, already: true, ...socialState(me) });
    if ((social.requests[me] ?? []).includes(to)) { befriend(me, to); return send(res, 200, { ok: true, accepted: true, ...socialState(me) }); }   // they asked first
    const list = social.requests[to] ??= []; if (!list.includes(me)) list.push(me);
    saveSocial(); push(to, { t: 'request', from: view(me) });
    return send(res, 200, { ok: true, ...socialState(me) });
  }
  if (!other) return send(res, 404, { error: 'Unknown player' });
  if (url === '/api/social/accept') { if (!(social.requests[me] ?? []).includes(other)) return send(res, 404, { error: 'No request from them' }); befriend(me, other); return send(res, 200, socialState(me)); }
  if (url === '/api/social/decline') { social.requests[me] = (social.requests[me] ?? []).filter(f => f !== other); saveSocial(); return send(res, 200, socialState(me)); }
  if (url === '/api/social/cancel') { social.requests[other] = (social.requests[other] ?? []).filter(f => f !== me); saveSocial(); push(other, { t: 'friends' }); return send(res, 200, socialState(me)); }
  if (url === '/api/social/remove') {
    social.friends[me] = friendsOf(me).filter(f => f !== other); social.friends[other] = friendsOf(other).filter(f => f !== me);
    saveSocial(); push(other, { t: 'friends' }); return send(res, 200, socialState(me));
  }
  if (url === '/api/social/invite') {
    if (!friendsOf(me).includes(other)) return send(res, 403, { error: 'Only friends can be invited' });
    const room = rooms.get(String(b.room || '').toUpperCase()); if (!room) return send(res, 404, { error: 'Start or join a co-op game first' });
    if (!presence.get(other)?.size) return send(res, 409, { error: 'They are offline' });
    push(other, { t: 'invite', from: view(me), room: room.code, page: room.page, map: String(b.map || room.map || '').slice(0, 64) });
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'unknown endpoint' });
}
function onSocialSocket(req, sock) {
  const s = session(req); if (!s) { sock.destroy(); return; }
  remember(s);
  const conn = { sock, status: { status: 'menu' } }, sub = s.sub;
  if (!presence.has(sub)) presence.set(sub, new Set());
  const wasOffline = !presence.get(sub).size; presence.get(sub).add(conn);
  sock.setNoDelay(true);
  const ping = setInterval(() => { if (!sock.destroyed) sock.write(Buffer.from([0x89, 0])); }, 25000);
  wsSend(sock, { t: 'state', ...socialState(sub) });
  if (wasOffline) notifyFriends(sub);
  sock.on('close', () => {
    clearInterval(ping); const set = presence.get(sub); set?.delete(conn);
    if (!set?.size) { presence.delete(sub); (social.users[sub] ??= {}).seen = Date.now(); saveSocial(); }
    notifyFriends(sub);
  });
  sock.on('error', () => {});
  wsFrames(sock, msg => {
    if (msg.t !== 'status') return;
    conn.status = { status: ['game', 'launcher'].includes(msg.status) ? msg.status : 'menu', map: String(msg.map || '').slice(0, 64), mapName: String(msg.mapName || '').slice(0, 64), room: String(msg.room || '').slice(0, 8).toUpperCase() };
    notifyFriends(sub);
  });
}

// Code and data must never go stale (Cloudflare rewrites "no-cache" into a
// 4-hour browser cache, but leaves "no-store" alone). Heavy assets such as
// meshes, textures and audio are cached for a day.
const cacheControl = path => /\.(html|m?js|css|json|md|txt|ya?ml)$/i.test(path) ? 'no-store' : 'public, max-age=86400';

function serveFile(req, res, url) {
  if (url === '/favicon.ico') { res.writeHead(204).end(); return; }
  let path = resolve(ROOT, '.' + (url === '/' ? HOME : url).replace(/\\/g, '/'));
  if (!path.toLowerCase().startsWith((ROOT + sep).toLowerCase())) { res.writeHead(403).end('forbidden'); return; }
  // a folder serves its index.html (e.g. /rind/, the launcher's download page); without the slash, redirect to it
  try { if (statSync(path).isDirectory()) { if (!url.endsWith('/')) { res.writeHead(301, { Location: url + '/', 'Cache-Control': 'no-store' }).end(); return; } path = join(path, 'index.html'); } } catch {}
  let stat; try { stat = statSync(path); if (!stat.isFile()) throw 0; } catch { res.writeHead(404).end('not found'); return; }
  const type = TYPES[extname(path).toLowerCase()] || 'application/octet-stream', range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = m?.[1] ? Number(m[1]) : m?.[2] ? Math.max(0, stat.size - Number(m[2])) : NaN;
    const end = m?.[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': cacheControl(path) });
    if (req.method === 'HEAD') res.end(); else createReadStream(path, { start, end }).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Last-Modified': stat.mtime.toUTCString(), 'Cache-Control': cacheControl(path) });
  if (req.method === 'HEAD') res.end(); else createReadStream(path).on('error', () => res.destroy()).pipe(res);
}

// ---- Co-op rooms over WebSocket (minimal RFC 6455, text frames only) --------
// The host's browser runs the game; the server only relays messages:
//   {t:'to', target:'host'|'all'|<id>, data}  ->  {t:'msg', from, data}
const MAX_PLAYERS = 4, MAX_FRAME = 256 * 1024, rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => { let c; do c = Array.from(randomBytes(4), b => CODE_CHARS[b % CODE_CHARS.length]).join(''); while (rooms.has(c)); return c; };
function wsSend(sock, obj) {
  if (sock.destroyed) return;
  const data = Buffer.from(JSON.stringify(obj)), n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])]);
  sock.write(Buffer.concat([head, data]));
}
function wsFrames(sock, onText) {
  let buf = Buffer.alloc(0);
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_FRAME || !masked) { sock.destroy(); return; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), payload = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 8) { sock.end(Buffer.from([0x88, 0])); return; }
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op === 1) { try { onText(JSON.parse(payload.toString('utf8'))); } catch {} }
    }
  });
}
function leave(client) {
  const room = client.room; if (!room) return; client.room = null;
  room.players.delete(client.id);
  if (!room.players.size) { rooms.delete(room.code); if (client.sub) notifyFriends(client.sub); return; }
  for (const p of [client, ...room.players.values()]) if (p.sub) notifyFriends(p.sub);
  // The host runs the game; if it leaves, the longest-connected player takes over.
  if (room.host === client.id) room.host = room.players.keys().next().value;
  for (const p of room.players.values()) wsSend(p.sock, { t: 'left', id: client.id, host: room.host });
}
const publicPlayer = p => ({ id: p.id, name: p.name, character: p.character, variants: p.variants, uid: p.uid ?? null, picture: p.picture ?? null });   // picture: their Discord avatar (signed in)   // uid: the account's friend id (signed in)
// A player's customisation picks for their character ({group: option id}, characters.json `variants`), kept small.
const cleanVariants = v => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out = {};
  for (const [k, x] of Object.entries(v).slice(0, 32)) if (typeof x === 'string') out[String(k).slice(0, 32)] = x.slice(0, 32);
  return out;
};
let clientSerial = 0;
function onSocket(req, sock) {
  const s = session(req), client = { id: 'p' + (++clientSerial), sock, room: null, name: s?.name || 'Guest ' + (clientSerial % 1000), character: 'mannequin', uid: s ? pubId(s.sub) : null, sub: s?.sub ?? null, picture: s?.picture ?? null };
  if (s) remember(s);
  sock.setNoDelay(true);
  const ping = setInterval(() => { if (!sock.destroyed) sock.write(Buffer.from([0x89, 0])); }, 25000);
  sock.on('close', () => { clearInterval(ping); leave(client); });
  sock.on('error', () => {});
  wsFrames(sock, msg => {
    if (msg.t === 'create' || msg.t === 'join') {
      leave(client);
      client.character = String(msg.character || 'mannequin').slice(0, 64);
      client.variants = cleanVariants(msg.variants);
      let room;
      if (msg.t === 'create') {
        room = { code: newCode(), host: client.id, page: String(msg.page || '/').slice(0, 300), map: String(msg.map || '').slice(0, 64), players: new Map() };
        rooms.set(room.code, room);
      } else {
        room = rooms.get(String(msg.code || '').toUpperCase());
        if (!room) return wsSend(sock, { t: 'error', error: 'No game with that code' });
        if (room.players.size >= MAX_PLAYERS) return wsSend(sock, { t: 'error', error: 'That game is full' });
      }
      room.players.set(client.id, client); client.room = room;
      for (const p of room.players.values()) if (p.sub) notifyFriends(p.sub);
      wsSend(sock, { t: 'welcome', id: client.id, code: room.code, host: room.host, page: room.page, players: [...room.players.values()].map(publicPlayer) });
      for (const p of room.players.values()) if (p !== client) wsSend(p.sock, { t: 'joined', player: publicPlayer(client) });
      return;
    }
    if (msg.t === 'to' && client.room) {
      const room = client.room, out = { t: 'msg', from: client.id, data: msg.data };
      if (msg.target === 'all') { for (const p of room.players.values()) if (p !== client) wsSend(p.sock, out); }
      else { const p = room.players.get(msg.target === 'host' ? room.host : msg.target); if (p && p !== client) wsSend(p.sock, out); }
    }
  });
}

const server = createServer(async (req, res) => {
  let url; try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end('bad request'); return; }
  try {
    if (url.startsWith('/api/')) return await api(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    if (url === '/__health') return send(res, 200, { app: 'kino-browser-zombies', root: ROOT, accounts: ENABLED });
    serveFile(req, res, url);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server error' }); }
});
server.on('upgrade', (req, sock) => {
  const url = new URL(req.url, 'http://x'), key = req.headers['sec-websocket-key'];
  if (!['/api/ws', '/api/social/ws'].includes(url.pathname) || !key || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) { sock.destroy(); return; }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  if (url.pathname === '/api/social/ws') onSocialSocket(req, sock); else onSocket(req, sock);
});
server.listen(PORT, '0.0.0.0', () => console.log(`kino: http://0.0.0.0:${PORT}/ · data ${DATA} · Discord sign-in ${ENABLED ? 'on' : 'off (set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, KINO_PUBLIC_URL)'}`));
