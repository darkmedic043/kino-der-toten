#!/usr/bin/env python3
# Dumps the loaded Black Ops III map's AI navigation mesh from the running game's memory (BO3 under Proton, read through
# /proc/<pid>/mem; the same pool table as bo3_dump_map.py) and decodes it.
# BO3's navmesh is Havok AI (2014.2.0-r1): asset pool 97 (NavMeshData, 104 bytes: name, then six {u64 size, u64 ptr}
# blobs) and pool 98 (NavVolume, 72 bytes, four blobs: 3D volumes for flying AI, saved but not decoded). Each blob is a
# Havok binary packfile already loaded in place (absolute pointers; the data section's local fixups still list where
# they are). The navmesh blobs: 0 generation settings, 1 hkaiUserEdgePairArray (the traversals), 2 the cluster graph,
# 3 the query mediator + AABB tree + hkaiNavMesh, 4 a string, 5 the clearance cache. docs/fork/bo3-ports.md 1.7.
# Output (export_game/bo3/maps/<map>/, git-ignored):
#   nav_raw/              the asset structs and blobs as read (nav_raw/meta.json: names, addresses, sizes); --from-raw
#                         decodes these again without the game
#   <map>.navmesh.json    game units (inches, Z up): vertices, faces (vertex loops, counter-clockwise from above),
#                         per-edge neighbour face (-1 = boundary), cluster per face, traversals (user edge pairs: both
#                         edge segments, cost, direction, their negotiation nodes from <map>.ents with the animscript)
#   --web DIR             also writes DIR/bo3-nav.json in scene units (glTF Y-up: x, z, -y, as build_bo3_map.py) for a
#                         map entry's `navFile` (custom-world.js): triangles and the traversal links
# usage: python3 -I .tools/bo3_dump_navmesh.py [--pid N] [--pools 0x93883F0] [--map zm_stalingrad] [--from-raw] [--web DIR]
import argparse, json, os, re, struct, sys

ap = argparse.ArgumentParser()
ap.add_argument('--pid', type=int); ap.add_argument('--pools', default='0x93883F0')
ap.add_argument('--map', help='map folder name (default: the loaded map; required with --from-raw)')
ap.add_argument('--from-raw', action='store_true', help='decode nav_raw/ again without reading the game')
ap.add_argument('--web', help='write bo3-nav.json (scene units) into this map folder')
ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'export_game', 'bo3', 'maps'))
a = ap.parse_args()
BASE, M2IN = 0x140000000, 1 / 0.0254   # Havok works in metres

def snapshot():
    def _proc(p, f):
        try: return open(f'/proc/{p}/{f}', 'rb').read().decode('latin1')
        except OSError: return ''
    pid = a.pid or next(int(p) for p in os.listdir('/proc') if p.isdigit() and _proc(p, 'comm').strip() == 'Main' and 'BlackOps3.exe' in _proc(p, 'cmdline'))
    mem = open(f'/proc/{pid}/mem', 'rb', buffering=0)
    def rd(addr, n): mem.seek(addr); return mem.read(n)
    def q(addr): return struct.unpack('<Q', rd(addr, 8))[0]
    def cstr(addr, n=256): return rd(addr, n).split(b'\0')[0].decode('latin1')
    pools = BASE + int(a.pools, 16)
    if cstr(q(q(pools + 0x80)), 8) != 'void': sys.exit('asset pool table not at --pools (bo3_dump_map.py --scan finds it)')
    map_name = a.map or cstr(q(q(pools + 0x200) + 8))
    raw = os.path.join(a.out, map_name, 'nav_raw'); os.makedirs(raw, exist_ok=True)
    meta = {}
    for key, idx, size in (('navmesh', 97, 104), ('navvolume', 98, 72)):
        asset = q(pools + idx * 0x20)   # first entry of the pool: a map has one of each
        A = rd(asset, size); name = cstr(struct.unpack_from('<Q', A, 0)[0])
        if not name.startswith('maps/'): sys.exit(f'pool {idx}: no {key} loaded ({name!r})')
        open(os.path.join(raw, f'{key}.asset.bin'), 'wb').write(A)
        blobs = []
        for k, o in enumerate(range(8, size, 16)):
            n, p = struct.unpack_from('<QQ', A, o)
            open(os.path.join(raw, f'{key}.blob{k}.bin'), 'wb').write(rd(p, n)); blobs.append({'off': o, 'size': n, 'addr': hex(p)})
        meta[key] = {'name': name, 'asset': hex(asset), 'blobs': blobs}
        print(f'{name}: {len(blobs)} blobs, {sum(b["size"] for b in blobs)} bytes', file=sys.stderr)
    json.dump(meta, open(os.path.join(raw, 'meta.json'), 'w'), indent=1)
    return map_name

def packfile(d):
    """Havok 2014 binary packfile -> (data section bytes, {pointer offset: target offset}, object offsets, class names)."""
    assert d[:8] == bytes.fromhex('57e0e05710c0c010'), 'not a Havok packfile'
    secs = {}
    for k in range(struct.unpack_from('<i', d, 0x14)[0]):
        o = 0x40 + k * 0x40   # tag[19]+pad, then start and six offsets relative to it
        start, lf, gf, vf, ex, im, end = struct.unpack_from('<7i', d, o + 0x14)
        secs[d[o:o + 19].split(b'\0')[0].decode()] = (start, lf, gf, vf, ex, im, end)
    cs, ds = secs['__classnames__'], secs['__data__']
    names, o = [], cs[0]   # u32 signature, 0x09, name\0 ...
    while o < cs[0] + cs[1] and struct.unpack_from('<I', d, o)[0] != 0xffffffff:
        s = d[o + 5:].split(b'\0')[0].decode('latin1'); names.append(s); o += 6 + len(s)
    data = d[ds[0]:ds[0] + ds[6]]
    ptr = {}
    for o in range(ds[1], ds[2] - 7, 8):
        s, t = struct.unpack_from('<ii', data, o)
        if s != -1: ptr[s] = t
    objs = [struct.unpack_from('<i', data, o)[0] for o in range(ds[3], ds[4] - 11, 12)]
    # the virtual fixups' class-name offsets were rewritten at load; objects come in the class names' order
    classes = [n for n in names if not n.startswith('hkClass')]
    return data, ptr, [o for o in objs if o != -1], classes

def decode(map_name):
    D = os.path.join(a.out, map_name); raw = os.path.join(D, 'nav_raw')
    blob = lambda k: open(os.path.join(raw, f'navmesh.blob{k}.bin'), 'rb').read()
    # ---- blob 3: hkaiNavMesh
    data, ptr, objs, classes = packfile(blob(3))
    nm = objs[classes.index('hkaiNavMesh')]
    arr = lambda o: (ptr[nm + o], struct.unpack_from('<i', data, nm + o + 8)[0])   # hkArray: ptr, size, capacity
    (fo, nf), (eo, ne), (vo, nv) = arr(0x10), arr(0x20), arr(0x30)
    faces = [struct.unpack_from('<iihhhH', data, fo + 16 * i) for i in range(nf)]   # startEdge, startUserEdge, numEdges, numUserEdges, cluster, pad
    edges = [struct.unpack_from('<IIIIBBH', data, eo + 20 * i) for i in range(ne)]  # a, b, oppositeEdge, oppositeFace, flags, pad, userEdgeCost
    verts = [struct.unpack_from('<3f', data, vo + 16 * i) for i in range(nv)]       # hkVector4 (w unused)
    erosion, = struct.unpack_from('<f', data, nm + 0xA0)
    V = [[round(c * M2IN, 2) for c in v] for v in verts]
    F, N, C = [], [], []
    for s, _, n, _, cl, _ in faces:
        F.append([edges[s + k][0] for k in range(n)])
        N.append([(-1 if edges[s + k][3] == 0xffffffff else edges[s + k][3]) for k in range(n)])
        C.append(cl)
    # ---- blob 0: generation settings (the fields we know)
    g, _, _, _ = packfile(blob(0)); gf = lambda o: struct.unpack_from('<f', g, o)[0]
    settings = {'characterHeight': gf(0x10) * M2IN, 'maxWalkableSlopeCos': gf(0x34), 'maxStepHeight': gf(0x4C) * M2IN, 'unknown94': gf(0x94) * M2IN,
                'quantization': gf(0x30) * M2IN, 'erosionRadius': erosion * M2IN}
    # ---- blob 1: hkaiUserEdgePairArray: count at +0x18, array at +0x20 (inline), 80 bytes a pair
    u, _, _, _ = packfile(blob(1)); nu, = struct.unpack_from('<i', u, 0x18)
    # the user data are node indices in the entity string's node order (node_pathnode / node_negotiation_*)
    ents = [dict(re.findall(r'"([^"]*)" "([^"]*)"', b)) for b in open(os.path.join(D, f'{map_name}.ents'), encoding='latin1').read().split('}')]
    nodes = [e for e in ents if e.get('classname', '').startswith('node_')]
    vec = lambda s: [float(x) for x in s.split()]
    trav = []
    for i in range(nu):
        o = 0x20 + 80 * i
        x, y, z = (struct.unpack_from('<4f', u, o + 16 * k) for k in range(3))   # SoA: A start, A end, B start, B end
        _, _, fa, fb, ua, ub = struct.unpack_from('<6I', u, o + 48); cab, cba = struct.unpack_from('<2e', u, o + 72)
        pts = [[round(x[k] * M2IN, 2), round(y[k] * M2IN, 2), round(z[k] * M2IN, 2)] for k in range(4)]
        t = {'a': pts[:2], 'b': pts[2:], 'faceA': fa, 'faceB': fb, 'cost': [cab, cba], 'dir': u[o + 76], 'nodes': [ua, ub]}
        na, nb = (nodes[k] if k < len(nodes) else {} for k in (ua, ub))
        t['anim'] = na.get('animscript') or nb.get('animscript')
        t['origins'] = [vec(na['origin']) if 'origin' in na else None, vec(nb['origin']) if 'origin' in nb else None]
        trav.append(t)
    # negotiation pairs with no user edge (zm_stalingrad: 27, every one an AIRBORNE `air_buy_gate` pair 45-110 over the
    # navmesh: the flying AI's, not the zombies'), begin -> target end
    used, by_name = {k for t in trav for k in t['nodes']}, {e.get('targetname'): k for k, e in enumerate(nodes) if e.get('targetname')}
    gates = [{'nodes': [k, by_name[e['target']]], 'from': vec(e['origin']), 'to': vec(nodes[by_name[e['target']]]['origin']), 'note': e.get('script_noteworthy')}
             for k, e in enumerate(nodes) if e['classname'] == 'node_negotiation_begin' and k not in used and e.get('target') in by_name]
    out = {'map': map_name, 'units': 'inches', 'up': 'z', 'settings': settings, 'vertices': V, 'faces': F, 'neighbours': N, 'clusters': C, 'traversals': trav, 'gates': gates}
    json.dump(out, open(os.path.join(D, f'{map_name}.navmesh.json'), 'w'))
    print(f'{map_name}.navmesh.json: {nv} vertices, {nf} faces, {ne} edges, {nu} traversals, {len(gates)} airborne gates, {len(set(C))} clusters', file=sys.stderr)
    return out

def web(nav, folder):
    """Scene units for custom-world.js: glTF Y-up (x, z, -y), scale 1, as build_bo3_map.py's g()."""
    V, F = nav['vertices'], nav['faces']
    sc = lambda p: [round(p[0], 1), round(p[2], 1), round(-p[1], 1)]
    tris = []
    for f in F:
        for k in range(1, len(f) - 1): tris += [f[0], f[k], f[k + 1]]   # counter-clockwise from above in both frames: the normal comes out +Y
    def z_in(fi, x, y):   # the face's height at (x, y), or None outside it
        vs = [V[i] for i in F[fi]]
        for k in range(1, len(vs) - 1):
            a, b, c = vs[0], vs[k], vs[k + 1]; d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-9: continue
            l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d; l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d; l3 = 1 - l1 - l2
            if min(l1, l2, l3) >= -1e-6: return l1 * a[2] + l2 * b[2] + l3 * c[2]
        return None
    def inward(seg, fi, want=20):
        # the middle of a link's edge segment, moved `want` into its face: the generated navmesh is eroded back from the
        # boundary (about 14), and a link end off the mesh leaves the zombie pressing against the edge before the hop
        m = [(seg[0][i] + seg[1][i]) / 2 for i in range(3)]; ex, ey = seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]; L = (ex * ex + ey * ey) ** .5 or 1
        cx, cy = sum(V[i][0] for i in F[fi]) / len(F[fi]), sum(V[i][1] for i in F[fi]) / len(F[fi])
        nx, ny = -ey / L, ex / L
        if nx * (cx - m[0]) + ny * (cy - m[1]) < 0: nx, ny = -nx, -ny
        d = want
        while d >= 2.5:
            z = z_in(fi, m[0] + nx * d, m[1] + ny * d)
            if z is not None: return [m[0] + nx * d, m[1] + ny * d, z]
            d /= 2
        return m
    # nav['gates'] are left out: all of them are AIRBORNE air_buy_gate pairs 45-110 over the navmesh, the flying AI's
    links = []
    for t in nav['traversals']:
        # the link runs between its two edge segments (on the navmesh); dir 3 = both ways
        # over: [t, top] as the World at War TRAVERSE markers have it (enemies.js hopOver): a mantle_over_<h> crosses a
        # wall h over the link's start, in the middle
        a_, b_ = inward(t['a'], t['faceA']), inward(t['b'], t['faceB']); m = re.match(r'mantle_over_(\d+)', t['anim'] or '')
        links.append({'from': sc(a_), 'to': sc(b_), 'both': t['dir'] == 3 or None, 'oneWay': t['dir'] if t['dir'] != 3 else None,
                      'anim': t['anim'], 'over': [.5, round(a_[2] + int(m.group(1)), 1)] if m else None})
    out = {'source': f"BO3 {nav['map']} navmesh (Havok), scene units", 'vertices': [c for v in V for c in sc(v)], 'triangles': tris,
           'links': [{k: v for k, v in l.items() if v is not None} for l in links]}
    os.makedirs(folder, exist_ok=True)
    json.dump(out, open(os.path.join(folder, 'bo3-nav.json'), 'w'), separators=(',', ':'))
    print(f'{folder}/bo3-nav.json: {len(tris) // 3} triangles, {len(links)} links', file=sys.stderr)

map_name = a.map if a.from_raw else snapshot()
if not map_name: sys.exit('--from-raw needs --map')
nav = decode(map_name)
if a.web: web(nav, a.web)
