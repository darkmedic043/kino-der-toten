#!/usr/bin/env python3
"""Gorod Krovi's transport dragon, its roost consoles and the sounds of the dragon ride, the Pavlov's lockdown and the
powered bridge, for the gorod-krovi mod (dragon.js, pap.js, bridge.js), from the Greyhound export and the map's sound bank.

  python3 -I .tools/build_gorod_dragon.py [models|anims|sounds ...]   (no argument: all three)

Models: c_zom_dlc3_dragon (meshes merged per material), p7_zm_sta_dragon_console, the network console and its three
parts (the ride's craftable). Clips (animation.js makeClip JSON): the three roosts' transport scenes (arrive, idle,
idle_2_pavlovs = the flight to Pavlov's, timeout) and the two flight idles. BO3 plays the transport scenes at the struct
tag_align_dragon_path; tag_origin carries the whole flight in that scene's space (CoD axes, inches), so it is kept as
the clip's own `root` track ({pos, rot}, CoD space, not applied by makeClip) and the mod moves the model with it. Other
bones as in .tools/build_castle_panzer.py: absolute local rotations, translations as offsets from the bind position.
Long clips are thinned to every STEP-th key. Output (git-ignored, ripped): export/web/mods/maps/gorod-krovi/dragon/.
"""
import importlib.util, json, mmap, pathlib, struct, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GH = pathlib.Path('/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
BANK = pathlib.Path('/mass_drive/SteamLibrary/steamapps/common/Call of Duty Black Ops III/zone/snd/all/zm_stalingrad.all.sabl')
OUT = ROOT/'export/web/mods/maps/gorod-krovi/dragon'
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

def model(name, out_name):
    src = GH/'xmodels'/name/(name + '_LOD0.semodel')
    if not src.exists(): print('MISSING model', name); return
    sem = merged(scaled(SEM.read_semodel(src)))
    SEM.to_glb(sem, OUT/(out_name + '.glb'), texture_loader=webp)
    print(f'  {name} -> {out_name}.glb {round((OUT/(out_name + ".glb")).stat().st_size / 1e6, 2)} MB')

def r(v, n): return [round(x, n) for x in v]

def thin(keys, step):
    if len(keys) <= 2 or step <= 1: return keys
    last = keys[-1][0]
    return [k for k in keys if k[0] % step == 0 or k[0] == last]

def anim(key, src, step):
    a = read_seanim(GH/'xanims'/(src + '.seanim'))
    fps = a['framerate'] or 30; frames = max(a['frames'] - 1, 1)
    bones = []
    for bone, k in a['bones'].items():
        if bone in ('tag_origin', 'tag_sync'): continue
        out = {'name': bone, 'rot': None, 'pos': None}
        rot, loc = thin(k.get('rot') or [], step), thin(k.get('loc') or [], step)
        if rot: out['rot'] = {'frames': [f for f, _ in rot], 'values': r([c for _, q in rot for c in q], 4)}
        if loc: out['pos'] = {'frames': [f for f, _ in loc], 'values': r([c * CM for _, v in loc for c in v], 2)}
        if out['rot'] or out['pos']: bones.append(out)
    o = a['bones'].get('tag_origin', {})
    loc, rot = thin(o.get('loc') or [], step), thin(o.get('rot') or [], step)
    root = {'pos': {'frames': [f for f, _ in loc], 'values': r([c * CM for _, v in loc for c in v], 1)} if loc else None,
            'rot': {'frames': [f for f, _ in rot], 'values': r([c for _, q in rot for c in q], 5)} if rot else None}
    clip = {'name': key, 'fps': fps, 'duration': round(frames / fps, 4), 'speed': 0,
            'notifies': [{'name': n, 'time': round(f / fps, 4)} for f, n in sorted(a['notes'])], 'bones': bones, 'root': root}
    p = OUT/'anims'/(key + '.json'); p.write_text(json.dumps(clip, separators=(',', ':')))
    print(f'  {key}: {frames + 1} frames, {len(bones)} bones, {round(p.stat().st_size / 1e3)} KB')
    return clip

def build_models():
    model('c_zom_dlc3_dragon', 'dragon')
    model('p7_zm_sta_dragon_console', 'console')
    model('p7_zm_sta_dragon_network_console', 'netconsole')
    for i in (1, 2, 3): model(f'p7_zm_sta_dragon_network_console_part0{i}', f'part{i}')

def build_anims():
    (OUT/'anims').mkdir(parents=True, exist_ok=True)
    index = {}
    for n in (1, 2, 3):
        for sfx, key, step in (('', 'arrive', 2), ('_idle', 'idle', 3), ('_idle_2_pavlovs', 'ride', 2), ('_timeout', 'timeout', 2)):
            c = anim(f'roost{n}_{key}', f'ai_zm_dlc3_dragon_transport_roost{n}{sfx}', step)
            index[c['name']] = {'duration': c['duration'], 'notes': [[x['name'], x['time']] for x in c['notifies'] if not x['name'].startswith(('dlc3/', 'fxexp'))]}
    for key in ('flight_idle_a_1', 'flight_idle_b_1'):
        c = anim(key, f'ai_zm_dlc3_dragon_{key}', 2); index[key] = {'duration': c['duration'], 'notes': []}
    # Dragon Strike's flight (strike.js through dragon.js strike()): its 'fireball' notes time the four shots
    c = anim('dragon_strike_1', 'ai_zm_dlc3_dragon_strike_1', 2)
    index['dragon_strike_1'] = {'duration': c['duration'], 'notes': [[x['name'], x['time']] for x in c['notifies'] if not x['name'].startswith(('dlc3/', 'fxexp'))]}
    (OUT/'anims.json').write_text(json.dumps(index, indent=1))

SOUNDS = {   # bank path fragment -> our name
    r'dragon\arrival\dragon_arrival_01': 'arrival', r'dragon\idle\dragon_idle': 'idle', r'dragon\idle\arrival\dragon_arrival_idle': 'idle_arrival',
    r'dragon\roar\dragon_roar_00': 'roar0', r'dragon\roar\dragon_roar_01': 'roar1', r'dragon\roar\dragon_roar_02': 'roar2',
    r'dragon\mount\dragon_mount': 'mount', r'dragon\depart\dragon_depart_00': 'depart0', r'dragon\depart\dragon_depart_01': 'depart1',
    r'dragon\start\dragon_start_00': 'start', r'dragon\wind_buffet\dragon_flight_buffet': 'buffet', r'dragon\end\dragon_end_00': 'end0',
    r'dragon\wings\close\dragon_flap_close_00': 'flap0', r'dragon\wings\close\dragon_flap_close_02': 'flap1', r'dragon\wings\far\dragon_flap_base_01': 'flapfar',
    r'dragon\land\land_close\dragon_land_close_00': 'land', r'dragon\breath\stal_dragon_fire_02': 'breath', r'dragon\breath\pre\dragon_fire_start_00': 'breath_pre',
    r'dragon\transport\foot\dragon_flight_foot_00': 'foot0', r'dragon\transport\foot\dragon_flight_foot_01': 'foot1',
    r'traps\elevator\bridge_close': 'bridge_close', r'traps\elevator\bridge_open': 'bridge_open', r'traps\elevator\elevator_start': 'bridge_start',
    r'traps\elevator\elevator_accel': 'bridge_accel', r'traps\elevator\bridge_impact\bridge_impact_00': 'bridge_impact0',
    r'traps\elevator\bridge_impact\bridge_impact_03': 'bridge_impact1',
    r'amb\alarms\lock_down\lock_down_alarm_00': 'lockdown_alarm', r'zm_stalingrad\dragon_alarm': 'dragon_alarm',
}

def build_sounds():
    d = OUT/'audio'; d.mkdir(parents=True, exist_ok=True)
    with open(BANK, 'rb') as f:
        m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        count = struct.unpack_from('<I', m, 0x14)[0]; table = struct.unpack_from('<Q', m, 0x28)[0]; names = len(m) - count * 128
        done = set()
        for i in range(count):
            name = m[names + i * 128:names + (i + 1) * 128].split(b'\0')[0].decode(errors='replace')
            stem = name.split('.')[0]
            key = next((v for k, v in SOUNDS.items() if stem.endswith(k)), None)
            if not key or key in done: continue
            _id, size, _fr, _pad, off = struct.unpack_from('<IIIIQ', m, table + i * 36)
            with tempfile.NamedTemporaryFile(suffix='.flac') as t:
                t.write(m[off:off + size]); t.flush()
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', t.name, '-ac', '1', '-c:a', 'libvorbis', '-q:a', '3', str(d/(key + '.ogg'))], check=True)
            done.add(key)
    print('sounds', len(done), 'missing', sorted(set(SOUNDS.values()) - done))

OUT.mkdir(parents=True, exist_ok=True); (OUT/'.gitignore').write_text('*\n')
for t in sys.argv[1:] or ['models', 'anims', 'sounds']: {'models': build_models, 'anims': build_anims, 'sounds': build_sounds}[t]()
