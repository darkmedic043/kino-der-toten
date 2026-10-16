// Der Eisendrache (a BO3 map ported by .tools/build_bo3_map.py; see docs/fork/waw-ports.md). Does nothing elsewhere.
// Zones: BO3's zone manager links pairs of zones by a flag (zm_castle_zones.gsc add_adjacent_zone) and some flags set
// others (add_zone_flags). The build gives every door and debris pile its whole flag as its zone
// (connect_start_to_subclocktower -> connectstarttosubclocktower) and every spawner its BO3 zone without underscores;
// world.activeZones is replaced here: an open door sets its flag, the power sets power_on and opens the electric doors
// (connect_start_to_undercroft has no pieces in the map, so the power sets it here), and both zones of every pair whose
// flag is set are active.
const ADJ = [["v10pad","v10paddoor","castleteleporterused"],["v10paddoor","v10padexterior","castleteleporterused"],["start","tramhigh","alwayson"],["start","tramtogatehouse","connectstarttotram2gatehouse"],["tramhigh","tramtosubclocktowerbot","connectstarttosubclocktower"],["tramhigh","undercroftjail","connectstarttoundercroft"],["tramtosubclocktower","tramtosubclocktowertop","activatetramtosubclocktower"],["tramtosubclocktower","tramtosubclocktowerbot","activatetramtosubclocktower"],["tramtosubclocktowertop","courtyard","connectsubclocktowertocourtyard"],["clocktower","courtyardedge","activatecourtyard"],["clocktower","clocktowerrooftop","activatecourtyard"],["courtyard","courtyardedge","activatecourtyard"],["courtyard","clocktowerrooftop","activatecourtyard"],["courtyard","greathall","connectgreathalltocourtyard"],["courtyardedge","greathallupperleft","connectcourtyardtogreathallupper"],["courtyard","greathallupper","connectcourtyardtogreathallupper"],["gatehouse","lowergatehouse","buyabledropdowngatehousetolowercourtyard"],["tramtogatehouse","lowergatehouse","connectgatehousearea"],["gatehouse","lowercourtyardupper","connectlowercourtyard"],["lowercourtyard","lowercourtyardupper","connectlowercourtyard"],["lowercourtyardupper","ramparts","poweron"],["lowercourtyard","lowergatehouse","connectgatehousetolowercourtyard"],["lowercourtyardupper","livingquarters","connectlowercourtyardtolivingquarters"],["lowercourtyardupper","lowercourtyardback","connectlowercourtyard"],["lowercourtyard","lowercourtyardback","connectlowercourtyard"],["lowercourtyardback","undercroftpaphall","connectlowercourtyardtoundercroft"],["greathallupper","armory","connectgreathalltoarmory"],["greathall","greathallupperleft","activategreathall"],["greathall","greathallupper","activategreathall"],["armory","armoryback","activatearmory"],["armory","livingquarters","connectarmorytolivingquarters"],["rooftop","ramparts","poweron"],["rooftop","clocktowerrooftop","poweron"],["rooftop","armoryback","poweron"],["undercroftchapel","greathall","connectgreathalltoundercroft"],["undercroft","undercroftlab","connectundercrofttoundercroftlab"],["undercroft","undercroftchapel","activateundercroft"],["undercroft","undercroftjail","activateundercroft"],["undercroft","undercroftpap","activateundercroft"],["undercroftjail","undercroftpap","activateundercroft"],["undercroftpap","undercroftpaphall","activateundercroft"]];
const DERIVED = {"activatecourtyard":["connectsubclocktowertocourtyard","connectcourtyardtogreathallupper","connectcourtyardtorooftop","connectgreathalltocourtyard","connectarmorytorooftop"],"activatetramtosubclocktower":["connectstarttosubclocktower","connectsubclocktowertocourtyard"],"connectgatehousearea":["connectstarttotram2gatehouse","connectgatehousetolowercourtyard","buyabledropdowngatehousetolowercourtyard"],"connectlowercourtyard":["connectgatehousetolowercourtyard","connectlowercourtyardtolivingquarters","connectlowercoutryardtorooftop","connectlowercourtyardtoundercroft"],"activategreathall":["connectgreathalltoarmory","connectgreathalltoundercroft","connectcourtyardtogreathallupper"],"activatearmory":["connectarmorytolivingquarters","connectgreathalltoarmory"],"activateundercroft":["connectlowercourtyardtoundercroft","connectgreathalltoundercroft"]};
const POWER_FLAGS = ['poweron', 'connectstarttoundercroft'];

export default function setup(api) {
  if (api.map?.id !== 'der-eisendrache') return;
  const { world, session } = api;
  const flags = s => {
    const f = new Set(['alwayson']);
    for (const d of world.doors.values()) if (d.zone && world.isOpen(d, s)) f.add(d.zone);
    if (s.power) for (const p of POWER_FLAGS) f.add(p);
    for (const x of s.flags) if (x.startsWith('castle:flag:')) f.add(x.slice(12));   // set by later scripts (castleteleporterused)
    for (const [g, from] of Object.entries(DERIVED)) if (from.some(x => f.has(x))) f.add(g);
    return f;
  };
  world.activeZones = s => {
    const f = flags(s), zones = new Set(['start']);
    for (const [a, b, flag] of ADJ) if (f.has(flag)) { zones.add(a); zones.add(b); }
    for (const x of s.flags) if (x.startsWith('zone:')) zones.add(x.slice(5));
    return zones;
  };
  window.kino ??= {}; window.kino.castle = { flags: () => [...flags(session)], zones: () => [...world.activeZones(session)] };
}
