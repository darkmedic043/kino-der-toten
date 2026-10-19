// Malibu Drive's heroes (_shield.gsc set_up_trigger, _malibu_utils.gsc return_player_attributes, the heroes' give_*()):
// eleven stations in the character room beside Asgard (`new_character`, script_noteworthy = the hero). Each hero stands
// there posed (_asgard.gsc spawn_*: their full-body idle); taking one turns its figure into a gold statue until it is
// free again. A hero sets health and speed, the arms you see, and their own gear (Tony's phone, Natasha's pistols,
// Spider-Man's web shooter; Mjolnir, the shield and the bows once found). You need one to use the Bifrost.
// Kino's health: the original's values x1.5 (Kino's base is 150 where World at War's is 100).
import * as THREE from 'three';

export const HEROES = [
  { id: 'tony', hud: 'hud_tony_stark', name: 'Tony Stark', color: 6, hp: 100, speed: 1, hands: 'viewhands_tony_stark', figure: 'worldmodel_tony_stark', anim: 'full_body_tony', spawn: 'tony_spawn', statue: 'malibu_gold_statue_2', gear: ['malibu_tony_phone'] },
  { id: 'banner', hud: 'hud_banner', name: 'Bruce Banner', color: 2, hp: 150, speed: 1, hands: 'viewhands_banner', figure: 'hulk', anim: 'full_body_hulk', spawn: 'hulk_spawn', statue: 'malibu_gold_statue_1', gear: [] },
  { id: 'widow', hud: 'hud_black_widow', name: 'Black Widow', color: 0, hp: 300, speed: 1.3, hands: 'black_widow_viewhands', figure: 'black_widow_0', anim: 'full_body_widow', spawn: 'widow_spawn', statue: 'malibu_gold_statue_2', gear: ['malibu_widow_pistols'] },
  { id: 'hawkeye', hud: 'hud_hawkeye', name: 'Hawkeye', color: 6, hp: 350, speed: 1.2, hands: 'viewhands_hawkeye', figure: 'hawkeye_full_body', anim: 'full_body_hawkeye', spawn: 'hawkeye_spawn', statue: 'malibu_gold_statue_2', gear: [], found: 'bows' },
  { id: 'cap', hud: 'hud_cap', name: 'Captain America', color: 4, hp: 400, speed: 1.2, hands: 'viewhands_cap', figure: 'captain_america', attach: ['backmodel_cap_shield'], anim: 'full_body_cap', spawn: 'cap_spawn', statue: 'malibu_gold_statue_1', gear: [], found: 'shield' },
  { id: 'thor', hud: 'hud_thor', name: 'Thor', color: 3, hp: 400, speed: 1.2, hands: 'viewhands_thor', figure: 'thor_full_body_model', anim: 'full_body_thor', spawn: 'thor_spawn', statue: 'malibu_gold_statue_1', gear: [], found: 'hammer' },
  { id: 'quicksilver', hud: 'hud_quicksilver', name: 'Quicksilver', color: 5, hp: 120, speed: 1.5, hands: 'viewhands_quicksilver', figure: 'quicksilver_torso', attach: ['quicksilver_legs', 'quicksilver_head'], anim: 'full_body_mk42', spawn: 'quicksilver_spawn', statue: 'malibu_gold_lion', gear: [] },
  { id: 'scarlet', hud: 'hud_scarlet', name: 'Scarlet Witch', color: 1, hp: 150, speed: 1.2, hands: 'viewhands_scarlet_witch', figure: 'scarlet_witch_0', anim: 'full_body_scarlet', spawn: 'scarlet_spawn', statue: 'malibu_gold_statue_2', gear: ['malibu_scarlet_witch'] },
  { id: 'spiderman', hud: 'hud_spiderman', name: 'Spider-Man', color: 1, hp: 300, speed: 1.3, hands: 'spider_man_view', figure: 'spider_man', anim: 'full_body_spiderman', spawn: 'spiderman_spawn', statue: 'malibu_gold_lion', gear: ['malibu_spiderman'] },
  { id: 'rhodes', hud: 'hud_rhode', name: 'James Rhodes', color: 3, hp: 200, speed: 1.2, hands: null, figure: 'rhode1', anim: 'full_body_rhode', spawn: 'rhodes_spawn', statue: 'malibu_gold_statue_2', gear: [] },
  { id: 'vision', hud: 'hud_vision', name: 'Vision', color: 3, hp: 250, speed: 1.2, hands: 'viewhands_vision', figure: 'vision', anim: 'full_body_vision', spawn: 'vision_spawn', statue: 'malibu_gold_statue_1', gear: [] },
];
const HP_SCALE = 1.5;
// the lines each hero says when picked (one exchange at random; `missing` while their gear is still to be found)
const LINES = {"Tony Stark":{"lines":[[[0,"^6Tony^7: Don't know who I am? You're about to."]],[[0,"^6Tony^7: Tony Stark. Genius, billionaire, playboy, phylanthropist."]],[[0,"^6Tony^7: I have to protect the one thing I can't live without..."],[2.0,"^6Tony^7: Shawarma."]],[[0,"^6Tony^7: Zombies? Fun time."],[1.0,"^4Captain America^7: Is everything a joke to you?"],[1.5,"^6Tony^7: Funny things are."]]],"missing":null},"Thor":{"lines":[[[0,"^3Thor^7: The mighty power of Mjolnir is upon me!"]],[[0,"^3Thor^7: I am the mighty god of thunder."],[1.0,"^1Spider-Man^7: More like the god of flowing hair."]],[[0,"^3Thor^7: I enjoy the fullness of my hair."]],[[0,"^3Thor^7: Where is Jane Foster?"],[1.0,"^3Thor^7: I must find her in this accursed place."]]],"missing":"^3Thor^7: I must find Mjolnir. It could be anywhere."},"Captain America":{"lines":[[[0,"^4Captain America^7: I don't like bullies."],[2.0,"^4Captain America^7: I don't care who they are or how dead they are."]],[[0,"^4Captain America^7: There's only one god."],[1.0,"^4Captain America^7: And I'm certian He's not from Asgard."]],[[0,"^4Captain America^7: World Ice-Bucket Challenge Champion since 1942"]],[[0,"^4Captain America^7: We must fight for freedom amidst these undead."]]],"missing":"^4Captain America^7: My shield fell off the Helicarrier. It must be around somewhere."},"Bruce Banner":{"lines":[[[0,"^2Bruce Banner^7: That's my secret. I'm always crazy."]],[[0,"^2Bruce Banner^7: Oh, I love scary Bruce."],[1.0,"^2Bruce Banner^7: He says what regular Bruce is thinking."]],[[0,"^2Bruce Banner^7: I'm....Getting....ANGRY!!!!!!!"],[2.0,"^2Bruce Banner^7: Just kidding. I'm fine."]],[[0,"^2Bruce Banner^7: The Hulk and I are not a team."],[1.5,"^2Bruce Banner^7: We're a timebomb."]]],"missing":"^2Bruce Banner^7: I'm out of anger serum. I need to make some more."},"Black Widow":{"lines":[[[0,"^0Black Widow^7: Agent Natasha Romanoff. Let's kill 'em."]],[[0,"^0Black Widow^7: Romanoff here. Let's go."]],[[0,"^0Black Widow^7: Girls hate me. Boys love me."]],[[0,"^0Black Widow^7: I'm Russian; come at me zombies."]]],"missing":null},"Hawkeye":{"lines":[[[0,"^6Hawkeye^7: Agent Barton here."]],[[0,"^6Hawkeye^7: It's hard to be a man who got beat up by a woman."],[1.0,"^0Black Widow^7: (insert evil laugh here)"]],[[0,"^6Hawkeye^7: I see better from a distance."]],[[0,"^6Hawkeye^7: I got three types of arrows to use on these monsters."]]],"missing":"^6Hawkeye^7: I think I left my bow at some store somewhere..."},"Scarlet Witch":{"lines":[[[0,"^1Scarlet Witch^7: Until I die, I am an Avenger."]],[[0,"^1Scarlet Witch^7: I am the daughter of Magneto."],[1.0,"^1Scarlet Witch^7: I'm here to help."]],[[0,"^1Scarlet Witch^7: I am incomplete without the Vision."]]],"missing":null},"Quicksilver":{"lines":[[[0,"^5Quicksilver^7: You ever stand behind an old lady at an ATM?"],[2.0,"^5Quicksilver^7: That's how I feel 24/7."]],[[0,"^5Quicksilver^7: You should see me play Galaga sometime."]],[[0,"^5Quicksilver^7: Don't bother trying to catch me."]],[[0,"^5Quicksilver^7: My hands are the quickest. All the time."]]],"missing":null},"Spider-Man":{"lines":[[[0,"^1Spider-Man^7: With great power, comes great electricity bill"]],[[0,"^1Spider-Man^7: Some promises are meant to be broken."],[2.0,"^1Spider-Man^7: Ya, that was bad"]],[[0,"^5Quicksilver^7: Oh joy, not him again."],[2.0,"^1Spider-Man^7: I can't hear you. It's too dark over here"]],[[0,"^1Spider-Man^7: Let it go! Let it go!!!"],[2.0,"^3Thor^7: Cease that abhorrent tune"]]],"missing":null},"James Rhodes":{"lines":[[[0,"^3James Rhodes^7: Ya, baby!!!"]],[[0,"^6Tony^7: Watch out for Mr. Big Gun"],[2.0,"^3James Rhodes^7: You know it"]],[[0,"^6Tony^7: Not you again"],[2.0,"^3James Rhodes^7: Shut up. You love me and you know it"],[2.0,"^6Tony^7: Ya, I do. But I would never say that"]],[[0,"^3James Rhodes^7: War Machine inbound, baby!!!"],[2.0,"^3James Rhodes^7: I just gotta find my armor somewhere"]],[[0,"^3James Rhodes^7: Weapons do 2x the damage in my hands"]]],"missing":null},"Vision":{"lines":[[[0,"^3Vision^7: I'm still adjusting to the real world"]],[[0,"^6Tony^7: You're not gonna go crazy and destroy the human race, right?"],[2.0,"^3Vision^7: No promises"]],[[0,"^3Vision^7: I can fly!"],[2.0,"^6Hawkeye^7: Nah, it's a jump boost"]],[[0,"^1Spider-Man^7: Ooo, it's the JARVIS-robot-monster thingy!!!"],[2.0,"^3Vision^7: Humans are strange creatures"]]],"missing":null}};

export function setupHeroes(kit) {
  const { api, named, one, center, yawOf, say, dialog, figure, remove, model } = kit;
  const { world, session, host, player, data, scene } = api;
  const W = data.weapons;
  let hero = null;                 // the local player's hero (a HEROES entry) or null: "freeplay"
  const taken = new Map();         // hero id -> who (a co-op peer id, or 'me')
  const found = new Set();         // gear found this game: 'hammer', 'shield', 'bows'
  const blockers = [];             // fn() -> a reason you can't change hero now (an armor on, the Hulk...)
  const gearFor = new Map();       // hero id -> extra gear ids (unlocked during the game)
  const listeners = [];
  const base = { move: player.moveSpeed, sprint: player.sprintSpeed };

  // health: the larger of the normal value and the hero's (armors wrap this again)
  const own = Object.getOwnPropertyDescriptor(session, 'maxHealth');
  const baseMax = own?.get ? () => own.get.call(session) : () => own?.value ?? 150;
  let over = {};   // a form's stats over the hero's (the Hulk: hp, speed, hands)
  Object.defineProperty(session, 'maxHealth', { configurable: true, get() { return hero ? baseMax() - 150 + (over.hp ?? hero.hp) * HP_SCALE : baseMax(); }, set() {} });
  const applySpeed = () => { const scale = over.speed ?? hero?.speed ?? 1; player.moveSpeed = base.move * scale; player.sprintSpeed = base.sprint * scale; };

  // arms: SetViewmodel. Weapons whose own hands are WaW's "no model"/cloth placeholders use the player's arms, as do all
  // of this game's guns (data.characters' default arms)
  const DIR = api.map.dir.replace(/\/?$/, '/');
  const handsUrl = n => n ? DIR + 'models/' + n + '.glb' : null;
  const defaultArms = { pow: data.characters?.viewmodel_usa_pow_arms, usmc: data.characters?.viewhands_usmc };
  let armsOverride = null;   // an armor's arms (tony.js), over the hero's
  const setArms = () => {
    const url = handsUrl(armsOverride ?? over.hands ?? hero?.hands);
    if (data.characters) { data.characters.viewmodel_usa_pow_arms = url ?? defaultArms.pow; if (!defaultArms.pow) data.characters.viewhands_usmc = url ?? defaultArms.usmc; }
    for (const d of Object.values(W)) if (d.malibuArms) d.handsModel = url ?? d.malibuArms;
    api.view && (api.view.currentId = null);   // the view caches by weapon id: re-equip with the new arms
    api.equipView?.();
  };

  const isGear = id => !!W[id]?.malibuHero;
  const give = id => {
    const d = W[id]; if (!d || session.inventory.some(w => w.id === id)) return;
    session.cancelReload?.();
    session.inventory.push({ id, mag: d.clipSize, reserve: Math.max(0, (d.maxAmmo ?? 0) - d.clipSize), upgraded: false });
    session.slot = session.inventory.length - 1; api.equipView?.();
  };
  const takeGear = () => {
    const before = session.inventory.length;
    session.inventory = session.inventory.filter(w => !isGear(w.id));
    if (session.inventory.length !== before) { session.slot = Math.min(session.slot, Math.max(0, session.inventory.length - 1)); api.equipView?.(); }
  };

  function become(h, { quiet = false, remote = false } = {}) {
    const prev = hero;
    if (prev) taken.delete(prev.id);
    takeGear();
    hero = h; over = {};
    if (h) taken.set(h.id, 'me');
    applySpeed();
    if (h) session.health = session.maxHealth; else session.health = Math.min(session.health, session.maxHealth);
    setArms();
    for (const id of [...(h?.gear ?? []), ...(gearFor.get(h?.id) ?? [])]) give(id);
    refreshFigures(); refreshHud();
    if (h && !quiet) {
      say(`[i] You are now playing as ^${h.color}${h.name}`);
      const L = LINES[h.name];
      const missing = h.found && !found.has(h.found) && L?.missing;
      if (missing) dialog([[2, missing]]);
      else if (L?.lines.length) dialog(L.lines[Math.floor(Math.random() * L.lines.length)].map(([d, t], i) => [i ? d : 2, t]));
    }
    if (!remote) window.kino.coop?.id && window.kino.coop.send('all', { t: 'malibu', k: 'hero', d: h?.id ?? null });
    for (const fn of listeners) fn(h, prev);
  }

  // ---- the hero's icon (top right, as the original's *_interface: 100 x 100) and full-screen overlays (the Hulk's view;
  // without a hero, the freeplay view)
  const icon = document.createElement('img'), overlay = document.createElement('img');
  icon.style.cssText = 'position:fixed;right:22px;top:132px;width:92px;height:92px;z-index:29;pointer-events:none;display:none;filter:drop-shadow(0 2px 4px #000)';
  overlay.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:fill;z-index:28;pointer-events:none;display:none;opacity:.55';
  document.body.append(overlay, icon);
  let suited = false;
  const hudUrl = n => DIR + 'hud/' + n + '.webp';
  const refreshHud = () => {
    const name = over.hud ?? hero?.hud;
    icon.style.display = name && !suited ? 'block' : 'none'; if (name) icon.src = hudUrl(name);
    const ov = over.overlay ?? (!hero && window.kino.malibu?.inLobby?.() ? '1stperson_view_freeplay' : null);
    overlay.style.display = ov ? 'block' : 'none'; if (ov) overlay.src = hudUrl(ov);
  };
  host.on('suitChange', ({ on }) => { suited = on; refreshHud(); });
  let lobbyWas = null;
  host.on('update', () => { const l = !!window.kino.malibu?.inLobby?.(); if (l !== lobbyWas) { lobbyWas = l; refreshHud(); } });

  // ---- the figures in the character room, gold statues while taken
  const figures = new Map();   // hero id -> {fig, statue}
  const refreshFigures = () => {
    for (const h of HEROES) {
      const f = figures.get(h.id); if (!f) continue;
      const busy = taken.has(h.id);
      if (f.fig) f.fig.visible = !busy;
      if (f.statue) f.statue.visible = busy;
    }
  };
  (async () => {
    for (const h of HEROES) {
      const at = one(h.spawn); if (!at) continue;
      const position = new THREE.Vector3(...at.origin), yaw = yawOf(at);
      // stand on the floor (the structs sit up to 32 below it in places; the original's anims lift them)
      const hit = world.raycast(new THREE.Ray(position.clone().add(new THREE.Vector3(0, 90, 0)), new THREE.Vector3(0, -1, 0)), 0, 200);
      if (hit) position.y = position.y + 90 - hit.distance;
      const fig = await figure(h.figure, h.anim, { position, yaw, attach: h.attach ?? [] });
      const statue = await figure(h.statue, null, { position: position.clone().add(new THREE.Vector3(0, h.statue === 'malibu_gold_lion' ? 27 : 0, 0)), yaw });
      if (statue) statue.visible = false;
      figures.set(h.id, { fig, statue });
    }
    refreshFigures();
  })();

  // ---- the stations
  for (const e of named('new_character')) {
    const h = HEROES.find(x => x.name === e.note); if (!h) continue;
    const it = world.addInteraction({
      position: center(e), sight: true,
      hidden: () => hero === h,
      text: () => `Play as ${h.name}`,
      use() {
        if (taken.has(h.id) && taken.get(h.id) !== 'me') { say(`[i] ${h.name} is taken`); return false; }
        const why = blockers.map(fn => fn()).find(Boolean);
        if (why) { say('[i] ' + why); return false; }
        become(h); return true;
      },
    });
    it.locked = () => taken.has(h.id) && taken.get(h.id) !== 'me';
    Object.defineProperty(it, 'lockedText', { get: () => `${h.name} is taken by a teammate`, configurable: true });
  }

  // ---- the Bifrost needs a hero ("Choose a character to continue")
  const bifrost = world.teleporters.find(t => t.name === 'bifrost');
  if (bifrost) { Object.defineProperty(bifrost, 'locked', { configurable: true, get: () => !hero, set() {} }); bifrost.lockedText = 'Choose a character to continue'; }

  // ---- co-op: heroes are unique; peers announce theirs
  const peerHero = new Map();
  const net = window.kino.coop;
  net?.on?.('malibu', (m, from) => {
    if (m?.k !== 'hero') return;
    const prev = peerHero.get(from); if (prev) taken.delete(prev);
    if (m.d) { taken.set(m.d, from); peerHero.set(from, m.d); const h = HEROES.find(x => x.id === m.d); if (h) say(`[i] A teammate is now playing as ^${h.color}${h.name}`); }
    else peerHero.delete(from);
    refreshFigures();
  });
  net?.on?.('left', p => { const id = peerHero.get(p?.id); if (id) { taken.delete(id); peerHero.delete(p.id); refreshFigures(); } });

  host.on('reset', () => { hero = null; over = {}; taken.clear(); found.clear(); gearFor.clear(); armsOverride = null; suited = false; player.moveSpeed = base.move; player.sprintSpeed = base.sprint; setArms(); refreshFigures(); refreshHud(); });

  return {
    hero: () => hero, is: id => hero?.id === id, become, HEROES,
    onChange: fn => listeners.push(fn), block: fn => blockers.push(fn),
    found: what => found.has(what), find: what => found.add(what),
    giveGear: (heroId, id) => { const list = gearFor.get(heroId) ?? []; if (!list.includes(id)) list.push(id); gearFor.set(heroId, list); if (hero?.id === heroId) give(id); },
    give, takeGear, setArms: n => { armsOverride = n; setArms(); }, handsUrl,
    // a form over the hero (the Hulk, Vision's Molecular Mode...): {hp, speed, hands}; null clears it
    setForm: f => { over = f ?? {}; applySpeed(); session.health = Math.min(session.maxHealth, f?.hp ? session.maxHealth : session.health); setArms(); refreshHud(); }, form: () => over,
    name: () => hero ? hero.name : 'Freeplay',
  };
}
