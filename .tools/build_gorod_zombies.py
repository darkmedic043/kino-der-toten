#!/usr/bin/env python3
"""Gorod Krovi's own zombies for the gorod-krovi mod (zombies.js): BO3's Russian zombie bodies, heads and hats
(c_zom_dlc3_rus_zombies_body1-4, head1-4, the helmet/officer cap/ushanka hats), exported with Greyhound from the
running game, as skinned GLBs the engine's BO1 zombie animations can drive. Same pipeline as build_castle_zombies.py:

  python3 -I .tools/build_gorod_zombies.py

CoD skeleton (BO1's ai_zombie_* clips find the bones by name), centimetres scaled to inches, BO3's finger joints renamed
to BO1's numbering. Textures: WebP, embedded, colour up to 1024 px, normals 1024 (bodies) / 512 (heads, hats); a gib
piece carries its body's textures as 16 px stand-ins (zombies.js gives it the body's own materials). The hats are
one-bone (j_head) rigid meshes. Output: export/web/mods/maps/gorod-krovi/zombies/ (git-ignored: ripped).
"""
import importlib.util, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GH = pathlib.Path('/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
OUT = ROOT/'export/web/mods/maps/gorod-krovi/zombies'
_spec = importlib.util.spec_from_file_location('semodel_to_glb', pathlib.Path(__file__).parent/'semodel_to_glb.py')
SEM = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(SEM)
P = 'c_zom_dlc3_rus_zombies_'
MODELS = [P + f'body{k}' for k in (1, 2, 3, 4)] + [P + f'head{k}' for k in (1, 2, 3, 4)]
MODELS += [P + h for h in ('head1_helmet', 'head1_officercap', 'head1_ushanka', 'head2_officercap', 'head2_ushanka',
                           'head3_helmet', 'head3_officercap', 'head3_ushanka', 'head4_helmet')]
GIBS = ['upclean', 'lowclean', 'behead', 'larmoff', 'rarmoff', 'llegoff', 'rlegoff', 'blegsoff']
MODELS += [P + f'body{k}_g_{g}' for k in (1, 2, 3, 4) for g in GIBS if (GH/'xmodels'/(P + f'body{k}_g_{g}')).exists()]
CM = 1 / 2.54
RENAME = {f'j_{f}_{s}_{k}': f'j_{f}_{s}_{k-1}' for f in ['index', 'mid', 'ring', 'pinky', 'thumb'] for s in ['le', 'ri'] for k in (1, 2, 3)}
# body1's behead piece (the neck stump) points at a Japanese zombie head the export doesn't have: use head1's
SUBST = {'i_c_zom_dlc2_jpn_zombie_head_2_c': 'i_c_zom_dlc3_rus_zombie_head_1_c', 'i_c_zom_dlc2_jpn_zombie_head_2_n': 'i_c_zom_dlc3_rus_zombie_head_1_n'}

GIB = False
MISSING = set()
def webp(stem, kind):
    if kind not in ('diffuse', 'normal'): return None
    stem = SUBST.get(stem, stem)
    src = GH/'ximages'/(stem + '.png')
    if not src.exists(): MISSING.add(stem); return None
    small = any(w in stem for w in ('head', 'helmet', 'cap', 'ushanka'))   # heads and hats
    body = 'zom_dlc3_rus' in stem and 'head' not in stem   # the clothes and flesh a gib piece shares with its body
    size = 16 if GIB and body else 512 if kind == 'normal' and small else 1024
    with tempfile.NamedTemporaryFile(suffix='.webp') as out:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', f"scale='min({size},iw)':-2:flags=lanczos", '-c:v', 'libwebp', '-quality', '88' if kind == 'diffuse' else '84', out.name], check=True)
        return pathlib.Path(out.name).read_bytes(), 'image/webp'

def scaled(sem):
    for b in sem['bones']:
        for k in ('wpos', 'lpos'):
            if k in b: b[k] = tuple(v * CM for v in b[k])
    for m in sem['meshes']: m['pos'] = [tuple(v * CM for v in p) for p in m['pos']]
    return sem

OUT.mkdir(parents=True, exist_ok=True); (OUT/'.gitignore').write_text('*\n')
only = set(sys.argv[1:])
for name in MODELS:
    if only and not any(o in name for o in only): continue
    src = GH/'xmodels'/name/(name + '_LOD0.semodel')
    if not src.exists(): print('not exported:', name); continue
    GIB = '_g_' in name
    SEM.to_glb(scaled(SEM.read_semodel(src)), OUT/(name + '.glb'), texture_loader=webp, rename=RENAME)
    print('wrote', name, round((OUT/(name + '.glb')).stat().st_size / 1e6, 2), 'MB')
if MISSING: print('missing images:', sorted(MISSING))
