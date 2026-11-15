#!/usr/bin/env python3
"""Gorod Krovi's special enemies for the gorod-krovi mod (bosses.js): the Mangler (raz), the Valkyrie drone (sentinel)
and Nikolai's siegebot, from the Greyhound export, as skinned GLBs and the engine's animation JSON (animation.js
makeClip), the same way .tools/build_castle_panzer.py builds Der Eisendrache's Panzersoldat. Sounds come straight out
of the map's sound bank (.tools/extract_sabl.py's reader) as Ogg.

  python3 -I .tools/build_gorod_bosses.py [raz|sentinel|mech|sounds ...]   (no argument: all four)

Meshes sharing a material are merged (the mech has 125 meshes on ~60 materials: one draw call per material instead).
Greyhound writes centimetres: models and translation keys are scaled to inches. Clips: rotations are absolute local
quaternions, translations offsets from the bind position (the mod sets userData.bindPosition), tag_origin's motion is
dropped and kept as the clip's travel speed (inches/s). Output (git-ignored, ripped):
export/web/mods/maps/gorod-krovi/bosses/{raz,sentinel,mech,audio}/.
"""
import importlib.util, json, mmap, os, pathlib, struct, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GH = pathlib.Path('/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
BANK = pathlib.Path('/mass_drive/SteamLibrary/steamapps/common/Call of Duty Black Ops III/zone/snd/all/zm_stalingrad.all.sabl')
OUT = ROOT/'export/web/mods/maps/gorod-krovi/bosses'
sys.path.insert(0, str(ROOT/'.tools'))
from seanim import read_seanim
_spec = importlib.util.spec_from_file_location('semodel_to_glb', ROOT/'.tools'/'semodel_to_glb.py')
SEM = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(SEM)
CM = 1 / 2.54

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

def merged(sem):
    """one mesh per material (vertex lists concatenated, faces offset)"""
    groups = {}
    for m in sem['meshes']: groups.setdefault(m['mats'][0] if m['mats'] else -1, []).append(m)
    out = []
    for mat, ms in groups.items():
        if len(ms) == 1: out.append(ms[0]); continue
        keys = [k for k in ('pos', 'uv', 'nrm', 'col', 'w') if all(k in m for m in ms)]
        n = {k: [] for k in keys}; n['faces'] = []; n['mats'] = [mat]
        for m in ms:
            base = len(n['pos'])
            for k in keys: n[k].extend(m[k] if k != 'uv' else [u[:1] for u in m['uv']])
            n['faces'].extend((a + base, b + base, c + base) for a, b, c in m['faces'])
        out.append(n)
    sem['meshes'] = out
    return sem

def model(name, dest, merge=True):
    src = GH/'xmodels'/name/(name + '_LOD0.semodel')
    if not src.exists(): print('MISSING model', name); return False
    sem = scaled(SEM.read_semodel(src))
    n0 = len(sem['meshes'])
    if merge: merged(sem)
    SEM.to_glb(sem, dest/(name + '.glb'), texture_loader=webp)
    print(f'  {name}: {n0} -> {len(sem["meshes"])} meshes, {round((dest/(name + ".glb")).stat().st_size / 1e6, 2)} MB')
    return True

def r(v, n): return [round(x, n) for x in v]

def anim(key, src, dest):
    p = GH/'xanims'/(src + '.seanim')
    if not p.exists(): print('MISSING anim', src); return None
    a = read_seanim(p)
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
    rise = (o[-1][1][2] - o[0][1][2]) * CM if len(o) > 1 else 0
    clip = {'name': key, 'fps': fps, 'duration': round(frames / fps, 4), 'speed': round(travel / (frames / fps), 1),
            'notifies': [{'name': n, 'time': round(f / fps, 4)} for f, n in a['notes']], 'bones': bones}
    (dest/'anims'/(key + '.json')).write_text(json.dumps(clip, separators=(',', ':')))
    return {'duration': clip['duration'], 'speed': clip['speed'], 'rise': round(rise, 1), 'notes': sorted({n for _, n in a['notes']})}

def part(sub, models, anims, merge=True):
    d = OUT/sub; (d/'anims').mkdir(parents=True, exist_ok=True)
    print(sub)
    for m in models: model(m, d, merge)
    index = {}
    for key, src in anims.items():
        c = anim(key, src, d)
        if c: index[key] = c
    (d/'anims.json').write_text(json.dumps(index, indent=1))
    print(f'  {len(index)} anims')

RAZ = 'ai_zm_dlc3_armored_zombie_'
def build_raz():
    part('raz', ['c_zom_dlc3_raz_fb', 'c_zom_dlc3_raz_cannon_arm', 'c_zom_dlc3_raz_s_armcannon', 'c_zom_dlc3_raz_s_cannonpowercore', 'c_zom_dlc3_raz_s_helmet', 'c_zom_dlc3_raz_s_leftshoulderpad',
                 'c_zom_dlc3_raz_s_rightshoulderpad', 'c_zom_dlc3_raz_s_leftthighpad', 'c_zom_dlc3_raz_s_rightthighpad', 'c_zom_dlc3_raz_s_chestplate'],
         {'idle': RAZ + 'idle', 'walk': RAZ + 'walk_f', 'sprint': RAZ + 'sprint_f', 'shoot': RAZ + 'attack_mangler_shoot',
          'swing_lr': RAZ + 'attack_mangler_swing_l_to_r', 'swing_rl': RAZ + 'attack_mangler_swing_r_to_l', 'double': RAZ + 'attack_mangler_double_swing_1',
          'sickle_lr': RAZ + 'attack_sickle_swing_l_to_r', 'sickle_rl': RAZ + 'attack_sickle_swing_r_to_l', 'sickle_down': RAZ + 'attack_sickle_swing_down',
          'sprint_attack': RAZ + 'sprint_f_attack', 'enrage': RAZ + 'enrage', 'death': RAZ + 'death_collapse_fallback_1', 'death_b': RAZ + 'death_collapse_fallforward_1',
          'pain_gun': RAZ + 'pain_mangler', 'pain_chest': RAZ + 'pain_chest_armor', 'pain_head': RAZ + 'pain_facemask', 'pain_shoulder': RAZ + 'pain_left_arm_armor',
          'pain_leg_l': RAZ + 'pain_left_leg_armor', 'pain_leg_r': RAZ + 'pain_right_leg_armor', 'walk_pain': RAZ + 'walk_f_pain_chest_f', 'sprint_pain': RAZ + 'sprint_f_pain_chest_f'})

SEN = 'ai_zm_dlc3_sentinel_'
def build_sentinel():
    part('sentinel', ['veh_t7_dlc3_sentinel_drone', 'veh_t7_dlc3_sentinel_drone_faceplate', 'veh_t7_dlc3_sentinel_drone_dead_whole'],
         {k: SEN + k for k in ['idle', 'fly_f', 'fly_b', 'fly_l', 'fly_r', 'attack', 'attack_quick_v1', 'dodge_l_v2', 'dodge_r_v2', 'dth', 'hit_reaction',
                               'intro', 'suicide_intro', 'suicide_fly_f', 'arms_broken_left', 'arms_broken_right', 'arms_broken_top', 'antenna_twitch']})

MECH = 'ai_zm_dlc3_russian_mech_'
def build_mech():
    part('mech', ['veh_t7_dlc3_mech_nikolai', 'veh_t7_dlc3_mech_nikolai_harpoon', 'veh_t7_dlc3_mech_nikolai_harpoon_large'],
         {k: MECH + k for k in ['dth', 'heat_vent_l', 'heat_vent_r', 'idle', 'in_air_loop', 'juke_l', 'juke_r', 'land', 'land_loop', 'launch_up', 'pain_body',
                                'pain_light_1', 'pain_med_1', 'shoot_gunbarrel', 'shoot_harpoon', 'spawn_raps', 'stumble', 'turn_l_loop', 'turn_r_loop',
                                'walk_b', 'walk_f', 'walk_l', 'walk_r']})

SOUNDS = ['\\raz\\', '\\sentinel\\', '\\nikolaibot\\', 'mechz\\v2\\destruction', 'raps\\launch\\kls_raps_launch_00', 'raps\\land\\veh_raps_land_00',
          'raps\\alarm\\evt_raps_alarm_loop', 'raps\\spawn\\veh_raps_spawn_00']
def build_sounds():
    d = OUT/'audio'; d.mkdir(parents=True, exist_ok=True)
    with open(BANK, 'rb') as f:
        m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        count = struct.unpack_from('<I', m, 0x14)[0]; table = struct.unpack_from('<Q', m, 0x28)[0]; names = len(m) - count * 128
        n = 0
        for i in range(count):
            name = m[names + i * 128:names + (i + 1) * 128].split(b'\0')[0].decode(errors='replace')
            if not any(p in name for p in SOUNDS): continue
            _id, size, _fr, _pad, off = struct.unpack_from('<IIIIQ', m, table + i * 36)
            parts = name.split('.')[0].split('\\')
            stem = ('raz_' if '\\raz\\' in name else 'sen_' if 'sentinel' in name else 'nik_' if 'nikolaibot' in name else 'mech_' if 'mechz' in name else 'raps_') + parts[-1]
            with tempfile.NamedTemporaryFile(suffix='.flac') as t:
                t.write(m[off:off + size]); t.flush()
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', t.name, '-ac', '1', '-c:a', 'libvorbis', '-q:a', '3', str(d/(stem + '.ogg'))], check=True)
            n += 1
    print('sounds', n, sorted(p.stem for p in d.glob('*.ogg')))

OUT.mkdir(parents=True, exist_ok=True); (OUT/'.gitignore').write_text('*\n')
todo = sys.argv[1:] or ['raz', 'sentinel', 'mech', 'sounds']
for t in todo: {'raz': build_raz, 'sentinel': build_sentinel, 'mech': build_mech, 'sounds': build_sounds}[t]()
