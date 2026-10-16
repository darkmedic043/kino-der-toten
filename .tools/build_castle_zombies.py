#!/usr/bin/env python3
"""Der Eisendrache's own zombies for the der-eisendrache mod: BO3's full-body zombie models (c_zom_der_body*_fb, exported
with Greyhound from the running game) as skinned GLBs the engine's BO1 zombie animations can drive.

  python3 .tools/build_castle_zombies.py

The skeleton is CoD's (j_mainroot, j_spine4, ...), so BO1's ai_zombie_* clips find the bones by name. Greyhound writes
centimetres: positions and bone translations are scaled to inches (BO1's units, which the clips' translations use).
BO3 numbers finger joints from the knuckle (_1.._3) where BO1 uses _0.._2: renamed as for the BO3 weapons' arms.
Textures: 512 px WebP colour + normal, embedded. Output: export/web/mods/der-eisendrache/zombies/ (git-ignored: ripped).
"""
import importlib.util, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GH = pathlib.Path('/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
OUT = ROOT/'export/web/mods/der-eisendrache/zombies'
_spec = importlib.util.spec_from_file_location('semodel_to_glb', pathlib.Path(__file__).parent/'semodel_to_glb.py')
SEM = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(SEM)
MODELS = ['c_zom_der_body1_corpse2_fb', 'c_zom_der_body1_corpse3_fb', 'c_zom_der_body2_corpse1_fb', 'c_zom_der_body2_corpse2_fb']
CM = 1 / 2.54
RENAME = {f'j_{f}_{s}_{k}': f'j_{f}_{s}_{k-1}' for f in ['index', 'mid', 'ring', 'pinky', 'thumb'] for s in ['le', 'ri'] for k in (1, 2, 3)}

def webp(stem, kind):
    if kind not in ('diffuse', 'normal'): return None
    src = GH/'ximages'/(stem + '.png')
    if not src.exists(): return None
    with tempfile.NamedTemporaryFile(suffix='.webp') as out:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(512,iw)':-2", '-c:v', 'libwebp', '-quality', '82', out.name], check=True)
        return pathlib.Path(out.name).read_bytes(), 'image/webp'

def scaled(sem):
    for b in sem['bones']:
        for k in ('wpos', 'lpos'):
            if k in b: b[k] = tuple(v * CM for v in b[k])
    for m in sem['meshes']: m['pos'] = [tuple(v * CM for v in p) for p in m['pos']]
    return sem

OUT.mkdir(parents=True, exist_ok=True); (OUT/'.gitignore').write_text('*\n')
for name in MODELS:
    src = GH/'xmodels'/name/(name + '_LOD0.semodel')
    if not src.exists(): print('not exported:', name); continue
    SEM.to_glb(scaled(SEM.read_semodel(src)), OUT/(name + '.glb'), texture_loader=webp, rename=RENAME)
    print('wrote', name, round((OUT/(name + '.glb')).stat().st_size / 1e6, 1), 'MB')
