// What the Rind launcher installs on a player's PC for Melon Zombies (GET /api/install/melon-zombies, from
// kino-server.mjs). Only what may be redistributed: the game's code (upstream's MIT code plus this fork's), bundled
// libraries (vendor/, MIT) and the fork's own data and props. Everything from the original games or other third parties
// (BO1/BO3 maps, textures, models, sounds, animations, data extracted from them, the purchased/ripped character models,
// the map screenshots) is NOT installed: the installed game keeps streaming it from the site, as the browser does.
// Rind serves installed files from disk and fetches the rest from the server (see ~/projects/rind/src/install.js).
// When adding files: code is picked up automatically; new own data or assets need a rule in OWN below.
import { createHash } from 'node:crypto';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// folders that only hold game/third-party assets (never walked)
const ASSET_DIRS = new Set(['textures', 'textures-mobile', 'moon', 'ascension', 'shangri-la', 'coast', 'audio', 'animations', 'models', 'rind', 'social']);
const ASSET_SUBDIRS = new Set(['models', 'animations', 'sounds', 'thumbs', 'textures']);   // e.g. mods/bo3-weapons/models
const CODE = /\.(m?js|css|html)$/i;
// the fork's own data and assets (paths relative to export/web)
const OWN = [
  /^icon\.svg$/,
  /^vendor\/.+\.(m?js|txt)$/,                                       // three.js, three-mesh-bvh and their licences
  /^mods\/(mods|maps)\.json$/, /^mods\/README\.md$/,
  /^mods\/[^/]+\/mod\.json$/,                                       // every mod's manifest
  /^mods\/(classes\/classes|characters\/characters|progression\/progression|gobblegums\/gums|prestige\/prestige|research\/research|credits\/credits|shop\/catalog|weapon-levels\/(attachments|camos)|movement\/data|player-health\/data|terminal-booth\/placements|hd-weapons\/hd|map-materials\/(hd|hd-materials|normals)|(gun|event|zombie)-sounds\/sounds|_template\/data|lighting\/fixtures)\.json$/,
  /^mods\/terminal-booth\/terminal_booth(_compact)?\.glb$/,        // built in Blender for this fork (.tools/build-terminal-booth.py)
  /^mods\/bo7-weapons\/[^/]+\.glb$/,                               // rebuilt from reference in Blender for this fork (.tools/build-grimhawk.py etc.)
];
// game code under these is still map-specific data (custom map folders hold a converted map, not code)
const NEVER = [/^mods\/maps\/[^/]+\//];

let cache = new Map(), last = null;   // path -> {m, s, h}; last manifest (rebuilt at most every 10 s)
export function installManifest(root) {
  if (last && Date.now() - last.at < 10000) return last.value;
  const files = [], next = new Map();
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name), rel = relative(root, full).split(sep).join('/');
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) {
        const top = !rel.includes('/');
        if ((top && ASSET_DIRS.has(e.name)) || (!top && ASSET_SUBDIRS.has(e.name))) continue;
        walk(full); continue;
      }
      if (!e.isFile() || NEVER.some(r => r.test(rel))) continue;
      if (!(CODE.test(rel) || OWN.some(r => r.test(rel)))) continue;
      const st = statSync(full), c = cache.get(rel);
      const h = c && c.m === st.mtimeMs && c.s === st.size ? c.h : createHash('sha1').update(readFileSync(full)).digest('hex');
      next.set(rel, { m: st.mtimeMs, s: st.size, h });
      files.push({ p: rel, s: st.size, h });
    }
  };
  walk(root);
  cache = next;
  files.sort((a, b) => a.p < b.p ? -1 : 1);
  const version = createHash('sha1').update(files.map(f => f.p + ':' + f.h).join('\n')).digest('hex').slice(0, 16);
  const value = { game: 'melon-zombies', version, size: files.reduce((n, f) => n + f.s, 0), files };
  last = { at: Date.now(), value };
  return value;
}

// A native game's build for one platform, published as a folder (Melon Pinball: export/web/rind/games/melon-pinball/
// <linux|win>/, from ~/projects/rind/games/melon-pinball). Everything in it is installable (the game is MIT and ships
// only its own files, fonts and licences). `base` is where the files are served from.
const folderCache = new Map(), folderHashes = new Map();   // dir -> {at, value}; full path -> {m, s, h}
export function folderManifest(dir, game, base, exe) {
  const hit = folderCache.get(dir);
  if (hit && Date.now() - hit.at < 10000) return hit.value;
  const files = [];
  const walk = d => {
    let entries; try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.isFile()) continue;
      const rel = relative(dir, full).split(sep).join('/'), st = statSync(full), c = folderHashes.get(full);
      const h = c && c.m === st.mtimeMs && c.s === st.size ? c.h : createHash('sha1').update(readFileSync(full)).digest('hex');
      folderHashes.set(full, { m: st.mtimeMs, s: st.size, h });
      files.push({ p: rel, s: st.size, h });
    }
  };
  walk(dir);
  files.sort((a, b) => a.p < b.p ? -1 : 1);
  const version = createHash('sha1').update(files.map(f => f.p + ':' + f.h).join('\n')).digest('hex').slice(0, 16);
  const value = files.length ? { game, version, size: files.reduce((n, f) => n + f.s, 0), base, exe, files } : null;
  folderCache.set(dir, { at: Date.now(), value });
  return value;
}
