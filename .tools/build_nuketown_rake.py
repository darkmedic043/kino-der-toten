#!/usr/bin/env python3
# Nuketown's Rake Trap (the rake with an axe and a rope tied on) cut out of ~/projects/waw-nuketown into the git-ignored
# export/web/mods/maps/nuketown/rake/, for the rake traps on every map (mods/bloodstreaks/rake.js; Nuketown's stations
# use it too). Ripped data: never publish it. Writes rake.glb (one still mesh per surface, no skin: the bind pose is the
# model, handle end at the origin and the head 71 along +z, tines up +y) and icon.webp (the HUD icon).
# python3 -I .tools/build_nuketown_rake.py
import json, pathlib, subprocess, struct, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path.home()/'projects/waw-nuketown'
OUT = ROOT/'export/web/mods/maps/nuketown/rake'
MODEL = SRC/'dump_mod/mod/model_export/nt_rake_trap_lod0.glb'
IMAGES = [SRC/'dump_mod/mod/images', SRC/'dump/nuketown/images']
MATS = SRC/'dump_mod/mod/materials'

def image(name, out, *args):
    src = next((d/(name+'.dds') for d in IMAGES if (d/(name+'.dds')).exists()), None)
    if not src: sys.exit('missing image '+name)
    r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), *args, '-c:v', 'libwebp', '-quality', '90', str(OUT/out)], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr)
    return out

def colour_map(material):
    d = json.loads((MATS/(material+'.json')).read_text())
    return next(t['image'] for t in d['textures'] if t['name'] == 'colorMap'), d.get('techniqueSet', '')

OUT.mkdir(parents=True, exist_ok=True)
b = MODEL.read_bytes(); n = struct.unpack_from('<I', b, 12)[0]; doc = json.loads(b[20:20+n])
doc['images'], doc['textures'] = [], []
doc['samplers'] = [{'wrapS': 10497, 'wrapT': 10497, 'magFilter': 9729, 'minFilter': 9987}]
for m in doc['materials']:
    name, tech = colour_map(m['name'])
    m.pop('normalTexture', None); m.pop('occlusionTexture', None)
    ix = len(doc['images']); doc['images'].append({'uri': image(name, name+'.webp')}); doc['textures'].append({'source': ix, 'sampler': 0})
    m['pbrMetallicRoughness'] = {'metallicFactor': 0, 'roughnessFactor': .8, 'baseColorTexture': {'index': ix}}
    if '_t0' in tech: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = .5; m['doubleSided'] = True   # the tines are cut out
for mesh in doc['meshes']:
    for p in mesh['primitives']:
        for k in ('JOINTS_0', 'WEIGHTS_0'): p['attributes'].pop(k, None)
doc['nodes'] = [{'mesh': i} for i in range(len(doc['meshes']))]; doc['scenes'] = [{'nodes': list(range(len(doc['meshes'])))}]; doc['scene'] = 0
doc.pop('skins', None); doc.pop('animations', None)
raw = json.dumps(doc, separators=(',', ':')).encode(); raw += b' '*(-len(raw) % 4); tail = b[20+n:]
(OUT/'rake.glb').write_bytes(struct.pack('<III', 0x46546c67, 2, 20+len(raw)+len(tail))+struct.pack('<II', len(raw), 0x4e4f534a)+raw+tail)
image('hud_icon_rake_trap', 'icon.webp')
print('wrote', *sorted(p.name for p in OUT.iterdir()))
