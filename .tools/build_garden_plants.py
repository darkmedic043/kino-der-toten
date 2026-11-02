# The Gardener's plants, modelled from code in Blender (own assets, no game rips).
#   blender -b -P .tools/build_garden_plants.py -- [--no-icons] [--only pod,thorn]
# Writes export/web/mods/classes/garden/plants.glb (a node per plant and stage: pod_1, pod_2, pod_3, thorn_1...,
# plus sprout, burr_ball, melon_ball) and the bench's pictures, icons/<plant>_<stage>.png and icons/<ingredient>.png.
# 1 Blender unit = 1 game unit (a zombie is about 70 tall). Colour is per vertex: one material for the plants and one
# for the parts that glow (gardener.js swaps that one for an unlit material), so the whole garden costs two programs.
import bpy, math, os, random, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ICONS = '--no-icons' not in argv
ONLY = argv[argv.index('--only') + 1].split(',') if '--only' in argv else None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'export', 'web', 'mods', 'classes', 'garden'))
os.makedirs(os.path.join(ROOT, 'icons'), exist_ok=True)

def hexc(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4) for x in c)   # sRGB to linear
def mix(a, b, t):
    t = max(0, min(1, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

class B:
    """A mesh being built: quads and tris with a colour per vertex; glow=True faces take the second material."""
    def __init__(s, rnd): s.v, s.c, s.f, s.g, s.r = [], [], [], [], rnd
    def vert(s, p, c): s.v.append(tuple(p)); s.c.append(c); return len(s.v) - 1
    def face(s, idx, glow=False): s.f.append(tuple(idx)); s.g.append(glow)

    def tube(s, pts, radii, c0, c1=None, seg=6, glow=False, cap=True):
        """A swept tube; the frame is carried along so it doesn't twist."""
        c1 = c1 or c0; pts = [Vector(p) for p in pts]; n = len(pts); rings = []
        a = Vector((1, 0, 0)) if abs((pts[1] - pts[0]).normalized().x) < .9 else Vector((0, 1, 0))
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
            a = (a - t * a.dot(t)).normalized(); b = t.cross(a); ring = []
            col = mix(c0, c1, i / max(1, n - 1))
            for k in range(seg):
                q = k / seg * math.tau
                ring.append(s.vert(p + (a * math.cos(q) + b * math.sin(q)) * radii[i], col))
            rings.append(ring)
        for i in range(n - 1):
            for k in range(seg):
                l = (k + 1) % seg
                s.face((rings[i][k], rings[i][l], rings[i + 1][l], rings[i + 1][k]), glow)
        if cap and radii[-1] > .01: s.face(rings[-1], glow)

    def curve(s, a, b, lift, n=7, side=(0, 0, 0), wob=0):
        """Points of an arc from a to b, bowed up by lift."""
        a, b, side = Vector(a), Vector(b), Vector(side); out = []
        for i in range(n):
            t = i / (n - 1); w = math.sin(t * math.pi)
            p = a.lerp(b, t) + Vector((0, 0, lift)) * w + side * w
            if wob: p += Vector((s.r.uniform(-wob, wob), s.r.uniform(-wob, wob), 0)) * w
            out.append(p)
        return out

    def lathe(s, prof, center, c0, c1, seg=14, mod=None, glow=False, rows=None):
        """prof: (radius, height) from bottom to top; mod(theta, i) scales the radius (ribs, petals, a crack)."""
        center = Vector(center); rings = []
        for i, (r, z) in enumerate(prof):
            ring = []
            col = mix(c0, c1, i / (len(prof) - 1))
            for k in range(seg):
                q = k / seg * math.tau; m = mod(q, i) if mod else 1
                ring.append(s.vert(center + Vector((math.cos(q) * r * m, math.sin(q) * r * m, z)), col))
            rings.append(ring)
        for i in range(len(prof) - 1):
            for k in range(seg):
                l = (k + 1) % seg
                s.face((rings[i][k], rings[i][l], rings[i + 1][l], rings[i + 1][k]), glow)

    def blob(s, center, r, c0, c1=None, seg=12, rows=8, noise=0, colf=None, glow=False, squash=None):
        """An egg: r = (x, y, z) radii. colf(x, y, z in -1..1) overrides the colours."""
        center = Vector(center); c1 = c1 or c0; top = None; rings = []
        for i in range(1, rows):
            ph = i / rows * math.pi; ring = []
            for k in range(seg):
                q = k / seg * math.tau
                x, y, z = math.sin(ph) * math.cos(q), math.sin(ph) * math.sin(q), -math.cos(ph)
                n = 1 + noise * (math.sin(q * 3 + ph * 4) * .5 + math.sin(q * 5 - ph * 3 + 1) * .3)
                if squash: n *= squash(q, ph)
                col = colf(x, y, z) if colf else mix(c0, c1, (z + 1) / 2)
                ring.append(s.vert(center + Vector((x * r[0] * n, y * r[1] * n, z * r[2] * n)), col))
            rings.append(ring)
        bot = s.vert(center - Vector((0, 0, r[2])), colf(0, 0, -1) if colf else c0)
        top = s.vert(center + Vector((0, 0, r[2])), colf(0, 0, 1) if colf else c1)
        for k in range(seg):
            l = (k + 1) % seg
            s.face((bot, rings[0][l], rings[0][k]), glow); s.face((top, rings[-1][k], rings[-1][l]), glow)
        for i in range(len(rings) - 1):
            for k in range(seg):
                l = (k + 1) % seg
                s.face((rings[i][k], rings[i][l], rings[i + 1][l], rings[i + 1][k]), glow)

    def leaf(s, base, yaw, L, W, c0, c1, n=6, rise=.55, droop=1.0, rag=0, fold=.25):
        """A blade from base outward along yaw: rises then droops; folded along its rib, ragged if rag > 0."""
        base = Vector(base); d = Vector((math.cos(yaw), math.sin(yaw), 0)); side = Vector((-d.y, d.x, 0)); rows = []
        for i in range(n + 1):
            t = i / n
            p = base + d * (L * t) + Vector((0, 0, L * (rise * math.sin(t * 2.2) - droop * .45 * t * t)))
            w = W * math.sin(min(1, t * 1.15) * math.pi) ** .7 * .5 * (1 + (s.r.uniform(-rag, rag) if rag else 0))
            col = mix(c0, c1, t)
            rib = mix(col, (1, 1, 1), .1)
            lift = Vector((0, 0, w * fold))
            rows.append((s.vert(p - side * w + lift, col), s.vert(p, rib), s.vert(p + side * w + lift, col)))
        for i in range(n):
            a, b = rows[i], rows[i + 1]
            s.face((a[0], a[1], b[1], b[0])); s.face((a[1], a[2], b[2], b[1]))

    def mound(s, r, c=None):
        """The heap of soil every plant sits in."""
        soil, dark = hexc('#3a2a1c'), hexc('#1e150e')
        s.lathe([(r, -1), (r * .96, 1), (r * .7, 3.4), (r * .3, 4.6), (r * .02, 5)], (0, 0, 0), dark, soil, seg=12,
                mod=lambda q, i: 1 + .08 * math.sin(q * 3 + 1) + .06 * math.sin(q * 5))

    def spike(s, p, d, L, r, c0, c1):
        p, d = Vector(p), Vector(d).normalized()
        s.tube([p, p + d * L * .55, p + d * L], [r, r * .45, .01], c0, c1, seg=4, cap=False)

def yaws(n, off=0): return [off + i / n * math.tau for i in range(n)]

# ---- the plants: build(b, stage) with stage 1 grown, 2 mature, 3 ancient --------------------------------------
GREEN, GREEN2, YEL = hexc('#2f5a23'), hexc('#6d8f3a'), hexc('#a9b04a')
def rosette(b, n, L, W, z=3, c0=GREEN, c1=GREEN2, rag=.0, off=0, rise=.55, droop=1.0):
    for y in yaws(n, off + b.r.uniform(0, 1)):
        b.leaf((math.cos(y) * 2, math.sin(y) * 2, z), y + b.r.uniform(-.15, .15), L * b.r.uniform(.85, 1.1), W, c0, c1, rag=rag, rise=rise, droop=droop)

def pod(b, st):
    """Echo Pod: speaker-like seed pods on bent stalks; the slits glow while it replays."""
    b.mound(17 + st * 2); rosette(b, 4 + st * 2, 17 + st * 3, 10, rag=.25)
    skin, skin2, gl = hexc('#7a5a2e'), hexc('#c2964a'), hexc('#ffd978')
    spots = [(0, 0, 40 + st * 7, 1.0), (2.4, 11, 30, .7), (4.6, 12, 24, .55)][:st]
    for i, (y, out, h, k) in enumerate(spots):
        c = Vector((math.cos(y) * out, math.sin(y) * out, 3)); tip = c + Vector((math.cos(y + 1) * 5, math.sin(y + 1) * 5, h))
        b.tube(b.curve((c.x * .3, c.y * .3, 3), tip, 4, n=6), [2.6 * k + .9, 2.2 * k + .6, 1.9 * k + .6, 1.7 * k + .6, 1.6 * k + .5, 1.6 * k + .5], hexc('#3f5a2a'), hexc('#6a7a35'), seg=5)
        at = tip + Vector((0, 0, 9 * k))
        ribs = lambda q, ph: 1 + .13 * math.cos(q * 6)
        b.blob(at, (9.5 * k, 9.5 * k, 13.5 * k), skin, skin2, seg=18, rows=9, squash=ribs)
        for r in range(6):      # the glowing slits sit in the ribs' grooves
            q = (r + .5) / 6 * math.tau
            pts = [at + Vector((math.cos(q) * 8.7 * k * math.sin(t), math.sin(q) * 8.7 * k * math.sin(t), -13 * k * math.cos(t))) * 1.0 for t in (.6, 1.0, 1.4, 1.8, 2.3)]
            b.tube(pts, [.3, .85 * k, 1.15 * k, .85 * k, .3], gl, gl, seg=4, glow=True)
        b.tube([at + Vector((0, 0, 12.5 * k)), at + Vector((0, 0, 16.5 * k))], [4 * k, 1.5 * k], skin2, skin, seg=7)

def thorn(b, st):
    """Grudge Thorn: arched woody canes with red-tipped spikes."""
    b.mound(20 + st * 3)
    wood, wood2, tip = hexc('#3a2433'), hexc('#6a4052'), hexc('#c23a3a')
    canes = 4 + st * 3
    for i, y in enumerate(yaws(canes, .3)):
        L = (26 + st * 9) * b.r.uniform(.8, 1.1); H = (28 + st * 12) * b.r.uniform(.8, 1.15)
        a = (math.cos(y) * 3, math.sin(y) * 3, 3); e = (math.cos(y) * L, math.sin(y) * L, b.r.uniform(2, H * .3))
        pts = b.curve(a, e, H, n=9, wob=1.2)
        b.tube(pts, [3.1 - .3 * i / canes, 2.8, 2.5, 2.2, 1.9, 1.6, 1.2, .8, .15], wood, wood2, seg=5, cap=False)
        for j in range(1, 8):
            p = pts[j]; t = (pts[j + 1] - pts[j - 1]).normalized()
            for k in range(2 if j % 2 else 1):
                d = t.cross(Vector((b.r.uniform(-1, 1), b.r.uniform(-1, 1), b.r.uniform(-1, 1)))).normalized()
                b.spike(p, d, b.r.uniform(5, 7.5 + st), 1.05, wood2, tip)
    if st >= 2:
        b.tube(b.curve((0, 0, 3), (0, 3, 44 + st * 9), 0, n=7, side=(4, 0, 0), wob=1), [4.4, 3.8, 3.2, 2.5, 1.8, 1, .1], wood, wood2, seg=6, cap=False)
    rosette(b, 3, 12, 6, c0=hexc('#2c3a1e'), c1=hexc('#4e4f2a'), rag=.4)

def bulb(b, st):
    """Sundial: a sunflower head tilted to the player's sky, with a shadow-casting ruff of leaves."""
    b.mound(21 + st * 2); rosette(b, 3 + st, 26 + st * 4, 14, c0=hexc('#35601f'), c1=hexc('#88a23a'), rag=.1, rise=.7)
    H = 40 + st * 11; R = 11 + st * 2.5
    stem = [Vector((0, 0, 3)), Vector((.5, 0, H * .35)), Vector((1.8, 0, H * .7)), Vector((4.5, 0, H))]
    b.tube(stem, [3.8 + st * .4, 3.2 + st * .3, 2.9, 2.6], hexc('#3f6a24'), hexc('#7e9a36'), seg=7)
    at = stem[-1] + Vector((3, 0, 3))
    tilt = .55; n = Vector((math.sin(tilt), 0, math.cos(tilt))); u = Vector((0, 1, 0)); v = n.cross(u)
    def disc(p, r, z=0): return at + u * (p[0] * r) + v * (p[1] * r) + n * z
    # the head: a dome that glows; the back is a green cup
    hub = b.vert(at + n * 3.6, hexc('#fff0a0')); rings = []
    for ri, (rr, z) in enumerate([(.33, 3.0), (.66, 2.0), (1, .4)]):
        ring = [b.vert(disc((math.cos(k / 16 * math.tau), math.sin(k / 16 * math.tau)), R * rr, z), mix(hexc('#ffe27a'), hexc('#d98a1e'), ri / 2)) for k in range(16)]
        rings.append(ring)
    for k in range(16):
        l = (k + 1) % 16
        b.face((hub, rings[0][k], rings[0][l]), True)
        for r in range(2): b.face((rings[r][k], rings[r + 1][k], rings[r + 1][l], rings[r][l]), True)
    back = b.vert(at - n * 5, hexc('#3f6a24'))
    for k in range(16): b.face((back, rings[2][(k + 1) % 16], rings[2][k]))
    for layer in range(1 if st < 3 else 2):
        np = 12 + st * 2
        for i in range(np):
            q = (i + layer * .5) / np * math.tau; d = u * math.cos(q) + v * math.sin(q)
            s = at + d * R * .92 + n * .2; L = (R * .95 + st) * (1 + layer * .22); wid = R * .5
            rows = []
            for j in range(5):
                t = j / 4; c = s + d * L * t - n * (layer * 1.5 + 2.2 * t * t) ; w = wid * math.sin(min(1, t * 1.05 + .12) * math.pi) * .5
                side = d.cross(n).normalized(); col = mix(hexc('#e7a81f'), hexc('#ffe16a'), t)
                rows.append((b.vert(c - side * w, col), b.vert(c + side * w, col)))
            for j in range(4):
                b.face((rows[j][0], rows[j][1], rows[j + 1][1], rows[j + 1][0]))

def burr_head(b, at, r, st=1):
    b.blob(at, (r, r, r), hexc('#6a4a24'), hexc('#a07a3a'), seg=9, rows=6, noise=.08)
    for i in range(int(26)):
        z = 1 - 2 * (i + .5) / 26; q = i * 2.399; s = math.sqrt(1 - z * z); d = Vector((s * math.cos(q), s * math.sin(q), z))
        b.spike(Vector(at) + d * r * .9, d, r * 1.05, r * .17, hexc('#a07a3a'), hexc('#e8cf8a'))

def burr(b, st):
    """Hitchhiker Burr: a wiry bush of hooked seed balls that throw themselves at passers-by."""
    b.mound(17 + st * 2); rosette(b, 4 + st, 16 + st * 2, 7, c0=hexc('#3b4a22'), c1=hexc('#7a7433'), rag=.5)
    heads = 3 + st * 2
    for i, y in enumerate(yaws(heads, .7)):
        out = b.r.uniform(6, 13 + st * 2) ; H = b.r.uniform(20, 26 + st * 9)
        e = (math.cos(y) * out, math.sin(y) * out, H)
        b.tube(b.curve((math.cos(y) * 2, math.sin(y) * 2, 3), e, 3, n=5, wob=1), [1.5, 1.2, 1, .9, .9], hexc('#4a3c20'), hexc('#7a6a35'), seg=4)
        burr_head(b, e, b.r.uniform(3.8, 5.2) + st * .3)

def bean(b, st):
    """Jumping Bean: a coiled spring of a stem under a fat, shiny pad. Walk on it."""
    b.mound(22); rosette(b, 3 + st, 18, 9, c0=hexc('#2e5c34'), c1=hexc('#67a24a'), rise=.35)
    H = 15 + st * 3; turns = 2 + st * .6; pts = []
    n = int(turns * 9)
    for i in range(n + 1):
        t = i / n; q = t * turns * math.tau; r = 7.5 - 1.5 * t
        pts.append(Vector((math.cos(q) * r, math.sin(q) * r, 3 + t * H)))
    b.tube(pts, [2.6 - .7 * i / n for i in range(n + 1)], hexc('#2e5c34'), hexc('#7fbf54'), seg=6)
    R = 15 + st * 3
    tops = [(0, 0, H + 7, R)]
    for x, y, z, r in tops:
        b.blob((x, y, z), (r, r * .82, 3.8 + st * .5), hexc('#3f8a3e'), hexc('#b7e06a'), seg=20, rows=8, squash=lambda q, ph: 1 + .06 * math.cos(q * 2) - (.26 if ph > 1.9 and abs(math.sin(q)) < .25 else 0))
    # the beans, in a row on the pad; the middle one glows when it's ready
    for i in range(1 + st):
        k = (i - st / 2) * 5.6
        b.blob((k, 0, H + 11 + st * .3), (2.7, 2.2, 1.9), hexc('#7a2f38'), hexc('#ff8a6a'), seg=8, rows=5, glow=(i == st // 2))

def mint(b, st):
    """Penny Mint: coin-round leaves with a metal sheen; real coins ripen in the middle."""
    b.mound(19 + st * 2)
    c0, c1 = hexc('#2b6e4a'), hexc('#8fd4a2')
    for layer in range(1 + st):
        n = 5 + layer; r = 11 + layer * 5.5 + st * 1.5
        for y in yaws(n, layer * .6):
            at = Vector((math.cos(y) * r * .55, math.sin(y) * r * .55, 6 + (st - layer) * 5.5))
            b.leaf((0, 0, at.z - 2), y, r * 1.3, r * .95, c0, c1, n=5, rise=.42 + .1 * (st - layer), droop=.8, fold=.1)
    coin, coin2 = hexc('#a97a18'), hexc('#ffd86a')
    for i in range(1 + st * 2):
        y = i * 2.399; rr = 3 + i * 1.8; z = 9 + st * 6 + i * .5
        c = Vector((math.cos(y) * rr, math.sin(y) * rr, z))
        b.tube([(0, 0, 4), c - Vector((0, 0, 1.5))], [.9, .6], c0, c1, seg=4)
        tilt = Vector((math.cos(y) * .5, math.sin(y) * .5, 1)).normalized()
        b.tube([c - tilt * .8, c + tilt * .8], [3.7, 3.7], coin, coin2, seg=12)

def gourd(b, st):
    """Hollow Gourd: a ribbed gourd with a jagged split down one side, lit from inside. Full of zombies when it hums."""
    k = .85 + st * .22; b.mound(26 * k)
    R = 25 * k; H = 25 * k
    def ribs(q, ph):
        m = 1 + .085 * abs(math.cos(q * 4.5)) - .04
        # the split faces +X
        crack = max(0, 1 - abs(math.atan2(math.sin(q), math.cos(q))) / .6)
        jag = .5 + .5 * math.sin(ph * 15)
        return m * (1 - .42 * crack ** .6 * (0.45 + .55 * jag) * (1 if .9 < ph < 2.5 else 0))
    b.blob((0, 0, H + 2), (R, R, H), hexc('#3e4a1a'), hexc('#c0902c'), seg=36, rows=20, squash=ribs,
           colf=lambda x, y, z: mix(mix(hexc('#3c3a14'), hexc('#a9822a'), (z + 1) / 2), hexc('#c8b45a'), max(0, math.cos(math.atan2(y, x) * 9)) * .55))
    b.blob((R * .32, 0, H + 2), (R * .46, R * .55, H * .68), hexc('#ff7a2a'), hexc('#ffc060'), seg=10, rows=6, glow=True)
    b.tube(b.curve((0, 0, H * 2), (5, 3, H * 2 + 13 * k), 2, n=5), [3.6 * k, 3, 2.3, 1.8, 1.2], hexc('#3f4a1a'), hexc('#7a7433'), seg=6)
    for y in yaws(2 + st, 1.1):
        e = (math.cos(y) * (R + 12), math.sin(y) * (R + 12), 3)
        b.tube(b.curve((math.cos(y) * R * .5, math.sin(y) * R * .5, 5), e, 9, n=7, wob=1.5), [2.2, 2, 1.6, 1.4, 1.2, 1, .5], hexc('#3f5a22'), hexc('#6a8034'), seg=5)
        b.leaf(e, y + .6, 15 + st, 11, GREEN, GREEN2, rag=.2)

def lily(b, st):
    """Prism Lily: a tall trumpet whose stamen is a cut crystal that throws the beam."""
    b.mound(17 + st); rosette(b, 3 + st, 22 + st * 3, 7, c0=hexc('#255a52'), c1=hexc('#4fa890'), rise=.95, droop=.8)
    blooms = [(0, 0, 44 + st * 9, 1 + st * .12), (1.9, 12, 34 + st * 6, .75), (4.2, 12, 28 + st * 6, .62)][:st]
    for y, out, H, k in blooms:
        tip = Vector((math.cos(y) * out, math.sin(y) * out, H)); tilt = Vector((.5, .15, .85)).normalized()
        b.tube(b.curve((math.cos(y) * 2, math.sin(y) * 2, 3), tip, 0, n=6, wob=.6), [2.2, 2, 1.8, 1.6, 1.5, 1.5], hexc('#255a52'), hexc('#5fb49a'), seg=6)
        c0, c1 = hexc('#6fd4e0'), hexc('#f4fbff')
        # the trumpet, in a tilted frame: built upright, then the verts are rotated round the tip
        start = len(b.v)
        prof = [(1.8 * k, 0), (2.6 * k, 5 * k), (3.8 * k, 10 * k), (6.4 * k, 15 * k), (11 * k, 19 * k), (16.5 * k, 21.5 * k), (19 * k, 21 * k)]
        b.lathe(prof, (0, 0, 0), c0, c1, seg=18, mod=lambda q, i: 1 + (i / 6) ** 2 * .34 * math.cos(q * 3 + .3))
        for j in range(3):       # stamens around the crystal
            q = j / 3 * math.tau + .4
            b.tube([(math.cos(q) * 1.4 * k, math.sin(q) * 1.4 * k, 6 * k), (math.cos(q) * 5 * k, math.sin(q) * 5 * k, 22 * k)], [.5, .32], hexc('#d8c26a'), hexc('#ffe9a0'), seg=4)
        # the crystal: a long double pyramid
        o = Vector((0, 0, 17 * k)); h, r = 12 * k, 3.8 * k
        top = b.vert(o + Vector((0, 0, h)), hexc('#ffffff')); bot = b.vert(o - Vector((0, 0, h * .7)), hexc('#7fe0ff'))
        ring = [b.vert(o + Vector((math.cos(i / 6 * math.tau) * r, math.sin(i / 6 * math.tau) * r, 0)), hexc('#bff4ff')) for i in range(6)]
        for i in range(6):
            j = (i + 1) % 6; b.face((top, ring[i], ring[j]), True); b.face((bot, ring[j], ring[i]), True)
        z = Vector((0, 0, 1)); q = z.rotation_difference(tilt)
        for i in range(start, len(b.v)):
            b.v[i] = tuple(q @ Vector(b.v[i]) + tip)

def flower(b, st):
    """Corpse Flower: rotting meat-red petals around a pale spike, with green gas pooled in the well."""
    k = .9 + st * .17; b.mound(30 * k)
    meat, meat2, spot = hexc('#5c1a1e'), hexc('#a8333a'), hexc('#e6c8a0')
    for layer, n in enumerate([6, 7][:1 + (st > 1)]):
        for y in yaws(n, layer * .45):
            L = (32 - layer * 9) * k; W = (28 - layer * 7) * k; rows = []
            base = Vector((math.cos(y) * 7 * k, math.sin(y) * 7 * k, 5 + layer * 3)); d = Vector((math.cos(y), math.sin(y), 0)); side = Vector((-d.y, d.x, 0))
            for j in range(7):
                t = j / 6; c = base + d * L * t + Vector((0, 0, 14 * k * math.sin(t * 2.6) * (1 + .4 * layer) - 6 * k * t * t))
                w = W * .5 * math.sin(min(1, t * 1.02 + .08) * math.pi) ** .55
                row = []
                for q in range(5):
                    u = q / 4 * 2 - 1
                    mott = b.r.random()
                    col = spot if mott > .86 else mix(meat, meat2, t + .2 * math.sin(u * 3))
                    row.append(b.vert(c + side * (u * w) + Vector((0, 0, (u * u) * 4.5 * k * (1 - t * .4))), col))
                rows.append(row)
            for j in range(6):
                for q in range(4):
                    b.face((rows[j][q], rows[j][q + 1], rows[j + 1][q + 1], rows[j + 1][q]))
    # the well and its gas
    b.blob((0, 0, 11 * k), (11 * k, 11 * k, 3.5 * k), hexc('#58ff6a'), hexc('#c8ff7a'), seg=14, rows=5, glow=True)
    b.lathe([(13 * k, 3), (15 * k, 11 * k), (13 * k, 14 * k), (11.5 * k, 13 * k)], (0, 0, 0), hexc('#2a0c0e'), hexc('#7a2228'), seg=14)
    S = (28 + st * 11) * k
    b.lathe([(6.5 * k, 8 * k), (6 * k, 8 * k + S * .35), (5 * k, 8 * k + S * .7), (3.4 * k, 8 * k + S * .9), (.2, 8 * k + S)], (0, 0, 0), hexc('#8a7a4a'), hexc('#e8d8a0'), seg=10,
           mod=lambda q, i: 1 + .05 * math.sin(q * 5 + i * 2))

def maw(b, st):
    """Glutton Maw: a flytrap head big enough for a person, on a neck like a forearm. Faces +X."""
    k = .88 + st * .2; b.mound(26 * k); rosette(b, 4 + st, 25 * k, 13 * k, c0=hexc('#2f4a1e'), c1=hexc('#8a8a2e'), rag=.3)
    neck = b.curve((0, 0, 3), (7 * k, 0, 38 * k), 2, n=7, side=(-9 * k, 0, 0))
    b.tube(neck, [8 * k, 7.2 * k, 6.2 * k, 5.4 * k, 5 * k, 5 * k, 5 * k], hexc('#34521f'), hexc('#7f8e30'), seg=8)
    o = Vector((7 * k, 0, 40 * k)); skin, inner, tooth = hexc('#7f8e30'), hexc('#a82a3c'), hexc('#efe6c8')
    L, W, D, gape = 46 * k, 22 * k, 15 * k, .38
    for sign in (1, -1):     # upper and lower jaw: half an egg each, hinged at the neck
        c, sn = math.cos(gape), math.sin(gape) * sign
        def P(u, v, shrink=1.0):      # u along the jaw 0..1, v across the rim 0..1
            th, ph = u * math.pi, v * math.pi
            x, y, z = L / 2 * (1 - math.cos(th)), W * shrink * math.sin(th) * math.cos(ph), D * shrink * math.sin(th) * math.sin(ph) * sign
            return o + Vector((x * c - z * sn, y, x * sn + z * c))
        n, m = 10, 10
        outer = [[b.vert(P(i / n, j / m), mix(hexc('#5f7428'), hexc('#c8c048'), abs(j / m - .5) * 2 * .4 + i / n * .6)) for j in range(m + 1)] for i in range(n + 1)]
        lining = [[b.vert(P(i / n, j / m, .92), mix(hexc('#4a1018'), inner, abs(j / m - .5) * 2)) for j in range(m + 1)] for i in range(n + 1)]
        for i in range(n):
            for j in range(m):
                f = (outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], outer[i + 1][j])
                g = (lining[i][j], lining[i + 1][j], lining[i + 1][j + 1], lining[i][j + 1])
                b.face(f if sign > 0 else f[::-1]); b.face(g if sign > 0 else g[::-1])
        d = Vector((sn * -1, 0, -c)) * sign if False else Vector((0, 0, -sign))
        for i in range(1, n):         # teeth down both sides of the rim, meeting across the gape
            for v in (0, 1):
                p = P(i / n, v); t = 8 + 7 * math.sin(i / n * math.pi)
                b.spike(p, (Vector((.15, (.5 - v) * .5, 0)) + d).normalized(), t * k, 1.5 * k, tooth, hexc('#fffbea'))
        for j in (3, 5, 7):           # trigger bristles on the wet inside
            p = P(.55, j / m, .92); b.spike(p, d, 8 * k, .8 * k, tooth, inner)

def melon_stripe(x, y, z):
    q = math.atan2(y, x); s = abs(math.sin(q * 5 + math.sin(z * 3) * .6)) ** .7
    return mix(hexc('#1a4a1e'), hexc('#7fbf4e'), 1 - s)

def melon(b, st):
    """Melon Lobber: a thick vine arm wound back like a catapult, with a striped melon in its curl."""
    k = .9 + st * .15; b.mound(25 * k); rosette(b, 5 + st, 30 * k, 18 * k, c0=hexc('#245226'), c1=hexc('#6fae45'), rag=.2, rise=.4)
    base = [Vector((0, 0, 3)), Vector((1, 0, 14 * k)), Vector((-2, 0, 24 * k))]
    arm = base + [Vector((-13 * k, 0, 36 * k)), Vector((-27 * k, 0, 39 * k)), Vector((-36 * k, 0, 31 * k)), Vector((-33 * k, 0, 21 * k)), Vector((-24 * k, 0, 18 * k)), Vector((-20 * k, 0, 24 * k))]
    b.tube(arm, [9 * k, 8 * k, 7 * k, 6 * k, 5 * k, 4 * k, 3.2 * k, 2.4 * k, .6 * k], hexc('#245226'), hexc('#8fbf4e'), seg=8)
    b.blob((-27 * k, 0, 27 * k), (11 * k, 11 * k, 12.5 * k), None, seg=16, rows=11, colf=melon_stripe)
    for i in range(st):     # spare melons ripening at the foot
        y = 1.2 + i * 1.7
        r = 8 + i
        b.blob((math.cos(y) * 17 * k, math.sin(y) * 17 * k, r * .8 + 3), (r, r, r * .9), None, seg=12, rows=8, colf=melon_stripe)

def sprout(b):
    b.mound(10)
    b.tube([(0, 0, 3), (0, 0, 8), (.5, 0, 12)], [1, .8, .7], GREEN, GREEN2, seg=5)
    b.leaf((.5, 0, 12), .4, 11, 7, hexc('#4f8a33'), hexc('#a9d05a'), rise=.5, droop=.8)
    b.leaf((.5, 0, 12), .4 + math.pi, 11, 7, hexc('#4f8a33'), hexc('#a9d05a'), rise=.5, droop=.8)

def burr_ball(b): burr_head(b, (0, 0, 0), 4.5)
def melon_ball(b): b.blob((0, 0, 0), (11, 11, 12.5), None, seg=16, rows=11, colf=melon_stripe)

# ---- the bench's ingredients (pictures only) --------------------------------------------------------------------
def jar(b, liquid, liquid2, glow=False, fill=1.0):
    b.lathe([(.1, 0), (11, 0), (12.4, 2), (12.4, 22), (9.5, 26), (7, 28), (7, 31)], (0, 0, 0), liquid, liquid2, seg=20, glow=glow)
    b.lathe([(7.6, 29), (7.8, 34), (.1, 34.5)], (0, 0, 0), hexc('#5a3a1e'), hexc('#a07a4a'), seg=12)
    b.tube([(5.5, -11.6, 6), (7, -10.6, 12), (7, -10.6, 19)], [.7, 1, .7], (1, 1, 1), (1, 1, 1), seg=4)   # a window's highlight
def ing_fertilizer(b):
    s0, s1 = hexc('#a07c4a'), hexc('#d2b078')
    b.lathe([(.1, 0), (13, .5), (16, 6), (16.5, 16), (13, 24), (8, 27), (6, 29), (9.5, 33), (.1, 32)], (0, 0, 0), s0, s1, seg=18, mod=lambda q, i: 1 + .05 * math.sin(q * 3 + i) + (.14 * math.sin(q * 9) if i > 6 else 0))
    b.lathe([(6.2, 28.2), (6.4, 30.5)], (0, 0, 0), hexc('#c23a3a'), hexc('#c23a3a'), seg=14)
def ing_dew(b): jar(b, hexc('#2a7ab0'), hexc('#a8e8ff'), fill=1.1)
def ing_compost(b):
    d, l = hexc('#2a1c10'), hexc('#6a4a24')
    b.blob((0, 0, 11), (19, 19, 11), d, l, seg=18, rows=10, noise=.2)
    for i in range(7):
        y = i * 2.399; r = 5 + i * 1.8
        b.leaf((math.cos(y) * r, math.sin(y) * r, 17 + b.r.uniform(-3, 2)), y, 12, 7, hexc('#8a5a22'), hexc('#c2852e'), rise=.2, droop=.3, rag=.4)
    b.lathe([(4, 18), (7, 26), (8, 26.5), (0.1, 25)], (3, 2, 0), hexc('#6a6a5a'), hexc('#9a9a80'), seg=8)
def ing_pollen(b):
    jar(b, hexc('#c2901e'), hexc('#ffe46a'), fill=.8)
    for i in range(14):
        z = 18 + i * 1.3; q = i * 2.399
        b.blob((math.cos(q) * 6, math.sin(q) * 6, z), (1.1, 1.1, 1.1), hexc('#ffd24a'), hexc('#fff0a0'), seg=6, rows=4)
def ing_sap(b):
    jar(b, hexc('#8a3e0a'), hexc('#ffb04a'), fill=1.05)
    b.tube([(7.6, 0, 33), (9, 0, 28), (8.5, 0, 22)], [1.8, 1.3, 1], hexc('#d2761e'), hexc('#ffb04a'), seg=6)
def ing_mutagen(b):
    jar(b, hexc('#1eaf4a'), hexc('#b8ff6a'), glow=True, fill=1.15)
    for i in range(5):
        q = i * 2.2
        b.blob((math.cos(q) * 5, math.sin(q) * 5, 6 + i * 2.2), (1.4, 1.4, 1.4), hexc('#e8ffb0'), hexc('#ffffff'), seg=6, rows=4, glow=True)
def ing_packet(b):
    # a paper seed packet standing on edge
    p0, p1 = hexc('#a8742e'), hexc('#e0c080')
    w, h, d = 13, 19, 1.8
    for yy in (-d, d):
        ids = [b.vert((x, yy * (1 - abs(z - 11) / 26), z + 11), mix(p0, p1, (z + 19) / 38)) for x, z in ((-w, -h), (w, -h), (w, h), (-w, h))]
        b.face(ids if yy > 0 else ids[::-1])
    b.leaf((0, -2.2, 6), math.pi / 2 + 1.57, 11, 8, hexc('#2f6a2a'), hexc('#8fc050'), rise=.8, droop=.2)
    b.tube([(-13, -d, 29), (13, -d, 29)], [1, 1], hexc('#7a5a2a'), hexc('#7a5a2a'), seg=4)
def ing_rare(b):
    # the foil packet
    p0, p1 = hexc('#23202a'), hexc('#8a7fb0')
    w, h, d = 13, 19, 2.2
    for yy in (-d, d):
        ids = [b.vert((x, yy * (1 - abs(z - 11) / 26), z + 11), mix(p0, p1, (x + z + 32) / 64)) for x, z in ((-w, -h), (w, -h), (w, h), (-w, h))]
        b.face(ids if yy > 0 else ids[::-1])
    b.blob((0, -3, 11), (6, 1.5, 7.6), hexc('#ffd86a'), hexc('#fff4c0'), seg=10, rows=6, glow=True)

STAGED = {'pod': pod, 'thorn': thorn, 'bulb': bulb, 'burr': burr, 'bean': bean, 'mint': mint, 'gourd': gourd, 'lily': lily, 'flower': flower, 'maw': maw, 'melon': melon}
SINGLE = {'sprout': sprout, 'burr_ball': burr_ball, 'melon_ball': melon_ball}
PICTURES = {'fertilizer': ing_fertilizer, 'dew': ing_dew, 'compost': ing_compost, 'pollen': ing_pollen, 'sap': ing_sap, 'mutagen': ing_mutagen, 'packet': ing_packet, 'rare': ing_rare}

# ---- Blender --------------------------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def material(name, glow):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.use_backface_culling = False
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
    nt.links.new(a.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = .55
    if glow:
        nt.links.new(a.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = 1.6
    return m
MAT, GLOW = material('garden', False), material('garden_glow', True)

def finish(name, b, keep=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(b.v, [], b.f); me.update()
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(b.c): col.data[i].color = (*c, 1)
    me.materials.append(MAT); me.materials.append(GLOW)
    for i, p in enumerate(me.polygons):
        p.material_index = 1 if b.g[i] else 0
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.validate(); me.update()
    return ob

objs = {}
for pid, fn in STAGED.items():
    if ONLY and pid not in ONLY: continue
    for st in (1, 2, 3):
        rnd = random.Random(sum(map(ord, pid)) * 31 + st)
        b = B(rnd); fn(b, st); objs[f'{pid}_{st}'] = finish(f'{pid}_{st}', b)
for pid, fn in SINGLE.items():
    if ONLY and pid not in ONLY: continue
    b = B(random.Random(7)); fn(b); objs[pid] = finish(pid, b)
tris = {k: sum(len(p.vertices) - 2 for p in o.data.polygons) for k, o in objs.items()}
print('tris', tris, 'total', sum(tris.values()))

if not ONLY:
    for o in bpy.data.objects: o.select_set(o.name in objs)
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'plants.glb'), export_format='GLB', use_selection=True, export_apply=False,
                              export_vertex_color='MATERIAL', export_normals=True, export_materials='EXPORT', export_animations=False, export_skins=False, export_yup=True)

ANGLE = {'maw': -28, 'gourd': -30, 'melon': -115, 'lily': -40}
if ICONS:
    pic = {}
    for pid, fn in PICTURES.items():
        if ONLY and pid not in ONLY: continue
        b = B(random.Random(11)); fn(b); pic[pid] = finish('pic_' + pid, b)
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 48; scene.cycles.use_denoising = True; scene.cycles.device = 'CPU'
    scene.render.film_transparent = True; scene.render.resolution_x = scene.render.resolution_y = 240
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.32, .34, .36, 1); w.node_tree.nodes['Background'].inputs[1].default_value = .55
    def lamp(name, kind, loc, power, color, size=60):
        d = bpy.data.lights.new(name, kind); d.energy = power; d.color = color
        if kind == 'AREA': d.size = size
        o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o
    key, rim = lamp('key', 'AREA', (120, -160, 200), 1, (1, .93, .8)), lamp('rim', 'AREA', (-150, 120, 90), 1, (.65, .85, 1))
    cd = bpy.data.cameras.new('c'); cd.lens = 70; cam = bpy.data.objects.new('c', cd); bpy.context.collection.objects.link(cam); scene.camera = cam
    def shoot(ob, name):
        for o in bpy.data.objects:
            if o.type == 'MESH': o.hide_render = o is not ob
        cs = [Vector(c) for c in ob.bound_box]; lo = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs))); hi = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
        mid = (lo + hi) / 2; R = (hi - lo).length / 2
        yaw = math.radians(ANGLE.get(name.split('_')[0], -55)); pitch = math.radians(16); dist = R / math.tan(cd.angle / 2) * .93
        cam.location = mid + Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))) * dist
        cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
        key.location = mid + Vector((R * 1.6, -R * 2.2, R * 2.6)); key.data.energy = 26 * R * R; key.data.size = R * 2
        key.rotation_euler = (mid - key.location).to_track_quat('-Z', 'Y').to_euler()
        rim.location = mid + Vector((-R * 2.2, R * 1.8, R * 1.2)); rim.data.energy = 16 * R * R; rim.data.size = R * 2
        rim.rotation_euler = (mid - rim.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(ROOT, 'icons', name + '.png')
        bpy.ops.render.render(write_still=True)
    for k, o in objs.items():
        if k in SINGLE: continue
        shoot(o, k)
    for k, o in pic.items(): shoot(o, k)
if ICONS:     # the bench's pictures as WebP, small enough to load with the game
    import subprocess
    for f in os.listdir(os.path.join(ROOT, 'icons')):
        if f.endswith('.png'):
            src = os.path.join(ROOT, 'icons', f)
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-c:v', 'libwebp', '-quality', '82', src[:-4] + '.webp'], check=True); os.remove(src)
print('done')
