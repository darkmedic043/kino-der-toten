#!/usr/bin/env python3
# A Black Ops III clip map, as dumped by .tools/bo3_dump_clip.py, turned into triangles sorted by what they stop.
# Imported by build_bo3_map.py (--game-clip); run alone it prints a summary:
#   python3 -I .tools/bo3_clip.py <bsp> [--models]      (needs numpy: Blender's python has it)
# All output is in CoD space (inches, Z up), faces wound counter-clockwise seen from outside (normal = outward).
# Contents flags and what our engine does with each class: docs/fork/bo3-ports.md 1.1a.
import json, os, sys
import numpy as np

SOLID, GLASS, BULLET, PLAYER, MONSTER = 0x1, 0x10, 0x2000, 0x10000, 0x20000
# What stops whom (zm_stalingrad's materials): solid stops everything; glass stops players and zombies (bullets break it);
# clipshot (0x2000) stops bullets and grenades only: on its own with missileclip (0x2080) it is the drawn detail the game
# lets players walk through (beams, trims, grates), covered by clip brushes; playerclip / monsterclip are the invisible clip.
def stops(c):
    c = np.asarray(c, dtype=np.int64)
    return (c & (SOLID | GLASS | PLAYER)) != 0, (c & (SOLID | GLASS | MONSTER)) != 0, (c & (SOLID | BULLET)) != 0

# our classes (custom-world.js): COL_ = player + bullets + navmesh, PCOL_ = player + bullets, CLIP_ = player only,
# NCOL_ = navmesh only (zombies kept off it)
def classify(c):
    p, m, b = stops(c)
    out = np.full(len(np.atleast_1d(c)), '', dtype=object)
    out[p & m & b] = 'COL'
    out[p & ~m & b] = 'PCOL'
    out[p & m & ~b] = 'CLIP+NCOL'
    out[p & ~m & ~b] = 'CLIP'
    out[~p & m] = 'NCOL'
    return out

def load(src, bsp):
    d = os.path.join(src, bsp + '.clip')
    J = json.load(open(d + '.json'))
    f = lambda k, dt, w: np.fromfile(f'{d}.{k}.bin', dtype=dt).reshape(-1, w)
    return {'json': J, 'planes': f('planes', '<f4', 4), 'sides': f('brushsides', '<i4', 3), 'brushes': f('brushes', '<i4', 23),
            'bverts': f('brushverts', '<f4', 3), 'verts': f('verts', '<f4', 3), 'tris': f('tris', '<u4', 3),
            'partitions': f('partitions', '<i4', 4), 'aabb': np.fromfile(d + '.aabbtrees.bin', dtype=np.uint8).reshape(-1, 32),
            'xtris': f('xmodeltris', '<f4', 12)}

from itertools import combinations
_COMB = {}
def _corners(N, d, tol=0.01):   # corners of the polytope n.p <= d (the planes N, d), by intersecting every three planes
    n = len(N)
    if n not in _COMB: _COMB[n] = np.array(list(combinations(range(n), 3)))
    idx = _COMB[n]; M = N[idx]; det = np.linalg.det(M); ok = np.abs(det) > 1e-6
    p = np.linalg.solve(M[ok], d[idx[ok]][..., None])[..., 0]
    p = p[np.all(p @ N.T - d <= tol, 1)]
    keep = []   # merge corners within 0.05 (three nearly parallel planes meet in a cluster of points)
    for q in p:
        if all(np.abs(q - k).max() > .05 for k in keep): keep.append(q)
    return np.array(keep).reshape(-1, 3)

def _face(vs, n):   # the points of one convex face -> ordered polygon (outward normal n), or None
    if len(vs) < 3: return None
    u = np.cross(n, [0, 0, 1] if abs(n[2]) < .9 else [1, 0, 0]); u /= np.linalg.norm(u); v = np.cross(n, u)
    c = vs.mean(0); d = vs - c
    return vs[np.argsort(np.arctan2(d @ v, d @ u))]

AX = np.array([[-1, 0, 0], [0, -1, 0], [0, 0, -1], [1, 0, 0], [0, 1, 0], [0, 0, 1]], dtype=np.float64)
def brush_planes(D, i):   # (normals, dists): the brush's box sides then its side planes, all outward
    B = D['brushes']; Bf = B.view('<f4'); PL = D['planes'].astype(np.float64); S = D['sides']
    mins, maxs = Bf[i, 0:3].astype(np.float64), Bf[i, 4:7].astype(np.float64)
    sp = PL[S[B[i, 8]:B[i, 8] + B[i, 7], 0]] if B[i, 7] else np.zeros((0, 4))
    return np.concatenate([AX, sp[:, :3]]), np.concatenate([-mins, maxs, sp[:, 3]])

def brush_tris(D, which=None, eps=0.05):
    """Brushes -> (tris (n, 3, 3) float64, contents per tri, brush index per tri). A brush is its box cut by its side
    planes (outward normals), which is what the game's traces test; its stored corners (brushverts) are not used: they
    disagree with the planes on some brushes (zm_stalingrad: 45-degree corners a brush with no side planes doesn't have)."""
    B = D['brushes']
    out, cont, bid = [], [], []
    for i in (range(len(B)) if which is None else which):
        N, d = brush_planes(D, i)
        pts = _corners(N, d)
        if len(pts) < 4: continue
        faces = []
        for n, dist in zip(N, d):
            on = np.nonzero(np.abs(pts @ n - dist) < eps)[0]
            if len(on) >= 3: faces.append((frozenset(on.tolist()), n))
        faces = [f for f in faces if not any(f[0] < g[0] for g in faces)]   # a plane touching part of a face (a bevel)
        seen = set()
        for on, n in faces:
            if on in seen: continue
            seen.add(on)
            poly = _face(pts[sorted(on)], n)
            k = len(poly) - 2
            out.append(np.stack([np.repeat(poly[:1], k, 0), poly[1:-1], poly[2:]], 1))
            cont += [B[i, 3]] * k; bid += [i] * k
    if not out: return np.zeros((0, 3, 3)), np.zeros(0, np.int64), np.zeros(0, np.int64)
    return np.concatenate(out), np.array(cont, np.int64) & 0xFFFFFFFF, np.array(bid, np.int64)

def world_brushes(D):   # brush indices of the world (cmodel 0): everything not listed by a submodel (*N: doors, volumes...)
    sub = {b for c in D['json']['cmodels'][1:] for b in c['brushes']}
    first_sub = min(sub) if sub else len(D['brushes'])
    return [i for i in range(len(D['brushes'])) if i < first_sub and i not in sub]

def soup_tris(D):
    """The world's triangle soup (terrain, patches): tris (n, 3, 3), contents per tri. Each aabb-tree leaf holds one
    partition and names the material; submodels' trees are left out."""
    A = D['aabb']; mat = A[:, 12:14].copy().view('<u2').ravel(); child = A[:, 14:16].copy().view('<u2').ravel()
    first = A[:, 28:32].copy().view('<i4').ravel()
    J = D['json']; M = J['materials']; P = D['partitions']
    sub = set()
    for c in J['cmodels'][1:]:
        stack = list(range(c['firstCollAabb'], c['firstCollAabb'] + c['collAabbCount']))
        while stack:
            k = stack.pop()
            if child[k]: stack += list(range(first[k], first[k] + child[k]))
            else: sub.add(k)
    tri_cont = np.zeros(len(D['tris']), np.int64); keep = np.zeros(len(D['tris']), bool)
    for k in np.nonzero(child == 0)[0]:
        if k in sub: continue
        n, f = P[first[k], 0], P[first[k], 1]
        tri_cont[f:f + n] = M[mat[k]]['contents'] & 0xFFFFFFFF; keep[f:f + n] = True
    T = D['verts'].astype(np.float64)[D['tris'][keep][:, [0, 2, 1]]]   # stored clockwise seen from outside (as the render surfaces)
    return T, tri_cont[keep]

def xmodel_tris(D, name, cache={}):
    """An xmodel's collision triangles in model space, per surface: [(tris (n, 3, 3), contents)]. Surfaces skinned to a
    bone other than the root and lying outside the model's bounds are bone-local (vehicles, the drop-down gate): skipped."""
    if name in cache: return cache[name]
    X = D['json']['xmodels'][name]; XT = D['xtris'].astype(np.float64)
    mn, mx = np.array(X['mins']) - 2, np.array(X['maxs']) + 2
    res = []
    for s in X['surfs']:
        if not s['numTris']: continue
        if s['bone'] and not (np.all(np.array(s['mins']) >= mn) and np.all(np.array(s['maxs']) <= mx)): continue
        t = XT[s['firstTri']:s['firstTri'] + s['numTris']]
        n, d, sv, tv = t[:, 0:3], t[:, 3], t[:, 4:8], t[:, 8:12]
        corners = []
        for ss, tt in ((0, 0), (1, 0), (0, 1)):
            Mx = np.stack([n, sv[:, :3], tv[:, :3]], 1); rhs = np.stack([d, ss + sv[:, 3], tt + tv[:, 3]], 1)
            corners.append(np.linalg.solve(Mx, rhs[..., None])[..., 0])
        tri = np.stack(corners, 1)
        e = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])   # wind along the stored plane normal
        flip = (e * n).sum(1) < 0; tri[flip] = tri[flip][:, [0, 2, 1]]
        res.append((tri, s['contents'] & 0xFFFFFFFF))
    cache[name] = res
    return res

def smodel_tris(D, lo=None, hi=None, keep=None):
    """Static models' collision in world space: tris (n, 3, 3), contents per tri, model name per tri (keep(smodel): a
    filter). world = origin + inverse(invScaledAxis) @ local."""
    out, cont, names = [], [], []
    for sm in D['json']['staticModels']:
        o = np.array(sm['origin'])
        if lo is not None and not (np.all(np.array(sm['absmax']) >= lo) and np.all(np.array(sm['absmin']) <= hi)): continue
        if keep is not None and not keep(sm): continue
        A = np.linalg.inv(np.array(sm['invScaledAxis']).reshape(3, 3))
        for tri, c in xmodel_tris(D, sm['model']):
            w = tri @ A.T + o
            if np.linalg.det(A) < 0: w = w[:, [0, 2, 1]]
            ic = sm['contents'] & 0xFFFFFFFF   # a trace tests the instance's contents, then the surface's: both must match
            out.append(w); cont.append(np.full(len(w), (c & ic) or ic, np.int64)); names += [sm['model']] * len(w)
    if not out: return np.zeros((0, 3, 3)), np.zeros(0, np.int64), []
    return np.concatenate(out), np.concatenate(cont), names

def in_box(T, lo, hi):   # triangles whose centre is inside the box
    c = T.mean(1); return np.all((c >= lo) & (c <= hi), 1)

STEP, OBSTACLE = 18, 40   # BO3 steps the player up 18 units; props from 40 high are obstacles the navmesh goes round
def game_collision(src, bsp, lo=None, hi=None, models=True, log=print):
    """The game's collision in our engine's classes, CoD space: {'COL': tris, 'PCOL': ..., 'CLIP': ..., 'NCOL': ...}.
    World brushes and the soup by their contents (player + monster clip, which stops no bullets, goes to both CLIP and
    NCOL); static models (models=True) by instance height: under STEP left out (stepped over: rubble, splinters, books,
    shells; 3 of zm_stalingrad's 4 million model triangles), up to OBSTACLE player and bullets only (PCOL), above it COL."""
    D = load(src, bsp)
    out = {}
    def put(k, T):
        if len(T): out.setdefault(k, []).append(T)
    for T, c in (brush_tris(D, world_brushes(D))[:2], soup_tris(D)):
        if lo is not None: k = in_box(T, lo, hi); T, c = T[k], c[k]
        cls = classify(c)
        put('COL', T[cls == 'COL']); put('PCOL', T[cls == 'PCOL']); put('CLIP', T[(cls == 'CLIP') | (cls == 'CLIP+NCOL')])
        put('NCOL', T[(cls == 'NCOL') | (cls == 'CLIP+NCOL')])
    if models:
        J = D['json']; kept = 0
        h = np.array([s['absmax'][2] - s['absmin'][2] for s in J['staticModels']])
        for name, lo_h, hi_h in (('PCOL', STEP, OBSTACLE), ('COL', OBSTACLE, 1e9)):
            T, c, _ = smodel_tris(D, lo, hi, lambda s: lo_h <= s['absmax'][2] - s['absmin'][2] < hi_h)
            if lo is not None: k = in_box(T, lo, hi); T, c = T[k], c[k]
            p, m, b = stops(c)
            put(name, T[p & b]); put('CLIP', T[p & ~b]); put('NCOL', T[p & m & ~b] if name == 'COL' else T[:0])
            kept += int(p.sum())
        log(f'game clip: static models {kept} collision triangles from {int((h >= STEP).sum())} of {len(h)} instances (under {STEP} high left out)')
    return {k: np.concatenate(v) for k, v in out.items()}

if __name__ == '__main__':
    bsp = sys.argv[1]
    src = os.path.join(os.path.dirname(__file__), '..', 'export_game', 'bo3', 'maps', bsp)
    out = game_collision(src, bsp, models='--models' in sys.argv)
    for k, v in out.items(): print(f'{k}: {len(v)} triangles')
