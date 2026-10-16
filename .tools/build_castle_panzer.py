#!/usr/bin/env python3
"""Der Eisendrache's Panzersoldat for the der-eisendrache mod: BO3's c_zom_mech_body (+ the spinning gun barrel and the
faceplate / power-supply cap that come off) as skinned GLBs, and its ai_zm_dlc1_soldat_* animations as the engine's
animation JSON (animation.js makeClip). Exported with Greyhound from a running game that had spawned one.

  python3 .tools/build_castle_panzer.py

Greyhound writes centimetres: models and translation keys are scaled to inches. The clips are BO3 "delta" anims: joint
rotations are absolute local quaternions; joint translations are offsets from the joint's bind position (the mod sets
userData.bindPosition so makeClip adds them); tag_origin carries the root motion, which is left out and kept only as
the clip's travel speed (`speed`, inches/s) for the mod to move the actor at. Output (git-ignored, ripped):
export/web/mods/der-eisendrache/panzer/.
"""
import importlib.util, json, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GH = pathlib.Path('/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
OUT = ROOT/'export/web/mods/der-eisendrache/panzer'
sys.path.insert(0, str(ROOT/'.tools'))
from seanim import read_seanim
_spec = importlib.util.spec_from_file_location('semodel_to_glb', ROOT/'.tools'/'semodel_to_glb.py')
SEM = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(SEM)
CM = 1 / 2.54
MODELS = ['c_zom_mech_body', 'c_zom_mech_gun_barrel', 'c_zom_mech_faceplate', 'c_zom_mech_powersupply_cap']
ANIMS = ['arrive_2', 'berserk_2', 'chaingun_fire', 'death', 'death_2', 'ft_aim_idle', 'ft_run', 'ft_sweep', 'head_stun_intro', 'head_stun_loop',
         'head_stun_outro', 'hover_land', 'hover_loop', 'hover_start', 'melee_a', 'melee_b', 'pain_faceplate', 'powercore_pain', 'run', 'sprint',
         'stumble_intro', 'stumble_loop', 'stumble_outro', 'walk_basic', 'chaingun_intro_sprint_to_aim_5']

def webp(stem, kind):
    if kind not in ('diffuse', 'normal'): return None
    src = GH/'ximages'/(stem + '.png')
    if not src.exists(): return None
    with tempfile.NamedTemporaryFile(suffix='.webp') as out:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(1024,iw)':-2", '-c:v', 'libwebp', '-quality', '82', out.name], check=True)
        return pathlib.Path(out.name).read_bytes(), 'image/webp'

def scaled(sem):
    for b in sem['bones']:
        for k in ('wpos', 'lpos'):
            if k in b: b[k] = tuple(v * CM for v in b[k])
    for m in sem['meshes']: m['pos'] = [tuple(v * CM for v in p) for p in m['pos']]
    return sem

def r(v, n): return [round(x, n) for x in v]

def anim(name):
    a = read_seanim(GH/'xanims'/(f'ai_zm_dlc1_soldat_{name}.seanim'))
    fps = a['framerate'] or 30; frames = max(a['frames'] - 1, 1)
    bones = []
    for bone, k in a['bones'].items():
        if bone in ('tag_origin', 'tag_sync'): continue
        out = {'name': bone, 'rot': None, 'pos': None}
        if k.get('rot'): out['rot'] = {'frames': [f for f, _ in k['rot']], 'values': r([c for _, q in k['rot'] for c in q], 5)}
        if k.get('loc'): out['pos'] = {'frames': [f for f, _ in k['loc']], 'values': r([c * CM for _, v in k['loc'] for c in v], 3)}
        if out['rot'] or out['pos']: bones.append(out)
    o = a['bones'].get('tag_origin', {}).get('loc') or []
    travel = sum(((o[i][1][0] - o[i - 1][1][0]) ** 2 + (o[i][1][1] - o[i - 1][1][1]) ** 2) ** .5 for i in range(1, len(o))) * CM if len(o) > 1 else 0
    clip = {'name': name, 'fps': fps, 'duration': round(frames / fps, 4), 'speed': round(travel / (frames / fps), 1),
            'notifies': [{'name': n, 'time': round(f / fps, 4)} for f, n in a['notes']], 'bones': bones}
    (OUT/'anims'/(name + '.json')).write_text(json.dumps(clip, separators=(',', ':')))
    return clip

(OUT/'anims').mkdir(parents=True, exist_ok=True); (OUT/'.gitignore').write_text('*\n')
for name in MODELS:
    src = GH/'xmodels'/name/(name + '_LOD0.semodel')
    if not src.exists(): print('not exported:', name); continue
    SEM.to_glb(scaled(SEM.read_semodel(src)), OUT/(name + '.glb'), texture_loader=webp)
    print('model', name, round((OUT/(name + '.glb')).stat().st_size / 1e6, 1), 'MB')
index = {}
for n in ANIMS:
    if not (GH/'xanims'/f'ai_zm_dlc1_soldat_{n}.seanim').exists(): print('no anim', n); continue
    c = anim(n); index[n] = {'duration': c['duration'], 'speed': c['speed'], 'notes': [x['name'] for x in c['notifies']]}
(OUT/'anims.json').write_text(json.dumps(index, indent=1))
print(json.dumps({k: (v['duration'], v['speed']) for k, v in index.items()}))
