#!/usr/bin/env python3
"""Writes export/web/mods/maps/sandbox/sandbox.glb, a small box-built zombies
map (in metres, like a Blender export) that uses every map marker. Standard
library only. It doubles as a reference for building maps in Blender: the
empties here are what you would add there (see mods/README.md)."""
import json, math, struct, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'export/web/mods/maps/sandbox/sandbox.glb'
FACES = [((1,0,0),[(1,-1,-1),(1,1,-1),(1,1,1),(1,-1,1)]),((-1,0,0),[(-1,-1,1),(-1,1,1),(-1,1,-1),(-1,-1,-1)]),
         ((0,1,0),[(-1,1,-1),(-1,1,1),(1,1,1),(1,1,-1)]),((0,-1,0),[(-1,-1,1),(-1,-1,-1),(1,-1,-1),(1,-1,1)]),
         ((0,0,1),[(1,-1,1),(1,1,1),(-1,1,1),(-1,-1,1)]),((0,0,-1),[(-1,-1,-1),(-1,1,-1),(1,1,-1),(1,-1,-1)])]
COLORS = {'ground':(.23,.25,.22),'floor':(.42,.4,.36),'yardfloor':(.36,.37,.35),'wall':(.55,.5,.44),'trim':(.3,.27,.24),
          'crate':(.55,.38,.2),'door':(.35,.22,.13)}
WALL_H, SILL, LINTEL, WIN = 3.5, .9, 2.1, 1.4

static, door = [], []   # (material, min xyz, max xyz)
def box(target, mat, lo, hi): target.append((mat, lo, hi))

def wall(axis, fixed, a, b, gaps, t=.3):
    """A wall along x (axis='x', at z=fixed) or z, from a to b, with window gaps
    [(centre, kind)] where kind is 'window' (sill + lintel) or 'door' (open)."""
    def put(lo_along, hi_along, y0, y1):
        if axis == 'x': box(static, 'wall', (lo_along, y0, fixed - t/2), (hi_along, y1, fixed + t/2))
        else: box(static, 'wall', (fixed - t/2, y0, lo_along), (fixed + t/2, y1, hi_along))
    cursor = a
    for centre, kind, width in sorted(gaps):
        put(cursor, centre - width/2, 0, WALL_H)
        if kind == 'window': put(centre - width/2, centre + width/2, 0, SILL)
        put(centre - width/2, centre + width/2, LINTEL if kind == 'window' else 2.6, WALL_H)
        cursor = centre + width/2
    put(cursor, b, 0, WALL_H)

box(static, 'ground', (-17, -.25, -12), (18, -.05, 12))
box(static, 'floor', (-12, -.05, -8), (0, 0, 8))
box(static, 'yardfloor', (0, -.05, -8), (14, 0, 8))
# Lobby x -12..0, yard x 0..14, both z -8..8. Windows at x (north/south) or z (west/east).
wall('x', -8, -12, 14, [(-8,'window',WIN), (-3,'window',WIN), (7,'window',WIN)])
wall('x', 8, -12, 14, [(-6,'window',WIN), (10,'window',WIN)])
wall('z', -12, -8, 8, [(0,'window',WIN)])
wall('z', 14, -8, 8, [(-3,'window',WIN)])
wall('z', 0, -8, 8, [(0,'door',2.0)])
box(door, 'door', (-.12, 0, -1), (.12, 2.6, 1))
# Sniper tower outside the east wall, reachable only by teleporter.
box(static, 'floor', (19, 3.8, -3), (25, 4, 3))
box(static, 'trim', (21.5, -.05, -.5), (22.5, 3.8, .5))
for lo, hi in [((19, 4, -3), (25, 5, -2.8)), ((19, 4, 2.8), (25, 5, 3)), ((24.8, 4, -3), (25, 5, 3)), ((19, 4, -3), (19.2, 5, 3))]:
    box(static, 'trim', lo, hi)
for x, y, z in [(4,0,-2),(4,0,-1),(4,1,-1.5),(9,0,2),(10,0,2),(7,0,4.5)]:  # 1 m crates, one stacked
    box(static, 'crate', (x-.5, y, z-.5), (x+.5, y+1, z+.5))

def yaw_rotation(deg):  # rotation about +Y; a marker faces its local +X
    r = math.radians(deg) / 2
    return [0, math.sin(r), 0, math.cos(r)]
N, S, W, E = -90, 90, 0, 180   # marker facing: into the room from the north wall faces +Z, etc.
markers = [
    ('PLAYER_SPAWN', (-9, 0, 0), W),
    # Windows sit in the wall openings; each pairs with the nearest ZSPAWN outside it.
    ('WINDOW_start', (-8, 1.5, -8), 0), ('ZSPAWN_start', (-8, 0, -9.6), 0),
    ('WINDOW_start', (-3, 1.5, -8), 0), ('ZSPAWN_start', (-3, 0, -9.6), 0),
    ('WINDOW_start', (-6, 1.5, 8), 0), ('ZSPAWN_start', (-6, 0, 9.6), 0),
    ('WINDOW_start', (-12, 1.5, 0), 0), ('ZSPAWN_start', (-13.6, 0, 0), 0),
    ('WINDOW_yard', (7, 1.5, -8), 0), ('ZSPAWN_yard', (7, 0, -9.6), 0),
    ('WINDOW_yard', (10, 1.5, 8), 0), ('ZSPAWN_yard', (10, 0, 9.6), 0),
    ('WINDOW_yard', (14, 1.5, -3), 0), ('ZSPAWN_yard', (15.6, 0, -3), 0),
    ('WALLBUY_m14_zm', (-9.5, 1.4, 7.8), S),
    ('WALLBUY_rottweil72_zm', (-5.5, 1.4, -7.8), N),
    ('WALLBUY_mp40_zm', (3.5, 1.4, -7.8), N),
    ('CLAYMORE', (-11.8, 1.2, -5), W),
    ('PERK_revive', (-11.3, 0, 5), W),
    ('BOX_start', (-1.2, 0, -5), E),
    ('BOX', (12.5, 0, 6.8), S),
    ('POWER', (13.8, 1.2, 4), E),
    ('PERK_jugg', (13.2, 0, -6.2), E),
    ('PERK_speedcola', (2.2, 0, 7.2), S),
    ('PERK_doubletap', (5.2, 0, 7.2), S),
    ('PAP', (9, 0, -7.2), N),
    # Electric trap: the switch on the dividing wall fires the zone at the yard doorway.
    ('TRAP_door_1000', (.2, 1.2, -2.6), W),
    ('TRAPZONE_door', (1.3, 0, 0), 0, {'radius': 90}),
    # One-way teleporter to the tower; it brings you back after 20 seconds.
    ('TELEPORT_tower', (11, 0, -.5), W),
    ('TPDEST_tower_20', (20.5, 4, 0), W),
    ('WALLBUY_dragunov_zm', (24.75, 4.7, 0), E),
]

blob, views, accessors = bytearray(), [], []
def add(data, count, target, typ, comp, mn=None, mx=None):
    while len(blob) % 4: blob.append(0)
    views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(data),'target':target}); blob.extend(data)
    a = {'bufferView':len(views)-1,'componentType':comp,'count':count,'type':typ}
    if mn: a['min'], a['max'] = mn, mx
    accessors.append(a); return len(accessors)-1
materials = list(COLORS)
def mesh(boxes):
    prims = []
    for mat in materials:
        pos, nor, idx = [], [], []
        for _, lo, hi in [b for b in boxes if b[0]==mat]:
            c = [(lo[i]+hi[i])/2 for i in range(3)]; h = [(hi[i]-lo[i])/2 for i in range(3)]
            for n, corners in FACES:
                base = len(pos)
                for v in corners: pos.append(tuple(c[i]+v[i]*h[i] for i in range(3))); nor.append(n)
                idx += [base, base+1, base+2, base, base+2, base+3]
        if not pos: continue
        p = add(b''.join(struct.pack('<3f',*v) for v in pos), len(pos), 34962, 'VEC3', 5126,
                [min(v[i] for v in pos) for i in range(3)], [max(v[i] for v in pos) for i in range(3)])
        n = add(b''.join(struct.pack('<3f',*v) for v in nor), len(nor), 34962, 'VEC3', 5126)
        i = add(struct.pack(f'<{len(idx)}I', *idx), len(idx), 34963, 'SCALAR', 5125)
        prims.append({'attributes':{'POSITION':p,'NORMAL':n},'indices':i,'material':materials.index(mat)})
    return {'primitives':prims}

meshes = [mesh(static), mesh(door)]
nodes = [{'name':'sandbox','mesh':0}, {'name':'DOOR_yard_750','mesh':1}]
nodes += [{'name':m[0],'translation':list(m[1]),'rotation':yaw_rotation(m[2]),**({'extras':m[3]} if len(m) > 3 else {})} for m in markers]
while len(blob) % 4: blob.append(0)
gltf = {'asset':{'version':'2.0','generator':'make-sandbox-map.py'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],
        'nodes':nodes,'meshes':meshes,
        'materials':[{'name':m,'pbrMetallicRoughness':{'baseColorFactor':[*COLORS[m],1],'metallicFactor':0,'roughnessFactor':.85}} for m in materials],
        'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(blob)}]}
js = json.dumps(gltf, separators=(',',':')).encode(); js += b' ' * (-len(js) % 4)
OUT.write_bytes(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(blob)) + struct.pack('<II',len(js),0x4E4F534A) + js + struct.pack('<II',len(blob),0x004E4942) + blob)
print(OUT, OUT.stat().st_size, 'bytes,', len(markers), 'markers')
