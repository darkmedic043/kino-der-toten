// Operator voice lines: your operator talks during a match. Each operator with
// lines has a folder voices/<voice id>/ (the characters.json entry's `voice`,
// else its id) holding lines.json, {event: [{f: file, t: caption}]}, and the
// clips. Operators without a folder stay silent. In co-op the line is sent to
// teammates, who hear it from your position.
// Conversations: voices/<voice id>/convos.json, [{id, lines: [{v, f, t}]}],
// lines from two operators (v = the speaker's voice id; every clip sits in
// that folder). In co-op, when two operators with a conversation stand near
// each other, the one with the lower player id starts it at the match start or
// between rounds and the others hear it from the speakers' bodies.
// Settings: Audio > Operator voice volume / Operator chatter (Off, Rare,
// Normal, Chatty). docs/fork/gameplay.md "Operator voice lines".
import { loadCharacterRegistry } from '../../characters.js';
import { loadProfile, cloudReady } from '../../profile.js';
import { settings } from '../../settings.js';

// event: [priority 0-3, chance at Normal, own cooldown in seconds]. Priority 3
// always plays (cutting off a lower line); 2 ignores the chance roll on Rare.
const EVENTS = {
  start: [3, 1, 0], roundStart: [1, .55, 0], roundEnd: [1, .45, 0], dogRound: [2, 1, 0],
  kill: [0, .06, 14], headshot: [0, .1, 16], meleeKill: [0, .15, 18], multiKill: [1, .6, 20], eliteKill: [2, 1, 10], streak: [1, .7, 45],
  hurt: [0, .25, 20], lowHealth: [2, 1, 30], down: [3, 1, 0], revived: [2, 1, 0], reviveTeammate: [2, 1, 0], gameOver: [3, 1, 0],
  reload: [0, .07, 25], noAmmo: [1, .8, 30], perk: [1, .8, 10], box: [1, .7, 10], pap: [2, 1, 0], wallBuy: [0, .4, 25],
  powerup: [1, .5, 15], ability: [1, .6, 20], gum: [0, .5, 30], door: [0, .45, 30], power: [2, 1, 0], horde: [1, .6, 60],
  idle: [0, 1, 70], inspect: [0, .6, 25],
  roundEndTeam: [1, .45, 0], lastZombie: [1, .6, 0], boss: [2, 1, 20], boxSpin: [0, .45, 20], abilityReady: [1, .5, 30],
  exfil: [2, 1, 0], exfilWin: [3, 1, 0], easterEgg: [3, 1, 0], teammateJoined: [2, 1, 0],
};
const GAP = [Infinity, 9, 4.5, 2.5];   // seconds between any two lines, per chatter setting
const CHANCE = [0, .45, 1, 1.6];

export default async function setup(api){
  const { host, audio, session, enemies, camera, mysteryBox, mod } = api;
  await cloudReady;
  const id = loadProfile().character;
  const registry = await loadCharacterRegistry({ all: true });
  const entry = registry.find(c => c.id === id);
  const voiceOf = e => e ? e.voice ?? e.id : null;
  const nameOf = v => (registry.find(c => voiceOf(c) === v)?.name ?? 'Operator').toUpperCase();
  const lines = await loadLines(entry?.voice ?? id);
  const voices = new Map();   // voice id -> lines (teammates' voices load on first use)
  if (lines) voices.set(entry?.voice ?? id, lines);
  const voiceId = entry?.voice ?? id, name = (entry?.name ?? 'Operator').toUpperCase();

  async function loadLines(v, file = 'lines.json'){
    if (!v) return null;
    try { const r = await fetch(new URL(`voices/${v}/${file}`, mod.url));if (!r.ok) return null;return await r.json(); } catch { return null; }
  }
  const convoSets = new Map();   // voice id -> its conversations
  const loadConvos = v => { if (!convoSets.has(v)) convoSets.set(v, loadLines(v, 'convos.json').then(a => Array.isArray(a) ? a : []));return convoSets.get(v); };
  const buffers = new Map();
  const buffer = (v, f) => {
    if (!audio.ctx) return null;
    const k = v + '/' + f;
    if (!buffers.has(k)) buffers.set(k, fetch(new URL(`voices/${v}/${f}`, mod.url)).then(r => r.arrayBuffer()).then(b => audio.ctx.decodeAudioData(b)).catch(() => null));
    return buffers.get(k);
  };

  // caption: plain text, no blur or shadow (no new Skia shaders mid-game)
  const cap = document.createElement('div');
  cap.id = 'voice-caption';
  cap.style.cssText = 'position:fixed;left:50%;bottom:21%;transform:translateX(-50%);max-width:52vw;text-align:center;font:600 15px/1.35 system-ui,sans-serif;color:#f2f2f2;background:rgba(0,0,0,.55);padding:5px 12px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity .25s;z-index:30';
  document.body.append(cap);
  let capTimer = 0;
  const caption = (who, text, sec) => {
    if (!text || settings.voiceSubs === false) return;
    cap.innerHTML = '';const b = document.createElement('b');b.textContent = who + ': ';b.style.color = '#ffd36b';cap.append(b, text);
    cap.style.opacity = '1';clearTimeout(capTimer);capTimer = setTimeout(() => cap.style.opacity = '0', Math.max(1800, sec * 1000 + 600));
  };
  host.on('warmHud', on => { cap.textContent = on ? 'WARM: up' : '';cap.style.opacity = on ? '1' : '0'; });

  let current = null, convoRun = 0, talking = false, lastAny = -99;
  const now = () => performance.now() / 1000;
  async function play(v, line, position, who){
    if (!audio.ctx || !audio.enabled || !audio.master) return null;
    const buf = await buffer(v, line.f);if (!buf) return null;
    const d = position ? position.distanceTo(camera.position) : 0, gain = (settings.voiceVolume ?? 1) * 1.35 * (position ? Math.max(0, 1 - d / 2200) ** 1.2 : 1);
    if (gain < .02) return null;
    const src = audio.ctx.createBufferSource(), g = audio.ctx.createGain();
    src.buffer = buf;g.gain.value = gain;src.connect(g).connect(audio.master);src.start();
    if (!position) { current?.src.stop?.();current = { src, end: audio.ctx.currentTime + buf.duration };src.onended = () => { if (current?.src === src) current = null; }; }
    caption(who ?? name, line.t, buf.duration);
    return buf;
  }

  const net = () => window.kino.coop?.id ? window.kino.coop : null;
  // co-op: teammates' lines arrive here even when your own operator is silent
  // (multiplayer sets up after this mod, so hook its connection once loading is done)
  let hooked = false;
  const hookCoop = () => { if (hooked || !window.kino.coop?.on) return;hooked = true;window.kino.coop.on('vox', async (m, from) => {
    if (!m?.v || !m.f) return;
    if (!voices.has(m.v)) voices.set(m.v, loadLines(m.v));
    const set = await voices.get(m.v);if (!set) return;
    const line = Object.values(set).flat().find(l => l.f === m.f);if (!line) return;
    const r = window.kino.coopRemote?.(from);
    play(m.v, line, r?.root?.position, m.n);
  });window.kino.coop.on('convo', async m => {
    if (!m?.o || !m.k) return;
    const c = (await loadConvos(m.o)).find(c => c.id === m.k);if (c) playConvo(m.o, c, m.who ?? {});
  });window.kino.coop.on('joined', p => { if (p?.id && p.id !== window.kino.coop.id) setTimeout(() => window.kino.voice?.say?.('teammateJoined'), 1500); }); };
  hookCoop();host.on('ready', hookCoop);host.on('start', hookCoop);

  // ---- conversations between two operators ----
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const speakersOf = c => new Set(c.lines.map(l => l.v));
  async function playConvo(folder, c, who){
    const run = ++convoRun, me = net()?.id;talking = true;
    const bufs = await Promise.all(c.lines.map(l => buffer(folder, l.f)));
    try {
      for (let i = 0; i < c.lines.length; i++) {
        const l = c.lines[i], buf = bufs[i];
        if (run !== convoRun || !buf) return;
        const mine = l.v === voiceId && (!me || who[l.v] === me), r = mine ? null : window.kino.coopRemote?.(who[l.v]);
        await play(folder, l, mine ? null : r?.root?.position ?? null, nameOf(l.v));
        await wait(buf.duration * 1000 + 280);
      }
    } finally { if (run === convoRun) { talking = false;lastAny = now(); } }
  }
  const heard = new Set();   // conversations already played this match
  async function convoFor(mateVoice){
    const out = [];
    for (const folder of new Set([voiceId, mateVoice])) for (const c of await loadConvos(folder)) {
      const sp = speakersOf(c);
      if (sp.size === 2 && sp.has(voiceId) && sp.has(mateVoice)) out.push({ folder, c });
    }
    return out;
  }
  let convoAt = -999;
  async function startConvo(){
    const coop = net();if (!coop || talking || !started || session.phase === 'reviving') return false;
    const level = Math.round(settings.voiceChat ?? 2);if (!level) return false;
    for (const r of (window.kino.coopRemotes?.() ?? []).sort(() => Math.random() - .5)) {
      const v = voiceOf(r.entry);
      if (!v || v === voiceId || !r.root || r.down || r.dead || String(r.id) < String(coop.id)) continue;   // the lower id starts it
      if (r.root.position.distanceTo(camera.position) > 1400) continue;
      const all = (await convoFor(v)).filter(x => !heard.has(x.folder + '/' + x.c.id));if (!all.length) continue;
      const { folder, c } = all[Math.floor(Math.random() * all.length)];
      heard.add(folder + '/' + c.id);convoAt = now();
      const who = { [voiceId]: coop.id, [v]: r.id };
      coop.send('all', { t: 'convo', o: folder, k: c.id, who });
      playConvo(folder, c, who);
      return true;
    }
    return false;
  }
  const CONVO = [0, .2, .4, .65];   // chance between rounds, per chatter setting
  host.on('start', () => { heard.clear();convoAt = -999;setTimeout(() => { if (Math.random() < CONVO[Math.round(settings.voiceChat ?? 2)] + .25) startConvo(); }, 14000); });
  host.on('roundEnd', () => setTimeout(() => { if (now() - convoAt > 150 && Math.random() < CONVO[Math.round(settings.voiceChat ?? 2)]) startConvo(); }, 4500));
  // kino.voice.convo('deadlock_seven' | conversation id) plays one here, the other speaker unplaced (testing)
  async function convo(arg){
    const pool = [];
    for (const folder of new Set([voiceId, arg].filter(Boolean))) for (const c of await loadConvos(folder)) pool.push({ folder, c });
    const list = pool.filter(x => !arg || x.c.id === arg || speakersOf(x.c).has(arg));
    const x = list[Math.floor(Math.random() * list.length)];if (!x) return null;
    playConvo(x.folder, x.c, {});return x.c.id;
  }
  let started = false;
  window.kino.voice = { lines, say, convo, convos: () => loadConvos(voiceId) };
  if (!lines) { host.on('start', () => started = true);host.on('reset', () => started = false);return; }

  // a shuffled bag per event, so the same line doesn't come twice in a row
  const bags = {};
  const pick = ev => { const all = lines[ev];if (!all?.length) return null;let bag = bags[ev];if (!bag?.length) { bag = bags[ev] = [...all].sort(() => Math.random() - .5);if (bag[0] === bags[ev + ':last'] && bag.length > 1) bag.push(bag.shift()); }const l = bag.shift();bags[ev + ':last'] = l;return l; };
  const lastAt = {};
  function say(ev, force = false){
    const spec = EVENTS[ev] ?? [1, 1, 0], level = Math.round(settings.voiceChat ?? 2);
    if (!lines?.[ev]?.length || (!level && !force)) return false;
    const [prio, chance, cool] = spec, t = now();
    if (talking && prio < 3 && !force) return false;
    if (prio === 3 || force) convoRun++, talking = false;   // a down or game over cuts a conversation short
    if (!force) {
      if (t - (lastAt[ev] ?? -99) < cool) return false;
      const busy = current && audio.ctx && audio.ctx.currentTime < current.end;
      if (busy && prio < 3) return false;
      if (prio < 3 && t - lastAny < GAP[level]) return false;
      if (prio < 2 && Math.random() > chance * CHANCE[level]) return false;
      if (prio === 2 && level === 1 && Math.random() > .7) return false;
    }
    const line = pick(ev);if (!line) return false;
    lastAt[ev] = lastAny = t;
    play(voiceId, line);
    net()?.send('all', { t: 'vox', v: voiceId, f: line.f, n: name });
    return true;
  }

  // ---- game moments ----
  let startAt = 0;
  host.on('start', () => { started = true;startAt = now();setTimeout(() => say('start'), 1600); });
  host.on('reset', () => { started = false;streak = 0;recent.length = 0; });
  host.on('roundEnd', () => { lastOne = true;setTimeout(() => say(net() && lines.roundEndTeam && Math.random() < .5 ? 'roundEndTeam' : 'roundEnd'), 900); });
  const recent = [];let streak = 0, lastKill = now();
  host.on('kill', e => {
    if (e.remote) return;
    const t = now();lastKill = t;streak++;recent.push(t);while (recent.length && t - recent[0] > 2.2) recent.shift();
    const z = e.enemy;
    if (elite(z) && say('eliteKill')) return;
    if (recent.length >= 4 && say('multiKill')) { recent.length = 0;return; }
    if (streak > 0 && streak % 40 === 0 && say('streak')) return;
    if (e.melee && say('meleeKill')) return;
    if (e.head && say('headshot')) return;
    say('kill');
  });
  host.on('beforeDamage', e => { if (e.amount >= 20 && session.phase === 'fighting') setTimeout(() => say('hurt'), 120); });
  host.on('goingDown', () => say('down'));
  host.on('revived', () => setTimeout(() => say('revived'), 600));
  host.on('reviveDone', () => setTimeout(() => say('reviveTeammate'), 400));
  host.on('gameOver', () => { streak = 0;say('gameOver'); });
  host.on('powerup', () => say('powerup'));
  host.on('abilityUsed', () => say('ability'));
  host.on('gumChewed', () => say('gum'));
  host.on('inspect', () => say('inspect'));
  host.on('abilityReady', () => say('abilityReady'));
  host.on('exfilStart', () => say('exfil'));
  host.on('exfilEnd', e => { if (e?.success) say('exfilWin'); });
  host.on('easterEgg', () => setTimeout(() => say('easterEgg'), 1200));
  wrap(session, 'powerup', () => say('powerup'));
  wrap(session, 'reload', () => { if (session.reloadLeft > 0) say('reload'); });
  let boxAt = -9;
  if (mysteryBox?.start) { const start = mysteryBox.start.bind(mysteryBox);mysteryBox.start = (...a) => { const ok = start(...a);if (ok) say('boxSpin');return ok; }; }
  if (mysteryBox?.take) { const take = mysteryBox.take.bind(mysteryBox);mysteryBox.take = (...a) => { const w = take(...a);if (w) { boxAt = now();setTimeout(() => say('box'), 500); }return w; }; }
  wrap(session, 'giveWeapon', () => { if (started && now() - boxAt > .5 && now() - startAt > 5) say('wallBuy'); });

  // polled: phase changes, perks, Pack-a-Punch, ammo, doors, power, crowds, quiet
  const bosses = new WeakSet();let lastOne = false;
  let phase = null, perks = 0, upgraded = null, weapon = null, dry = null, low = false, doors = 0, power = false, hordeT = 0;
  host.on('update', () => {
    if (!started) return;
    const t = now();
    if (session.phase !== phase) {
      if (session.phase === 'reviving' && !window.kino.coop?.id) say('down');
      if (session.phase === 'fighting') lastOne = false;
      if (session.phase === 'fighting' && phase === 'preparing' && session.round > 1) say(session.dogRound && lines.dogRound ? 'dogRound' : 'roundStart');
      phase = session.phase;
    }
    const n = session.perks?.size ?? 0;if (n > perks) say('perk');perks = n;
    const w = session.weapon;
    if (w !== weapon) { weapon = w;upgraded = w?.upgraded;dry = null; }
    else if (w && w.upgraded && !upgraded) { upgraded = true;setTimeout(() => say('pap'), 700); }
    if (w && w.mag === 0 && w.reserve === 0 && dry !== w) { dry = w;say('noAmmo'); }
    if (session.health < 35 && session.phase === 'fighting' && !low) { low = true;say('lowHealth'); } else if (session.health > 75) low = false;
    const d = session.openDoors?.size ?? 0;if (d > doors && t - startAt > 3) say('door');doors = d;
    if (session.power && !power && t - startAt > 3) say('power');power = !!session.power;
    if (t > hordeT) {
      hordeT = t + 1;let near = 0, alive = 0, boss = null;
      for (const z of enemies.list) { if (!(z.health > 0)) continue;alive++;if (z.root.position.distanceTo(camera.position) < 650) near++;if (!boss && elite(z) && !bosses.has(z)) { bosses.add(z);boss = z; } }
      if (boss) say('boss');else if (near >= 12) say('horde');
      if (!lastOne && alive === 1 && session.phase === 'fighting' && session.total > 3 && session.spawned >= session.total) { lastOne = true;say('lastZombie'); }   // the round's last zombie
    }
    if (session.phase === 'fighting' && t - lastKill > 50 && t - lastAny > 50) { lastKill = t;say('idle'); }
  });
}

const ELITE = new Set(['panzer', 'astronaut', 'sentinel', 'keeper', 'margwa', 'mangler', 'valkyrie']);   // not health: plain zombies pass any fixed number at high rounds
function elite(z){ return !!z && (!!z.boss || ELITE.has(z.kind)); }

function wrap(object, name, after){
  const original = object?.[name];if (typeof original !== 'function') return;
  object[name] = function (...args) { const r = original.apply(this, args);try { after(...args); } catch {}return r; };
}
