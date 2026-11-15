#!/usr/bin/env python3
# Gorod Krovi's zombie spawn table: export/web/mods/maps/gorod-krovi/spawns.json (git-ignored map folder, read by
# mods/gorod-krovi/zombies.js). Run with python3 -I:
#   python3 -I .tools/gorod_spawns.py export_game/bo3/maps/zm_stalingrad <zm_stalingrad_zones.gsc> [out.json]
# Inputs: the dump's zm_stalingrad.spawns.json (.tools/bo3_spawns.py: each zone's spot structs, the windows),
# zm_stalingrad.volumes.json (the player zone volumes' boxes, read from the running game: absmin/absmax of each
# info_volume) and the map's zone script (only its add_adjacent_zone / add_zone_flags calls are read, as data).
# Output, all in map units (BO3 x, z, -y):
#   zones   BO3 zone name -> {id: our zone id (yellow_A_zone -> yellowa, the three start zones "start"), box: [[min],[max]],
#           spots: [[x, y, z, yaw°, kind ("s" spawn_location, "r" riser_location), window index or -1 (find_flesh)]]}
#   windows [[x, y, z, set]]: BO3's window (exterior goal) per window set
#   links   [[from zone, to zone, flag]]: one-way adjacencies (add_adjacent_zone ..., 1), flags as our ids (no underscores)
#   derived {flag: [flags that set it]} (add_zone_flags)
#   initial the zone that is active when no player is in one (manage_zones' initial_zone)
import json, re, sys

D = sys.argv[1].rstrip('/')
gsc = open(sys.argv[2], errors='replace').read()
out = sys.argv[3] if len(sys.argv) > 3 else 'export/web/mods/maps/gorod-krovi/spawns.json'
sp = json.load(open(D + '/zm_stalingrad.spawns.json'))
vols = json.load(open(D + '/zm_stalingrad.volumes.json'))

M = lambda v: [round(v[0], 1), round(v[2], 1), round(-v[1], 1)]   # BO3 -> map
flag = lambda f: f.replace('_', '').lower()
def zid(z):
    if z.startswith('start_'): return 'start'
    return re.sub(r'_zone$', '', z).replace('_', '').lower()

windows, wix = [], {}
for w in sp['windows']:
    wix[w['set']] = len(windows); windows.append(M(w['origin']) + [w['set']])

zones = {}
for name, z in sp['zones'].items():
    box = next((b for b in vols.get(name, []) if b.get('noteworthy') == 'player_volume'), None)
    if not box: print('no volume:', name); continue
    lo, hi = box['min'], box['max']
    spots = []
    for kind, code in (('spawn_location', 's'), ('riser_location', 'r')):
        for s in z['spots'].get(kind, []):
            w = s.get('window')
            spots.append(M(s['origin']) + [round(s.get('yaw', 0), 1), code, -1 if not w or w == 'find_flesh' else wix[w]])
    zones[name] = {'id': zid(name), 'box': [[lo[0], lo[2], -hi[1]], [hi[0], hi[2], -lo[1]]], 'spots': spots}
for name, b in vols.items():   # zones with a volume and no spots (pavlovs_C, powered_bridge): occupancy only
    if name not in zones and any(x.get('noteworthy') == 'player_volume' for x in b):
        x = next(x for x in b if x.get('noteworthy') == 'player_volume'); lo, hi = x['min'], x['max']
        zones[name] = {'id': zid(name), 'box': [[lo[0], lo[2], -hi[1]], [hi[0], hi[2], -lo[1]]], 'spots': []}

code = re.sub(r'/\*.*?\*/', '', gsc, flags=re.S)
links = []
for a, b, f, one in re.findall(r'add_adjacent_zone\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*(?:,\s*(\d))?', code):
    links.append([a, b, flag(f)])
    if one != '1': links.append([b, a, flag(f)])
derived = {}
for wait, add in re.findall(r'add_zone_flags\(\s*"([^"]+)"\s*,\s*"([^"]+)"', code):
    derived.setdefault(flag(add), []).append(flag(wait))
missing = sorted({x for l in links for x in l[:2]} - set(zones))
if missing: print('linked zones without a volume:', missing)

res = {'zones': zones, 'windows': windows, 'links': links, 'derived': derived, 'initial': 'start_A_zone'}   # zm_stalingrad.gsc's init_zones[0]
with open(out, 'w') as f: json.dump(res, f, separators=(',', ':'))
n = sum(len(z['spots']) for z in zones.values())
print(f'{out}: {len(zones)} zones, {n} spots ({sum(1 for z in zones.values() for s in z["spots"] if s[5] >= 0)} feed a window), '
      f'{len(windows)} windows, {len(links)} links, {len(derived)} derived flags')
