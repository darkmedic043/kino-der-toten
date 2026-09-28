#!/usr/bin/env python3
"""Writes export/web/mods/maps/sandbox/sandbox.glb, a tiny box-built test map
(in metres, like a Blender export) for the custom map explorer. Standard
library only. Replace it with your own Blender export to make a real map."""
import json, struct, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'export/web/mods/maps/sandbox/sandbox.glb'
FACES = [((1,0,0),[(1,-1,-1),(1,1,-1),(1,1,1),(1,-1,1)]),((-1,0,0),[(-1,-1,1),(-1,1,1),(-1,1,-1),(-1,-1,-1)]),
         ((0,1,0),[(-1,1,-1),(-1,1,1),(1,1,1),(1,1,-1)]),((0,-1,0),[(-1,-1,1),(-1,-1,-1),(1,-1,-1),(1,-1,1)]),
         ((0,0,1),[(1,-1,1),(1,1,1),(-1,1,1),(-1,-1,1)]),((0,0,-1),[(-1,-1,-1),(-1,1,-1),(1,1,-1),(1,-1,-1)])]
COLORS = {'floor':(.32,.34,.33),'wall':(.55,.5,.44),'crate':(.55,.38,.2),'step':(.45,.46,.5),'pillar':(.62,.12,.1),'platform':(.4,.42,.46)}
boxes = []  # (material, min xyz, max xyz)
def box(mat, x0, y0, z0, x1, y1, z1): boxes.append((mat, (x0, y0, z0), (x1, y1, z1)))

box('floor', -15, -.2, -15, 15, 0, 15)
for s in (-1, 1):
    box('wall', -15, 0, s*15-(.3 if s>0 else 0), 15, 3.5, s*15+(0 if s>0 else .3))
    box('wall', s*15-(.3 if s>0 else 0), 0, -15, s*15+(0 if s>0 else .3), 3.5, 15)
for x, y, z in [(-6,0,-4),(-5,0,-4),(-5.5,1,-4),(4,0,6),(8,0,-5),(8,0,-4)]:  # 1 m crates, one stacked
    box('crate', x-.5, y, z-.5, x+.5, y+1, z+.5)
for i in range(10):  # 0.2 m steps up to a 2 m platform
    box('step', 2+i*.4, 0, -12, 2.4+i*.4, .2*(i+1), -9)
box('platform', 6, 0, -14.7, 14.7, 2, -9)
for x in (-10, 0, 10):
    box('pillar', x-.4, 0, 2-.4, x+.4, 3.5, 2+.4)

prims, blob, views, accessors = [], bytearray(), [], []
def add(data, fmt, count, target, typ, comp, mn=None, mx=None):
    while len(blob) % 4: blob.append(0)
    views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(data),'target':target}); blob.extend(data)
    a = {'bufferView':len(views)-1,'componentType':comp,'count':count,'type':typ}
    if mn: a['min'], a['max'] = mn, mx
    accessors.append(a); return len(accessors)-1
materials = list(COLORS)
for mat in materials:
    pos, nor, idx = [], [], []
    for _, lo, hi in [b for b in boxes if b[0]==mat]:
        c = [(lo[i]+hi[i])/2 for i in range(3)]; h = [(hi[i]-lo[i])/2 for i in range(3)]
        for n, corners in FACES:
            base = len(pos)
            for v in corners: pos.append(tuple(c[i]+v[i]*h[i] for i in range(3))); nor.append(n)
            idx += [base, base+1, base+2, base, base+2, base+3]
    p = add(b''.join(struct.pack('<3f',*v) for v in pos), None, len(pos), 34962, 'VEC3', 5126,
            [min(v[i] for v in pos) for i in range(3)], [max(v[i] for v in pos) for i in range(3)])
    n = add(b''.join(struct.pack('<3f',*v) for v in nor), None, len(nor), 34962, 'VEC3', 5126)
    i = add(struct.pack(f'<{len(idx)}I', *idx), None, len(idx), 34963, 'SCALAR', 5125)
    prims.append({'attributes':{'POSITION':p,'NORMAL':n},'indices':i,'material':materials.index(mat)})
while len(blob) % 4: blob.append(0)
gltf = {'asset':{'version':'2.0','generator':'make-sandbox-map.py'},'scene':0,'scenes':[{'nodes':[0]}],
        'nodes':[{'name':'sandbox','mesh':0}],'meshes':[{'primitives':prims}],
        'materials':[{'name':m,'pbrMetallicRoughness':{'baseColorFactor':[*COLORS[m],1],'metallicFactor':0,'roughnessFactor':.85}} for m in materials],
        'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(blob)}]}
js = json.dumps(gltf, separators=(',',':')).encode(); js += b' ' * (-len(js) % 4)
OUT.write_bytes(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(blob)) + struct.pack('<II',len(js),0x4E4F534A) + js + struct.pack('<II',len(blob),0x004E4942) + blob)
print(OUT, OUT.stat().st_size, 'bytes')
