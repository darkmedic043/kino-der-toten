// Nuketown's smaller scripted pieces:
//   - The zipline (zipline_start): from the roof at the construction end down over the town, four legs of a second each.
//     Locked until the road or the blue house is open, as the original; no fall damage at the end.
//   - Fire tornadoes (_nt_moving_fire.gsc): four walk their chains round the edge of the map, 3 s a leg, harmless; fire_tornado
//     loops while the player is above ground.
//   - The song (ee_song.gsc): three meteors hum; use all three and, 3 s later, the song plays.
//   - The TV (richtofen_tv): from round 2, a line after each round. The nuke alarm every 300 s above ground.
//   - Electric Cherry (zombie_vending_bo2): its machine is part of the map, in the lab; the perk itself is the Reaper Collection's.
import { makeTornado, spotLoop } from './fx.js';

const ZIPLINE = { start: [-530, 1880, -602], path: [[-424, 1848, -118], [-328, 1824, 200], [-165, 1787, 732], [48, 1753, 1441]], leg: 1 };
const LEG = 3, ABOVE = [[-3011, 1613, -1807], [3483, 2119, 3701]];
const FIRES = [
  [[-2287, 1650, 2208], [-2281, 1658, 2096], [-2222, 1663, 2012], [-2216, 1664, 1924], [-2279, 1661, 1840], [-2364, 1657, 1762], [-2474, 1651, 1662], [-2560, 1646, 1497], [-2606, 1634, 1333], [-2707, 1625, 1210], [-2729, 1620, 1076], [-2809, 1617, 909], [-2937, 1621, 741], [-2939, 1640, 613], [-2867, 1620, 525], [-2770, 1630, 570], [-2574, 1647, 626], [-2579, 1658, 811], [-2505, 1663, 1009], [-2510, 1655, 1220], [-2452, 1660, 1411], [-2346, 1662, 1519], [-2168, 1674, 1567], [-1957, 1707, 1525], [-1811, 1703, 1617], [-1802, 1701, 1770], [-1942, 1697, 1951], [-1991, 1683, 2188], [-2141, 1666, 2269]],
  [[-2064, 1704, -1140], [-2090, 1704, -1036], [-2226, 1699, -1018], [-2408, 1672, -896], [-2474, 1670, -726], [-2428, 1676, -612], [-2448, 1674, -478], [-2532, 1665, -326], [-2552, 1660, -156], [-2478, 1669, 2], [-2284, 1688, 92], [-2190, 1696, 230], [-2178, 1698, 346], [-2288, 1690, 484], [-2498, 1660, 456], [-2664, 1632, 494], [-2810, 1622, 410], [-2920, 1610, 228], [-2880, 1618, -4], [-2776, 1630, -180], [-2660, 1642, -342], [-2640, 1642, -492], [-2710, 1645, -662], [-2872, 1635, -804], [-2888, 1633, -976], [-2772, 1645, -1076], [-2544, 1667, -1076], [-2326, 1687, -1182], [-2158, 1705, -1200]],
  [[1837, 1668, 387], [1993, 1675, 257], [2170, 1666, 130], [2226, 1668, -45], [2178, 1679, -156], [2189, 1701, -291], [2262, 1660, -447], [2256, 1649, -618], [2184, 1651, -772], [1997, 1694, -853], [1912, 1690, -986], [1874, 1678, -1101], [1982, 1668, -1244], [2194, 1703, -1223], [2360, 1682, -1273], [2510, 1695, -1194], [2622, 1717, -1020], [2597, 1699, -786], [2505, 1686, -605], [2398, 1663, -438], [2384, 1771, -187], [2462, 1656, -40], [2631, 1655, 39], [2635, 1651, 184], [2540, 1641, 290], [2317, 1653, 301], [2101, 1675, 418], [1934, 1680, 444]],
  [[2606, 1635, 496], [2438, 1657, 607], [2246, 1661, 717], [2170, 1671, 882], [2209, 1670, 999], [2180, 1673, 1131], [2086, 1679, 1277], [2054, 1680, 1445], [2118, 1678, 1608], [2306, 1668, 1711], [2391, 1661, 1855], [2396, 1662, 1971], [2277, 1674, 2102], [2067, 1678, 2060], [1897, 1677, 2087], [1757, 1690, 1993], [1659, 1694, 1804], [1714, 1692, 1575], [1830, 1686, 1407], [1957, 1677, 1253], [1987, 1673, 1104], [1929, 1685, 930], [1777, 1699, 778], [1773, 1698, 605], [1895, 1690, 513], [2123, 1675, 528], [2348, 1660, 437], [2518, 1651, 430]],
];
const METEORS = [[-745, 1864, 2100], [-1183, 1744, -599], [-1123, 1389, 1167]], SONG = 'varien_lilith', SONG_GAIN = .55;
const TV = [-772, 1762, -776], TV_LINES = 5, TV_REACH = 1400;
const ALARM_EVERY = 300;
const CHERRY = { perk: 'specialty_electriccherry', bottle: 'specialty_magnet', at: [-636, 1400, 1511] };

export function setupExtras(c) {
  const { api, world, session, host, sync, V, moved, sound, sfx, toast, announce, player, inBox, place, st } = c;
  const x = { };
  const v = a => V(...a);

  // the drink borrows a bottle already loaded: Cherry stays off everywhere else (reaper-perks.js)
  const { data, perkDrink } = api, bottle = CHERRY.bottle;
  if (data.perkDrinks[bottle]) { data.perkDrinks[CHERRY.perk] = data.perkDrinks[bottle]; if (perkDrink?.views?.[bottle]) perkDrink.views[CHERRY.perk] = perkDrink.views[bottle]; }
  world.interactions.push({ kind: 'perk', perk: CHERRY.perk, position: v(CHERRY.at) });

  // ---- zipline
  const ride = [...ZIPLINE.path.map(v)];
  const open = () => { const z = world.activeZones?.(session); return !!(z?.has('road') || z?.has('blue') || z?.has('blueback')); };
  world.addInteraction({
    position: v(ZIPLINE.start), nuketown: true, text: () => 'Use the Zipline', hidden: () => x.zip != null,
    locked: () => !open(), lockedText: 'The area the zipline leads to has to be opened first',
    use() { x.zip = { from: player.getFeetPosition().clone(), t: 0 }; sfx('teleport', .3); return true; },
  });
  const zipTick = dt => {
    const z = x.zip; if (!z) return;
    if (session.phase === 'reviving' || session.phase === 'gameover') { x.zip = null; return; }
    z.t += dt; st.spoutSafe = 1.5;
    const i = Math.floor(z.t / ZIPLINE.leg), f = z.t / ZIPLINE.leg - i;
    if (i >= ride.length) { x.zip = null; player.setPosition(ride.at(-1).clone().add(V(0, 2, 0))); return; }
    place((i ? ride[i - 1] : z.from).clone().lerp(ride[i], f));
  };

  // ---- fire tornadoes
  const fires = FIRES.map(chain => ({ chain: chain.map(v), group: makeTornado(api) }));
  const fireLoop = spotLoop(api, 'fire_tornado', 1500, .5);
  const fireTick = (dt, p) => {
    x.fire += dt;
    const spots = [];
    for (const q of fires) {
      const n = q.chain.length, t = x.fire / LEG % n, i = Math.floor(t);
      q.group.position.copy(q.chain[i]).lerp(q.chain[(i + 1) % n], t - i); moved(q.group); spots.push(q.group.position);
    }
    fireLoop.tick(p, spots, inBox(p, ABOVE));
  };

  // ---- the song
  x.meteors = METEORS.map(() => false);
  const hum = spotLoop(api, 'necros_portal', 260, .35);
  METEORS.forEach((a, i) => world.addInteraction({
    position: v(a), nuketown: true, hidden: () => x.meteors[i], text: () => 'Touch the meteor',
    use() { sync.act('ntMeteor', { i }); return true; },
  }));
  sync.on('ntMeteor', (d, ctx) => {
    if (x.meteors[d.i]) return; x.meteors[d.i] = true; sound('tactical_buttonpress', .8);
    const n = x.meteors.filter(Boolean).length; if (ctx.mine) toast(`Meteor ${n} / ${METEORS.length}`, 3);
    if (n === METEORS.length) { clearTimeout(x.songAt); x.songAt = setTimeout(() => { x.song = sound(SONG, SONG_GAIN); }, 3000); }
  });

  // ---- the TV, the alarm
  host.on('roundEnd', ({ round }) => {
    if (round < 1 || x.tv >= TV_LINES) return;
    x.tv++; const d = player.getFeetPosition().distanceTo(v(TV));
    if (d < TV_REACH) sound('nt_rich' + x.tv, (1 - d / TV_REACH) ** 2);
  });
  const alarmTick = (dt, p) => { if ((x.alarm -= dt) > 0) return; x.alarm = ALARM_EVERY; if (inBox(p, ABOVE)) sound('nuke_alarm', .5); };

  const reset = () => {
    Object.assign(x, { zip: null, fire: 0, meteors: METEORS.map(() => false), tv: 0, alarm: ALARM_EVERY }); clearTimeout(x.songAt);
    try { x.song?.pause(); } catch {} x.song = null; fireLoop.stop(); hum.stop();
  };
  host.on('gameOver', () => { try { x.song?.pause(); } catch {} x.song = null; fireLoop.stop(); hum.stop(); });
  const tick = (dt, p) => {
    zipTick(dt); fireTick(dt, p); alarmTick(dt, p);
    hum.tick(p, METEORS.filter((a, i) => !x.meteors[i]).map(v));
  };
  const state = () => ({ meteors: METEORS.map((a, i) => ({ at: v(a), done: x.meteors[i] })) });
  return { x, reset, tick, state, fires };
}
