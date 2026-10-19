// Malibu Drive's music (_zombiemode.gsc do_pre_intro, begin_custom_ambient_music, play_random_music, end_game_music and
// the intro titles): the map's own tracks from its iwd (sounds/, git-ignored), in place of this game's ambience.
//   Asgard: the pre-intro loops (malibu_pre_intro) under "Welcome to Asgard" and "Choose a Hero to Continue".
//   The first Bifrost trip down: the intro song (malibu_drive_intro_song) with the opening titles ("Earth Has Fallen",
//     "There's Only One Group", "Who Can Save the World", the Avengers logo, "Malibu Drive: Age of Apocalypse"); 20 s
//     later Captain America's radio line and the round music starts.
//   Rounds: the calm loop (malibu_ambient_calm = prison_background) while fewer than seven zombies are up, the
//     aggressive one (malibu_ambient_agressive) from seven, each change a 3 s fade (checked every 10 s, as the map does);
//     the music stops when a round ends and comes back 15 s later.
//   The ending (the Easter egg's win): malibu_ending_music.
// It is this game's music as far as the engine and RADIO.EXE know: it stands in audio.music (the radio stops it when a
// song plays) and audio.playMusic('ambience') brings it back instead of the engine's ambience.
const LEVEL = 1 / .42;

export function setupMusic(kit, heroes) {
  const { api, dir, wait, say, now } = kit;
  const { host, session, audio, enemies } = api;
  const base = dir + 'sounds/';
  let cur = null, want = null, intro = false, stopped = false, roundRest = 0, checkAt = 0, ended = false;
  const vol = { malibu_pre_intro: .45, malibu_drive_intro_song: .6, prison_background: .35, malibu_ambient_agressive: .38, malibu_ending_music: .6 };

  // an <audio> through the game's mixer (its volume and mute), faded in and out
  function track(name, loop) {
    const a = new Audio(base + name + '.ogg'); a.loop = loop;
    const ctx = audio?.ctx, master = audio?.master; let g = null;
    if (ctx && master) { g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(a).connect(g).connect(master); if (ctx.state === 'suspended') ctx.resume().catch(() => {}); }
    else a.volume = 0;
    const t = { name, a, target: (vol[name] ?? .4) * LEVEL, level: 0, fade: 1.5, dying: false,
      set(x) { this.level = x; if (g) g.gain.value = x; else a.volume = Math.min(1, x / LEVEL); } };
    a.play().catch(() => {});
    return t;
  }
  const dying = new Set(), ctl = { stop: () => stop() };   // the radio's duck() stops "the music": this
  const radioOn = () => !!window.kino.radio?.status?.().songs?.some(s => s.playing);
  function play(name, { loop = true, fade = 3 } = {}) {
    if (cur?.name === name && !cur.dying) return;
    if (radioOn()) { stopped = true; return; }   // the radio has the music; it asks for the ambience back when it stops
    if (audio && audio.music !== ctl) { try { audio.music?.stop?.(); } catch {} audio.musicToken++; audio.music = ctl; }   // the engine's ambience
    if (cur) { cur.dying = true; cur.fade = fade; dying.add(cur); }
    cur = name ? track(name, loop) : null;
    if (cur) cur.fade = 1.5;
  }
  function stop(fade = 2) { stopped = true; if (cur) { cur.dying = true; cur.fade = fade; dying.add(cur); cur = null; } }
  host.on('update', dt => {
    const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60;
    if (cur && !cur.dying) cur.set(Math.min(cur.target, cur.level + cur.target * step / cur.fade));
    for (const t of dying) { t.set(Math.max(0, t.level - t.target * step / t.fade)); if (t.level <= 0) { t.a.pause(); t.a.src = ''; dying.delete(t); } }
    if (cur && !cur.a.loop && cur.a.ended) cur = null;
  });
  // the engine's ambience: ours instead (also what the radio asks for when it stops)
  if (audio?.playMusic) {
    const playMusic = audio.playMusic.bind(audio);
    audio.playMusic = key => { if (key === 'ambience') { stopped = false; resume(); return Promise.resolve(); } return playMusic(key); };
  }
  const resume = () => { if (want) play(want); };
  const set = name => { want = name; if (!stopped) play(name); };

  // ---- the titles (the original's centred HUD text: gold, fading in and out)
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:22vh;pointer-events:none;z-index:35';   // below the round announcement
  let gen = 0;   // a new sequence (the trip down, a reset) cuts the one before
  document.body.append(box);
  async function title(text, { hold = 3, color = '#ffd700', size = 'clamp(26px,5vw,58px)', img = null, sub = null } = {}) {
    const g = gen;
    const el = document.createElement('div');
    el.style.cssText = `opacity:0;transition:opacity 1s;text-align:center;font:700 ${size} Georgia,serif;color:${color};text-shadow:0 2px 6px #000,0 0 18px #0009;letter-spacing:2px`;
    if (img) el.innerHTML = `<img src="${dir}hud/${img}.webp" style="width:min(550px,80vw);display:block;margin:auto">`; else el.textContent = text;
    box.append(el); requestAnimationFrame(() => { el.style.opacity = 1; });
    if (sub) { const s = document.createElement('div'); s.textContent = sub; s.style.cssText = 'margin-top:12px;font:600 clamp(14px,2vw,22px) Georgia,serif;color:#848484;text-shadow:0 1px 3px #000;opacity:0;transition:opacity 1s'; el.append(s); setTimeout(() => { s.style.opacity = 1; }, 2000); }
    await wait(1 + hold); el.style.opacity = 0; await wait(1); el.remove();
    return g === gen;
  }

  // ---- Asgard, then the trip down
  let welcomed = false;
  async function welcome() {
    if (welcomed) return; welcomed = true;
    set('malibu_pre_intro');
    const g = gen;
    await wait(2); if (g !== gen) return;
    if (await title('Welcome to Asgard', { hold: 3 }) && !heroes.hero()) await title('Choose a Hero to Continue', { hold: 3 });
  }
  host.on('start', welcome);
  let lobbyWas = true;
  host.on('update', () => {
    const lobby = !!window.kino.malibu?.inLobby?.();
    if (lobbyWas && !lobby && !intro && session.phase !== 'gameover') { intro = true; earth(); }
    lobbyWas = lobby;
    // the round music: calm under seven zombies, aggressive from seven (checked every 10 s)
    if (!intro || ended || want === 'malibu_drive_intro_song' || now() < roundRest || now() < checkAt) return;
    checkAt = now() + 10;
    set(enemies.list.length > 6 ? 'malibu_ambient_agressive' : 'prison_background');
  });
  async function earth() {
    set('malibu_drive_intro_song');
    const g = ++gen; box.innerHTML = '';
    (async () => {
      for (const t of ['Earth Has Fallen', "There's Only One Group", 'Who Can Save the World']) if (!await title(t, { hold: 3 })) return;
      await wait(2); await title('', { img: 'hud_avengers_intro', hold: 7, sub: 'Malibu Drive: Age of Apocalypse' });
    })();
    await wait(20); if (g !== gen) return;
    say('^4Captain America^7: Avengers, we can communicate at all times via our in-ear tech');
    if (want === 'malibu_drive_intro_song') want = null;
    checkAt = 0;
  }
  // between rounds the music rests 15 s
  host.on('roundEnd', () => { if (!intro || ended) return; want = null; if (cur) { cur.dying = true; cur.fade = 1; dying.add(cur); cur = null; } roundRest = now() + 15; checkAt = 0; });
  // the ending
  host.on('malibuWon', () => { ended = true; set('malibu_ending_music'); window.kino.radio?.heard?.('malibu:ending'); });
  host.on('gameOver', () => { if (!ended) { ended = true; stop(2); } });
  host.on('reset', () => {
    for (const t of [cur, ...dying]) if (t) { t.a.pause(); t.a.src = ''; }
    dying.clear(); cur = null; want = null; intro = false; stopped = false; ended = false; roundRest = 0; checkAt = 0; welcomed = false; lobbyWas = true; gen++; box.innerHTML = '';
    setTimeout(welcome, 500);
  });
  // the radio: the intro song joins it the first time you hear it (kino.radio.heard)
  host.on('update', () => { if (want === 'malibu_drive_intro_song' && cur?.name === want && cur.a.currentTime > 1 && !radioHeard) { radioHeard = true; window.kino.radio?.heard?.('malibu:intro'); } });
  let radioHeard = false;
  host.on('reset', () => { radioHeard = false; });
  return { state: () => ({ want, playing: cur?.name ?? null, intro, ended, stopped }) };
}
