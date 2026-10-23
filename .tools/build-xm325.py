# The XM325 (Black Ops 7's Rist Rauch belt-fed LMG), rebuilt from the Gunsmith renders for Melon Zombies. Modelled in
# the BO1 HK21 viewmodel's gun space (j_gun: x forward, y left, z up, inches), so .tools/assemble-grimhawk.mjs --gun xm325
# skins each part to the HK21 skeleton (and --gun xm325_rh / xm325_lh to the CZ75 dual-wield pair for Titan Wield).
# The player sees the gun's left (+y) side. Sizes come off the left-side Gunsmith render (1604 px wide):
# x = 30.465 - px * .0285, z = 5.738 - py * .024 (bore z 2.19, sight line z 5.14, muzzle x 29.5). Parts are part_<bone>:
#   j_gun          receiver, skeletal upper handguard, tan lower handguard, rear housing, rails, trigger group
#   j_bolt         the feed-cover latch and charging handle (moved by the reload)
#   tag_clip       the padded belt pouch (60) and its caseless belt (moved by the reload)
#   tag_iron_sight front post and rear aperture (removed by an optic, ironSights in attachments.json)
#   tag_xm_muzzle / _barrel / _grip / _stock   the stock parts, replaced by their attachments
#   tag_xm_*       the attachments, hidden by tag until fitted
#   blender -b -P .tools/build-xm325.py -- <out.glb> [--render <dir>] [--tex 4096]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo7lib import *
import bo7lib

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/xm325_parts.glb'
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None
TEX = int(argv[argv.index('--tex') + 1]) if '--tex' in argv else 4096

MAGS = ('tag_xm_fastbelt', 'tag_xm_extbelt', 'tag_xm_leyden', 'tag_xm_titan')
PARTS.update({k: [] for k in ('j_gun', 'j_bolt', 'tag_clip', 'tag_iron_sight', 'tag_xm_muzzle', 'tag_xm_barrel', 'tag_xm_grip',
                              'tag_xm_stock', 'tag_xm_comp', 'tag_xm_sup', 'tag_xm_chief', 'tag_xm_fractal', 'tag_xm_cryo',
                              'tag_xm_vas', 'tag_xm_mfs', 'tag_xm_reflex', 'tag_xm_lucius', 'tag_xm_aegis') + MAGS})
M.update(
    # Rist Rauch's two-tone: tan cerakote over aluminium, black polymer furniture, a black fabric belt pouch
    tan=worn('xm_tan', '#86735f', .62, .05, bare='#aeaba4', wear=.22, chips=.05, under='#4a4239', mottle=.18, dirt=.1, rust=.02),
    black=worn('xm_black', '#1f2022', .55, .15, bare='#7f858b', wear=.32, chips=.06, under='#3a3c3f', mottle=.2, dirt=.12, rust=.03),
    poly=worn('xm_poly', '#1b1c1e', .72, 0, bare='#4d5054', wear=.25, bare_metal=False, mottle=.25, dirt=.18),
    stip=worn('xm_stip', '#28292c', .95, 0, bare='#3a3c40', wear=.12, grain=5., bare_metal=False, mottle=.5, dirt=.08),   # stippled grip panels
    steel=worn('xm_steel', '#4a4f53', .35, 1, bare='#a0a6ac', wear=.5, dirt=.25, rust=.15),
    gunmetal=worn('xm_gunmetal', '#2b3033', .38, .95, bare='#8e969c', wear=.45, brushed=.7, dirt=.3, rust=.1),
    fabric=worn('xm_fabric', '#1d1e20', .92, 0, bare='#35373b', wear=.22, grain=7., bare_metal=False, mottle=.45, dirt=.35),   # the belt pouches' nylon
    rubber=worn('xm_rubber', '#141414', .9, 0, bare='#2a2a2a', wear=.2, bare_metal=False, dirt=.35),
    red=worn('xm_red', '#9c1f17', .5, 0, bare='#a9abad', wear=.35, chips=.4, under='#3e3f40', dirt=.3),
    round=worn('xm_round', '#56585b', .4, .45, bare='#8a8e92', wear=.3, dirt=.15),   # caseless propellant
    copper=worn('xm_copper', '#a3602e', .32, 1, bare='#dc9a62', wear=.35, dirt=.2),
    frost=worn('xm_frost', '#cfe3ea', .4, .3, bare='#eef6f8', wear=.3, bare_metal=False, mottle=.4),
    olive=worn('xm_olive', '#5a5c45', .58, .1, bare='#a9aa9c', wear=.45, chips=.45, under='#3c3d36', mottle=.4, dirt=.45, rust=.15),
    yellow=worn('xm_yellow', '#c79a1c', .55, 0, bare='#9a9da0', wear=.4, chips=.45, under='#3e3f40', dirt=.3),
    bore=mat('xm_bore', '#060606', .6, 0),
    glass=mat('xm_glass', '#a9d6e6', .05, 0, alpha=.15),
    lens=mat('reflex_lens_xm', '#a9e6c4', .05, 0, alpha=.08),   # named so the scopes mod treats it as a reflex lens
    dot=mat('xm_dot', '#300000', .3, 0, '#ff2a1a', 12),
    green=mat('xm_green_glow', '#002a08', .3, 0, '#3cff6a', 4),   # the front sight base's status light
    blue=mat('xm_blue_glow', '#04203a', .3, 0, '#58c8ff', 6),     # Cryo Shroud coolant, Leyden spark gap
    laser=mat('xm_laser_glow', '#300000', .3, 0, '#ff2018', 10),
    heat=mat('xm_heat_glow', '#1c0800', .4, 0, '#ff5a14', .15),   # the Leyden / Titan heat coils (xm325.js drives the glow with the heat)
    # the lettering stays out of the bake (glyphs that small lose strokes in the atlas)
    ink_w=mat('xm_ink_white', '#d4d0be', .6, 0), ink_k=mat('xm_ink_black', '#141414', .6, 0),
    ink_r=mat('xm_ink_red', '#e0402a', .6, 0), ink_t=mat('xm_ink_tan', '#b8a48e', .6, 0),
    thread=mat('xm_thread', '#4a4b4e', .85, 0),   # the pouches' stitching
)
BAKED = ('tan', 'black', 'poly', 'stip', 'steel', 'gunmetal', 'fabric', 'rubber', 'red', 'round', 'copper', 'frost', 'olive', 'yellow')
STENCIL = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'


def X(px): return 30.465 - px * .0285
def Z(py): return 5.738 - py * .024
def P(pts): return [(X(a), Z(b)) for a, b in pts]


SZ = 2.19          # bore axis
SIGHT = 5.14       # the HK21 sight line (front post top, rear aperture centre)
RAIL = 4.25        # top rail
MUZ = 27.33        # barrel end / muzzle device start


def vcyl(r, x, y, z0, z1, seg=16, r2=None):
    """An upright cylinder at (x, y) from z0 to z1."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0)
    bm.transform(Matrix.Translation((x, y, (z0 + z1) / 2))); return bm


def ring(name, r_out, r_in, x0, x1, m, part='j_gun', z=SZ, y=0., seg=40, bw=.03):
    """A band around the x axis (a tube from r_in to r_out)."""
    return solid(name, cylbm(r_out, x0, x1, z, y, seg), m, part=part, cuts=[cylbm(r_in, x0 - .1, x1 + .1, z, y, seg)], bw=bw, seg=1)


def bar(x0, z0, x1, z1, w, y0, y1):
    """A straight strip w wide from (x0, z0) to (x1, z1), across y0..y1."""
    dx, dz = x1 - x0, z1 - z0; L = math.hypot(dx, dz) or 1; nx, nz = -dz / L * w / 2, dx / L * w / 2
    return prism([(x0 + nx, z0 + nz), (x1 + nx, z1 + nz), (x1 - nx, z1 - nz), (x0 - nx, z0 - nz)], y0, y1)


def rail_teeth(x0, x1, y0, y1, z0, z1, part='j_gun', m='black', step=.4, w=.22):
    for k in range(int((x1 - x0) / step)):
        x = x0 + k * step
        solid('tooth', boxbm(x, x + w, y0, y1, z0, z1), M[m], part=part, bw=.02, seg=1)


def rot_x(bm, a, zc, yc=0.):
    """Turn a bmesh about the x axis through (yc, zc)."""
    bm.transform(Matrix.Translation((0, yc, zc)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, -yc, -zc))); return bm


# the belt off the Gunsmith render: (rear x, front x, z, y) per round, packed side by side up the receiver's left face
BELT = [(3.83, 6.2, 3.3, 1.08), (3.9, 6.38, 2.8, 1.14), (3.98, 6.45, 2.3, 1.16), (4.08, 6.52, 1.8, 1.16), (4.2, 6.62, 1.3, 1.14),
        (4.32, 6.72, .8, 1.12), (4.45, 6.82, .3, 1.1), (4.58, 6.92, -.2, 1.08)]


def belt(part, rounds=BELT, r=.235):
    """Caseless rounds (black propellant, three grooves, a domed tail) held side by side by steel links, climbing out
    of the box along the receiver's left face into the feed tray."""
    for k, (xa, xb, z, y) in enumerate(rounds):
        L = xb - xa
        solid('rnd', cylbm(r, xa + .2, xb, z, y=y, seg=14), M['round'], part=part, bw=.025, seg=1)
        solid('tail', cylbm(.11, xa, xa + .2, z, y=y, seg=14, r2=r), M['round'], part=part, bw=0)
        for f in (.42, .56, .7):   # the propellant's grooves
            solid('groove', cylbm(r * .9, xa + L * f, xa + L * f + .05, z, y=y, seg=14), M['poly'], part=part, bw=0)
        for f in (.2, .82):   # two links per round, and the strap that joins it to the next
            xl = xa + L * f
            solid('link', cylbm(r + .03, xl, xl + .16, z, y=y, seg=14), M['steel'], part=part, bw=.01, seg=1)
            if k + 1 < len(rounds):
                y2 = rounds[k + 1][3]
                solid('strap', boxbm(xl + .02, xl + .14, (y + y2) / 2 + r * .55, (y + y2) / 2 + r * .85, z, rounds[k + 1][2]), M['steel'], part=part, bw=0)


def quad(fb, rb, rt, ft):
    """Bilinear points on a leaning box's side: s 0..1 front to rear, t 0..1 bottom to top."""
    return lambda s_, t: tuple((1 - s_) * (1 - t) * fb[i] + s_ * (1 - t) * rb[i] + s_ * t * rt[i] + (1 - s_) * t * ft[i] for i in (0, 1))


def ytext(body, size, x, y, z, ang, part, m, side=1):
    """Lettering turned in the side plane by ang degrees (positive reads up and back)."""
    o = text(body, size, (x, y, z), part=part, m=m, side=side, font=STENCIL)
    o.data.transform(Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(ang * side), 4, 'Y') @ Matrix.Translation((-x, -y, -z))); return o


def disc_ring(name, x, y, z, ro, ri, part, m, d=.05):
    solid(name, screw(x, y, z, ro, d, seg=28), m, part=part, cuts=[screw(x, y + .02, z, ri, d, seg=28)], bw=.01)


def obox(bm, p, d, L, W, H):
    """A small box into bm centred on p=(x, y, z), L long along the xz direction d, W wide in xz, H thick in y."""
    dx, dz = d; nx, nz = -dz, dx; x, y, z = p
    vs = [bm.verts.new((x + dx * a * L / 2 + nx * b * W / 2, y + c * H / 2, z + dz * a * L / 2 + nz * b * W / 2))
          for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([vs[i] for i in f])


def loop_tube(pts, r, seg=8):
    """A round cord along a closed loop of (x, y, z) points (the piping in a pouch's seams)."""
    bm = bmesh.new(); n = len(pts); rings = []
    for k in range(n):
        a, b = Vector(pts[k - 1]), Vector(pts[(k + 1) % n]); t = (b - a).normalized(); up = Vector((0, 1, 0))
        side = t.cross(up).normalized(); p = Vector(pts[k])
        rings.append([bm.verts.new(p + r * (math.cos(2 * math.pi * j / seg) * up + math.sin(2 * math.pi * j / seg) * side)) for j in range(seg)])
    for k in range(n):
        A, B = rings[k], rings[(k + 1) % n]
        for j in range(seg):
            bm.faces.new((A[j], A[(j + 1) % seg], B[(j + 1) % seg], B[j]))
    return bm


def pouch(Q, y0, y1, flat=.74, sag=.12, nu=24, nv=34):
    """A padded belt pouch over the face mapper Q: rounded corners, flat faces that roll over into a seam at
    y0 + .2..y1 - .2 of the depth, and a bottom that sags under the rounds' weight. Returns (bmesh, at, border):
    at(u, v, side) -> (x, y, z) on the surface (u, v in -1..1), and the seam loop's (u, v)."""
    yc, half = (y0 + y1) / 2, (y1 - y0) / 2; he = half * .55
    def at(u, v, side=1):
        m = max(abs(u), abs(v)); n = (abs(u) ** 9 + abs(v) ** 9) ** (1 / 9)
        k = m / n if n > 1e-9 else 1
        s_, t = (u * k + 1) / 2, (v * k + 1) / 2
        x, z = Q(s_, t)
        z -= sag * math.sin(math.pi * s_) * (1 - t) ** 8
        f = 0 if m <= flat else ((m - flat) / (1 - flat)) ** 2
        h = half - (half - he) * f + .03 * math.sin(t * 19 + s_ * 4) * f * (1 - f) * 4   # creases where the fabric rolls over
        return x, yc + side * h, z
    U = [-1 + 2 * i / nu for i in range(nu + 1)]; V = [-1 + 2 * j / nv for j in range(nv + 1)]
    border = [(i, 0) for i in range(nu + 1)] + [(nu, j) for j in range(1, nv + 1)] + \
             [(i, nv) for i in range(nu - 1, -1, -1)] + [(0, j) for j in range(nv - 1, 0, -1)]
    bm = bmesh.new(); G = {}
    for side in (1, -1):
        for i in range(nu + 1):
            for j in range(nv + 1):
                G[side, i, j] = bm.verts.new(at(U[i], V[j], side))
        for i in range(nu):
            for j in range(nv):
                q = [G[side, i, j], G[side, i + 1, j], G[side, i + 1, j + 1], G[side, i, j + 1]]
                bm.faces.new(q if side > 0 else q[::-1])
    for k in range(len(border)):   # the gusset joining the two faces' seams
        (i, j), (i2, j2) = border[k], border[(k + 1) % len(border)]
        bm.faces.new((G[1, i, j], G[-1, i, j], G[-1, i2, j2], G[1, i2, j2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm, at, [(U[i], V[j]) for i, j in border]


def stitches(at, loop, side=1, dash=.12, gap=.08, name='stitch', part='tag_clip'):
    """A row of stitches along a closed (u, v) loop on a pouch face."""
    pts = [at(u, v, side) for u, v in loop]; bm = bmesh.new(); carry = 0.
    for k in range(len(pts)):
        a, b = Vector(pts[k]), Vector(pts[(k + 1) % len(pts)]); L = (b - a).length
        if L < 1e-6: continue
        d = (b - a) / L; dxz = Vector((d.x, d.z)); dxz = dxz.normalized() if dxz.length > 1e-6 else Vector((1, 0))
        pos = carry
        while pos < L:
            p = a + d * min(pos + dash / 2, L); obox(bm, (p.x, p.y + side * .012, p.z), (dxz.x, dxz.y), dash, .03, .03); pos += dash + gap
        carry = pos - L
    return plain(name, bm, M['thread'], part=part)


def square_loop(r, n=16):
    """A closed (u, v) square of half-size r, n points a side."""
    e = [-r + 2 * r * k / n for k in range(n)]
    return [(x, -r) for x in e] + [(r, y) for y in e] + [(-x, r) for x in e] + [(-r, -y) for y in e]


def belt_box(part, fb, rb, rt, ft, y0, y1, m='fabric', rounds=BELT):
    """A padded fabric belt pouch hanging forward in the mag well (BO7's soft belt bag), piping in both seams and a row
    of stitching round the face, a hard collar where it clips on, and the belt leaving it through the open
    top-rear corner. Returns the face mapper and the pouch surface (at)."""
    Q = quad(fb, rb, rt, ft)
    mouth = prism([Q(.42, .99), Q(.42, 1.2), Q(1.05, 1.2), Q(1.05, .9), Q(.97, .86)], y0 + .35, y1 + 1)
    bm, at, seam = pouch(Q, y0, y1)
    solid('box', bm, M[m], part=part, cuts=[mouth], bw=.04, seg=2, ang=40)
    for side in (1, -1):
        plain('piping', loop_tube([at(u, v, side) for u, v in seam], .065), M[m], part=part, smooth=60)
    stitches(at, square_loop(.9), part=part)
    solid('box_lip', prism(fillet([Q(-.03, .93), Q(.18, .97), Q(.17, 1.05), Q(-.04, 1.01)], .05), y0 - .03, y1 + .03), M['poly'], part=part, bw=.03)
    solid('box_tab', prism(fillet([Q(.84, .82), Q(1.04, .82), Q(1.05, 1.0), Q(.86, 1.0)], .08), y0 - .03, y1 + .03), M['poly'], part=part, bw=.03)
    belt(part, rounds)
    return Q


# ---------------------------------------------------------------- receiver core (black) and its tan bands
core = prism(fillet([(10.09, 4.06), (-0.74, 4.06), (-0.74, -0.14), (10.09, -0.14)], .1), -.85, .85)
solid('core', core, M['black'], cuts=[boxbm(2.25, 7.95, .4, 2, .94, 3.22),          # left feed window (the belt goes in here)
                                      boxbm(2.9, 6.1, -2, -.7, 2.35, 3.0)], bw=.05)  # ejection port (right)
solid('band_top', boxbm(-0.46, 9.37, -.88, .88, 3.63, 4.06), M['tan'], cuts=[boxbm(2.25, 7.95, .4, 2, 3.0, 3.7)], bw=.04)
solid('band_low', prism(fillet([(10.09, .99), (-0.74, .99), (-0.74, -0.14), (10.09, -0.14)], .08), -.88, .88), M['tan'], bw=.05)
solid('port_door', boxbm(3.0, 6.0, -.9, -.86, 2.4, 2.95), M['steel'], bw=.01)
for z in [.98 + .12 * k for k in range(10)]:   # the ribbed spring at the window's front edge
    solid('spring', boxbm(7.55, 8.35, .82, .95, z, z + .06), M['steel'], bw=0)
solid('lbl_ready', boxbm(6.3, 7.5, .4, .46, 1.35, 2.05), M['poly'], bw=.02)
solid('lbl_keep', boxbm(2.45, 3.15, .4, .46, 1.3, 2.3), M['poly'], bw=.02)
for t, x, z, sz in (('REGISTERED', 6.9, 1.88, .1), ('MILITARY', 6.9, 1.7, .1), ('USE', 6.9, 1.52, .1),
                    ('KEEP', 2.8, 2.08, .12), ('PORT', 2.8, 1.84, .12), ('CLEAR', 2.8, 1.6, .12)):
    text(t, sz, (x, .47, z), m=M['ink_r'], font=STENCIL)
solid('cover_knob', prism(fillet([(0.54, 2.71), (1.68, 2.71), (1.68, 3.1), (0.54, 3.1)], .08), .85, 1.02), M['poly'],
      cuts=[boxbm(x, x + .08, .97, 1.1, 2.6, 3.2) for x in (.75, .95, 1.15, 1.35)], bw=.03)
solid('knob_sel', screw(0.15, .92, .35, .22, .12, seg=18), M['steel'], bw=.02)
for x in (9.6, -0.3):
    solid('pin', screw(x, .9, 3.85, .09, .05, seg=10), M['steel'], bw=0)
text('XM325', .16, (5.2, -.9, 3.3), m=M['ink_t'], side=-1, font=STENCIL)

# top rail on the receiver
solid('rail', boxbm(-0.46, 8.8, -.38, .38, 4.06, RAIL - .1), M['black'], bw=.03)
rail_teeth(-0.3, 8.7, -.38, .38, RAIL - .12, RAIL)

# ---------------------------------------------------------------- upper skeletal handguard (black) with the gas tube
up = prism(fillet([(23.62, SZ), (23.62, 3.55), (23.4, 3.70), (13.6, 3.70), (13.2, 4.01), (9.37, 4.01), (9.37, SZ)], .12), -.8, .8)
up_cuts = [prism(rrect_xz(17.75, 22.5, 2.45, 3.55, .18), -2, 2), prism(rrect_xz(9.9, 17.2, 2.45, 3.55, .18), -2, 2),
           prism(rrect_xz(18.2, 22.5, 3.45, 3.62, .06), -.5, .5), bar(9.6, 3.55, 13.0, 3.55, .06, .75, 2)]
solid('upper', up, M['black'], cuts=up_cuts, bw=.05, seg=2)
solid('gas_tube', cylbm(.36, 9.4, 23.5, 3.0, seg=20), M['gunmetal'], bw=.02)
for x in [9.7 + .26 * k for k in range(53)]:   # the shroud's cooling ribs, seen through the windows
    solid('rib', cylbm(.41, x, x + .1, 3.0, seg=20), M['gunmetal'], bw=0)
solid('gas_plug', cylbm(.3, 23.45, 23.75, 3.0, seg=18), M['steel'], bw=.02)
text('XM325 - 1/8 - 5.56 CASELESS', .085, (11.3, .81, 3.05), m=M['ink_t'], font=STENCIL)

# ---------------------------------------------------------------- tan lower handguard: M-LOK, stipple plate, side rail
lo = prism(fillet([(23.71, SZ), (9.37, SZ), (9.37, -0.02), (20.92, -0.02), (21.63, 0.94), (23.34, 1.71), (23.71, 1.78)], .12), -1.0, 1.0)
lo_cuts = [prism(rrect_xz(x0, x1, 1.47, 1.8, .14), s * .86, s * 2) for x0, x1 in ((16.78, 17.92), (12.37, 14.36), (10.37, 12.08)) for s in (1, -1)]
lo_cuts += [oval(20.3, 1.86, 5.2, .3, math.radians(-3), .86, 2), oval(20.3, 1.86, 5.2, .3, math.radians(-3), -2, -.86)]
solid('lower_hg', lo, M['tan'], cuts=lo_cuts, bw=.06, seg=2)
solid('stipple', prism(rrect_xz(11.94, 14.5, .46, 1.3, .12), .95, 1.05), M['tan'],
      cuts=[boxbm(x, x + .06, 1.02, 1.1, .4, 1.4) for x in [12.1 + .16 * k for k in range(15)]], bw=.02)
text('XM325', .1, (13.2, 1.06, .2), m=M['ink_k'], font=STENCIL)
# left side rail with red index marks (the MFS laser clamps on here)
solid('side_rail', boxbm(15.36, 20.63, .98, 1.15, .94, 1.54), M['black'], cuts=[boxbm(x, x + .22, 1.08, 1.3, .8, 1.7) for x in
      [15.6 + .45 * k for k in range(11)]], bw=.02)
for x in (16.05, 17.4, 18.75, 20.1):
    solid('mark', boxbm(x, x + .14, 1.14, 1.17, 1.0, 1.48), M['red'], bw=0)
# bottom rail (the VAS foregrip clamps on here)
solid('bot_rail', boxbm(15.8, 21.0, -.38, .38, -0.2, -0.01), M['black'], bw=.02)
rail_teeth(15.9, 20.9, -.38, .38, -0.3, -0.18)
for x in (10.2, 22.4):
    solid('hg_pin', screw(x, 1.0, 1.0, .1, .05, seg=10), M['steel'], bw=0)

# ---------------------------------------------------------------- front sight base (black) with its green light
solid('fsb', prism(fillet([(23.48, 1.1), (25.19, 1.1), (25.19, 3.25), (24.9, 3.4), (23.48, 3.4)], .12), -.55, .55), M['black'],
      cuts=[cylbm(.28, 23.0, 25.5, SZ, seg=18)], bw=.04)
solid('fsb_lamp', boxbm(24.2, 24.48, .55, .6, 1.18, 1.46), M['green'], bw=0)
solid('fsb_screw', screw(24.9, .56, 2.9, .08, .04, seg=8), M['steel'], bw=0)

# ---------------------------------------------------------------- rear housing (tan), black top cap
rh = prism(fillet([(-0.46, 4.2), (-1.2, 4.22), (-11.4, 4.22), (-11.4, .7), (-0.46, .7)], .1), -.9, .9)
rh_cuts = [boxbm(-11.0, -1.0, s * .86, s * 2, 1.45, 1.56) for s in (1, -1)] + \
          [boxbm(-11.0, -0.8, s * .86, s * 2, z, z + .05) for s in (1, -1) for z in (2.42, 3.55)]
solid('housing', rh, M['tan'], cuts=rh_cuts, bw=.05, seg=2)
solid('housing_panel', prism(fillet([(-1.0, 2.5), (-1.0, 3.2), (-1.6, 3.5), (-10.7, 3.5), (-10.7, 2.5)], .1), .85, .95), M['tan'], bw=.03)
solid('housing_low', prism(fillet([(1.0, -0.1), (1.0, .72), (-10.1, .72), (-10.1, .25), (-2.6, .25), (-2.6, -0.1)], .1), -.62, .62), M['black'], bw=.04)
solid('cap', prism(fillet([(-6.4, 4.15), (-6.9, 4.55), (-11.3, 4.55), (-11.3, 4.15)], .1), -.72, .72), M['poly'], bw=.05)
for x in (0.54, -0.46, -5.16, -6.3):   # Rist Rauch's triangular screws
    solid('tri', screw(x, .9, 1.06, .17, .06, seg=3), M['black'], bw=.01)
for x in (-1.63, -4.84, -6.24, -7.66, -9.05):
    solid('vent', screw(x, .9, 3.82, .06, .03, seg=10), M['bore'], bw=0)
text('R', .5, (-2.65, .96, 3.0), m=M['ink_t'], font=STENCIL)
text('RIST', .2, (-3.75, .96, 3.15), m=M['ink_t'], font=STENCIL)
text('RAUCH', .2, (-3.9, .96, 2.85), m=M['ink_t'], font=STENCIL)
solid('qr', boxbm(-7.6, -7.2, .94, .97, 2.85, 3.25), M['black'], bw=0)
text('LMG  5.56x45 CASELESS', .09, (-9.3, .96, 3.05), m=M['ink_t'], font=STENCIL)
text('XM325  R556  CAL 5.56', .1, (-5.5, .91, 2.0), m=M['ink_t'], font=STENCIL)
text('RIST RAUCH', .16, (-5.0, -.91, 3.05), m=M['ink_k'], side=-1, font=STENCIL)

# ---------------------------------------------------------------- lower receiver (black), trigger guard, trigger
lr = prism(fillet([(4.4, -0.1), (-2.6, -0.1), (-2.6, -1.0), (-0.3, -1.0), (-0.05, -0.28), (3.0, -0.28), (4.4, -0.65)], .1), -.65, .65)
solid('lower_rcv', lr, M['black'], bw=.05)
gd = prism([(3.7, -0.25), (3.7, -1.0), (3.1, -1.5), (-0.7, -1.5), (-0.7, -0.95), (0.0, -0.25)], -.28, .28)
solid('guard', gd, M['black'], cuts=[prism(fillet([(3.35, -0.2), (3.35, -0.95), (2.95, -1.3), (-0.25, -1.3), (-0.25, -0.9),
                                                    (0.3, -0.2)], .2), -1, 1)], bw=.05)
solid('trigger', prism([(1.75, -0.25), (2.05, -0.25), (1.85, -0.75), (1.5, -0.95), (1.4, -0.85)], -.11, .11), M['steel'], bw=.03)
solid('mag_btn', screw(4.0, .65, -0.4, .14, .08, seg=12), M['steel'], bw=.01)

# ---------------------------------------------------------------- j_bolt: the feed-cover latch and charging handle
solid('latch', prism(fillet([(11.8, 4.0), (13.02, 4.0), (13.02, 4.17), (12.0, 4.25)], .06), -.2, .2), M['steel'], part='j_bolt', bw=.02)
solid('ch_stem', boxbm(12.2, 12.6, .78, 1.15, 3.78, 3.95), M['steel'], part='j_bolt', bw=.02)
solid('ch_knob', prism(fillet([(12.0, 3.72), (12.85, 3.72), (12.85, 4.0), (12.0, 4.0)], .1), 1.1, 1.38), M['poly'], part='j_bolt', bw=.04)

# ---------------------------------------------------------------- iron sights (tag_iron_sight)
IS = 'tag_iron_sight'
solid('fs_tower', prism(fillet([(23.25, 3.3), (24.45, 3.3), (24.3, 4.15), (23.4, 4.15)], .08), -.32, .32), M['black'], part=IS, bw=.03)
for s in (1, -1):
    solid('fs_ear', prism(fillet([(23.4, 4.0), (24.3, 4.0), (24.15, 5.38), (23.6, 5.38)], .08), s * .2, s * .34), M['black'], part=IS,
          cuts=[prism(rrect_xz(23.7, 24.05, 4.35, 4.9, .08), -1, 1)], bw=.02)
solid('fs_post', boxbm(23.82, 23.98, -.05, .05, 4.1, SIGHT), M['steel'], part=IS, bw=0)
solid('rs_base', boxbm(-2.85, -1.5, -.42, .42, 4.25, 4.6), M['black'], part=IS, bw=.04)
for s in (1, -1):
    solid('rs_wing', prism(fillet([(-2.75, 4.55), (-1.6, 4.55), (-1.75, 5.55), (-2.55, 5.55)], .08), s * .28, s * .42), M['black'], part=IS, bw=.02)
ring('rs_aperture', .28, .12, -2.25, -2.05, M['black'], part=IS, z=SIGHT, seg=24, bw=0)
solid('rs_stem', boxbm(-2.25, -2.05, -.08, .08, 4.55, SIGHT - .26), M['black'], part=IS, bw=0)
solid('rs_knob', screw(-2.15, .45, 4.45, .12, .08, seg=12), M['steel'], part=IS, bw=0)

# ---------------------------------------------------------------- stock parts: barrel, flash hider, grip, stock
BA = 'tag_xm_barrel'
solid('barrel_in', cylbm(.3, 9.0, 23.6, SZ, seg=20), M['gunmetal'], part=BA, bw=.01)
solid('barrel', cylbm(.37, 23.5, MUZ + .05, SZ, seg=24), M['gunmetal'], part=BA, bw=.01)
ring('barrel_step', .42, .3, 25.2, 25.5, M['steel'], part=BA, seg=24, bw=.01)
ring('barrel_collar', .41, .3, 26.6, 26.85, M['black'], part=BA, seg=6, bw=.01)

MZ = 'tag_xm_muzzle'
solid('fh', cylbm(.34, MUZ, 29.47, SZ, seg=20), M['steel'], part=MZ,
      cuts=[boxbm(28.1, 29.7, -.06, .06, SZ, 2.7), rot_x(boxbm(28.1, 29.7, -.06, .06, SZ, 2.7), math.radians(120), SZ),
            rot_x(boxbm(28.1, 29.7, -.06, .06, SZ, 2.7), math.radians(240), SZ), cylbm(.15, 28.6, 29.6, SZ, seg=12)], bw=.03)
ring('fh_nut', .38, .24, MUZ, MUZ + .35, M['black'], part=MZ, seg=6, bw=.02)

GR = 'tag_xm_grip'
gp = prism(fillet([(-1.2, -0.6), (-0.6, -0.98), (-1.74, -6.62), (-2.3, -6.82), (-3.8, -6.65), (-4.02, -6.38), (-2.31, -0.5)], .3), -.55, .55)
solid('grip', gp, M['tan'], part=GR, bw=.12, seg=3)
for s in (1, -1):
    solid('grip_panel', prism(fillet([(-1.3, -2.0), (-2.0, -6.0), (-3.45, -5.85), (-2.65, -2.0)], .25), s * .5, s * .6), M['rubber'], part=GR,
          cuts=[bar(-1.2, z, -3.6, z - .3, .06, s * .57, s * .7) for z in (-2.6, -3.3, -4.0, -4.7, -5.4)], bw=.03)
solid('grip_logo', screw(-1.55, .57, -1.35, .24, .05, seg=20), M['black'], part=GR, bw=.01)
text('R', .2, (-1.55, .6, -1.35), part=GR, m=M['ink_t'], font=STENCIL)

ST = 'tag_xm_stock'
sk = prism(fillet([(-10.9, 4.2), (-11.6, 4.48), (-13.5, 4.62), (-14.35, 4.5), (-14.15, 1.0), (-13.95, -1.2), (-13.4, -1.32), (-12.6, -0.6),
                   (-12.1, -0.05), (-9.9, .1), (-9.9, .45), (-11.25, .55), (-11.25, 3.9)], .18), -.7, .7)
solid('stock', sk, M['poly'], part=ST, cuts=[prism(rrect_xz(-13.25, -12.85, 1.1, 3.55, .18), -1, 1), prism(rrect_xz(-13.0, -11.6, -0.2, .35, .15), -1, 1),
      cylbm(.17, -12.5, -12.5 + 2, 3.95, axis='y'), cylbm(.17, -13.1, -13.1 + 2, .62, axis='y')], bw=.08, seg=2)
solid('buttplate', prism(fillet([(-14.25, 4.55), (-14.65, 4.4), (-14.45, 1.0), (-14.25, -1.25), (-13.95, -1.3), (-14.1, 1.0)], .1), -.78, .78), M['rubber'], part=ST,
      cuts=[boxbm(-14.9, -14.4, -1, 1, z, z + .1) for z in [-0.9 + .3 * k for k in range(18)]], bw=.03)
for s_ in (1, -1):
    solid('loop', bar(-13.85, 4.0, -13.65, -0.9, .12, s_ * .7, s_ * .82), M['steel'], part=ST, bw=.03)
solid('stock_screw', screw(-11.9, .71, 2.2, .12, .05, seg=10), M['steel'], part=ST, bw=0)

# ---------------------------------------------------------------- the default belt box (tag_clip, 60 rounds)
CL = 'tag_clip'   # Rist Rauch's padded belt pouch: a stippled patch, the round maker's mark, 5.56x45MM / LMG556-B / CASELESS
BY0, BY1 = -.72, 1.28   # the box rides proud of the receiver's left face, where the belt climbs
Q = belt_box(CL, (11.3, -6.17), (7.09, -6.59), (3.97, -.66), (7.82, .78), BY0, BY1)
panel = [Q(.27, .05), Q(.93, .05), Q(.93, .8), Q(.14, .8), Q(.14, .55), Q(.27, .47)]
solid('box_stip', prism(fillet(panel, .15), BY1 - .03, BY1 + .015), M['stip'], part=CL, bw=.01)
(mx, mz), (hx, hz) = Q(.55, .7), Q(.2, .13)
disc_ring('box_mark', mx, BY1 + .02, mz, .62, .5, CL, M['poly'])
solid('box_mark_c', screw(mx, BY1 + .03, mz, .3, .04, seg=24), M['poly'], part=CL, bw=.01)
disc_ring('box_hole', hx, BY1 + .02, hz, .17, .08, CL, M['poly'])
for body, size, (x, z), dy in (('5.56x45MM', .24, Q(.1, .45), .01), ('LMG556-B', .24, Q(.17, .42), .01), ('CASELESS', .19, Q(.82, .33), .03)):
    ytext(body, size, x, BY1 + dy, z, 63, CL, M['ink_w'])
x, z = Q(.5, .5)
text('RR', .24, (x, BY0 - .02, z), part=CL, m=M['ink_t'], side=-1, font=STENCIL)

# ---------------------------------------------------------------- muzzle attachments
CP = 'tag_xm_comp'   # RL-7.62 Compensator: a squared-off block with top and side ports
solid('comp', prism(fillet([(MUZ - .05, 1.77), (30.0, 1.77), (30.0, 2.61), (MUZ - .05, 2.61)], .12), -.42, .42), M['black'], part=CP,
      cuts=[boxbm(x, x + .22, -.3, .3, 2.3, 3) for x in (28.0, 28.5, 29.0, 29.5)] +
           [boxbm(x, x + .2, -1, 1, 2.05, 2.35) for x in (28.25, 28.75, 29.25)] + [cylbm(.16, 29.6, 30.2, SZ, seg=12)], bw=.03)
text('RL-7.62', .1, (28.6, .43, 1.92), part=CP, m=M['ink_w'], font=STENCIL)

SP = 'tag_xm_sup'    # Monolithic Suppressor: one long faceted can
solid('sup', cylbm(.5, MUZ - .3, 34.0, SZ, seg=8), M['black'], part=SP, cuts=[cylbm(.14, 33.6, 34.3, SZ, seg=12)], bw=.04)
for x in (MUZ - .3, 33.6):
    ring('sup_band', .53, .4, x, x + .4, M['steel'], part=SP, seg=8, bw=.01)
text('MONOLITHIC', .14, (30.8, .49, SZ), part=SP, m=M['ink_t'], font=STENCIL)

# ---------------------------------------------------------------- barrel attachments (each replaces tag_xm_barrel)
CH = 'tag_xm_chief'   # 19.3" R-556 Chief: a fluted barrel with a hex gas block
solid('ch_in', cylbm(.3, 9.0, 23.6, SZ, seg=20), M['gunmetal'], part=CH, bw=.01)
solid('ch_barrel', cylbm(.31, 23.5, MUZ + .05, SZ, seg=24), M['gunmetal'], part=CH,
      cuts=[rot_x(boxbm(25.4, 27.1, -.05, .05, SZ + .24, SZ + .4), math.radians(a), SZ) for a in range(0, 360, 60)], bw=.01)
solid('ch_block', cylbm(.48, 25.9, 26.6, SZ, seg=6), M['steel'], part=CH, cuts=[cylbm(.31, 25.8, 26.7, SZ, seg=20)], bw=.03)
text('CHIEF', .1, (26.25, .45, SZ), part=CH, m=M['ink_w'], font=STENCIL)

FR = 'tag_xm_fractal'   # 24" Fractal-LRB: a heavy barrel in a perforated shroud
solid('fr_in', cylbm(.32, 9.0, 23.6, SZ, seg=20), M['gunmetal'], part=FR, bw=.01)
solid('fr_barrel', cylbm(.3, 23.5, MUZ + .05, SZ, seg=20), M['gunmetal'], part=FR, bw=.01)
holes = [cylbm(.11, x, x + 3, SZ, y=0, seg=10, axis='y') for x in [23.9 + .42 * k for k in range(8)]]
solid('fr_shroud', cylbm(.46, 23.7, MUZ, SZ, seg=24), M['black'], part=FR,
      cuts=[cylbm(.36, 23.5, MUZ + .2, SZ, seg=24)] + holes + [vcyl(.1, x, 0, SZ, SZ + 1, 10) for x in [24.1 + .42 * k for k in range(8)]], bw=.02)
ring('fr_cap', .48, .28, MUZ - .25, MUZ, M['steel'], part=FR, seg=24, bw=.01)

CR = 'tag_xm_cryo'   # Cryo Shroud (custom): a frosted coolant jacket, blue lines glowing through the handguard windows
solid('cr_in', cylbm(.3, 9.0, 23.6, SZ, seg=20), M['gunmetal'], part=CR, bw=.01)
solid('cr_jacket', cylbm(.4, 23.5, MUZ, SZ, seg=24), M['frost'], part=CR, bw=.03)
for x in [25.4 + .35 * k for k in range(5)]:
    ring('cr_fin', .5, .35, x, x + .12, M['copper'], part=CR, seg=24, bw=0)
for s in (1, -1):
    solid('cr_line', cylbm(.12, 13.4, 23.4, 3.0, y=s * .48, seg=12), M['blue'], part=CR, bw=0)
    for x in (14.0, 17.0, 20.0, 22.8):
        ring('cr_clip', .17, .1, x, x + .15, M['copper'], part=CR, z=3.0, y=s * .48, seg=12, bw=0)
solid('cr_valve', cylbm(.2, 23.55, 23.9, 3.0, y=.48, seg=12), M['copper'], part=CR, bw=.01)

# ---------------------------------------------------------------- underbarrel, laser, optic
VA = 'tag_xm_vas'    # VAS Convergence Foregrip: a raked grip on the bottom rail
solid('vas_clamp', boxbm(17.0, 19.5, -.5, .5, -0.32, -0.05), M['black'], part=VA, bw=.04)
solid('vas_grip', prism(fillet([(17.3, -0.2), (19.3, -0.2), (18.9, -2.6), (17.8, -2.7)], .35), -.48, .48), M['tan'], part=VA,
      cuts=[boxbm(19.0, 19.6, -.6, .6, z - .05, z + .05) for z in (-0.8, -1.4, -2.0)], bw=.18, seg=3)
solid('vas_cap', prism(fillet([(17.6, -2.45), (19.05, -2.4), (18.95, -2.8), (17.7, -2.85)], .12), -.5, .5), M['rubber'], part=VA, bw=.05)

MF = 'tag_xm_mfs'    # MFS Motion Strike Laser: a box on the left side rail, two red lenses
solid('mfs_clamp', boxbm(16.8, 19.0, 1.0, 1.2, .9, 1.6), M['black'], part=MF, bw=.02)
solid('mfs_box', prism(fillet([(16.2, .75), (19.6, .75), (19.6, 1.75), (16.2, 1.75)], .18), 1.15, 1.75), M['black'], part=MF, bw=.06, seg=2)
for z in (1.0, 1.5):
    solid('mfs_lens', cylbm(.17, 19.55, 19.66, z, y=1.45, seg=16), M['laser'], part=MF, bw=0)
solid('mfs_btn', screw(17.2, 1.76, 1.25, .16, .08, seg=12), M['red'], part=MF, bw=.01)
text('MFS', .14, (18.0, 1.76, 1.3), part=MF, m=M['ink_w'], font=STENCIL)

RX = 'tag_xm_reflex'   # a compact reflex on the top rail
solid('rx_base', boxbm(1.0, 4.5, -.55, .55, RAIL, RAIL + .3), M['black'], part=RX, bw=.04)
solid('rx_hood', prism(fillet([(1.6, RAIL + .25), (4.2, RAIL + .25), (4.2, 6.0), (2.0, 6.0)], .2), -.75, .75), M['tan'], part=RX,
      cuts=[prism(rrect_xz(1.4, 4.4, 4.62, 5.68, .18), -.58, .58)], bw=.06, seg=2)
solid('rx_glass', boxbm(3.95, 4.0, -.58, .58, 4.62, 5.68), M['lens'], part=RX, bw=0)
solid('rx_emit', cylbm(.08, 1.7, 1.95, RAIL + .45, seg=10), M['dot'], part=RX, bw=0)
solid('rx_knob', screw(2.7, .76, RAIL + .5, .15, .1, seg=14), M['steel'], part=RX, bw=.02)

# ---------------------------------------------------------------- grip and stock attachments
LU = 'tag_xm_lucius'   # Lucius-90: a black rubber grip with finger grooves
lu = prism(fillet([(-1.2, -0.6), (-0.6, -0.98), (-0.95, -2.2), (-0.75, -2.6), (-1.15, -3.6), (-0.95, -4.0), (-1.4, -5.1), (-1.25, -5.5),
                   (-1.6, -6.7), (-3.7, -6.8), (-4.0, -6.5), (-2.9, -1.4), (-3.3, -0.7), (-2.31, -0.5)], .2), -.56, .56)
solid('lucius', lu, M['rubber'], part=LU, cuts=[boxbm(-4, 0, s * .52, s * 1, z, z + .07) for s in (1, -1) for z in (-2.0, -3.0, -4.0, -5.0)],
      bw=.12, seg=3)
text('LUCIUS', .14, (-2.5, .57, -1.4), part=LU, m=M['ink_w'], font=STENCIL)

AE = 'tag_xm_aegis'    # Aegis-X40: a solid stock with a cheek riser
ae = prism(fillet([(-11.2, 4.4), (-12.9, 4.5), (-13.4, 5.0), (-15.2, 5.0), (-15.4, 4.6), (-15.4, -1.5), (-14.6, -1.6), (-11.2, 0.7)], .25), -.7, .7)
solid('aegis', ae, M['poly'], part=AE, cuts=[prism(rrect_xz(-14.6, -13.2, .2, 2.6, .3), .55, 2), prism(rrect_xz(-14.6, -13.2, .2, 2.6, .3), -2, -.55)],
      bw=.12, seg=3)
solid('aegis_riser', prism(fillet([(-12.9, 4.9), (-15.0, 4.9), (-15.0, 5.3), (-13.3, 5.3)], .15), -.55, .55), M['tan'], part=AE, bw=.08)
solid('aegis_pad', prism(fillet([(-15.3, 5.0), (-15.85, 4.9), (-15.85, -1.4), (-15.3, -1.5)], .15), -.78, .78), M['rubber'], part=AE, bw=.06)
text('AEGIS X40', .16, (-14.0, .71, 3.6), part=AE, m=M['ink_t'], font=STENCIL)

# ---------------------------------------------------------------- magazines (each replaces tag_clip, moved by the reload)
FB = 'tag_xm_fastbelt'   # Wessi Fast Belt (50): a slim short box with triangular panels
Q = belt_box(FB, (10.6, -4.5), (6.95, -4.85), (3.97, -.66), (7.82, .78), -.6, 1.24)
for tri in (((.18, .1), (.8, .1), (.8, .36)), ((.18, .2), (.18, .5), (.74, .5)), ((.2, .56), (.86, .56), (.86, .78), (.3, .78))):
    solid('fb_panel', prism(fillet([Q(*p) for p in tri], .1), 1.17, 1.27), M['black'], part=FB, bw=.02)
x, z = Q(.08, .45)
ytext('WESSI 50', .2, x, 1.25, z, 63, FB, M['ink_w'])

EB = 'tag_xm_extbelt'   # Enforcer Extended Belt (85): a deep box with three straps round it
Q = belt_box(EB, (12.1, -8.2), (7.4, -8.7), (3.97, -.66), (7.82, .78), -1.0, 1.5)
for t in (.22, .48, .74):
    (x0, z0), (x1, z1) = Q(-.03, t), Q(1.03, t)
    solid('eb_strap', bar(x0, z0, x1, z1, .5, -.98, 1.54), M['black'], part=EB, bw=.05)
    xb, zb = Q(.5, t)
    solid('eb_buckle', prism(fillet([(xb - .3, zb - .32), (xb + .3, zb - .28), (xb + .3, zb + .32), (xb - .3, zb + .28)], .06), 1.55, 1.62), M['steel'], part=EB, bw=.01)
x, z = Q(.08, .62)
ytext('ENFORCER', .2, x, 1.51, z, 63, EB, M['ink_w'])
x, z = Q(.62, .1)
text('85', .4, (x, 1.51, z), part=EB, m=M['ink_w'], font=STENCIL)


def canister(part, x0, x1, zc, r, label):
    """BO7's long belt canister slung under the handguard (the Leyden belt, and Titan Wield's): a faceted tube with tan rib
    bands and two grilled windows on the left over the heat coils (xm_heat_glow, lit by xm325.js as the gun heats),
    an end cap, and a round feed housing at the rear that turns the belt up into the feed window."""
    tw = lambda bm: rot_x(bm, math.radians(15), zc)   # a flat facet facing the player
    wins = [(x0 + 2.9, x0 + 6.5), (x0 + 7.5, x0 + 11.1)]
    cuts = [prism(rrect_xz(a, b, zc - r * .42, zc + r * .42, .2), r * .74, 3) for a, b in wins]
    solid('can', tw(cylbm(r, x0, x1, zc, seg=12)), M['poly'], part=part, cuts=cuts, bw=.06, seg=2)
    for a, b in wins:
        solid('coil_glow', boxbm(a + .1, b - .1, r * .6, r * .78, zc - r * .36, zc + r * .36), M['heat'], part=part, bw=0)
        for k in range(int((b - a - .3) / .28)):   # the copper coil seen through the grille
            x = a + .2 + k * .28
            solid('coil', boxbm(x, x + .09, r * .7, r * .8, zc - r * .4, zc + r * .4), M['copper'], part=part, bw=0)
        solid('grille', boxbm(a, b, r * .82, r * .86, zc - .03, zc + .03), M['steel'], part=part, bw=0)
    for a in (x0 + 1.6, x0 + 6.75, x0 + 11.35, x1 - 1.2):
        solid('rib', tw(cylbm(r + .07, a, a + .4, zc, seg=12)), M['tan'], part=part, bw=.03)
    solid('cap', tw(cylbm(r * .96, x1, x1 + .55, zc, seg=12, r2=r * .72)), M['black'], part=part, bw=.05)
    solid('cap_nut', cylbm(.28, x1 + .5, x1 + .75, zc, seg=6), M['steel'], part=part, bw=.02)
    solid('hanger', boxbm(x0 + 1, x1 - .6, -.42, .42, zc + r - .15, -0.01), M['black'], part=part, bw=.04)
    for a in (x0 + 2.2, x1 - 2.4):
        solid('hanger_pin', screw(a, .43, (zc + r - .01) / 2, .1, .05, seg=10), M['steel'], part=part, bw=0)
    text(label, .3, ((x0 + x1) / 2, -r * .97, zc), part=part, m=M['ink_w'], side=-1, font=STENCIL)
    text(label, .24, ((x0 + 11.75 + x1 - 1.2) / 2, r * .97, zc), part=part, m=M['ink_w'], font=STENCIL)
    # the feed housing: a drum across the gun, the belt neck rising from its top-rear
    hx, hr = x0 - 1.35, r * 1.22
    solid('housing', cylbm(hr, hx, hx + 2.5, zc, y=.05, seg=32, axis='y'), M['poly'], part=part, bw=.1, seg=2)
    solid('housing_box', prism(fillet([(hx, zc + hr), (x0 + .6, zc + hr), (x0 + .6, zc - hr), (hx, zc - hr)], .2), -1.15, 1.25), M['poly'], part=part, bw=.08)
    disc_ring('housing_ring', hx, 1.3, zc, hr * .8, hr * .66, part, M['tan'])
    solid('housing_hub', screw(hx, 1.32, zc, hr * .3, .06, seg=6), M['steel'], part=part, bw=.02)
    solid('neck', prism(fillet([(4.25, -.35), (7.25, .35), (7.25, zc + hr * .5), (4.6, zc + hr * .5)], .15), .5, 1.42), M['black'], part=part,
          cuts=[prism([(4.4, -.15), (7.1, .5), (7.1, -.3), (4.6, -.9)], .7, 2)], bw=.05)
    solid('hv_plate', boxbm(hx + .3, hx + 1.3, 1.24, 1.27, zc - hr * .9, zc - hr * .55), M['yellow'], part=part, bw=.01)
    text('HV', .22, (hx + .8, 1.28, zc - hr * .72), part=part, m=M['ink_k'], font=STENCIL)
    belt(part, BELT[:8])


LY = 'tag_xm_leyden'   # Leyden Spark Belt Fed: the 500-round overheat canister (it locks up hot and discharges)
canister(LY, 8.3, 23.0, -1.62, 1.25, 'LEYDEN')

TW = 'tag_xm_titan'   # Titan Wield: each gun carries a bigger 500-round canister
canister(TW, 8.3, 24.6, -1.95, 1.55, 'TITAN')

PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
if PREVIEW:   # quick look without the bake: the unbaked materials in EEVEE, framed like the left-side Gunsmith render
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    w = bpy.data.worlds.new('pw'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.32, .34, .38, 1)
    for loc, e in (((8, 40, 30), 6000), ((8, -40, 20), 2500), ((-30, 30, 10), 2000), ((40, 30, 0), 2000)):
        ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = 25
        lo = bpy.data.objects.new('l', ld); lo.location = loc; COL.objects.link(lo)
        lo.rotation_euler = (Vector((8, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('pc'); cam.type = 'ORTHO'; co = bpy.data.objects.new('pc', cam); COL.objects.link(co); sc.camera = co
    W, H = 1604 * .0285, 556 * .024   # the Gunsmith render's extent in inches (x 30.465 .. -15.25, z 5.738 .. -7.6)
    def show(on):
        for p, obs in PARTS.items():
            for o in obs: o.hide_render = not (p in on or (p == 'tag_clip' and 'clip' in on))
    BASE_ON = ('j_gun', 'j_bolt', 'tag_iron_sight', 'tag_xm_muzzle', 'tag_xm_barrel', 'tag_xm_grip', 'tag_xm_stock')
    looks = [a for a in argv[argv.index('--preview') + 2:] if not a.startswith('--')] or ['tag_clip']
    for look in looks:
        show(BASE_ON + tuple(look.split(',')))
        sc.render.resolution_x, sc.render.resolution_y = 1604, round(1604 * H / W)
        co.location = (30.465 - W / 2, 60, 5.738 - H / 2); co.rotation_euler = (math.radians(90), 0, math.radians(180)); cam.ortho_scale = W
        sc.render.filepath = f'{PREVIEW}/left_{look.replace(",", "+")}.png'; bpy.ops.render.render(write_still=True)
        sc.render.resolution_x, sc.render.resolution_y = 1200, 800
        co.location = (-26, 30, 14)   # roughly the player's view: behind, left and above
        co.rotation_euler = (Vector((7, 0, 0)) - co.location).to_track_quat('-Z', 'Y').to_euler(); cam.ortho_scale = 30
        sc.render.filepath = f'{PREVIEW}/eye_{look.replace(",", "+")}.png'; bpy.ops.render.render(write_still=True)
    sys.exit(0)

export(OUT, RENDER, 'xm', BAKED, tex=TEX, frame=(7.5, 0, -1.0), ortho=52)

if RENDER:   # close-ups of the bare gun (no attachments), then the kits
    sc = bpy.context.scene; co = sc.camera
    keep = ('part_tag_clip', 'part_tag_iron_sight', 'part_tag_xm_muzzle', 'part_tag_xm_barrel', 'part_tag_xm_grip', 'part_tag_xm_stock')
    for o in bpy.data.objects:
        if o.name.startswith('part_tag_') and o.name not in keep: o.hide_render = True
    for name, (x, z, sc_) in (('close_rcv', (4.0, 1.0, 16)), ('close_front', (21.0, 2.2, 16)), ('close_stock', (-8.0, 0.5, 16))):
        co.location = (x, 60, z); co.rotation_euler = (math.radians(90), 0, math.radians(180)); co.data.ortho_scale = sc_
        sc.render.filepath = f'{RENDER}/xm_{name}.png'; bpy.ops.render.render(write_still=True)
    co.location = (-30, 26, 16)   # roughly the player's view: from behind, left and above
    co.rotation_euler = (Vector((8, 0, 2)) - co.location).to_track_quat('-Z', 'Z').to_euler(); co.data.ortho_scale = 36
    sc.render.filepath = f'{RENDER}/xm_close_hip.png'; bpy.ops.render.render(write_still=True)
    kits = (('a', ('iron_sight', 'xm_comp', 'xm_chief', 'xm_vas', 'xm_lucius', 'xm_aegis', 'xm_fastbelt')),
            ('b', ('xm_reflex', 'xm_sup', 'xm_cryo', 'xm_mfs', 'xm_grip', 'xm_stock', 'xm_leyden')),
            ('c', ('iron_sight', 'xm_muzzle', 'xm_fractal', 'xm_grip', 'xm_stock', 'xm_titan')),
            ('d', ('iron_sight', 'xm_muzzle', 'xm_barrel', 'xm_grip', 'xm_stock', 'xm_extbelt')))
    co.location = (7.5, 60, -1.5); co.rotation_euler = (math.radians(90), 0, math.radians(180)); co.data.ortho_scale = 52
    for k, on in kits:
        for o in bpy.data.objects:
            if o.name.startswith('part_tag_'): o.hide_render = o.name[9:] not in on
        sc.render.filepath = f'{RENDER}/xm_kit_{k}.png'; bpy.ops.render.render(write_still=True)
