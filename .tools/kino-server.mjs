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
import { createReadStream, createWriteStream, statSync, mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, appendFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { extname, join, resolve, sep } from 'node:path';
import { installManifest, folderManifest } from './install-manifest.mjs';
import { homedir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..', 'export', 'web');
const PORT = Number(process.argv[2]) || 5190;
const HOME = '/' + (process.env.KINO_HOME || 'home.html').replace(/^\/+/, '');
const DATA = resolve(process.env.KINO_DATA || join(homedir(), '.local', 'share', 'kino'));
const DISCORD_ID = process.env.DISCORD_CLIENT_ID || '', DISCORD_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const PUBLIC_URL = (process.env.KINO_PUBLIC_URL || '').replace(/\/$/, '');
const ENABLED = !!(DISCORD_ID && DISCORD_SECRET && PUBLIC_URL);
const REDIRECT = PUBLIC_URL + '/api/auth/discord/callback';
const SESSION_DAYS = 90, MAX_BODY = 256 * 1024, MAX_TRACE = 250 * 1024 * 1024, KEEP_TRACES = 6;
mkdirSync(join(DATA, 'profiles'), { recursive: true });

const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.webp':'image/webp','.ktx2':'image/ktx2','.wasm':'application/wasm','.yml':'text/yaml; charset=utf-8','.wav':'audio/wav','.ogg':'audio/ogg',
  '.bin':'application/octet-stream','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};

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
  // A token for a native game Rind launches (it can't use the cookie): see gameToken below.
  if (url === '/api/game-token' && req.method === 'GET') {
    const s = session(req); if (!s) return send(res, 401, { error: 'not signed in' });
    const game = new URL(req.url, 'http://x').searchParams.get('game') || '';
    if (!/^[a-z0-9-]{1,40}$/.test(game)) return send(res, 400, { error: 'bad game id' });
    remember(s); return send(res, 200, gameToken(s, game));
  }
  // Helm (~/projects/helm, a program in Rind): a Helm server hosts a room (page /helm/) as its owner so friends can watch
  // its Claude Code sessions peer to peer. This lists the Helm rooms hosted by the caller's friends (and the caller).
  if (url === '/api/helm' && req.method === 'GET') {
    const s = session(req); if (!s) return send(res, 401, { error: 'Sign in to watch your friends\' Helm' });
    const mine = new Set([s.sub, ...friendsOf(s.sub)]);
    const list = [...rooms.values()].filter(r => r.page === '/helm/').map(r => [r, r.players.get(r.host)]).filter(([, h]) => h?.sub && mine.has(h.sub))
      .map(([r, h]) => ({ code: r.code, owner: { id: pubId(h.sub), name: h.name, picture: h.picture ?? null }, me: h.sub === s.sub }));
    return send(res, 200, { rooms: list });
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
  // Load diagnostics from game pages (engine.js diag): stages, a heartbeat, WebGL context loss, errors, GPU name. One JSON
  // line each in KINO_DATA/client-log.jsonl (rotated past 5 MB). Added 2026-10-15 for a black window while loading in Rind.
  // a GPU-process trace from the Rind runtime (its src/trace.js, 2026-10-30): gzipped Chromium trace JSON, streamed to
  // KINO_DATA/traces/<who>-<time>.json.gz (the last KEEP_TRACES kept, a client-log line each); .tools/trace-report.mjs reads them
  if (url === '/api/trace' && req.method === 'POST') {
    const s = session(req); if (!s) return send(res, 401, { error: 'sign in first' });
    const dir = join(DATA, 'traces'); mkdirSync(dir, { recursive: true });
    const who = String(s.username || s.name || 'anon').replace(/[^\w.-]/g, '_').slice(0, 32), at = new Date().toISOString();
    const name = `${who}-${at.replace(/[:.]/g, '-').slice(0, 19)}.json.gz`, file = join(dir, name), out = createWriteStream(file);
    let size = 0, over = false;
    req.on('data', c => { size += c.length; if (size > MAX_TRACE && !over) { over = true; req.destroy(); out.destroy(); try { unlinkSync(file); } catch {} send(res, 413, { error: 'too large' }); } });
    req.on('error', () => { out.destroy(); });
    out.on('error', () => { if (!over) send(res, 500, { error: 'write failed' }); });
    out.on('finish', () => {
      if (over) return;
      try { for (const f of readdirSync(dir).filter(f => f.endsWith('.json.gz')).sort().slice(0, -KEEP_TRACES)) unlinkSync(join(dir, f)); } catch {}
      try { appendFileSync(join(DATA, 'client-log.jsonl'), JSON.stringify({ at, who: s.name, ev: 'trace', file: name, bytes: size, info: String(req.headers['x-trace-info'] || '').slice(0, 200) }) + '\n'); } catch {}
      send(res, 200, { file: name, bytes: size });
    });
    req.pipe(out);
    return;
  }
  if (url === '/api/client-log' && req.method === 'POST') {
    let doc; try { doc = await body(req); } catch { return send(res, 400, { error: 'bad body' }); }
    const s = session(req), file = join(DATA, 'client-log.jsonl');
    try { if (existsSync(file) && statSync(file).size > 5e6) renameSync(file, file + '.1'); } catch {}
    appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), who: s?.name ?? null, ...doc }).slice(0, 4000) + '\n');
    return send(res, 204, null);
  }
  if (url.startsWith('/api/social')) return socialApi(req, res, url);
  // the Rind launcher's install list for Melon Zombies (only redistributable files: see install-manifest.mjs)
  if (url === '/api/install/melon-zombies' && req.method === 'GET') return send(res, 200, installManifest(ROOT));
  // native games (Melon Pinball): the published build for ?platform=linux|win
  if (url === '/api/install/melon-pinball' && req.method === 'GET') {
    const platform = new URL(req.url, 'http://x').searchParams.get('platform');
    if (!['linux', 'win'].includes(platform)) return send(res, 400, { error: 'platform must be linux or win' });
    const m = folderManifest(join(ROOT, 'rind', 'games', 'melon-pinball', platform), 'melon-pinball', `/rind/games/melon-pinball/${platform}/`, platform === 'win' ? 'melon-pinball.exe' : 'melon-pinball');
    return m ? send(res, 200, m) : send(res, 404, { error: 'Melon Pinball is not published for this system yet' });
  }
  // Melon Pinball friends leaderboard: the player and their friends, each with their best score (scores.txt) and best
  // Harvest season (unlocks.txt) from their account saves; only people with a saved score or season
  if (url === '/api/leaderboard/melon-pinball' && req.method === 'GET') {
    const s = session(req); if (!s) return send(res, 401, { error: 'Sign in to see the leaderboard' });
    remember(s);
    const rows = [s.sub, ...friendsOf(s.sub)].map(sub => {
      const f = readJson(userFile(sub).replace(/\.json$/, '.saves-melon-pinball.json'), null)?.files;
      if (!f) return null;
      const score = Math.max(0, ...String(f['scores.txt'] ?? '').split('\n').map(l => parseInt(l)).filter(Number.isFinite));
      const season = Math.max(0, ...[...String(f['unlocks.txt'] ?? '').matchAll(/^best (\d+)$/gm)].map(m => +m[1]));
      if (!score && !season) return null;
      const v = view(sub);
      return { id: v.id, name: v.name, picture: v.picture, status: v.status, map: v.map ?? null, me: sub === s.sub, score, season };
    }).filter(Boolean).sort((a, b) => b.score - a.score || b.season - a.season);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return send(res, 200, { rows });
  }
  // game saves on the account (Rind syncs Melon Pinball's scores and unlocks): {files: {name: text}, updatedAt}
  if (url.startsWith('/api/saves/')) {
    const s = session(req); if (!s) return send(res, 401, { error: 'not signed in' });
    const game = url.slice('/api/saves/'.length);
    if (!/^[a-z0-9-]{1,40}$/.test(game)) return send(res, 400, { error: 'bad game id' });
    const file = userFile(s.sub).replace(/\.json$/, `.saves-${game}.json`);
    if (req.method === 'GET') return send(res, 200, readJson(file, { files: {}, updatedAt: 0 }));
    if (req.method === 'PUT') {
      let doc; try { doc = await body(req); } catch (e) { return send(res, 400, { error: e.message }); }
      const files = doc?.files;
      if (!files || typeof files !== 'object' || Array.isArray(files)) return send(res, 400, { error: 'expected {files}' });
      const ok = Object.entries(files).every(([k, v]) => /^[\w.-]{1,40}$/.test(k) && typeof v === 'string') && JSON.stringify(files).length < 65536;
      if (!ok) return send(res, 400, { error: 'bad save files' });
      writeJson(file, { files, updatedAt: Date.now() });
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method' });
  }
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
  if (g.room && g.page) return { status: 'game', map: g.mapName || g.map || null, room: g.room, page: g.page, players: g.players ?? null, joinable: (g.players ?? 0) < MAX_PLAYERS };
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
    // an outside room (a Rind catalog game's own server) that the inviter's status says they are in, or one of ours
    const code = String(b.room || '').toUpperCase();
    const ext = code && [...(presence.get(me) ?? [])].map(c => c.status).find(st => st.status === 'game' && st.page && st.room === code);
    const room = !ext && rooms.get(code);
    if (!room && !ext) return send(res, 404, { error: 'Start or join a co-op game first' });
    if (!presence.get(other)?.size) return send(res, 409, { error: 'They are offline' });
    push(other, { t: 'invite', from: view(me), room: code, page: room ? room.page : ext.page, map: String(b.map || (room ? room.map : ext.mapName) || '').slice(0, 64) });
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
    // A room hosted outside this server (a Rind catalog game's own server, e.g. Night Shift): its page is /rind/<id>/.
    if (/^\/rind\/[a-z0-9-]{1,40}\/$/.test(msg.page ?? '')) { conn.status.page = msg.page; if (Number.isInteger(msg.players) && msg.players > 0 && msg.players <= MAX_PLAYERS) conn.status.players = msg.players; }
    notifyFriends(sub);
  });
}

// Code and data must never go stale (Cloudflare rewrites "no-cache" into a
// 4-hour browser cache, but leaves "no-store" alone). Heavy assets such as
// meshes, textures and audio are cached for a day.
// stale-while-revalidate: after max-age, a cached asset is used at once and re-checked in the background (an ETag
// match answers 304), so repeat loads don't wait on thousands of re-checks; a changed file shows up on the next load.
// Game data JSON (animations, map data, collision/navigation: about 1,000 files per Kino load) is cached like an asset,
// with a 1 h max-age; code and config (js/css/html, mods.json, mod.json, classes.json...) stay no-store.
const DATA_JSON = /[\\/](animations|moon|ascension|shangri-la|coast|models|textures|audio)[\\/].*\.json$|[\\/]mods[\\/]maps[\\/][^\\/]+[\\/].*\.json$|[\\/]export[\\/]web[\\/](collision|navigation|game-data|asset-report|provenance)\.json$/i;
const cacheControl = path => DATA_JSON.test(path) ? 'public, max-age=3600, stale-while-revalidate=2592000'
  : /\.(html|m?js|css|json|md|txt|ya?ml)$/i.test(path) ? 'no-store' : 'public, max-age=86400, stale-while-revalidate=2592000';

function serveFile(req, res, url) {
  if (url === '/favicon.ico') { res.writeHead(204).end(); return; }
  let path = resolve(ROOT, '.' + (url === '/' ? HOME : url).replace(/\\/g, '/'));
  if (!path.toLowerCase().startsWith((ROOT + sep).toLowerCase())) { res.writeHead(403).end('forbidden'); return; }
  // a folder serves its index.html (e.g. /rind/, the launcher's download page); without the slash, redirect to it
  try { if (statSync(path).isDirectory()) { if (!url.endsWith('/')) { res.writeHead(301, { Location: url + '/', 'Cache-Control': 'no-store' }).end(); return; } path = join(path, 'index.html'); } } catch {}
  let stat; try { stat = statSync(path); if (!stat.isFile()) throw 0; } catch { res.writeHead(404).end('not found'); return; }
  const type = TYPES[extname(path).toLowerCase()] || 'application/octet-stream', range = req.headers.range;
  // validators: a re-check of an unchanged file gets 304 (no body) instead of the whole file again
  const etag = `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`, lastModified = stat.mtime.toUTCString();
  const inm = req.headers['if-none-match'], ims = req.headers['if-modified-since'];
  if (inm ? inm.split(',').some(t => t.trim().replace(/^W\//, '') === etag) : ims && Date.parse(ims) >= Math.floor(stat.mtimeMs / 1000) * 1000) {
    res.writeHead(304, { ETag: etag, 'Last-Modified': lastModified, 'Cache-Control': cacheControl(path) }).end(); return;
  }
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = m?.[1] ? Number(m[1]) : m?.[2] ? Math.max(0, stat.size - Number(m[2])) : NaN;
    const end = m?.[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': lastModified, 'Content-Length': end - start + 1, 'Cache-Control': cacheControl(path) });
    if (req.method === 'HEAD') res.end(); else createReadStream(path, { start, end }).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': lastModified, 'Cache-Control': cacheControl(path) });
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

// ---- Game tokens and the Night Shift proxy ------------------------------------
// Rind fetches GET /api/game-token?game=<id> with the account's cookie and hands the token to the native game it starts.
// Token = b64url(JSON {v:1, g: game, u: pubId, n: name, p: picture, e: expiry ms}) + '.' + b64url(HMAC-SHA256), with the
// key in DATA/game-token.key (made on first use, kept across restarts).
const GAME_TOKEN_HOURS = 24, TOKEN_KEY_FILE = join(DATA, 'game-token.key');
let tokenKey = null;
function gameKey() {
  if (tokenKey) return tokenKey;
  try { const k = readFileSync(TOKEN_KEY_FILE); if (k.length >= 32) return tokenKey = k; } catch {}
  tokenKey = randomBytes(32); writeFileSync(TOKEN_KEY_FILE, tokenKey, { mode: 0o600 }); return tokenKey;
}
const tokenSig = body => createHmac('sha256', gameKey()).update(body).digest('base64url');
function gameToken(s, game) {
  const e = Date.now() + GAME_TOKEN_HOURS * 36e5;
  const body = Buffer.from(JSON.stringify({ v: 1, g: game, u: pubId(s.sub), n: s.name, p: s.picture ?? null, e })).toString('base64url');
  return { token: body + '.' + tokenSig(body), expires: e };
}
function readGameToken(token, game) {
  const [body, sig, extra] = String(token || '').split('.');
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(tokenSig(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try { const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return t.v === 1 && t.g === game && t.e > Date.now() ? t : null; } catch { return null; }
}
// Night Shift (~/projects/opsec, a Rind game): /api/opsec/* goes to its game server's unix socket with the prefix
// stripped. The WebSocket (/api/opsec/ws) needs the game's token in X-Opsec-Token; the server gets the player as
// X-Opsec-User (b64url JSON {id, name, picture, owner, friendOfOwner, friends}), never the cookie or the token, and any
// X-Opsec-User a client sends is dropped. OPSEC_OWNER = the site owner's friend id (the game is friends-only).
const OPSEC_SOCKET = process.env.OPSEC_SOCKET || '/opsec/opsec.sock', OPSEC_OWNER = process.env.OPSEC_OWNER || '';
const OPSEC_DROP = /^(x-opsec-user|x-opsec-token|cookie)$/i;
const opsecPath = req => req.url.replace(/^\/api\/opsec/, '') || '/';
function proxyOpsec(req, res) {
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !OPSEC_DROP.test(k)));
  const up = httpRequest({ socketPath: OPSEC_SOCKET, method: req.method, path: opsecPath(req), headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { if (!res.headersSent) send(res, 503, { error: 'Night Shift is offline' }); else res.destroy(); });
  req.pipe(up);
}
function opsecSocket(req, sock, head) {
  const t = readGameToken(req.headers['x-opsec-token'], 'opsec');
  if (!t) { sock.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return; }
  const sub = subOf(t.u), owner = OPSEC_OWNER ? subOf(OPSEC_OWNER) : null;
  const who = { id: t.u, name: t.n, picture: t.p ?? null, owner: !!OPSEC_OWNER && t.u === OPSEC_OWNER,
    friendOfOwner: !!(sub && owner && (social.friends[owner] ?? []).includes(sub)),
    friends: sub ? (social.friends[sub] ?? []).map(f => social.users[f]?.pid).filter(Boolean) : [] };
  const lines = [`${req.method} ${opsecPath(req)} HTTP/1.1`];
  for (let i = 0; i < req.rawHeaders.length; i += 2) if (!OPSEC_DROP.test(req.rawHeaders[i])) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
  lines.push('X-Opsec-User: ' + Buffer.from(JSON.stringify(who)).toString('base64url'));
  let open = false;
  const up = connect({ path: OPSEC_SOCKET }), end = () => { sock.destroy(); up.destroy(); };
  up.on('connect', () => { open = true; up.write(lines.join('\r\n') + '\r\n\r\n'); if (head?.length) up.write(head); sock.pipe(up); up.pipe(sock); });
  up.on('error', () => { if (open) end(); else sock.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); });
  up.on('close', end); sock.on('error', end); sock.on('close', end);
}

const server = createServer(async (req, res) => {
  let url; try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end('bad request'); return; }
  try {
    if (url === '/api/opsec' || url.startsWith('/api/opsec/')) return proxyOpsec(req, res);
    if (url.startsWith('/api/')) return await api(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    if (url === '/__health') return send(res, 200, { app: 'kino-browser-zombies', root: ROOT, accounts: ENABLED });
    serveFile(req, res, url);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server error' }); }
});
server.on('upgrade', (req, sock, head) => {
  const url = new URL(req.url, 'http://x'), key = req.headers['sec-websocket-key'];
  if (url.pathname === '/api/opsec/ws') {
    if (!key || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) { sock.destroy(); return; }
    return opsecSocket(req, sock, head);
  }
  if (!['/api/ws', '/api/social/ws'].includes(url.pathname) || !key || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) { sock.destroy(); return; }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  if (url.pathname === '/api/social/ws') onSocialSocket(req, sock); else onSocket(req, sock);
});
server.listen(PORT, '0.0.0.0', () => console.log(`kino: http://0.0.0.0:${PORT}/ · data ${DATA} · Discord sign-in ${ENABLED ? 'on' : 'off (set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, KINO_PUBLIC_URL)'}`));
