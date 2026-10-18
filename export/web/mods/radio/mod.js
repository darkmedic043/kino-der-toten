// RADIO.EXE (user, 2026-10-18): a jukebox on the terminal booth for the maps' Easter-egg songs. A song joins the radio
// the first time its Easter egg plays it (account-wide, kino.mods.radio, cloud.js TRACKED). The player plays, pauses,
// seeks and skips, and queues songs; when a song ends (played out or skipped) it rests for COOLDOWN before it can be
// played again. A song from the map you're on stays locked in the radio until its egg has been done in this game,
// even if it was unlocked before.
//   Unlocks: the engine's audio.playMusic (Kino's 115 and the custom maps' egg reward, Moon's hidden recordings and
//   Coming Home, The Giant's Beauty of Annihilation) and Der Eisendrache's castle-audio music() (which calls
//   kino.radio.heard('castle:<name>')): Requiem (gramophones), Dead Again (bears).
//   Playback: one HTML audio element at the game's volume (and silent while the game is muted), radio volume on top;
//   the map's ambience stops while the radio plays and comes back when it stops. An egg song starting in the game
//   pauses the radio.
// window.kino.radio: {status(), act(action, arg) -> true | 'reason', heard(key)}; the desktop draws it (desktop.js).
import { settings } from '../../settings.js';

const KEY = 'kino.mods.radio', COOLDOWN = 180;   // seconds a song rests after it ends
export const SONGS = [
  { id: '115', title: '115', artist: 'Elena Siegman', map: 'kino', mapName: 'Kino der Toten', egg: 'The three meteor fragments', url: 'audio/115.ogg', keys: ['115'] },
  { id: 'coming_home', title: 'Coming Home', artist: 'Elena Siegman', map: 'moon', mapName: 'Moon', egg: 'All three hidden recordings', moonKey: 'moon/mus/zombie/moon/coming_home', keys: ['moon/mus/zombie/moon/coming_home'] },
  { id: 'moon_new_chorus', title: 'New Chorus (8-bit)', artist: 'Kevin Sherwood', map: 'moon', mapName: 'Moon', egg: 'A hidden recording', moonKey: 'moon/mus/zombie/moon/bit/new_chorus_8bit', keys: ['moon/mus/zombie/moon/bit/new_chorus_8bit'] },
  { id: 'moon_pareidolia', title: 'Pareidolia (8-bit)', artist: 'Kevin Sherwood', map: 'moon', mapName: 'Moon', egg: 'A hidden recording', moonKey: 'moon/mus/zombie/moon/bit/paradol_8bit', keys: ['moon/mus/zombie/moon/bit/paradol_8bit'] },
  { id: 'moon_redamned', title: 'Re-Damned (8-bit)', artist: 'Kevin Sherwood', map: 'moon', mapName: 'Moon', egg: 'A hidden recording', moonKey: 'moon/mus/zombie/moon/bit/redamned', keys: ['moon/mus/zombie/moon/bit/redamned'] },
  { id: 'beauty', title: 'Beauty of Annihilation', artist: 'Elena Siegman', map: 'the-giant', mapName: 'The Giant', egg: 'The three specimen jars', url: 'mods/the-giant/sounds/beauty-of-annihilation.ogg', keys: ['giant_beauty_of_annihilation'] },
  { id: 'requiem', title: 'Requiem', artist: 'Clark S. Nova', map: 'der-eisendrache', mapName: 'Der Eisendrache', egg: 'The three gramophones', url: 'mods/der-eisendrache/audio/requiem.ogg', keys: ['castle:requiem'] },
  { id: 'dead_again', title: 'Dead Again', artist: 'Elena Siegman', map: 'der-eisendrache', mapName: 'Der Eisendrache', egg: 'The three teddy bears', url: 'mods/der-eisendrache/audio/dead_again.ogg', keys: ['castle:dead_again'] },
];
const BY_ID = Object.fromEntries(SONGS.map(s => [s.id, s])), BY_KEY = Object.fromEntries(SONGS.flatMap(s => s.keys.map(k => [k, s])));

const load = () => { try { return { unlocked: {}, cooldown: {}, volume: .8, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { unlocked: {}, cooldown: {}, volume: .8 }; } };
const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };

export default function setup(api) {
  const { host, audio, toast } = api, mapId = api.map?.id ?? 'kino', kino = (window.kino ??= {});
  const heardThisGame = new Set();   // songs whose egg was done in this game (a map's own songs need it)
  const el = new Audio(); el.preload = 'auto';
  const st = { now: null, queue: [], ducked: false };
  let moonUrls = null;

  const level = () => (audio?.enabled === false ? 0 : Math.max(0, Math.min(1, (settings.volume ?? 1) * load().volume)));
  setInterval(() => { el.volume = level(); }, 300);   // the game's mute and volume apply while playing

  async function urlOf(s) {
    if (s.url) return s.url;
    if (audio?.manifest?.[s.moonKey]?.url) return audio.manifest[s.moonKey].url;   // on Moon its manifest is the game's
    moonUrls ??= fetch('moon/audio/manifest.json').then(r => r.json()).catch(() => ({}));
    return (await moonUrls)[s.moonKey]?.url ?? null;
  }
  // why a song can't be played now ('' when it can)
  function why(s, now = Date.now()) {
    const d = load();
    if (!d.unlocked[s.id]) return 'locked';
    if (s.map === mapId && !heardThisGame.has(s.id)) return 'map';
    if ((d.cooldown[s.id] ?? 0) > now) return 'cooldown';
    return '';
  }
  // ---- unlocks: the game played an egg song --------------------------------------------------------------------------
  function heard(key) {
    const s = BY_KEY[key]; if (!s) return;
    heardThisGame.add(s.id);
    const d = load(); if (!d.unlocked[s.id]) { d.unlocked[s.id] = Date.now(); save(d); setTimeout(() => toast?.(`RADIO · ${s.title} added to the radio`, 3.5), 2500); }
    if (st.now && !el.paused) { el.pause(); st.paused = true; }   // the game's song takes over
  }
  if (audio?.playMusic) {
    const playMusic = audio.playMusic.bind(audio);
    audio.playMusic = key => {
      if (key === 'ambience' && st.now && !el.paused) return Promise.resolve();   // the radio is on: no ambience over it
      heard(key); return playMusic(key);
    };
  }
  // ---- playback ----------------------------------------------------------------------------------------------------
  function duck() { if (st.ducked) return; st.ducked = true; try { audio?.music?.stop?.(); if (audio) audio.music = { stop() {} }; } catch {} }
  function unduck() { if (!st.ducked) return; st.ducked = false; if (audio?.manifest?.ambience && audio.ctx) audio.playMusic('ambience').catch?.(() => {}); }
  async function start(id) {
    const s = BY_ID[id]; const url = await urlOf(s); if (!url) { toast?.('RADIO · that song is not installed', 2); return false; }
    st.now = { id, startedAt: Date.now() }; st.paused = false;
    el.src = url; el.currentTime = 0; el.volume = level(); duck();
    try { await el.play(); } catch (e) { console.warn('[radio]', e); }
    return true;
  }
  function ended() {   // played out or skipped: the song rests
    if (st.now) { const d = load(); d.cooldown[st.now.id] = Date.now() + COOLDOWN * 1000; save(d); }
    st.now = null; el.pause(); el.removeAttribute('src'); el.load();
    next();
  }
  function next() {
    while (st.queue.length) { const id = st.queue.shift(); if (!why(BY_ID[id])) { start(id); return; } }
    st.now = null; unduck();
  }
  el.addEventListener('ended', ended);
  host.on('reset', () => { heardThisGame.clear(); if (st.now) { el.pause(); st.now = null; } st.queue.length = 0; unduck(); });

  function act(a, arg) {
    const s = arg != null ? BY_ID[arg] : null;
    if (a === 'play' || a === 'queue') {
      if (!s) return 'No such song';
      const w = why(s); if (w) return { locked: 'Locked · do its Easter egg first', map: `On ${s.mapName}: do its Easter egg this game first`, cooldown: 'Still cooling down' }[w];
      if (st.now?.id === s.id || st.queue.includes(s.id)) return a === 'queue' ? 'Already queued' : 'Already playing';
      if (a === 'play' || !st.now) { if (st.now) { const d = load(); d.cooldown[st.now.id] = Date.now() + COOLDOWN * 1000; save(d); } start(s.id); return true; }
      st.queue.push(s.id); return true;
    }
    if (a === 'toggle') { if (!st.now) { next(); return true; } if (el.paused) { el.play().catch(() => {}); st.paused = false; duck(); } else { el.pause(); st.paused = true; } return true; }
    if (a === 'skip') { if (!st.now) return 'Nothing playing'; ended(); return true; }
    if (a === 'stop') { if (st.now) { const d = load(); d.cooldown[st.now.id] = Date.now() + COOLDOWN * 1000; save(d); } st.now = null; el.pause(); st.queue.length = 0; unduck(); return true; }
    if (a === 'seek') { if (!st.now || !isFinite(el.duration)) return 'Nothing playing'; el.currentTime = Math.max(0, Math.min(1, +arg)) * el.duration; return true; }
    if (a === 'unqueue') { st.queue.splice(+arg, 1); return true; }
    if (a === 'up') { const i = +arg; if (i > 0 && i < st.queue.length) [st.queue[i - 1], st.queue[i]] = [st.queue[i], st.queue[i - 1]]; return true; }
    if (a === 'volume') { const d = load(); d.volume = Math.max(0, Math.min(1, +arg)); save(d); el.volume = level(); return true; }
    return 'Unknown action';
  }
  function status() {
    const now = Date.now(), d = load();
    return {
      songs: SONGS.map(s => { const w = why(s, now); return { id: s.id, title: s.title, artist: s.artist, mapName: s.mapName, egg: s.egg, home: s.map === mapId, state: w || 'ready',
        cooldown: w === 'cooldown' ? Math.ceil((d.cooldown[s.id] - now) / 1000) : 0, queued: st.queue.includes(s.id), playing: st.now?.id === s.id }; }),
      now: st.now ? { ...BY_ID[st.now.id], pos: el.currentTime || 0, dur: isFinite(el.duration) ? el.duration : 0, paused: el.paused } : null,
      queue: st.queue.map(id => ({ id, title: BY_ID[id].title, artist: BY_ID[id].artist })),
      volume: d.volume, unlocked: Object.keys(d.unlocked).length, total: SONGS.length, cooldownSecs: COOLDOWN,
    };
  }
  kino.radio = { status, act, heard, songs: SONGS };

  // cheat console: `radio unlock <id|all>` (also counts as done this game), `radio cool` clears the cooldowns
  const addCheat = () => { if (!kino.cheats?.addCommand) { setTimeout(addCheat, 500); return; } kino.cheats.addCommand('radio', { usage: 'radio unlock <id|all> · radio cool · radio list', cheat: true,
    text: 'RADIO.EXE songs. ids: ' + SONGS.map(s => s.id).join(', '),
    run: ([a, b]) => {
      a = (a ?? 'list').toLowerCase(); const d = load();
      if (a === 'list') return SONGS.map(s => s.id + (d.unlocked[s.id] ? '*' : '')).join(' ');
      if (a === 'cool') { d.cooldown = {}; save(d); return 'Radio cooldowns cleared'; }
      if (a === 'unlock') { const list = (b ?? 'all') === 'all' ? SONGS : SONGS.filter(s => s.id.startsWith(b)); for (const s of list) { d.unlocked[s.id] ??= Date.now(); heardThisGame.add(s.id); } save(d); return 'Unlocked: ' + list.map(s => s.title).join(', '); }
      return 'radio unlock <id|all> · radio cool · radio list';
    } }); };
  addCheat();
}
