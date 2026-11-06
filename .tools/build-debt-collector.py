# The Debt Collector (Melon Zombies' own revolver, docs/fork/melon-weapons.md): a loan shark's oversized six-shot in
# blackened steel and worn brass. Modelled in the BO1 Python viewmodel's gun space (j_gun: x forward, y left, z up,
# inches), so .tools/assemble-grimhawk.mjs --gun debt skins each part to the Python's skeleton. The player sees the
# gun's left (+y) side. Parts are objects named part_<bone>:
#   j_gun            frame, knuckle-duster trigger guard, trigger, abacus tally on the top strap, coin slot, rear sight
#   j_press_rear     the padlock hammer
#   tag_clip         the crane (swings out with the cylinder on the reload)
#   j_bolt           ejector rod
#   tag_dc_ledger    the ledger cylinder (chambers stamped I-VI); child of j_bolt (BONE_PARENT), so it swings and turns
#   tag_barrel_long  octagonal barrel, vent rib, underlug (replaced by the Bailiff and the Debt Spiral)
#   tag_iron_sight   the gold-tooth front sight (folded away by the loupe, ironSights in attachments.json)
#   tag_dc_grips     green celluloid grips with a brass shield (replaced by the Loan Shark Grips)
#   tag_dc_spool     the ticker-tape receipt spool on the left (replaced by the Ticker Tape Laser)
#   tag_speedloader, tag_bullets, tag_spent0-5   the reload's loader, rounds and the spent cases
#   tag_dc_*         the attachments, hidden by tag until fitted
#   blender -b -P .tools/build-debt-collector.py -- <out.glb> [--render <dir>]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bo7lib import *
import bo7lib

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/debt_parts.glb'
RENDER = argv[argv.index('--render') + 1] if '--render' in argv else None

SPENT = tuple(f'tag_spent{i}' for i in range(6))
ATT = ('tag_dc_loupe', 'tag_dc_brake', 'tag_dc_compound', 'tag_dc_roulette', 'tag_dc_hook', 'tag_dc_payday',
       'tag_dc_bailiff', 'tag_dc_spiral', 'tag_dc_ticker', 'tag_dc_shark')
PARTS.update({k: [] for k in ('j_gun', 'j_press_rear', 'tag_clip', 'j_bolt', 'tag_dc_ledger', 'tag_barrel_long', 'tag_iron_sight',
                              'tag_dc_grips', 'tag_dc_spool', 'tag_speedloader', 'tag_bullets') + SPENT + ATT})
M.update(
    # blackened steel worn silver on the edges, worn brass, gold, green celluloid
    blk=worn('dc_black', '#1b1c1e', .4, .9, bare='#8d9298', wear=.55, brushed=.35, dirt=.3, rust=.08),
    steel=worn('dc_steel', '#43474b', .32, 1, bare='#a6acb2', wear=.5, brushed=.5, dirt=.25),
    brass=worn('dc_brass', '#9a7631', .3, 1, bare='#e3c277', wear=.5, dirt=.4, mottle=.3),
    gold=worn('dc_gold', '#d6a630', .2, 1, bare='#ffe190', wear=.25, dirt=.1),
    cell=worn('dc_celluloid', '#1d5a33', .22, 0, bare='#4f8f63', wear=.3, bare_metal=False, mottle=1., dirt=.25),
    ebony=worn('dc_ebony', '#121010', .3, 0, bare='#3a3430', wear=.4, bare_metal=False),
    walnut=worn('dc_walnut', '#4b2a16', .45, 0, bare='#7c4b2a', wear=.35, bare_metal=False, mottle=.7, dirt=.3),
    leather=worn('dc_leather', '#3a2214', .6, 0, bare='#6a4428', wear=.4, bare_metal=False, mottle=.4, dirt=.3),
    paper=worn('dc_paper', '#d8cfb2', .8, 0, bare='#efe8d2', wear=.2, bare_metal=False, mottle=.35, dirt=.45),
    note=worn('dc_banknote', '#7d9670', .75, 0, bare='#b8c9a6', wear=.3, bare_metal=False, mottle=.6, dirt=.35),
    red=worn('dc_red', '#8e1b14', .32, 0, bare='#c9b9a0', wear=.35, chips=.25, under='#2a2a2a', dirt=.2),
    rblack=worn('dc_rblack', '#141414', .3, 0, bare='#5a5a5a', wear=.3, bare_metal=False, dirt=.2),
    felt=worn('dc_green', '#0f5e30', .35, 0, bare='#4c9a6a', wear=.3, bare_metal=False),
    shark=worn('dc_shark', '#6a747b', .75, 0, bare='#a3acb2', wear=.3, bare_metal=False, mottle=.8, grain=2.5, dirt=.3),
    tooth=worn('dc_tooth', '#e6dfc9', .3, 0, bare='#fffbe8', wear=.2, bare_metal=False, dirt=.35),
    yellow=worn('dc_yellow', '#c3901a', .5, 0, bare='#9a9da0', wear=.45, chips=.5, under='#333333', dirt=.35),
    copper=worn('dc_copper', '#a3602e', .3, 1, bare='#dc9a62', wear=.3, dirt=.2),
    rubber=worn('dc_rubber', '#161515', .9, 0, bare='#2c2a28', wear=.2, bare_metal=False, dirt=.3),
    # not baked: the gold glow accents (debt.js drives their strength while debt is owed), glass, lettering
    glow=mat('dc_glow', '#5a3c08', .3, .6, '#ffc23a', 2.0),
    laser=mat('dc_laser', '#3a2400', .3, 0, '#ffd04a', 6),
    bore=mat('dc_bore', '#050505', .6, 0),
    glass=mat('dc_glass', '#cfe6e0', .04, 0, alpha=.14),
    lens=mat('reflex_lens_dc', '#e6d6a9', .05, 0, alpha=.08),   # named so the scopes mod treats it as a reflex lens
    face=mat('dc_dialface', '#ece4cc', .6, 0),
    ink_k=mat('dc_ink_black', '#141414', .6, 0), ink_w=mat('dc_ink_white', '#e4ddc6', .6, 0),
    ink_g=mat('dc_ink_gold', '#d9ad48', .3, .8), ink_r=mat('dc_ink_red', '#a3170f', .5, 0),
)
BAKED = ('blk', 'steel', 'brass', 'gold', 'cell', 'ebony', 'walnut', 'leather', 'paper', 'note', 'red', 'rblack', 'felt',
         'shark', 'tooth', 'yellow', 'copper', 'rubber')
SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'

BZ = 2.285                 # bore axis (the Python's tag_flash height)
CX0, CX1, CZ, CR = -0.12, 2.72, 1.643, 1.03   # cylinder: x span, axis height (j_bolt), radius
CH = .642                  # chamber circle radius (the top chamber lines up with the bore)
JB = (1.447, 0, 1.643)     # j_bolt in j_gun space
MUZ = 12.3


def xprism(pts_yz, x0, x1):
    """Extrude a YZ cross-section along X (x0..x1)."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in pts_yz]
    b = [bm.verts.new((x1, y, z)) for y, z in pts_yz]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    for i in range(len(a)):
        j = (i + 1) % len(a); bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def tube(name, pts, r, m, part='j_gun', res=8):
    """A round rod through the points (a NURBS curve with a bevel, made a mesh)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS'); sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts): p.co = (*c, 1)
    sp.use_endpoint_u = True; sp.order_u = min(4, len(pts)); sp.resolution_u = res
    ob = bpy.data.objects.new(name, cu); COL.objects.link(ob); bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob); me.materials.append(m)
    o2 = bpy.data.objects.new(name, me); COL.objects.link(o2); me.shade_smooth()
    PARTS[part].append(o2); return o2


def loop(name, cx, cy, cz, rx, rz, r, m, part, plane='xz', n=12):
    """A closed oval rod (chain link, shackle eye)."""
    pts = []
    for k in range(n + 3):
        a = 2 * math.pi * k / n
        u, v = rx * math.cos(a), rz * math.sin(a)
        pts.append((cx + u, cy, cz + v) if plane == 'xz' else (cx, cy + u, cz + v))
    o = tube(name, pts, r, m, part, res=4)
    return o


def ring(name, r_out, r_in, x0, x1, m, part='j_gun', z=BZ, y=0., seg=40, bw=.02):
    """A band around the x axis (a tube from r_in to r_out)."""
    return solid(name, cylbm(r_out, x0, x1, z, y, seg), m, part=part, cuts=[cylbm(r_in, x0 - .1, x1 + .1, z, y, seg)], bw=bw, seg=1)


def ball(x, y, z, r, sx=1., sy=1., sz=1., seg=12):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r,
                              matrix=Matrix.Translation((x, y, z)) @ Matrix.Diagonal((sx, sy, sz, 1)))
    return bm


def cone(base, tip, r, seg=10):
    """A cone from base (radius r) to a point at tip."""
    b, t = Vector(base), Vector(tip); d = t - b
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=0, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bm.transform(Matrix.Translation((b + t) / 2) @ q.to_matrix().to_4x4()); return bm


def spin(ob, deg, z=CZ, y=0.):
    """Turn an object's mesh about the cylinder axis (x), +y toward +z."""
    ob.data.transform(Matrix.Translation((0, y, z)) @ Matrix.Rotation(math.radians(deg), 4, 'X') @ Matrix.Translation((0, -y, -z)))
    return ob


def rotxz(pts, cx, cz, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return [(cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c) for x, z in pts]


def chambers(x0, x1, n=6, r=.23, start=90):
    return [cylbm(r, x0, x1, CZ + CH * math.sin(math.radians(start + 360 * k / n)), CH * math.cos(math.radians(start + 360 * k / n)), 20)
            for k in range(n)]


def octagon_barrel(part, x0, x1, m='blk', bore_from=None):
    bm = cylbm(.45, x0, x1, BZ, seg=8)
    bm.transform(Matrix.Translation((0, 0, BZ)) @ Matrix.Rotation(math.radians(22.5), 4, 'X') @ Matrix.Translation((0, 0, -BZ)))
    solid('barrel', bm, M[m], part=part, cuts=[cylbm(.2, (bore_from or x1 - .5), x1 + .3, BZ)], bw=.025, seg=1)


def rib_and_lug(part, x_end, lug_end=MUZ - .05, vents=True):
    cuts = [boxbm(x, x + .42, -1, 1, 2.71, 2.8) for x in [3.95 + .8 * k for k in range(int((x_end - 4.6) / .8))]] if vents else []
    solid('rib', boxbm(3.4, x_end, -.16, .16, 2.6, 2.86), M['blk'], part=part, cuts=cuts, bw=.02, seg=1)
    solid('lug', prism(fillet([(5.4, 2.25), (lug_end, 2.25), (lug_end, 1.3), (5.95, 1.3), (5.4, 1.78)], .14), -.34, .34),
          M['blk'], part=part, bw=.05)


def gold_tooth(part, x):
    """The gold-tooth front sight: a molar on a ramp, roots splayed onto the rib, top at z 3.35."""
    solid('ramp', prism([(x - .45, 2.84), (x + .2, 2.84), (x + .2, 2.95), (x - .1, 2.95)], -.1, .1), M['blk'], part=part, bw=.01)
    t = [(x - .17, 2.92), (x - .12, 3.05), (x - .16, 3.2), (x - .12, 3.33), (x - .03, 3.3), (x, 3.35), (x + .06, 3.31),
         (x + .14, 3.34), (x + .17, 3.2), (x + .12, 3.05), (x + .18, 2.92), (x + .06, 2.92), (x, 3.02), (x - .06, 2.92)]
    solid('tooth', prism(t, -.11, .11), M['gold'], part=part, bw=.025, seg=2, ang=20)
    solid('pip', ball(x, .1, 3.2, .03), M['glow'], part=part, bw=0)
    solid('pip', ball(x, -.1, 3.2, .03), M['glow'], part=part, bw=0)


def cartridge(part, x0, y, z, bullet=True):
    solid('case', cylbm(.2, x0 + .08, x0 + 1.25, z, y, 16), M['brass'], part=part, bw=.01, seg=1)
    solid('rim', cylbm(.24, x0, x0 + .08, z, y, 16), M['brass'], part=part, bw=.01, seg=1)
    solid('head', cylbm(.1, x0 - .005, x0 + .02, z, y, 12), M['gold'], part=part, bw=0)
    if bullet:
        solid('slug', cylbm(.19, x0 + 1.25, x0 + 1.7, z, y, 16, r2=.08), M['copper'], part=part, bw=.01, seg=1)


# ---------------------------------------------------------------- frame (j_gun)
FRAME = [(3.4, 3.0), (3.4, 1.32), (2.72, 1.32), (2.72, 0.15), (-0.55, 0.15), (-1.15, -0.25), (-1.6, -0.6), (-2.95, -3.7),
         (-3.1, -3.95), (-4.85, -3.95), (-5.0, -3.75), (-4.4, -2.3), (-3.4, -0.5), (-2.5, 0.8), (-2.05, 1.42), (-1.55, 1.45),
         (-0.8, 1.45), (-0.8, 3.0)]
solid('frame', prism(fillet(FRAME, .12), -.42, .42), M['blk'], cuts=[
    boxbm(-0.15, 2.78, -1, 1, 0.55, 2.72),                  # the cylinder window
    boxbm(-1.55, -0.8, -.31, .31, 1.2, 1.6),                # hammer slot
    prism([(0.3, 0.3), (0.7, 0.3), (0.7, -0.2), (0.3, -0.2)], -.12, .12)], bw=.05)
solid('shank', cylbm(.5, 2.72, 3.45, BZ, seg=24), M['blk'], bw=.02, seg=1)
for s in (1, -1):   # rear sight: two posts with a notch between them
    solid('rsight', boxbm(-0.62, -0.32, s * .1, s * .22, 2.96, 3.24), M['blk'], bw=.015, seg=1)
solid('rsight_base', boxbm(-0.7, -0.24, -.22, .22, 2.95, 3.04), M['blk'], bw=.015, seg=1)
for s in (1, -1):   # frame screws
    for x, z in ((-1.2, 0.7), (1.0, 0.35), (-0.5, 0.35)):
        solid('screw', screw(x, s * .43, z, .07, .03), M['brass'], bw=0)

# the knuckle-duster trigger guard (worn brass with knuckle bumps and studs)
GO = [(1.65, 0.2), (1.98, -0.35), (1.88, -1.2), (1.38, -1.84), (0.4, -1.98), (-0.5, -1.82), (-1.15, -1.25), (-1.45, -0.65), (-1.2, -0.25), (-0.6, 0.18)]
GI = [(1.25, 0.25), (1.45, -0.4), (1.35, -1.1), (0.95, -1.45), (0.35, -1.56), (-0.35, -1.43), (-0.85, -1.0), (-0.95, -0.55), (-0.6, 0.25)]
solid('guard', prism(fillet(GO, .25), -.3, .3), M['brass'], cuts=[prism(fillet(GI, .2), -1, 1)], bw=.07, seg=2)
GC = Vector((0.25, -0.85))
for x, z in ((2.0, -0.55), (1.86, -1.12), (1.5, -1.62), (0.95, -1.9)):
    d = (Vector((x, z)) - GC).normalized()
    solid('knuckle', ball(x - d.x * .05, 0, z - d.y * .05, .2, sy=1.45), M['brass'], bw=0)
    solid('stud', cone((x + d.x * .1, 0, z + d.y * .1), (x + d.x * .36, 0, z + d.y * .36), .08, 8), M['steel'], bw=0)
solid('trigger', prism(fillet([(0.56, 0.3), (0.62, -0.2), (0.5, -0.7), (0.3, -1.0), (0.2, -0.95), (0.36, -0.65), (0.42, -0.2), (0.4, 0.3)], .06), -.09, .09),
      M['steel'], bw=.02, seg=1)

# the abacus tally along the top strap: two brass rods, five beads each (three counted to the rear)
for s in (1, -1):
    solid('rod', cylbm(.035, -0.4, 3.25, 3.04, s * .6, 10), M['brass'], bw=0)
    for x0, x1 in ((-0.48, -0.32), (3.18, 3.34)):
        solid('rodpost', boxbm(x0, x1, s * .36, s * .68, 2.86, 3.12), M['brass'], bw=.015, seg=1)
    for x, k in ((-0.15, 'gold'), (0.12, 'gold'), (0.39, 'gold'), (2.55, 'ebony'), (2.82, 'ebony')):
        solid('bead', ball(x, s * .6, 3.04, .15, sx=.6, seg=14), M[k], bw=0)

# the coin slot on the recoil shield: a brass plate, a glowing slot, a gold coin half posted
solid('slotplate', boxbm(-0.76, -0.18, .38, .47, 0.62, 2.58), M['brass'], cuts=[boxbm(-0.53, -0.41, .3, .6, 1.1, 2.15)], bw=.03, seg=1)
solid('slotglow', boxbm(-0.54, -0.4, .36, .41, 1.08, 2.17), M['glow'], bw=0)
solid('coin', cylbm(.3, -0.5, -0.44, 1.75, .5, 28), M['gold'], bw=.008, seg=1)
for z in (0.8, 2.4):
    solid('slotscrew', screw(-0.47, .48, z, .06, .03), M['steel'], bw=0)
text('PAY', .13, (-0.47, .475, 0.92), m=M['ink_k'], font=SANS)

# ---------------------------------------------------------------- the padlock hammer (j_press_rear)
P = 'j_press_rear'
solid('lock', prism(rrect_xz(-1.55, -0.84, 1.42, 2.32, .14), -.3, .3), M['brass'], part=P, bw=.05)
solid('lockband', prism(rrect_xz(-1.57, -0.82, 2.18, 2.27, .03), -.31, .31), M['steel'], part=P, bw=.01)
solid('keyhole', prism([(-1.2 + .07 * math.cos(a * math.pi / 6), 1.95 + .07 * math.sin(a * math.pi / 6)) for a in range(12)], .29, .33), M['ink_k'], part=P, bw=0)
solid('keyslot', prism([(-1.23, 1.93), (-1.17, 1.93), (-1.15, 1.68), (-1.25, 1.68)], .29, .33), M['ink_k'], part=P, bw=0)
tube('shackle', [(-1.42, 0, 2.25), (-1.42, 0, 2.7), (-1.4, 0, 2.95), (-1.2, 0, 3.08), (-1.0, 0, 2.95), (-0.98, 0, 2.7), (-0.98, 0, 2.25)],
     .075, M['steel'], part=P)
solid('hammerfoot', boxbm(-1.35, -0.95, -.2, .2, 1.15, 1.45), M['steel'], part=P, bw=.02)

# ---------------------------------------------------------------- crane and ejector rod
solid('crane', prism(fillet([(2.74, 0.15), (3.38, 0.15), (3.38, 1.0), (3.1, 1.3), (2.74, 1.3)], .1), -.2, .42), M['blk'], part='tag_clip', bw=.03)
solid('ejrod', cylbm(.11, 2.72, 5.3, CZ, seg=16), M['steel'], part='j_bolt', bw=.01, seg=1)
solid('ejhead', cylbm(.16, 5.05, 5.36, CZ, seg=16), M['steel'], part='j_bolt',
      cuts=[boxbm(5.1 + .06 * k, 5.13 + .06 * k, -1, 1, CZ + .12, 2) for k in range(4)], bw=.01, seg=1)

# ---------------------------------------------------------------- the ledger cylinder (tag_dc_ledger)
P = 'tag_dc_ledger'
cuts = chambers(2.45, 2.95) + [cylbm(.14, 2.5, 2.95, CZ)]
for k in range(6):   # flutes between the chambers
    a = math.radians(360 * k / 6)
    cuts.append(cylbm(.3, 0.45, 2.15, CZ + 1.17 * math.sin(a), 1.17 * math.cos(a), 20))
solid('cyl', cylbm(CR, CX0, CX1, CZ, seg=48), M['blk'], part=P, cuts=cuts, bw=.04, seg=2)
for x0 in (0.06, 2.42):   # ledger rules: gold bands near both ends
    ring('rule', CR + .012, CR - .05, x0, x0 + .07, M['glow'], part=P, z=CZ, seg=48, bw=0)
for x0, x1 in ((CX0 - .02, 0.0), (2.62, CX1 + .02)):
    ring('band', CR + .02, CR - .1, x0, x1, M['brass'], part=P, z=CZ, seg=48, bw=.01)
for k, n in enumerate(('I', 'II', 'III', 'IV', 'V', 'VI')):   # the chambers' numerals, one on each land
    t = text(n, .3, (1.3, CR - .005, CZ), part=P, m=M['glow'], extrude=.012, font=SERIF)
    spin(t, 30 + 60 * k)
    for x in (0.95, 1.65):   # the ledger's columns: red ink rules either side of the numeral
        r = solid('col', boxbm(x - .015, x + .015, CR - .02, CR + .006, CZ - .14, CZ + .14), M['ink_r'], part=P, bw=0)
        spin(r, 30 + 60 * k)

# ---------------------------------------------------------------- barrel, front sight
P = 'tag_barrel_long'
octagon_barrel(P, 3.3, MUZ)
rib_and_lug(P, 12.15)
ring('crown', .47, .21, MUZ - .1, MUZ + .02, M['brass'], part=P, seg=32)
solid('bore', cylbm(.2, MUZ - .45, MUZ - .3, BZ), M['bore'], part=P, bw=0)
solid('inlay', boxbm(5.7, 12.0, .335, .352, 2.1, 2.15), M['glow'], part=P, bw=0)
text('DEBT COLLECTOR', .3, (7.25, .345, 1.82), part=P, m=M['ink_g'], extrude=.012, font=SERIF)
text('COLLECTIONS DEPT.   No 6', .12, (7.25, .345, 1.5), part=P, m=M['ink_g'], extrude=.01, font=SANS)
gold_tooth('tag_iron_sight', 11.82)

# ---------------------------------------------------------------- green celluloid grips with a brass shield
GRIP = [(-1.1, 0.05), (-1.62, -0.55), (-2.92, -3.6), (-3.08, -3.82), (-4.78, -3.82), (-4.86, -3.7), (-4.3, -2.3), (-3.3, -0.5),
        (-2.5, 0.75), (-2.2, 0.95), (-1.45, 0.6)]
GTILT = -math.degrees(math.atan2(1.35, 3.1))   # the grip's lean (front strap angle)


def grip_panels(part, m):
    for s in (1, -1):
        solid('grip', prism(fillet(GRIP, .2), s * .34, s * .74), M[m], part=part, bw=.14, seg=3, ang=25)


grip_panels('tag_dc_grips', 'cell')
SH = rotxz([(-3.4, -1.25), (-2.7, -1.25), (-2.7, -1.75), (-3.05, -2.15), (-3.4, -1.75)], -3.05, -1.7, GTILT)
for s in (1, -1):
    solid('shield', prism(fillet(SH, .06), s * .7, s * .8), M['brass'], part='tag_dc_grips', bw=.03, seg=1)
t = text('%', .38, (-3.05, .805, -1.62), part='tag_dc_grips', m=M['ink_k'], extrude=.01, font=SERIF)

# ---------------------------------------------------------------- the ticker-tape receipt spool (left of the frame)
P = 'tag_dc_spool'
SP = (2.3, -0.05)   # spool axis (x, z), the axis runs along y
solid('bracket', prism(fillet([(1.9, 0.35), (2.7, 0.35), (2.7, -0.15), (2.45, -0.35), (2.15, -0.35), (1.9, -0.15)], .08), .4, .5), M['brass'], part=P, bw=.02)
solid('axle', cylbm(.07, SP[0], SP[0] + .5, SP[1], .7, 12, axis='y'), M['steel'], part=P, bw=0)
for y in (.5, .88):
    solid('flange', cylbm(.42, SP[0], SP[0] + .04, SP[1], y, 32, axis='y'), M['brass'], part=P, bw=.008, seg=1)
solid('roll', cylbm(.33, SP[0], SP[0] + .34, SP[1], .69, 32, axis='y'), M['paper'], part=P, bw=.01, seg=1)
TAPE = [(2.3, -0.38), (2.0, -0.45), (1.62, -0.66), (1.32, -0.98), (1.18, -1.36), (1.24, -1.72), (1.42, -1.95)]


def ribbon(name, pts, y0, y1, th, m, part):
    up, dn = [], []
    for i, (x, z) in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        d = Vector((b[0] - a[0], b[1] - a[1])).normalized(); n = Vector((-d.y, d.x)) * th / 2
        up.append((x + n.x, z + n.y)); dn.append((x - n.x, z - n.y))
    return solid(name, prism(up + dn[::-1], y0, y1), m, part=part, bw=0)


ribbon('tape', TAPE, .55, .84, .02, M['paper'], P)
for i in range(1, len(TAPE) - 1):   # the printed figures on the tape
    x, z = TAPE[i]
    solid('print', boxbm(x - .05, x + .05, .841, .846, z - .015, z + .015), M['ink_k'], part=P, bw=0)
solid('tear', prism([(2.5, -0.45), (2.6, -0.5), (2.62, -0.42)], .52, .86), M['steel'], part=P, bw=0)

# ---------------------------------------------------------------- reload pieces: speedloader, rounds, spent cases
SL = (JB[0] - 1.445, -6.25, JB[2] + .03)
solid('sl_body', cylbm(.98, SL[0] - .05, SL[0] + .85, SL[2], SL[1], 32), M['brass'], part='tag_speedloader', bw=.03, seg=1)
solid('sl_wrap', cylbm(1.0, SL[0] + .15, SL[0] + .7, SL[2], SL[1], 32), M['red'], part='tag_speedloader', bw=.005, seg=1)
solid('sl_knob', cylbm(.34, SL[0] - .75, SL[0] - .05, SL[2], SL[1], 16), M['steel'], part='tag_speedloader',
      cuts=[boxbm(SL[0] - .7 + .1 * k, SL[0] - .66 + .1 * k, SL[1] - 1, SL[1] + 1, SL[2] + .28, SL[2] + 1) for k in range(6)], bw=.02, seg=1)
BL = (JB[0] + .408, -6.25, JB[2] - .008)
for k in range(6):
    a = math.radians(90 + 60 * k)
    cartridge('tag_bullets', BL[0] - 1.0, BL[1] + CH * math.cos(a), BL[2] + CH * math.sin(a))
SPOFF = ((-0.097, -12.5, -0.797), (-0.089, -11.823, -0.403), (-0.073, -11.818, 0.385), (-0.065, -12.495, 0.767), (-0.073, -13.178, 0.379), (-0.089, -13.172, -0.398))
for i, o in enumerate(SPOFF):
    cartridge(f'tag_spent{i}', JB[0] + o[0] - 1.0, o[1], JB[2] + o[2], bullet=False)

# ================================================================ attachments
# --- Jeweller's Loupe (optic): a brass loupe on a hinged arm over the top strap
P = 'tag_dc_loupe'
LZ = 4.1
solid('clamp', boxbm(0.85, 1.95, -.34, .34, 2.98, 3.16), M['blk'], part=P, bw=.03)
bm = cylbm(.11, 1.4, 1.4 + .62, 3.22, 0, 16, axis='y')
solid('hinge', bm, M['brass'], part=P, bw=.01, seg=1)
for s in (1, -1):
    solid('arm', prism([(1.22, 3.15), (1.58, 3.15), (1.62, LZ - .3), (1.18, LZ - .3)], s * .16, s * .24), M['brass'], part=P, bw=.02, seg=1)
ring('loupe', .52, .42, 0.95, 1.85, M['brass'], part=P, z=LZ, seg=40)
ring('knurl', .56, .42, 1.72, 1.86, M['steel'], part=P, z=LZ, seg=24)
ring('eyecup', .55, .44, 0.72, 0.96, M['rubber'], part=P, z=LZ, seg=32)
solid('lens', cylbm(.43, 1.5, 1.53, LZ, seg=32), M['lens'], part=P, bw=0)
text('x10', .13, (1.3, .52, LZ - .05), part=P, m=M['ink_k'], extrude=.008, font=SANS, tilt=20)

# --- Foreclosure Brake (muzzle): a vault-door brake with locking-bolt studs, side ports and a red FORECLOSED tag
P = 'tag_dc_brake'
B0, B1 = MUZ, MUZ + 1.4
cuts = [cylbm(.22, B0 - .1, B1 + .2, BZ)]
for x in (B0 + .3, B0 + .68):
    cuts.append(boxbm(x, x + .25, -1, 1, BZ - .2, BZ + .2))
solid('brake', cylbm(.62, B0, B1, BZ, seg=40), M['blk'], part=P, cuts=cuts, bw=.03, seg=2)
ring('door', .64, .36, B1 - .02, B1 + .1, M['brass'], part=P, seg=40)
ring('wheel', .44, .36, B1 + .1, B1 + .17, M['brass'], part=P, seg=32)
ring('hub', .3, .23, B1 + .1, B1 + .2, M['brass'], part=P, seg=24)
for k in range(4):   # the wheel's spokes
    a = math.radians(45 + 90 * k)
    sp = boxbm(B1 + .11, B1 + .16, -.04, .04, .27, .4); sp.transform(Matrix.Translation((0, 0, BZ)) @ Matrix.Rotation(a, 4, 'X'))
    solid('spoke', sp, M['brass'], part=P, bw=0)
for k in range(8):   # locking bolts out of the rim
    a = math.radians(22.5 + 45 * k)
    bb = bmesh.new(); bmesh.ops.create_cone(bb, cap_ends=True, segments=12, radius1=.075, radius2=.075, depth=.24)
    bb.transform(Matrix.Translation((B1 - .3, 0, BZ)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, 0, .7)) @ Matrix.Rotation(math.radians(0), 4, 'X'))
    solid('bolt', bb, M['steel'], part=P, bw=.01, seg=1)
ring('bezel', .66, .5, B0, B0 + .12, M['brass'], part=P, seg=40)
tube('tagwire', [(B0 + .95, .63, BZ - .5), (B0 + .95, .68, BZ - .62), (B0 + .95, .69, BZ - .75)], .02, M['steel'], part=P)
solid('ftag', prism(fillet([(B0 + .45, BZ - .72), (B0 + 1.45, BZ - .72), (B0 + 1.45, BZ - 1.12), (B0 + .45, BZ - 1.12)], .05), .66, .69), M['red'], part=P, bw=.008, seg=1)
text('FORECLOSED', .13, (B0 + .95, .695, BZ - .92), part=P, m=M['ink_w'], extrude=.006, font=SANS)

# --- Compound Cylinder (mag): five chambers in a clockwork cylinder, gear rims, an interest dial on each flat
P = 'tag_dc_compound'
PENT = [(1.07 * math.cos(math.radians(126 + 72 * k)), CZ + 1.07 * math.sin(math.radians(126 + 72 * k))) for k in range(5)]
solid('ccyl', xprism(PENT, 0.2, 2.45), M['blk'], part=P, cuts=chambers(2.2, 2.6, n=5, r=.26) + [cylbm(.14, 2.3, 2.6, CZ)], bw=.06, seg=2)


def gear(n, r0, r1):
    pts = []
    for k in range(n):
        for f, r in ((0, r0), (.18, r1), (.5, r1), (.68, r0)):
            a = 2 * math.pi * (k + f) / n; pts.append((r * math.cos(a), CZ + r * math.sin(a)))
    return pts


for x0, x1 in ((CX0, 0.2), (2.45, CX1)):
    solid('gearrim', xprism(gear(22, .96, 1.07), x0, x1), M['brass'], part=P, cuts=chambers(x0 - .1, x1 + .1, n=5, r=.26) if x0 > 1 else [], bw=.012, seg=1)
APO = 1.07 * math.cos(math.radians(36))
for k in range(5):
    ang = 18 + 72 * k
    obs = [solid('bezel', cylbm(.3, 1.45, 1.45 + .13, CZ, APO + .015, 28, axis='y'), M['brass'], part=P, bw=.01, seg=1),
           solid('dial', cylbm(.25, 1.45, 1.45 + .02, CZ, APO + .085, 28, axis='y'), M['face'], part=P, bw=0),
           solid('needle', boxbm(1.43, 1.47, APO + .1, APO + .11, CZ - .03, CZ + .2), M['ink_r'], part=P, bw=0),
           solid('glass', cylbm(.26, 1.45, 1.45 + .03, CZ, APO + .12, 28, axis='y'), M['glass'], part=P, bw=0),
           solid('cog', prism([(0.62 + x, CZ + z) for x, z in [(p[0], p[1] - CZ) for p in gear(10, .15, .22)]], APO - .02, APO + .05), M['brass'], part=P, bw=0)]
    for i in range(6):   # the dial's scale ticks
        a = math.radians(-60 + 24 * i)
        obs.append(solid('tick', boxbm(1.44, 1.46, APO + .1, APO + .108, CZ + .17, CZ + .23), M['ink_k'], part=P, bw=0))
        obs[-1].data.transform(Matrix.Translation((1.45, 0, CZ)) @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Translation((-1.45, 0, -CZ)))
    obs[2].data.transform(Matrix.Translation((1.45, 0, CZ)) @ Matrix.Rotation(math.radians(-40 + 25 * k), 4, 'Y') @ Matrix.Translation((-1.45, 0, -CZ)))
    for o in obs: spin(o, ang)
    t = text('%', .2, (2.05, APO + .005, CZ), part=P, m=M['glow'], extrude=.01, font=SERIF); spin(t, ang)

# --- Double or Nothing (mag): a roulette cylinder, red and black with a green zero, a gold ball on its track
P = 'tag_dc_roulette'
NUMS = ('0', '32', '15', '19', '4', '21', '2', '25', '17', '34', '6', '27')
for k in range(12):
    a0, a1 = 30 * k, 30 * (k + 1)
    pts = [(0, CZ)] + [(CR * math.cos(math.radians(a)), CZ + CR * math.sin(math.radians(a))) for a in [a0 + (a1 - a0) * i / 5 for i in range(6)]]
    m = 'felt' if k == 3 else ('red' if k % 2 else 'rblack')
    solid('sector', xprism(pts, CX0 + .1, CX1 - .1), M[m], part=P, cuts=chambers(2.4, 2.9), bw=.0)
    t = text(NUMS[(k - 3) % 12], .2, (1.95, CR - .003, CZ), part=P, m=M['ink_w'], extrude=.01, font=SANS)
    spin(t, 30 * k + 15)
for x0, x1 in ((CX0, CX0 + .1), (CX1 - .1, CX1)):
    solid('rim', cylbm(CR + .01, x0, x1, CZ, seg=48), M['gold'], part=P, cuts=chambers(x0 - .1, x1 + .1) if x0 > 1 else [], bw=.01, seg=1)
ring('track', CR + .03, CR - .05, 1.2, 1.42, M['gold'], part=P, z=CZ, seg=48, bw=.01)
solid('ball', ball(1.31, (CR + .1) * math.cos(math.radians(40)), CZ + (CR + .1) * math.sin(math.radians(40)), .085), M['tooth'], part=P, bw=0)
for k in range(6):   # the gold diamond deflectors
    a = math.radians(15 + 60 * k)
    d = ball(0.62, 0, 0, .1, sx=1.6, sy=.5, sz=1.0, seg=4); d.transform(Matrix.Translation((0, 0, CZ)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, CR + .02, 0)))
    solid('diamond', d, M['gold'], part=P, bw=0)

# --- Repo Hook (under): a clamp on the lug, a chain and a tow hook under the muzzle
P = 'tag_dc_hook'
for s in (1, -1):
    solid('clamp', boxbm(11.32, 11.78, s * .33, s * .43, 1.2, 2.3), M['blk'], part=P, bw=.02, seg=1)
solid('clampb', boxbm(11.32, 11.78, -.43, .43, 1.12, 1.32), M['blk'], part=P, bw=.03, seg=1)
for s in (1, -1):
    solid('bolt', screw(11.55, s * .44, 2.0, .07, .04), M['steel'], part=P, bw=0)
loop('eye', 11.55, 0, 1.0, .12, .12, .04, M['steel'], P, plane='yz')
for i, (x, z, pl) in enumerate(((11.66, 0.78, 'xz'), (11.86, 0.62, 'yz'), (12.08, 0.46, 'xz'))):
    loop('link', x, 0, z, .14 if pl == 'xz' else .09, .09 if pl == 'xz' else .14, .035, M['steel'], P, plane=pl)
tube('hook', [(12.25, 0, 0.42), (12.3, 0, 0.1), (12.3, 0, -0.25), (12.15, 0, -0.5), (11.85, 0, -0.52), (11.68, 0, -0.32), (11.72, 0, -0.12)],
     .1, M['yellow'], part=P)
solid('hookeye', ball(12.25, 0, 0.42, .12, sy=.6), M['yellow'], part=P, bw=0)
solid('hooktip', cone((11.72, 0, -0.14), (11.78, 0, 0.08), .1, 10), M['yellow'], part=P, bw=0)

# --- Payday Loan (ammo): a brass money clip of banknotes and three rounds on the lug's left side
P = 'tag_dc_payday'
for i in range(4):
    solid('notes', boxbm(8.85 + .02 * i, 10.35 - .02 * i, .35 + .04 * i, .39 + .04 * i, 1.36 + .015 * i, 2.16 - .015 * i), M['note'], part=P, bw=.005, seg=1)
solid('mclip', prism(fillet([(9.4, 1.26), (9.95, 1.26), (9.95, 2.26), (9.4, 2.26)], .05), .34, .55), M['brass'], part=P,
      cuts=[boxbm(9.3, 10.1, .3, .52, 1.3, 2.22)], bw=.012, seg=1)
solid('mclipface', boxbm(9.42, 9.93, .53, .56, 1.3, 2.22), M['brass'], part=P, bw=.008, seg=1)
text('$', .42, (9.675, .565, 1.76), part=P, m=M['glow'], extrude=.012, font=SERIF)
text('100', .14, (8.95 + .4, .514, 1.98), part=P, m=M['ink_k'], extrude=.004, font=SERIF)
solid('loopstrap', boxbm(10.35, 11.22, .34, .5, 1.52, 1.82), M['leather'], part=P, bw=.02, seg=1)
for i, x in enumerate((10.52, 10.79, 11.06)):   # three spare rounds standing in the strap, bullets down
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=.12, radius2=.12, depth=.7); bm.transform(Matrix.Translation((x, .58, 1.8)))
    solid('pcase', bm, M['brass'], part=P, bw=.006, seg=1)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=.05, radius2=.115, depth=.26); bm.transform(Matrix.Translation((x, .58, 1.32)))
    solid('pslug', bm, M['copper'], part=P, bw=0)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=.145, radius2=.145, depth=.05); bm.transform(Matrix.Translation((x, .58, 2.17)))
    solid('prim', bm, M['brass'], part=P, bw=0)

# --- The Bailiff (stock): a folding wire stock from the butt and a long octagonal barrel with a walnut handguard
P = 'tag_dc_bailiff'
BX = 19.5
octagon_barrel(P, 3.3, BX)
rib_and_lug(P, BX - .2)
ring('crown', .47, .21, BX - .1, BX + .02, M['brass'], part=P, seg=32)
solid('bore', cylbm(.2, BX - .45, BX - .3, BZ), M['bore'], part=P, bw=0)
ring('handguard', .64, .4, 12.55, 17.3, M['walnut'], part=P, seg=32, bw=.06)
for x0 in (12.4, 17.25):
    ring('ferrule', .67, .4, x0, x0 + .2, M['brass'], part=P, seg=32)
solid('inlay', boxbm(5.7, 12.0, .335, .352, 2.1, 2.15), M['glow'], part=P, bw=0)
text('THE BAILIFF', .28, (7.25, .345, 1.82), part=P, m=M['ink_g'], extrude=.012, font=SERIF)
text('COURT ORDERED', .12, (7.25, .345, 1.5), part=P, m=M['ink_g'], extrude=.01, font=SANS)
gold_tooth(P, BX - .48)
solid('hinge', boxbm(-5.05, -4.55, -.3, .3, -3.98, -3.5), M['steel'], part=P, bw=.03)
for s in (1, -1):
    tube('lrail', [(-4.8, s * .34, -3.75), (-6.5, s * .36, -3.62), (-9, s * .4, -3.42), (-11.45, s * .42, -3.25)], .09, M['steel'], part=P)
    tube('urail', [(-4.5, s * .3, -2.75), (-6.5, s * .34, -2.15), (-9, s * .4, -1.5), (-11.45, s * .42, -1.1)], .09, M['steel'], part=P)
    tube('brace', [(-8.4, s * .39, -3.47), (-8.6, s * .39, -2.6), (-8.8, s * .39, -1.6)], .06, M['steel'], part=P)
solid('buttplate', prism(rrect_xz(-11.75, -11.35, -3.6, -0.85, .15), -.6, .6), M['blk'], part=P, bw=.05)
solid('buttpad', prism(rrect_xz(-12.0, -11.73, -3.65, -0.8, .13), -.62, .62), M['rubber'], part=P, bw=.06, seg=2)
solid('bplate', boxbm(-11.7, -11.4, .6, .64, -2.7, -1.7), M['brass'], part=P, bw=.01, seg=1)

# --- Debt Spiral (barrel): a black round barrel wound with a gold helical ribbon
P = 'tag_dc_spiral'
solid('sbarrel', cylbm(.44, 3.3, MUZ, BZ, seg=32), M['blk'], part=P, cuts=[cylbm(.2, MUZ - .5, MUZ + .3, BZ)], bw=.02, seg=1)
solid('srib', boxbm(3.4, 12.15, -.12, .12, 2.6, 2.86), M['blk'], part=P, bw=.015, seg=1)
solid('slug', prism(fillet([(5.4, 2.0), (MUZ - .05, 2.0), (MUZ - .05, 1.38), (6.0, 1.38), (5.4, 1.7)], .12), -.22, .22), M['blk'], part=P, bw=.04)
hel = [(3.6 + 8.4 * i / 160, .5 * math.cos(2 * math.pi * 7.5 * i / 160), BZ + .5 * math.sin(2 * math.pi * 7.5 * i / 160)) for i in range(161)]
tube('helix', hel, .06, M['gold'], part=P, res=2)
ring('scrown', .5, .21, MUZ - .12, MUZ + .02, M['gold'], part=P, seg=32)
solid('sbore', cylbm(.2, MUZ - .45, MUZ - .3, BZ), M['bore'], part=P, bw=0)
for x in (3.5, 12.0):
    ring('scollar', .56, .4, x - .1, x + .1, M['brass'], part=P, seg=32)

# --- Ledger Spool (laser): a glass-domed stock-ticker printer in place of the spool, with a gold appraisal laser
P = 'tag_dc_ticker'
solid('tbase', prism(fillet([(1.75, 0.35), (2.95, 0.35), (2.95, -0.75), (1.75, -0.75)], .1), .4, .58), M['brass'], part=P, bw=.03)
solid('tring', cylbm(.5, 2.35, 2.35 + .08, -0.2, .56, 40, axis='y'), M['brass'], part=P, bw=.01, seg=1)
dome = ball(2.35, .62, -0.2, .46, sy=.9, seg=24)
bmesh.ops.delete(dome, geom=[v for v in dome.verts if v.co.y < .6], context='VERTS')
solid('dome', dome, M['glass'], part=P, bw=0)
solid('pwheel', cylbm(.2, 2.35, 2.35 + .3, -0.2, .6, 24, axis='y'), M['brass'], part=P, bw=.01, seg=1)
solid('pspoke', boxbm(2.33, 2.37, .9, .92, -0.38, -0.02), M['ink_k'], part=P, bw=0)
ribbon('ttape', [(2.35, -0.4), (2.2, -0.75), (2.0, -1.1), (1.95, -1.5), (2.1, -1.85)], .62, .82, .02, M['paper'], P)
solid('emit', cylbm(.13, 2.95, 3.35, -0.55, .52, 20), M['brass'], part=P, bw=.01, seg=1)
solid('emitlens', cylbm(.09, 3.35, 3.37, -0.55, .52, 20), M['laser'], part=P, bw=0)
text('TICKER', .1, (2.35, .585, 0.2), part=P, m=M['ink_k'], extrude=.004, font=SANS)

# --- Shark Grip (grip): sharkskin panels, a tooth row along the butt, a fin off the backstrap
P = 'tag_dc_shark'
grip_panels(P, 'shark')
for i in range(7):
    x = -4.6 + .22 * i
    solid('tooth', cone((x, 0, -3.88), (x + .03, 0, -4.2), .1, 6), M['tooth'], part=P, bw=0)
    solid('toothb', ball(x, 0, -3.86, .1, sy=2.0, seg=8), M['tooth'], part=P, bw=0) if i % 3 == 0 else None
solid('fin', prism(fillet([(-4.3, -2.25), (-4.95, -3.55), (-6.0, -3.85), (-5.2, -2.9), (-4.75, -2.1)], .1), -.07, .07), M['shark'], part=P, bw=.04, seg=2)
for s in (1, -1):   # gill slits
    for i in range(3):
        solid('gill', prism(rotxz([(-3.05 + .22 * i, -2.35), (-2.98 + .22 * i, -2.35), (-2.98 + .22 * i, -1.25), (-3.05 + .22 * i, -1.25)], -3.0, -1.8, GTILT), s * .72, s * .76), M['rblack'], part=P, bw=0)

export(OUT, RENDER, 'dc', BAKED, tex=4096, frame=(4.0, 0, -0.3), ortho=26, spread=40)

if RENDER:   # close-ups: the bare gun, the player's view, then the attachments
    sc = bpy.context.scene; co = sc.camera
    BARE = ('part_tag_clip', 'part_tag_iron_sight', 'part_tag_barrel_long', 'part_tag_dc_ledger', 'part_tag_dc_grips', 'part_tag_dc_spool')
    def show(keep):
        for o in bpy.data.objects:
            if o.name.startswith('part_tag_'): o.hide_render = o.name not in keep
    def shot(name, x, z, scale, side=1):
        co.location = (x, 60 * side, z); co.rotation_euler = (math.radians(90), 0, math.radians(180 if side > 0 else 0)); co.data.ortho_scale = scale
        sc.render.filepath = f'{RENDER}/dc_{name}.png'; bpy.ops.render.render(write_still=True)
    show(BARE)
    shot('bare_left', 4.0, -0.3, 19)
    shot('close_cyl', 1.0, 1.4, 7)
    co.location = (-14, 9, 8)   # roughly the player's view: from behind, left and above
    co.rotation_euler = (Vector((3, 0, 1.5)) - co.location).to_track_quat('-Z', 'Z').to_euler(); co.data.ortho_scale = 16
    sc.render.filepath = f'{RENDER}/dc_close_hip.png'; bpy.ops.render.render(write_still=True)
    show(('part_tag_clip', 'part_tag_iron_sight', 'part_tag_barrel_long', 'part_tag_dc_compound', 'part_tag_dc_grips', 'part_tag_dc_ticker',
          'part_tag_dc_loupe', 'part_tag_dc_brake', 'part_tag_dc_hook'))
    shot('kit_a', 5.0, 0.0, 21)
    show(('part_tag_clip', 'part_tag_dc_roulette', 'part_tag_dc_shark', 'part_tag_dc_spool', 'part_tag_dc_spiral', 'part_tag_dc_payday', 'part_tag_iron_sight'))
    shot('kit_b', 4.0, -0.3, 19)
    show(('part_tag_clip', 'part_tag_dc_ledger', 'part_tag_dc_grips', 'part_tag_dc_spool', 'part_tag_dc_bailiff', 'part_tag_dc_brake', 'part_tag_dc_hook', 'part_tag_dc_payday'))
    shot('kit_bailiff', 3.0, -1.0, 36)
    show(BARE + ('part_tag_speedloader', 'part_tag_bullets') + tuple('part_' + s for s in SPENT))
    co.location = (1.0, -60, -2); co.rotation_euler = (math.radians(90), 0, 0); co.data.ortho_scale = 26
    sc.render.filepath = f'{RENDER}/dc_reload_parts.png'; bpy.ops.render.render(write_still=True)
