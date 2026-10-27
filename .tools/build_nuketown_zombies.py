#!/usr/bin/env python3
"""Nuketown's own zombies for the nuketown mod: the BO2 Nuketown Zombies characters UGX ported to World at War
(hazmat x2, soldier, civilian; four heads, each with a blue-eyed twin, and the hazmat gas mask) with their gib pieces.

  python3 -I .tools/build_nuketown_zombies.py [dump]

They live in the map's localized_nuketown.ff (not nuketown.ff), dumped with
  Unlinker --search-path "<WaW>/main;<map folder>" --model-format GLB --image-format DDS
           --include-assets xmodel,image,material -o <dump>/?zone? localized_nuketown.ff
(default dump: ~/projects/waw-nuketown/dump_zom/localized_nuketown). World at War's character skeleton is BO1's (inches,
same joint names and frames), so the engine's ai_zombie_* clips drive them as they are: the models are copied with their
textures as shared WebP files beside them (colour + normal map), nothing else changes. Output: export/web/mods/maps/nuketown/zombies/
(git-ignored with the rest of the map: ripped).
"""
import json, pathlib, re, struct, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DUMP = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path.home()/'projects/waw-nuketown/dump_zom/localized_nuketown')
OUT = ROOT/'export/web/mods/maps/nuketown/zombies'
P = 'bo2_c_zom_dlc0_zom_'
BODIES = ['haz_body1', 'haz_body2', 'sol_body1', 'solciv_body1']
HEADS = [f'head{k}{b}' for k in (1, 2, 3, 4) for b in ('', '_blueeyes')] + ['haz_head_mask', 'haz_head_mask_blueeyes']
GIBS = ['upclean', 'lowclean', 'behead', 'larmoff', 'rarmoff', 'llegoff', 'rlegoff', 'legsoff']
TEX = 1024

def texture(image):
    src = DUMP/'images'/(image + '.dds')
    if not src.exists() or image.startswith('$'): return None
    safe = re.sub(r'[^A-Za-z0-9_.-]', '_', image).lstrip('_-') + '.webp'; out = OUT/'textures'/safe
    if not out.exists():
        r = subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', str(src), '-frames:v', '1', '-vf', f"scale='min({TEX},iw)':-2",
                            '-c:v', 'libwebp', '-quality', '88', str(out)], capture_output=True, text=True)
        if r.returncode: print('texture failed', image, r.stderr.strip()[:200]); return None
    return 'textures/' + safe

def model(name):
    src = DUMP/'model_export'/(name + '_lod0.glb')
    if not src.exists(): print('missing', name); return False
    b = src.read_bytes(); n = struct.unpack_from('<I', b, 12)[0]; doc = json.loads(b[20:20 + n])
    doc['images'], doc['textures'] = [], []
    doc['samplers'] = [{'wrapS': 10497, 'wrapT': 10497, 'magFilter': 9729, 'minFilter': 9987}]
    seen = {}
    def tex(image):
        if image in seen: return seen[image]
        uri = texture(image); ix = None
        if uri:
            doc['images'].append({'uri': uri, 'name': image})
            doc['textures'].append({'extensions': {'EXT_texture_webp': {'source': len(doc['images']) - 1}}, 'sampler': 0})
            ix = len(doc['textures']) - 1
        seen[image] = ix; return ix
    for m in doc.get('materials', []):
        m.pop('normalTexture', None); m.pop('occlusionTexture', None)
        m['pbrMetallicRoughness'] = {'metallicFactor': 0, 'roughnessFactor': .85}
        p = DUMP/'materials'/(m['name'] + '.json')
        slots = {t.get('name'): t.get('image') for t in (json.loads(p.read_text()) if p.exists() else {}).get('textures', [])}
        c = tex(slots['colorMap']) if slots.get('colorMap') else None
        if c is not None: m['pbrMetallicRoughness']['baseColorTexture'] = {'index': c}
        nm = tex(slots['normalMap']) if slots.get('normalMap') else None
        if nm is not None: m['normalTexture'] = {'index': nm}
    doc['extensionsUsed'] = sorted(set(doc.get('extensionsUsed', [])) | {'EXT_texture_webp'})
    raw = json.dumps(doc, separators=(',', ':')).encode(); raw += b' ' * (-len(raw) % 4); tail = b[20 + n:]
    (OUT/(name.removeprefix(P) + '.glb')).write_bytes(struct.pack('<III', 0x46546C67, 2, 20 + len(raw) + len(tail))
        + struct.pack('<II', len(raw), 0x4E4F534A) + raw + tail)
    return True

(OUT/'textures').mkdir(parents=True, exist_ok=True)
names = [P + x for x in BODIES + HEADS] + [P + f'{b}_{g}' for b in BODIES for g in GIBS]
ok = sum(model(n) for n in names)
print(f'{ok}/{len(names)} models -> {OUT}')
