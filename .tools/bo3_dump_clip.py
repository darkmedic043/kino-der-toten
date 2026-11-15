#!/usr/bin/env python3
# Dumps the loaded Black Ops III map's collision (the clipMap_t asset, ASSET_TYPE_CLIPMAP = pool 12) from the running
# game's memory, next to bo3_dump_map.py's render dump. Same process and pool-table discovery as bo3_dump_map.py.
# Layout verified on zm_stalingrad (2026-11-15) against the live data; see docs/fork/bo3-ports.md 1.1a.
# Output (export_game/bo3/maps/<map>/, git-ignored), units inches, Z up, little-endian:
#   <map>.clip.json            counts, materials (name, surfaceFlags, contents), submodels (*N brush models), static
#                              models (xmodel, contents, origin, invScaledAxis), the xmodels' collision surfaces, and
#                              the record layout of every .bin below
#   <map>.clip.planes.bin      float32 [n,4]  normal xyz, dist (n.p = dist)
#   <map>.clip.brushsides.bin  int32 [n,3]    plane index, contents, surface flags
#   <map>.clip.brushes.bin     int32/float32 [n,23]  see 'brushes' in the json
#   <map>.clip.brushverts.bin  float32 [n,3]  the brushes' corner points
#   <map>.clip.verts.bin       float32 [n,3]  the triangle soup (terrain, patches, meshes compiled into the bsp)
#   <map>.clip.tris.bin        uint32 [n,3]
#   <map>.clip.partitions.bin  int32 [n,4]    triCount, firstTri, nuinds, fuind
#   <map>.clip.aabbtrees.bin   32-byte records: float32 origin[3], uint16 material, uint16 childCount, float32 halfSize[3],
#                              int32 firstChild (childCount > 0) or partition (leaf)
#   <map>.clip.leafbrushnodes.bin, .leafbrushes.bin, .nodes.bin, .leafs.bin   the brush BSP (see the json)
#   <map>.clip.xmodeltris.bin  float32 [n,12] the static models' collision triangles: plane (n, d), svec, tvec
# usage: python3 -I .tools/bo3_dump_clip.py [--pid N] [--pools 0x93883F0]
import argparse, json, os, struct, sys

ap = argparse.ArgumentParser()
ap.add_argument('--pid', type=int); ap.add_argument('--pools', default='0x93883F0')
ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'export_game', 'bo3', 'maps'))
a = ap.parse_args()
BASE = 0x140000000
def _proc(p, f):
    try: return open(f'/proc/{p}/{f}', 'rb').read().decode('latin1')
    except OSError: return ''
pid = a.pid or next(int(p) for p in os.listdir('/proc') if p.isdigit() and _proc(p, 'comm').strip() == 'Main' and 'BlackOps3.exe' in _proc(p, 'cmdline'))
mem = open(f'/proc/{pid}/mem', 'rb', buffering=0)
def rd(addr, n): mem.seek(addr); return mem.read(n)
def q(addr): return struct.unpack('<Q', rd(addr, 8))[0]
def cstr(addr, n=256): return rd(addr, n).split(b'\0')[0].decode('latin1')
pools = BASE + int(a.pools, 16)
try: ok = cstr(q(q(pools + 0x80)), 8) == 'void'
except OSError: ok = False
if not ok: sys.exit('asset pool table not found: run bo3_dump_map.py --scan and pass the address it prints as --pools')

# pool entries are 0x20 bytes (items pointer first); 12 = clipmap (item 0x2D0 bytes), 15 = mapents, 16 = gfxworld
cm = q(pools + 12 * 0x20)
H = rd(cm, 0x2D0)
u32 = lambda o: struct.unpack_from('<I', H, o)[0]; u64 = lambda o: struct.unpack_from('<Q', H, o)[0]
name = cstr(u64(0))
if not name.startswith('maps/'): sys.exit(f'no clip map loaded ({name!r})')
map_name = cstr(q(q(pools + 16 * 0x20) + 8))
# clipMap_t (BO3 PC, 64-bit): name, isInUse, then ClipInfo inline (count/pointer pairs), then the bsp and soup
F = {k: (u32(o), u64(o + 8)) for k, o in {
    'planes': 0x10, 'materials': 0x20, 'brushsides': 0x30, 'leafbrushnodes': 0x40, 'leafbrushes': 0x50, 'brushverts': 0x60,
    'uinds': 0x70, 'brushes': 0x80, 'staticmodels': 0xA8, 'nodes': 0xB8, 'leafs': 0xC8, 'verts': 0xD8, 'tris': 0xE8,
    'partitions': 0x100, 'aabbtrees': 0x110, 'cmodels': 0x120}.items()}
F['brushes'] = (F['brushes'][0] & 0xFFFF, F['brushes'][1])   # numBrushes is a uint16
tri_walk = u64(0xF8)
print(f'{name}: ' + ', '.join(f'{v[0]} {k}' for k, v in F.items()), file=sys.stderr)
out = os.path.join(a.out, map_name); os.makedirs(out, exist_ok=True)
def path(k): return os.path.join(out, f'{map_name}.clip.{k}.bin')
def arr(k, size): n, p = F[k]; return rd(p, n * size)
def index_of(ptr, k, size):   # a pointer into one of the arrays -> its index (-1 if it points elsewhere)
    n, p = F[k]; d = ptr - p
    return d // size if 0 <= d < n * size and d % size == 0 else -1

# planes (cplane_s: normal, dist, type, signbits, pad = 20 bytes)
PL = arr('planes', 20)
open(path('planes'), 'wb').write(b''.join(PL[i * 20:i * 20 + 16] for i in range(F['planes'][0])))
# materials (ClipMaterial: name, surfaceFlags, contents = 16 bytes)
materials = []
MT = arr('materials', 16)
for i in range(F['materials'][0]):
    p, sf, cf = struct.unpack_from('<QII', MT, i * 16)
    materials.append({'name': cstr(p), 'surfaceFlags': sf, 'contents': cf})
# brush sides (cbrushside_t: plane*, contents, surface flags = 16 bytes)
BS = arr('brushsides', 16)
sides = bytearray()
bad_planes = 0
for i in range(F['brushsides'][0]):
    p, cf, sf = struct.unpack_from('<Qii', BS, i * 16)
    pi = index_of(p, 'planes', 20); bad_planes += pi < 0
    sides += struct.pack('<iii', pi, cf, sf)
open(path('brushsides'), 'wb').write(sides)
# brushes (cbrush_t, 0x70 bytes: mins, contents, maxs, numsides, sides*, axial contents[6], axial surface flags[6],
# numverts, verts*) -> 23 words: mins[3] f, contents, maxs[3] f, numsides, firstSide, axialContents[6] (-x -y -z +x +y +z,
# i.e. [2][3] = min side then max side), axialSurfaceFlags[6], numverts, firstVert
BR = arr('brushes', 0x70)
brushes = bytearray()
for i in range(F['brushes'][0]):
    o = i * 0x70
    mins = BR[o:o + 12]; cont, = struct.unpack_from('<i', BR, o + 12); maxs = BR[o + 16:o + 28]; ns, = struct.unpack_from('<I', BR, o + 28)
    sp, = struct.unpack_from('<Q', BR, o + 0x20); ax = BR[o + 0x28:o + 0x58]; nv, = struct.unpack_from('<I', BR, o + 0x58); vp, = struct.unpack_from('<Q', BR, o + 0x60)
    brushes += mins + struct.pack('<i', cont) + maxs + struct.pack('<Ii', ns, index_of(sp, 'brushsides', 16) if ns else 0) + ax + \
        struct.pack('<Ii', nv, index_of(vp, 'brushverts', 12) if nv else 0)
open(path('brushes'), 'wb').write(brushes)
open(path('brushverts'), 'wb').write(arr('brushverts', 12))
# the submodels' leaf brush lists sit right after the world's, past the leafbrushes count (412 more on zm_stalingrad):
# extend the array to the last list a leaf points at
_LN, _lb = arr('leafbrushnodes', 24), F['leafbrushes'][1]
_ends = [(struct.unpack_from('<Q', _LN, i * 24 + 8)[0] - _lb) // 2 + struct.unpack_from('<h', _LN, i * 24 + 2)[0]
         for i in range(F['leafbrushnodes'][0]) if struct.unpack_from('<h', _LN, i * 24 + 2)[0] > 0]
_ends = [e for e in _ends if 0 < e <= F['leafbrushes'][0] + 0x10000]
if _ends and max(_ends) > F['leafbrushes'][0]: F['leafbrushes'] = (max(_ends), _lb)
open(path('leafbrushes'), 'wb').write(arr('leafbrushes', 2))
open(path('uinds'), 'wb').write(arr('uinds', 2))
# leaf brush nodes (cLeafBrushNode_s, 24 bytes: axis, pad, leafBrushCount i16, contents, then the leaf's brush list
# pointer when leafBrushCount > 0, else dist, range, childOffset[2] u16 (child = this index + offset)) ->
# 7 words: axis, leafBrushCount, contents, first leafbrush index (-1 when it points outside leafbrushes), dist f, range f,
# childOffset0 | childOffset1 << 16
LN = arr('leafbrushnodes', 24)
lbn = bytearray()
for i in range(F['leafbrushnodes'][0]):
    o = i * 24
    axis, cnt, cont = struct.unpack_from('<bxhi', LN, o)
    first = index_of(struct.unpack_from('<Q', LN, o + 8)[0], 'leafbrushes', 2) if cnt > 0 else -1
    dist, rng, c0, c1 = struct.unpack_from('<ffHH', LN, o + 8)
    lbn += struct.pack('<iiiiffI', axis, cnt, cont, first, dist if cnt <= 0 else 0, rng if cnt <= 0 else 0, (c0 | c1 << 16) if cnt <= 0 else 0)
open(path('leafbrushnodes'), 'wb').write(lbn)
# bsp nodes (cNode_t: plane*, children[2] int; negative = -1 - leaf) -> plane index, child0, child1
ND = arr('nodes', 16)
open(path('nodes'), 'wb').write(b''.join(struct.pack('<i', index_of(struct.unpack_from('<Q', ND, i * 16)[0], 'planes', 20)) + ND[i * 16 + 8:i * 16 + 16]
                                         for i in range(F['nodes'][0])))
# leafs (cLeaf_s, 56 bytes: firstCollAabbIndex, collAabbCount, brushContents, terrainContents, mins[3], maxs[3],
# leafBrushNode, cluster (i16), pad) as they are
open(path('leafs'), 'wb').write(arr('leafs', 56))
open(path('verts'), 'wb').write(arr('verts', 12))
open(path('tris'), 'wb').write(arr('tris', 12))
open(path('triwalk'), 'wb').write(rd(tri_walk, ((F['tris'][0] * 3 + 31) >> 5) << 2))
PT = arr('partitions', 16)   # CollisionPartition: triCount u8 (+3 pad), firstTri, nuinds, fuind
open(path('partitions'), 'wb').write(b''.join(struct.pack('<iiii', PT[i * 16], *struct.unpack_from('<iii', PT, i * 16 + 4)) for i in range(F['partitions'][0])))
open(path('aabbtrees'), 'wb').write(arr('aabbtrees', 32))

# submodels (cmodel_t, 96 bytes: mins, maxs, radius, pad, ClipInfo* (null here), cLeaf_s leaf at +0x28). Index 0 is the
# world; *N in the entity string is cmodels[N]. Their brushes are in the model's own space (around its origin).
lbn_rec = [struct.unpack_from('<iiiiffI', lbn, i * 28) for i in range(F['leafbrushnodes'][0])]
LB = struct.unpack(f'<{F["leafbrushes"][0]}H', arr('leafbrushes', 2))
def node_brushes(root):
    found, stack, seen = set(), [root], set()
    while stack:
        i = stack.pop()
        if i in seen or not 0 <= i < len(lbn_rec): continue
        seen.add(i); axis, cnt, cont, first, dist, rng, ch = lbn_rec[i]
        if cnt > 0:
            if first >= 0: found.update(LB[first:first + cnt])
        else: stack += [i + (ch & 0xFFFF), i + (ch >> 16)]
    return sorted(found)
CMD = arr('cmodels', 96)
cmodels = []
for i in range(F['cmodels'][0]):
    o = i * 96
    mins, maxs = struct.unpack_from('<3f', CMD, o), struct.unpack_from('<3f', CMD, o + 12)
    fa, na, bc, tc = struct.unpack_from('<iiii', CMD, o + 0x28); node, = struct.unpack_from('<i', CMD, o + 0x50)
    cmodels.append({'mins': mins, 'maxs': maxs, 'radius': struct.unpack_from('<f', CMD, o + 24)[0], 'firstCollAabb': fa, 'collAabbCount': na,
                    'brushContents': bc, 'terrainContents': tc, 'leafBrushNode': node, 'brushes': node_brushes(node) if i else []})

# static models (cStaticModel_s, 0x70 bytes: writable u16, XModel*, contents, origin, invScaledAxis[3][3], absmin, absmax)
# and the collision surfaces of their xmodels (XModel: collSurfs* +0xD8, numCollSurfs +0xE0, contents +0xE4, radius +0xF0,
# mins +0xF4, maxs +0x100; XModelCollSurf_s 0x30 bytes: collTris*, numCollTris, mins, maxs, boneIdx, contents, surfFlags;
# XModelCollTri_s 0x30 bytes: plane (n, d), svec, tvec: the corners solve n.p = d, svec.p - svec.w = s, tvec.p - tvec.w = t
# at (s, t) = (0, 0), (1, 0), (0, 1); model space)
SMD = arr('staticmodels', 0x70)
smodels, xmodels, xtris = [], {}, bytearray()
for i in range(F['staticmodels'][0]):
    o = i * 0x70
    xp, cont = struct.unpack_from('<Qi', SMD, o + 8)
    xn = cstr(q(xp))
    if xn not in xmodels:
        X = rd(xp, 0x110)
        cs, n, xc = struct.unpack_from('<Qii', X, 0xD8)
        surfs = []
        for k in range(n):
            S = rd(cs + k * 0x30, 0x30)
            tp, nt = struct.unpack_from('<Qi', S, 0)
            surfs.append({'firstTri': len(xtris) // 48, 'numTris': nt, 'mins': struct.unpack_from('<3f', S, 12), 'maxs': struct.unpack_from('<3f', S, 24),
                          'bone': struct.unpack_from('<i', S, 36)[0], 'contents': struct.unpack_from('<i', S, 40)[0], 'surfaceFlags': struct.unpack_from('<i', S, 44)[0]})
            xtris += rd(tp, nt * 48)
        xmodels[xn] = {'contents': xc, 'radius': struct.unpack_from('<f', X, 0xF0)[0], 'mins': struct.unpack_from('<3f', X, 0xF4),
                       'maxs': struct.unpack_from('<3f', X, 0x100), 'surfs': surfs}
    smodels.append({'model': xn, 'contents': cont, 'origin': struct.unpack_from('<3f', SMD, o + 0x14),
                    'invScaledAxis': struct.unpack_from('<9f', SMD, o + 0x20), 'absmin': struct.unpack_from('<3f', SMD, o + 0x44),
                    'absmax': struct.unpack_from('<3f', SMD, o + 0x50)})
open(path('xmodeltris'), 'wb').write(xtris)

counts = {k: v[0] for k, v in F.items()}
json.dump({'clipmap': name, 'map': map_name, 'units': 'inches', 'counts': counts, 'brokenSidePlanes': bad_planes,
           'contentsFlags': {'0x1': 'solid', '0x2': 'foliage', '0x10': 'glass', '0x20': 'water', '0x40': 'canshootclip (in *_nosight, clip_weapon_noimpact)',
                             '0x80': 'missileclip', '0x200': 'vehicleclip', '0x400': 'itemclip (clip_physics)', '0x800': 'sky',
                             '0x1000': 'ai_nosight', '0x2000': 'clipshot: stops bullets (with 0x80: drawn geometry players walk through)',
                             '0x10000': 'playerclip', '0x20000': 'monsterclip (clip_ai)', '0x80000': '? (on drawn brushes; not player-relevant)',
                             '0x400000': '? (every clip_* material that has player or monster clip)', '0x10000000': 'structural (sky)'},
           'layouts': {
               'planes': 'float32 nx ny nz dist', 'brushsides': 'int32 plane, contents, surfaceFlags',
               'brushes': 'float32 mins[3], int32 contents, float32 maxs[3], uint32 numsides, int32 firstSide, int32 axialContents[6] '
                          '(-x -y -z +x +y +z), int32 axialSurfaceFlags[6], uint32 numverts, int32 firstVert: a brush is its box cut '
                          'by its sides (planes, outward normals)',
               'leafbrushnodes': 'int32 axis, leafBrushCount (>0: a leaf), contents, firstLeafBrush (-1 = outside), float32 dist, range, '
                                 'uint32 childOffset0 | childOffset1 << 16 (child = index + offset)',
               'nodes': 'int32 plane, child0, child1 (negative = -1 - leaf)',
               'leafs': '56 bytes: int32 firstCollAabb, collAabbCount, brushContents, terrainContents, float32 mins[3], maxs[3], int32 leafBrushNode, int16 cluster, pad',
               'partitions': 'int32 triCount, firstTri, nuinds, fuind', 'tris': 'uint32 x3 into verts',
               'aabbtrees': 'float32 origin[3], uint16 material, uint16 childCount, float32 halfSize[3], int32 firstChild or partition (childCount 0)',
               'triwalk': 'one bit per triangle edge (triEdgeIsWalkable)',
               'xmodeltris': 'float32 plane[4], svec[4], tvec[4] per triangle'},
           'materials': materials, 'cmodels': cmodels, 'staticModels': smodels, 'xmodels': xmodels},
          open(os.path.join(out, f'{map_name}.clip.json'), 'w'))
print(f'wrote {out}: {counts["brushes"]} brushes, {counts["tris"]} soup triangles, {len(smodels)} static models '
      f'({len(xmodels)} xmodels, {len(xtris) // 48} collision triangles), {len(cmodels) - 1} submodels', file=sys.stderr)
