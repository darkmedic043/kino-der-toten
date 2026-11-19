# Gorod Krovi's placed effects for the mod's fires and smoke (mods/gorod-krovi/air.js): the `fx` entities of the map's
# entity string that burn all the time (no exploder) plus the far "vista" fires (exploder fxexp_710), as
# {types, fx: [[type, x, y, z, yaw]...], rect} in map axes (BO3 x, y, z -> x, z, -y; yaw in BO3 degrees), rect = the
# town's playable zones (spawns.json, without Pavlov's) plus a margin: the area of the ash's roof map. The output is map data: it goes into
# the map's git-ignored folder. python3 -I .tools/gorod-fx.py (rerun only if the entity dump changes)
import json, os, re, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTS = os.path.join(ROOT, 'export_game/bo3/maps/zm_stalingrad/zm_stalingrad.ents')
OUT = os.path.join(ROOT, 'export/web/mods/maps/gorod-krovi/fx.json')
ZONES = os.path.join(ROOT, 'export/web/mods/maps/gorod-krovi/spawns.json')
WANT = re.compile(r'fx_(fire_|embers_(smolder|smk_smolder|ceiling)|smk_(smolder|column))')
text = open(ENTS, errors='replace').read()
types, fx, count = [], [], collections.Counter()
for block in re.findall(r'\{([^{}]*)\}', text):
    kv = dict(re.findall(r'"([^"]+)" "([^"]*)"', block))
    if kv.get('classname') != 'fx': continue
    name = kv['fxdef'].split('/')[-1]
    gates = [re.search(r'name=(\S+)', v).group(1) for k, v in kv.items() if k.startswith('exploder_index') and 'name=' in v]
    if 'exploder_count' in kv and gates != ['fxexp_710']: continue   # switched by the scripts (the dragon's fire hazards, strikes, the boss)
    if not WANT.search(name) or 'haz' in name: continue
    x, y, z = (float(v) for v in kv['origin'].split())
    if name not in types: types.append(name)
    yaw = float((kv.get('angles') or '0 0 0').split()[1])
    fx.append([types.index(name), round(x, 1), round(z, 1), round(-y, 1), round(yaw)]); count[name] += 1
boxes = [z['box'] for k, z in json.load(open(ZONES))['zones'].items() if z.get('box') and not k.startswith('pavlovs')]   # Pavlov's is 20,000 units north
rect = [min(b[0][0] for b in boxes) - 600, min(b[0][2] for b in boxes) - 600, max(b[1][0] for b in boxes) + 600, max(b[1][2] for b in boxes) + 600]
json.dump({'types': types, 'fx': fx, 'rect': [round(v) for v in rect]}, open(OUT, 'w'), separators=(',', ':'))
print(len(fx), 'effects,', len(types), 'types, town rect', [round(v) for v in rect]); print(count.most_common())
