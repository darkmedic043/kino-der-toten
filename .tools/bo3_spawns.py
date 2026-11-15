#!/usr/bin/env python3
# Every spawn location in a Black Ops III map dump, so a port loses none of them (docs/fork/bo3-ports.md, 2.3).
#   python3 -I .tools/bo3_spawns.py <bsp name> [--glb export/web/mods/maps/<id>/<id>.glb]
# Reads export_game/bo3/maps/<bsp>/<bsp>.ents (written by bo3_dump_map.py), prints the inventory and what looks wrong,
# and writes <bsp>.spawns.json beside it (positions in the game's own units: inches, Z up, yaw in degrees).
# --glb also counts the built map's PLAYER_SPAWN / ZSPAWN / WINDOW markers per zone, to compare with the dump.
import collections, json, os, re, struct, sys
BSP = sys.argv[1]; SRC = os.path.join('export_game', 'bo3', 'maps', BSP)
ents = [dict(re.findall(r'"([^"]*)" "([^"]*)"', b)) for b in re.findall(r'\{(.*?)\}', open(os.path.join(SRC, BSP + '.ents'), encoding='latin1').read(), re.S)]
vec = lambda s: [float(x) for x in (s or '0 0 0').split()]
pt = lambda e, **k: dict(origin=vec(e.get('origin')), yaw=vec(e.get('angles'))[1], **{a: b for a, b in k.items() if b not in (None, '')})
by = collections.defaultdict(list)
for e in ents: by[e.get('targetname', '')].append(e)
kinds = lambda e: [t for t in e.get('script_noteworthy', '').split() if t.endswith('_location') or t == 'custom_spawner_entry']
out = {'bsp': BSP, 'units': 'inches, Z up, yaw in degrees', 'player': {}, 'zones': {}, 'outsideZones': {}, 'windows': [], 'spawners': [], 'other': {}}
warn = []

# ---- players: the map start, the four co-op start points, the respawn points (one per zone, each with four spots)
P = out['player']
P['info_player_start'] = [pt(e) for e in ents if e.get('classname') == 'info_player_start']
P['initial_spawn_points'] = [pt(e, slot=e.get('script_noteworthy'), n=e.get('script_int')) for e in by['initial_spawn_points']]
P['respawn'] = [pt(e, zone=e.get('script_noteworthy'), dist=e.get('script_int'), spots=[pt(x, slot=x.get('script_noteworthy')) for x in by.get(e.get('target', '\0'), [])]) for e in by['player_respawn_point']]
if not P['info_player_start']: warn.append('no info_player_start')
if len(P['initial_spawn_points']) < 4: warn.append(f"{len(P['initial_spawn_points'])} initial_spawn_points (4 expected for co-op)")
for r in P['respawn']:
    if len(r.get('spots', [])) < 4: warn.append(f"respawn point of {r.get('zone')} has {len(r.get('spots', []))} spots")

# ---- zones: each player_volume names its zone (targetname) and points at its spawn structs (target)
vols = [e for e in ents if e.get('script_noteworthy') == 'player_volume']
in_zone = set()
for v in vols:
    z = out['zones'].setdefault(v.get('targetname', '?'), {'target': v.get('target'), 'volumes': 0, 'spots': collections.defaultdict(list)}); z['volumes'] += 1
for name, z in out['zones'].items():
    spots = by.get(z['target'] or '\0', [])
    if not spots: warn.append(f"zone {name}: target {z['target']!r} resolves to nothing")
    for e in spots:
        in_zone.add(id(e))
        for k in kinds(e) or (['(no kind)'] if e.get('classname') == 'script_struct' and not e.get('model') else []):
            z['spots'][k].append(pt(e, kind=e.get('script_noteworthy'), window=None if e.get('script_string') in (None, 'find_flesh') else e.get('script_string')))
    if not any(k in z['spots'] for k in ('spawn_location', 'riser_location', 'faller_location')): warn.append(f"zone {name}: no zombie spawn (spawn_location / riser_location) of its own")
suffix = collections.Counter(re.sub(r'^.*_', '_', z['target']) for z in out['zones'].values() if z['target'])
if set(suffix) - {'_spawners'}: warn.append(f"spawn targetnames do not all end in _spawners ({dict(suffix)}): build_bo3_map.py matches that suffix, follow each volume's target instead")

# ---- spawn structs no zone points at: boss arenas, drop pods, quest steps. Their script decides when they are used
for e in ents:
    if kinds(e) and id(e) not in in_zone:
        out['outsideZones'].setdefault(e.get('targetname', '?'), []).append(pt(e, kind=e.get('script_noteworthy')))

# ---- windows: a barrier, its exterior_goal (the outward side) and the spawn structs that share its script_string
for e in ents:
    if not e.get('classname', '').startswith('zbarrier_zmcore_basicwoodbarrier'): continue
    goal = next((x for x in ents if x.get('targetname') == 'exterior_goal' and x.get('target') == e.get('targetname')), None)
    sp = [x for x in ents if kinds(x) and x.get('script_string') == e.get('script_string')] if e.get('script_string') else []
    out['windows'].append(pt(e, name=e.get('targetname'), set=e.get('script_string'), goal=vec(goal['origin']) if goal else None, spawns=len(sp)))
    if not goal: warn.append(f"window {e.get('targetname')}: no exterior_goal (outward side unknown)")
    if not sp: warn.append(f"window {e.get('targetname')} ({e.get('script_string')}): no spawn struct shares its script_string")

# ---- which enemies the map spawns, and every other entity whose name says spawn
out['spawners'] = sorted({(e['classname'], e.get('script_noteworthy', '')) for e in ents if e.get('classname', '').startswith('actor_spawner_')})
seen = {id(x) for x in by['initial_spawn_points'] + by['player_respawn_point'] + [x for e in by['player_respawn_point'] for x in by.get(e.get('target', '\0'), [])]}
for e in ents:
    tn = e.get('targetname', '')
    if re.search(r'spawn', tn, re.I) and id(e) not in in_zone and id(e) not in seen and not kinds(e) and not e.get('classname', '').startswith('actor_spawner_'):
        out['other'].setdefault(tn, []).append(pt(e, classname=e.get('classname')))

for z in out['zones'].values(): z['spots'] = dict(z['spots'])
json.dump(out, open(os.path.join(SRC, BSP + '.spawns.json'), 'w'), separators=(',', ':'))
tot = collections.Counter(k for z in out['zones'].values() for k, v in z['spots'].items() for _ in v)
print(f"{BSP}: {len(ents)} entities")
print(f"players: start {len(P['info_player_start'])}, co-op starts {len(P['initial_spawn_points'])}, respawn points {len(P['respawn'])} ({sum(len(r.get('spots', [])) for r in P['respawn'])} spots)")
print(f"zones: {len(out['zones'])} ({len(vols)} volumes); spots by kind: " + ', '.join(f'{k} {n}' for k, n in tot.most_common()))
print(f"windows: {len(out['windows'])}; enemy spawners: " + ', '.join(c.removeprefix('actor_spawner_') for c, _ in out['spawners']))
print('outside any zone: ' + (', '.join(f'{k} x{len(v)}' for k, v in sorted(out['outsideZones'].items(), key=lambda x: -len(x[1]))[:14]) or 'none'))
print('other spawn entities: ' + (', '.join(f'{k} x{len(v)}' for k, v in sorted(out['other'].items(), key=lambda x: -len(x[1]))[:14]) or 'none'))
print('per zone (zombie spawns / risers / other kinds):')
for name, z in sorted(out['zones'].items()):
    s = z['spots']; rest = ', '.join(f'{k} {len(v)}' for k, v in s.items() if k not in ('spawn_location', 'riser_location'))
    print(f"  {name:34} {len(s.get('spawn_location', [])):3} {len(s.get('riser_location', [])):3}  {rest}")
print(f'{len(warn)} to look at:'); [print('  ! ' + w) for w in warn]

if '--glb' in sys.argv:   # the built map: markers per zone (zone ids have no underscores; MAPCFG groups can rename them)
    f = open(sys.argv[sys.argv.index('--glb') + 1], 'rb'); f.read(12); n, _ = struct.unpack('<II', f.read(8)); g = json.loads(f.read(n))
    c = collections.Counter()
    for nd in g['nodes']:
        m = re.match(r'(PLAYER_SPAWN|SPAWN_PLAYER|ZSPAWN|WINDOW)(?:_([^_.]*))?', nd.get('name', ''))
        if m: c[(m[1], (nd.get('extras') or {}).get('zone') or m[2] or '', bool((nd.get('extras') or {}).get('walk')))] += 1
    print('built map markers: ' + ', '.join(f"{t} {sum(v for k, v in c.items() if k[0] == t)}" for t in ('PLAYER_SPAWN', 'ZSPAWN', 'WINDOW')) + f", walk-in ZSPAWN {sum(v for k, v in c.items() if k[2])}")
    zs = collections.Counter(); [zs.update({k[1]: v}) for k, v in c.items() if k[0] == 'ZSPAWN']
    print('  ZSPAWN per zone: ' + ', '.join(f'{k} {v}' for k, v in sorted(zs.items())))
    built = set(zs); zid = lambda t: re.sub(r'^zone_|_zone$', '', t).replace('_', '').lower()
    miss = [n for n, z in out['zones'].items() if zid(n) not in built and any(k in z['spots'] for k in ('spawn_location', 'riser_location'))]
    print(f"  dump zones with zombie spawns but no ZSPAWN of that zone id ({len(miss)}; a zone grouped under another by MAPCFG is fine): " + ', '.join(miss))
