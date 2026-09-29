#!/usr/bin/env node
// Local fork server (not part of upstream): the static game files plus a small
// account API for saving progress, with Google sign-in.
//   node .tools/kino-server.mjs [port]
// Environment:
//   KINO_HOME         page served at "/" (default home.html)
//   KINO_DATA         directory for profiles and sessions (default ~/.local/share/kino)
//   GOOGLE_CLIENT_ID  OAuth client id; sign-in is disabled without it
import { createReadStream, statSync, mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { extname, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..', 'export', 'web');
const PORT = Number(process.argv[2]) || 5190;
const HOME = '/' + (process.env.KINO_HOME || 'home.html').replace(/^\/+/, '');
const DATA = resolve(process.env.KINO_DATA || join(homedir(), '.local', 'share', 'kino'));
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_DAYS = 90, MAX_BODY = 256 * 1024;
mkdirSync(join(DATA, 'profiles'), { recursive: true });

const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.webp':'image/webp','.wasm':'application/wasm','.wav':'audio/wav','.ogg':'audio/ogg',
  '.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};

// ---- Storage (small JSON files, written atomically) -------------------------
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, value) => { const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(value)); renameSync(tmp, file); };
const SESSIONS = join(DATA, 'sessions.json');
const sessions = new Map(Object.entries(readJson(SESSIONS, {})));
const saveSessions = () => writeJson(SESSIONS, Object.fromEntries(sessions));
const userFile = sub => join(DATA, 'profiles', createHash('sha256').update(String(sub)).digest('hex').slice(0, 32) + '.json');

// ---- Google ID token verification (RS256 against Google's published keys) ---
let keys = { at: 0, byKid: new Map() };
async function googleKey(kid) {
  if (!keys.byKid.has(kid) || Date.now() - keys.at > 3600e3) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!r.ok) throw new Error('Google keys HTTP ' + r.status);
    const { keys: list } = await r.json();
    keys = { at: Date.now(), byKid: new Map(list.map(k => [k.kid, createPublicKey({ key: k, format: 'jwk' })])) };
  }
  return keys.byKid.get(kid);
}
const b64 = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
async function verifyGoogle(token) {
  const [h, p, s] = String(token).split('.');
  if (!s) throw new Error('malformed token');
  const header = JSON.parse(b64(h)), claims = JSON.parse(b64(p));
  if (header.alg !== 'RS256') throw new Error('unexpected algorithm');
  const key = await googleKey(header.kid);
  if (!key || !verify('RSA-SHA256', Buffer.from(h + '.' + p), key, b64(s))) throw new Error('bad signature');
  if (claims.aud !== CLIENT_ID) throw new Error('token is for another app');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw new Error('bad issuer');
  if (claims.exp * 1000 < Date.now()) throw new Error('token expired');
  return claims;
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
  if (url === '/api/config' && req.method === 'GET') return send(res, 200, { googleClientId: CLIENT_ID || null });
  if (url === '/api/me' && req.method === 'GET') {
    const s = session(req); return send(res, 200, s ? { signedIn: true, name: s.name, email: s.email, picture: s.picture } : { signedIn: false });
  }
  if (url === '/api/auth/google' && req.method === 'POST') {
    if (!CLIENT_ID) return send(res, 503, { error: 'Google sign-in is not configured on this server' });
    let claims;
    try { claims = await verifyGoogle((await body(req)).credential); } catch (e) { return send(res, 401, { error: 'Sign-in failed: ' + e.message }); }
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, { sub: claims.sub, name: claims.name || claims.email, email: claims.email, picture: claims.picture, expires: Date.now() + SESSION_DAYS * 864e5 });
    saveSessions();
    const cookie = `kino_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure(req) ? '; Secure' : ''}`;
    return send(res, 200, { signedIn: true, name: claims.name || claims.email, email: claims.email, picture: claims.picture }, { 'Set-Cookie': cookie });
  }
  if (url === '/api/auth/logout' && req.method === 'POST') {
    const s = session(req); if (s) { sessions.delete(s.id); saveSessions(); }
    return send(res, 200, { signedIn: false }, { 'Set-Cookie': 'kino_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }
  if (url === '/api/profile') {
    const s = session(req); if (!s) return send(res, 401, { error: 'not signed in' });
    const file = userFile(s.sub);
    if (req.method === 'GET') return send(res, 200, existsSync(file) ? readJson(file, {}) : {});
    if (req.method === 'PUT') {
      let doc; try { doc = await body(req); } catch (e) { return send(res, 400, { error: e.message }); }
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return send(res, 400, { error: 'expected an object' });
      writeJson(file, { ...doc, account: { name: s.name, email: s.email }, savedAt: Date.now() });
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'unknown endpoint' });
}

function serveFile(req, res, url) {
  if (url === '/favicon.ico') { res.writeHead(204).end(); return; }
  const path = resolve(ROOT, '.' + (url === '/' ? HOME : url).replace(/\\/g, '/'));
  if (!path.toLowerCase().startsWith((ROOT + sep).toLowerCase())) { res.writeHead(403).end('forbidden'); return; }
  let stat; try { stat = statSync(path); if (!stat.isFile()) throw 0; } catch { res.writeHead(404).end('not found'); return; }
  const type = TYPES[extname(path).toLowerCase()] || 'application/octet-stream', range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = m?.[1] ? Number(m[1]) : m?.[2] ? Math.max(0, stat.size - Number(m[2])) : NaN;
    const end = m?.[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') res.end(); else createReadStream(path, { start, end }).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') res.end(); else createReadStream(path).on('error', () => res.destroy()).pipe(res);
}

createServer(async (req, res) => {
  let url; try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end('bad request'); return; }
  try {
    if (url.startsWith('/api/')) return await api(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    if (url === '/__health') return send(res, 200, { app: 'kino-browser-zombies', root: ROOT, accounts: !!CLIENT_ID });
    serveFile(req, res, url);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server error' }); }
}).listen(PORT, '0.0.0.0', () => console.log(`kino: http://0.0.0.0:${PORT}/ · data ${DATA} · Google sign-in ${CLIENT_ID ? 'on' : 'off (set GOOGLE_CLIENT_ID)'}`));
