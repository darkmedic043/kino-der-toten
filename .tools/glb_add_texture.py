#!/usr/bin/env python3
"""Add an image file to a GLB as a material's texture (Blender's glTF exporter fails to write some, e.g. Deadlock
Seven's head emissive). WebP images go through EXT_texture_webp like the exporter's own.
usage: glb_add_texture.py <model.glb> <image.webp|png> <material-name-prefix> <slot: emissiveTexture|...>"""
import json, struct, sys
glb, img, mat, slot = sys.argv[1:5]
raw = open(glb, 'rb').read(); n = struct.unpack('<I', raw[12:16])[0]; doc = json.loads(raw[20:20 + n])
bn = struct.unpack('<I', raw[20 + n:24 + n])[0]; binc = bytearray(raw[28 + n:28 + n + bn])
data = open(img, 'rb').read(); off = len(binc); binc += data; binc += b'\0' * (-len(binc) % 4)
doc['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
webp = img.endswith('.webp')
doc['images'].append({'bufferView': len(doc['bufferViews']) - 1, 'mimeType': 'image/webp' if webp else 'image/png', 'name': img.rsplit('/', 1)[-1]})
tex = {'sampler': 0, **({'extensions': {'EXT_texture_webp': {'source': len(doc['images']) - 1}}} if webp else {'source': len(doc['images']) - 1})}
doc['textures'].append(tex)
hit = [m for m in doc['materials'] if m['name'].startswith(mat)]
for m in hit: m[slot] = {'index': len(doc['textures']) - 1}
doc['buffers'][0]['byteLength'] = len(binc)
j = json.dumps(doc, separators=(',', ':')).encode(); j += b' ' * (-len(j) % 4)
open(glb, 'wb').write(struct.pack('<III', 0x46546c67, 2, 28 + len(j) + len(binc)) + struct.pack('<II', len(j), 0x4e4f534a) + j
                      + struct.pack('<II', len(binc), 0x004e4942) + bytes(binc))
print('added', img, 'to', [m['name'] for m in hit], slot)
