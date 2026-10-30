#!/usr/bin/env python3
"""The Reaper Collection Rebuilt's perks (BO3 workshop mod 3814067303, by Logical Reaper) for Melon Zombies:
machines, bottles, HUD icons, jingles/stings and an asset index (perks.json), into export/web/mods/perks-plus/reaper/
(git-ignored: ripped mod art), for the perks catalogued in mods/perks-plus/reaper-perks.json (tracked). Source: Greyhound's export in BO3's Proton prefix
(models/images from the running game with the mod's xpaks linked into zone/; sounds via Load File on the mod's
snd/all/core_mod.all.sabs and, for the jingles this build lacks, the older Reaper Collection 2801151115's zm_mod.all.sabs).
See docs/fork/reaper-perks.md.
  python3 .tools/build_reaper_perks.py [--only id,id]
"""
import argparse, json, pathlib, subprocess, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import semodel_to_glb as SEM
GH = pathlib.Path('/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
OUT = pathlib.Path(__file__).resolve().parent.parent/'export'/'web'/'mods'/'perks-plus'/'reaper'
CM = 1 / 2.54   # Greyhound writes models in centimetres; the game is in inches

# The perks themselves (names, effects, origin, and the BO3/mod asset names built from) are the tracked catalogue
# mods/perks-plus/reaper-perks.json; this builds its git-ignored assets.
CAT = json.loads((OUT.parent/'reaper-perks.json').read_text())['perks']
P = {id: dict(name=e['name'], specialty=e['specialty'], effect=e['effect'], upgrade=e['upgrade'], new=e['new'],
              machine=e['source']['machine'], icon=e['source']['icon'], label=e['source']['label'], sound=e['source']['sound'])
     for id, e in CAT.items()}

# the mod's effect sounds the perks play (reaper-perks.js sound(id, key)), exported from its bank under reaps_cz/
EFFECTS = {'dyingwish': {'start': 'reaps_cz/dying_wish/dyingwish_start_plr', 'end': 'reaps_cz/dying_wish/dyingwish_end_plr'},
           'momentum': {'hit': 'reaps_cz/momentum/momentum_hit', 'activate': 'reaps_cz/momentum/momentum_activate'},
           'phdslider': {'slider_explode': 'reaps_cz/phd_slider/phd_slider_explode'},
           'prismatic': {'punch_activate': 'reaps_cz/prismatic_punch/prismatic_punch_activate', 'punch_max_size': 'reaps_cz/prismatic_punch/prismatic_punch_max_size'},
           'stronghold': {'armour_hit': 'reaps_cz/stone_cold_stronghold/armour_hit', 'armour_broken': 'reaps_cz/stone_cold_stronghold/armour_broken'},
           'winterwail': {'cryofreeze': 'reaps_cz/winters_wail/cryofreeze'}, 'bloodwolf': {'whistle': 'reaps_cz/blood_wolf_bite/bloodwolf_whistle'},
           'zombshell': {'start': 'reaps_cz/zombshell/zombshell_start'}, 'estatic': {'stun': 'reaps_cz/estatic_elixir/electric_stun'}}

def ff(*args): subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *map(str, args)], check=True)
def webp(src, size=512, kind='diffuse'):
    vf = f"scale='min({size},iw)':-2"
    if kind == 'rough': vf = 'format=gray,negate,format=rgb24,' + vf   # BO3 gloss -> roughness
    with tempfile.NamedTemporaryFile(suffix='.webp') as out:
        ff('-i', src, '-vf', vf, '-c:v', 'libwebp', '-quality', '85', out.name)
        return pathlib.Path(out.name).read_bytes()
def loader(swap=None):
    def load(stem, kind):
        if swap and stem in swap: stem = swap[stem]
        src = GH/'ximages'/(stem + '.png')
        return (webp(src, kind=kind), 'image/webp') if src.exists() else None
    return load
def model(name):
    sem = SEM.read_semodel(GH/'xmodels'/name/(name + '_LOD0.semodel'))
    for m in sem['meshes']: m['pos'] = [(x * CM, y * CM, z * CM) for x, y, z in m['pos']]
    for b in sem['bones']:
        for k in ('wpos', 'lpos'):
            if k in b: b[k] = tuple(v * CM for v in b[k])
    return sem
def bounds(sem):
    pts = [p for m in sem['meshes'] for p in m['pos']]
    return [[round(min(c), 2) for c in zip(*pts)], [round(max(c), 2) for c in zip(*pts)]]

# The mod's shared paints (reap_shared_metal_<colour>, reap_colour_<colour>) are a grey micro texture tinted by a material
# constant the SEModel doesn't carry, so they came out plain grey: the colour comes from the name.
REAP_TINT = {'black': [.04, .04, .04], 'orange': [.75, .33, .06], 'purple': [.33, .1, .5], 'white': [.85, .85, .83], 'emmisive_white': [1, 1, 1],
             'chrome_blue': [.2, .35, .75], 'chrome': [.75, .75, .78], 'chrome_black': [.08, .08, .09], 'copper_orange': [.72, .38, .16],
             'dark_bronze': [.3, .2, .1], 'dark_grey': [.12, .12, .12], 'dark_red': [.35, .04, .04], 'deep_green': [.05, .26, .1],
             'olive': [.3, .32, .12], 'red': [.6, .06, .05], 'yellow': [.8, .62, .08]}
def tint_glb(path):
    b = bytearray(path.read_bytes())
    n = int.from_bytes(b[12:16], 'little'); doc = json.loads(b[20:20 + n])
    hit = False
    for m in doc.get('materials', []):
        name = m.get('name', '')
        key = name.split('reap_shared_metal_')[-1] if 'reap_shared_metal_' in name else name.split('reap_shared_')[-1] if 'reap_shared_' in name \
            else name.split('reap_colour_')[-1] if 'reap_colour_' in name else name.split('reap_common_')[-1] if 'reap_common_' in name else None
        if key not in REAP_TINT: continue
        pbr = m.setdefault('pbrMetallicRoughness', {}); pbr['baseColorFactor'] = REAP_TINT[key] + [1]
        if 'chrome' in key: pbr['metallicFactor'] = .8; pbr['roughnessFactor'] = .3
        if key == 'emmisive_white': m['emissiveFactor'] = [1, 1, 1]
        hit = True
    if not hit: return
    js = json.dumps(doc, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    rest = b[20 + n:]
    out = b[:12] + len(js).to_bytes(4, 'little') + b'JSON' + js + rest
    out[8:12] = len(out).to_bytes(4, 'little'); path.write_bytes(out)

ap = argparse.ArgumentParser(); ap.add_argument('--only'); a = ap.parse_args()
only = set(a.only.split(',')) if a.only else None
KEEP_ICONS = {'electriccherry'}   # the user's own art, placed by hand: a rebuild must not overwrite it
for d in ('machines', 'bottles', 'icons', 'audio'): (OUT/d).mkdir(parents=True, exist_ok=True)
BOTTLE = 'wpn_t7_zmb_perk_bottle_template_view'
paper = next(pathlib.Path(m['diffuse'].replace('\\', '/')).stem for m in SEM.read_semodel(GH/'xmodels'/BOTTLE/(BOTTLE + '_LOD0.semodel'))['materials']
             if 'paper' in m['name'])
SND = GH/'sounds'
catalogue = {}
for id, p in P.items():
    if only and id not in only: continue
    e = {k: p[k] for k in ('name', 'specialty', 'effect', 'upgrade', 'new')}
    sem = model(p['machine'])
    SEM.to_glb(sem, OUT/'machines'/f"{p['machine']}.glb", texture_loader=loader())
    tint_glb(OUT/'machines'/f"{p['machine']}.glb")
    e['machine'] = f"machines/{p['machine']}.glb"; e['machineBounds'] = bounds(sem)
    if p['label'] and (GH/'ximages'/(p['label'] + '.png')).exists():
        SEM.to_glb(model(BOTTLE), OUT/'bottles'/f'{id}.glb', texture_loader=loader({paper: p['label']}))
        e['bottle'] = f'bottles/{id}.glb'
    icon = GH/'ximages'/(p['icon'] + '.png')
    if id in KEEP_ICONS and (OUT/'icons'/f'{id}.webp').exists():
        e['icon'] = f'icons/{id}.webp'
    elif icon.exists():
        ff('-i', icon, '-c:v', 'libwebp', '-quality', '90', OUT/'icons'/f'{id}.webp'); e['icon'] = f'icons/{id}.webp'
    s = p['sound']
    if s:
        pair = s if isinstance(s, list) else (s + 'jingle', s + 'sting')
        for kind, stem in zip(('jingle', 'sting'), pair):
            src = SND/(stem + '.wav')
            if src.exists():
                ff('-i', src, '-c:a', 'libvorbis', '-q:a', '4', OUT/'audio'/f'{id}_{kind}.ogg'); e[kind] = f'audio/{id}_{kind}.ogg'
    for k, stem in EFFECTS.get(id, {}).items():
        src = SND/(stem + '.wav')
        if src.exists(): ff('-i', src, '-c:a', 'libvorbis', '-q:a', '4', OUT/'audio'/f'{id}_{k}.ogg'); e.setdefault('sounds', {})[k] = f'audio/{id}_{k}.ogg'
    catalogue[id] = e
    print(id, ' '.join(k for k in ('machine', 'bottle', 'icon', 'jingle', 'sting') if k in e))
cat = OUT/'perks.json'
if only and cat.exists(): catalogue = {**json.loads(cat.read_text()), **catalogue}
cat.write_text(json.dumps(catalogue, indent=1) + '\n')
print(len(catalogue), 'perks ->', cat)
