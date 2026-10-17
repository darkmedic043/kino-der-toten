// The journal (JOURNAL.EXE on the terminal booth, user 2026-10-17): every map's Easter eggs and quests, step by step
// (mods/journal/quests.js). Doing a step records it for good (kino.mods.journal, cloud-synced): its instructions show
// in the journal from then on. Tracking a quest of the map you're on shows its current step in a panel and drops
// markers on the screen at the step's spots (unrecorded steps get markers too, but their instructions stay hidden).
// Steps are watched twice a second; cheat games record nothing. Team progress counts in co-op (the quests are shared).
// window.kino.journal: {status(), track(map, quest), untrack()}
import * as THREE from 'three';
import { JOURNAL, questsFor } from './quests.js';

const KEY = 'kino.mods.journal', TRACK = 'kino.journal.track';
export function loadJournal() { try { return { maps: {}, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { maps: {} }; } }
const saveJournal = j => { try { localStorage.setItem(KEY, JSON.stringify(j)); } catch {} };
const loadTrack = () => { try { return JSON.parse(localStorage.getItem(TRACK)); } catch { return null; } };

export default async function setup(api) {
  const { session, host, world, camera } = api;
  const mapId = api.map?.id ?? 'kino', quests = questsFor(mapId), kino = window.kino;
  const v = a => new THREE.Vector3().fromArray(a);
  const pos = o => o.getWorldPosition(new THREE.Vector3());
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const nodeCache = new Map();
  // the live context the quest functions read (see quests.js)
  const L = {
    api, session, world, v, castle: null, de: null, moon: null,
    prompts(re) {
      const out = [];
      for (const e of world?.interactions ?? []) {
        if (!e.position || e.hidden?.()) continue;
        let t = ''; try { t = typeof e.text === 'function' ? e.text() : e.text ?? ''; } catch {}
        if (t && re.test(t)) out.push(e.position.clone?.() ?? v(e.position));
      }
      return out;
    },
    nodes(re, keep) {
      const key = re.source; let list = nodeCache.get(key);
      if (!list) { list = []; world?.root?.traverse(o => { const m = re.exec(o.name); if (m) list.push([o, m]); }); nodeCache.set(key, list); }
      return list.filter(([o, m]) => shown(o) && (!keep || keep(m))).map(([o]) => pos(o));
    },
    ents: name => (L.moon?.data?.entities ?? api.data?.entities ?? []).filter(e => e.targetname === name && e.position).map(e => v(e.position)),
    targets: (kind, keep) => (L.moon?.targets ?? []).filter(t => t.kind === kind && t.e?.position && (!keep || keep(t))).map(t => v(t.e.position)),
    power: () => (world?.interactions ?? []).filter(e => e.kind === 'power' && e.position).map(e => e.position.clone()),
    cc: () => kino.cheeseCube?.state?.(), ccSuits: () => kino.cheeseCube?.suits?.(),
    tile: id => kino.scoreboard?.get?.(id),
    reels: () => { try { return kino.debug?.completionState?.(); } catch { return null; } },
    meteors: () => { try { return kino.debug?.specialState?.().meteors; } catch { return null; } },
  };
  if (mapId === 'der-eisendrache') {
    Promise.all([import('../der-eisendrache/ee.js'), import('../der-eisendrache/side.js'), import('../der-eisendrache/side2.js')])
      .then(([ee, side, side2]) => { L.de = { SUMMON: ee.SUMMON, TRAVEL: ee.TRAVEL, PAD: ee.PAD, SPOT: ee.SPOT, STONES: ee.STONES, PADS: side.PADS, RUNS: side.RUNS, SIDE: side.SPOT, SPOT2: side2.SPOT, GRAMOPHONES: side2.GRAMOPHONES, CLAWS: side2.CLAWS, SKULLS: side2.SKULLS }; })
      .catch(e => console.warn('[journal] castle spots', e));
  }
  // Moon's quest lives in its MoonFeatures (maps/moon.js exposes it as kino.debug.moonFeatures)
  const live = () => { L.castle = kino.castle ?? null; if (mapId === 'moon') L.moon = kino.debug?.moonFeatures?.() ?? null; return L; };

  // ---- which steps are done right now (this match), and recording them ----------------------------------------
  const safe = (f, fallback) => { try { return f(); } catch { return fallback; } };
  function doneNow(q) {
    live();
    if (q.progress) { const p = safe(() => q.progress(L), 0) || 0; return q.steps.map((s, i) => i < p); }
    return q.steps.map(s => !!safe(() => s.done?.(L), false));
  }
  const recordedOf = (j, map, id) => new Set(j.maps[map]?.[id] ?? []);
  function record() {
    if (kino.cheats?.used || !quests.length) return;
    const j = loadJournal(); let changed = false;
    for (const q of quests) {
      const now = doneNow(q), rec = recordedOf(j, mapId, q.id);
      now.forEach((d, i) => { if (d && !rec.has(i)) { rec.add(i); changed = true; api.toast?.(`JOURNAL · ${q.name}: ${q.steps[i].title} recorded`, 3); } });
      if (rec.size) (j.maps[mapId] ??= {})[q.id] = [...rec].sort((a, b) => a - b);
    }
    if (changed) saveJournal(j);
  }

  // ---- tracking: the panel and the markers ----------------------------------------------------------------------
  let tracked = null;   // {q, current index, recorded, points: [Vector3]}
  function track(map, id) {
    try { localStorage.setItem(TRACK, JSON.stringify({ map, quest: id })); } catch {}
    refresh(); return true;
  }
  function untrack() { try { localStorage.removeItem(TRACK); } catch {} refresh(); return true; }
  function refresh() {
    const t = loadTrack(), q = t?.map === mapId ? quests.find(x => x.id === t.quest) : null;
    if (!q) { tracked = null; draw(); return; }
    const now = doneNow(q), i = now.findIndex(d => !d), rec = recordedOf(loadJournal(), mapId, q.id);
    const step = q.steps[i], known = i >= 0 && rec.has(i);
    const points = [];   // markers within 60 units of one another are drawn once
    if (step?.where) for (const p of safe(() => step.where(L), [])) if (p?.isVector3 && points.length < 24 && !points.some(q => q.distanceTo(p) < 60)) points.push(p);
    tracked = { q, i, done: i < 0, step, known, points };
    draw();
  }

  const style = document.createElement('style'); style.textContent = `
    #journal-track{position:fixed;right:18px;top:120px;z-index:4;width:280px;pointer-events:none;font:600 12px/1.35 Arial,sans-serif;color:#e8f6ec;text-shadow:0 1px 2px #000;
      background:linear-gradient(90deg,#0000,#000a 30%);padding:8px 10px 8px 22px;border-right:3px solid #7dffa6;display:none}
    #journal-track.on{display:block}#journal-track small{display:block;font-size:10px;letter-spacing:2px;color:#7dffa6}
    #journal-track b{display:block;font-size:14px;margin:1px 0 3px}#journal-track p{margin:0;opacity:.9;font-weight:500}#journal-track p.un{color:#ffd36b}
    #journal-marks{position:fixed;inset:0;pointer-events:none;z-index:3}
    #journal-marks i{position:absolute;width:0;height:0;font:700 11px/1 Arial,sans-serif;color:#eafff0;text-shadow:0 1px 2px #000}
    #journal-marks i::before{content:'';position:absolute;left:-7px;top:-7px;width:12px;height:12px;border:2px solid #7dffa6;background:#7dffa633;transform:rotate(45deg);box-shadow:0 0 8px #3dff8a}
    #journal-marks i span{position:absolute;left:-30px;width:60px;top:10px;text-align:center}
    #journal-marks i.edge::before{border-color:#ffd36b;background:#ffd36b33;box-shadow:0 0 8px #ffb000}
    body.menu-open #journal-track,body.menu-open #journal-marks{visibility:hidden}`;
  document.head.append(style);
  const panel = document.createElement('div'); panel.id = 'journal-track'; document.body.append(panel);
  const marks = document.createElement('div'); marks.id = 'journal-marks'; document.body.append(marks);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let panelKey = '';
  function draw() {
    const t = tracked, key = t ? [t.q.id, t.i, t.known, !!t.points.length].join() : '';
    if (key === panelKey) return; panelKey = key;
    panel.classList.toggle('on', !!t);
    if (!t) { panel.innerHTML = ''; return; }
    const total = t.q.steps.length;
    panel.innerHTML = t.done ? `<small>JOURNAL · TRACKING</small><b>${esc(t.q.name)}</b><p>Complete this match.</p>`
      : `<small>JOURNAL · STEP ${t.i + 1} / ${total}</small><b>${esc(t.q.name)}${t.known ? ' · ' + esc(t.step.title) : ''}</b>`
        + (t.known ? `<p>${esc(t.step.how.length > 160 ? t.step.how.slice(0, 157) + '…' : t.step.how)}</p>` : `<p class="un">Not recorded yet${t.points.length ? ': the markers show where. Do' : ': do'} it once and the journal keeps the instructions.</p>`);
  }
  const tmp = new THREE.Vector3(), cam = new THREE.Vector3();
  function project() {
    const pts = tracked?.points ?? [];
    while (marks.children.length < pts.length) marks.append(Object.assign(document.createElement('i'), { innerHTML: '<span></span>' }));
    const W = innerWidth, H = innerHeight, M = 36;
    camera.getWorldPosition(cam);
    for (let k = 0; k < marks.children.length; k++) {
      const el = marks.children[k], p = pts[k];
      if (!p) { el.style.display = 'none'; continue; }
      el.style.display = '';
      tmp.copy(p).applyMatrix4(camera.matrixWorldInverse); const behind = tmp.z > 0;
      tmp.copy(p).project(camera);
      let x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H;
      if (behind) { x = W - x; y = H - M; }
      const edge = behind || x < M || x > W - M || y < M || y > H - M;
      x = Math.min(W - M, Math.max(M, x)); y = Math.min(H - M, Math.max(M, y));
      el.style.transform = `translate(${x}px,${y}px)`; el.classList.toggle('edge', edge);
      el.firstChild.textContent = Math.round(p.distanceTo(cam) * .0254) + ' m';
    }
  }

  let tick = 0;
  host.on('update', dt => {
    if ((tick -= dt || 0) <= 0) { tick = .5; record(); refresh(); }
    if (tracked?.points.length) project(); else if (marks.childElementCount) marks.replaceChildren();
  });
  host.on('reset', () => { tick = 0; });

  // ---- the terminal's view ------------------------------------------------------------------------------------
  function status() {
    const j = loadJournal(), t = loadTrack();
    return { map: mapId, cheating: !!kino.cheats?.used, maps: JOURNAL.map(m => ({ map: m.map, title: m.title, here: m.map === mapId, quests: m.quests.map(q => {
      const rec = recordedOf(j, m.map, q.id), now = m.map === mapId ? doneNow(q) : null;
      return { id: q.id, name: q.name, kind: q.kind, total: q.steps.length, recorded: rec.size, tracked: t?.map === m.map && t?.quest === q.id,
        steps: q.steps.map((s, i) => rec.has(i) ? { title: s.title, how: s.how, recorded: true, now: !!now?.[i] } : { recorded: false, now: !!now?.[i] }) };
    }) })) };
  }
  kino.journal = { status, track, untrack };
}
