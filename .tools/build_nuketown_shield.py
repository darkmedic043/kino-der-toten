#!/usr/bin/env python3
# Nuketown's Zombie Shield for first person (mods/nuketown/shield.js): the car door viewmodel and the riot shield clips from
# ~/projects/waw-nuketown, into the git-ignored export/web/mods/maps/nuketown/shield/ (ripped data: never publish it).
# python3 -I .tools/build_nuketown_shield.py
import json, math, pathlib, subprocess, struct, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path.home()/'projects/waw-nuketown'
OUT = ROOT/'export/web/mods/maps/nuketown/shield'
WEB = 'mods/maps/nuketown/shield/'
MODEL = SRC/'dump_mod/mod/model_export/t6_wpn_zmb_shield_view_lod0.glb'
FILE = SRC/'iwd/weapons/sp/zombie_shield'
IMAGES = [SRC/'dump_mod/mod/images', SRC/'dump/nuketown/images']
COLOURS = {'mc/bo2_mtl_t6_wpn_zmb_shield': '_-gmtl_t6_wpn_zmb_shield_col', 'mc/bo2_mtl_t6_wpn_zmb_shield_glass': 'mtl_t6_wpn_zmb_shield_glass_col'}
CLIPS = {'idleAnim': 'viewmodel_riotshield_idle', 'raiseAnim': 'viewmodel_riotshield_pullout', 'dropAnim': 'viewmodel_riotshield_putaway', 'meleeAnim': 'viewmodel_riotshield_melee',
    'sprintInAnim': 'viewmodel_riotshield_sprint_in', 'sprintLoopAnim': 'viewmodel_riotshield_sprint_loop', 'sprintOutAnim': 'viewmodel_riotshield_sprint_out'}

def texture(name):
    src = next((d/(name+'.dds') for d in IMAGES if (d/(name+'.dds')).exists()), None)
    if not src: sys.exit('missing image '+name)
    out = OUT/(name.lstrip('_-')+'.webp')
    r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-c:v', 'libwebp', '-quality', '90', str(out)], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr)
    return out.name

def model():
    b = MODEL.read_bytes(); n = struct.unpack_from('<I', b, 12)[0]; doc = json.loads(b[20:20+n])
    doc['images'], doc['textures'] = [], []
    doc['samplers'] = [{'wrapS': 10497, 'wrapT': 10497, 'magFilter': 9729, 'minFilter': 9987}]
    for m in doc['materials']:
        m.pop('normalTexture', None); m.pop('occlusionTexture', None)
        ix = len(doc['images']); doc['images'].append({'uri': texture(COLOURS[m['name']])}); doc['textures'].append({'source': ix, 'sampler': 0})
        m['pbrMetallicRoughness'] = {'metallicFactor': 0, 'roughnessFactor': .7, 'baseColorTexture': {'index': ix}}
    raw = json.dumps(doc, separators=(',', ':')).encode(); raw += b' '*(-len(raw) % 4); tail = b[20+n:]
    (OUT/'view.glb').write_bytes(struct.pack('<III', 0x46546c67, 2, 20+len(raw)+len(tail))+struct.pack('<II', len(raw), 0x4e4f534a)+raw+tail)

OUT.mkdir(parents=True, exist_ok=True); model()
a = FILE.read_text().split('\\'); d = dict(zip(a[1::2], a[2::2])); num = lambda k, default=0: float(d.get(k) or default)
anims, durations = {}, {}
for key, name in CLIPS.items():
    r = subprocess.run(['node', str(ROOT/'.tools/xanim_to_json.mjs'), str(SRC/'dump_mod/mod/xanim'/name), '-o', str(OUT)], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr)
    clip = json.loads((OUT/(name+'.json')).read_text())
    anims[key] = WEB+name+'.json'; durations[key] = clip['duration']
json.dump({'id': 'zombie_shield', 'model': WEB+'view.glb', 'animations': anims, 'durations': durations,
    'raiseTime': num('raiseTime', .5), 'dropTime': num('dropTime', .3), 'sprintInTime': num('sprintInTime', .3), 'sprintLoopTime': num('sprintLoopTime', .7), 'sprintOutTime': num('sprintOutTime', .3),
    'adsInTime': .25, 'adsOutTime': .25, 'sprintOffset': [num('sprintOfsR'), num('sprintOfsU'), -num('sprintOfsF')],
    'sprintRotation': [math.radians(num('sprintRotP')), math.radians(num('sprintRotY')), math.radians(num('sprintRotR'))], 'sounds': {}}, (OUT/'shield.json').open('w'))
print('built', sorted(p.name for p in OUT.iterdir()), durations)
