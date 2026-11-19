#!/usr/bin/env python3
"""Scenery bodies of a Black Ops III port, posed (docs/fork/bo3-ports.md, "Bodies in the scenery").

BO3 maps place dead soldiers and zombies as plain static models of full character rigs. The map dump only has the
model name and a transform, and the model is stored standing in its bind pose (an A-pose), so a port that draws them
as they are shows stiff figures with their arms out, lying on their backs like planks, standing in doorways or
sticking out of walls. This tool bakes each of those models into a handful of posed plain meshes and writes them, with
one instanced node per pose, to mods/maps/<map>/bodies.glb (git-ignored: ripped models). The runtime part is
export/web/posed-bodies.js (it also takes the bind-pose copies out of the map).

  ~/.local/opt/blender/5.2/python/bin/python3.13 -I .tools/build_posed_bodies.py gorod-krovi
  ... der-eisendrache            # numpy is needed: Blender's python has it, the system python does not
  ... gorod-krovi --preview scratch/corpses/prev     # contact sheets of every candidate pose (top and side view)

How a body is posed, from the transform its mapper gave the stiff model:
 * lying (the body's long axis is within LYING of level): the last frame of one of BO3's own zombie death clips, which
   is a body at rest on flat ground. It is laid on the plane the stiff body was lying on (through the lowest part of
   its torso, level across the body), hips where the stiff body's hips were, head pointing the same way, on its back
   or front as the stiff one was. Neighbours get different poses.
 * upright or steep (hung on a wall, slumped over sandbags, propped in a corner): the model stays exactly where it was
   put and goes limp: the arms fall the way gravity pulls for that placement, the head drops, the knees and back give.
Rigid pieces with a one-bone rig (helmets, loose limbs) are written as they are.
"""
import collections, hashlib, json, math, pathlib, re, struct, subprocess, sys, tempfile, zlib
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import semodel_to_glb as SEM
from seanim import read_seanim

ROOT = pathlib.Path(__file__).resolve().parents[1]
GH = pathlib.Path('/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
CM = 1 / 2.54
C = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=np.float64)   # CoD -> glTF axes, as build_bo3_map.py

MAPS = {
    # tex False: the map already has these models' materials; the runtime part swaps them in by name
    'gorod-krovi': {'dump': 'zm_stalingrad', 'tex': False, 'posed': r'^c_zom_dlc3_rus_corpse\d+_fb$', 'rigid': None},
    # Der Eisendrache's builder leaves every one of these out (POSED_CHARACTER), so the helmets and loose limbs come too
    'der-eisendrache': {'dump': 'zm_castle', 'tex': True, 'caps': (512, 128), 'posed': r'^c_zom_der_body\d+_corpse\d+_fb$',
                        'rigid': r'^c_ger_winter_soldier_\d+_helm$|^c_(54i_assault_body|zom_zod_zombie_fem_body\d+)_g_\w+spawn$'},
}
LYING = .62          # |long axis . up| under this = lying (about 38 degrees from level)
CAPS = (512, 256)    # texture sizes: colour, others
# death clips whose last frame is a body at rest; the tool measures which way up each one ends (--preview shows them)
CLIPS = ['ai_zombie_base_dth_f_v%d' % i for i in range(1, 14)] + ['ai_zombie_base_dth_b_v%d' % i for i in (1, 2, 3)] \
      + ['ai_zombie_base_death_v%d' % i for i in (1, 2, 3)] + ['ai_zombie_base_crawl_death_v1', 'ai_zombie_base_crawl_death_v2']
SKIP_CLIPS = set()
FLAT = .78           # a rest pose whose hips-to-neck line rises more than this allows is left out (propped on its arms)
POOL = {'up': 6, 'down': 8, 'side': 3}   # most poses per model and way of lying (each is a mesh of its own)
NEAR = 320           # inches: bodies this close to each other get different poses
MIRROR = np.array([1., -1, 1])
TEX = True

# ---------------------------------------------------------------- maths
def qmat(q):
    x, y, z, w = q; n = math.sqrt(x*x+y*y+z*z+w*w) or 1; x, y, z, w = x/n, y/n, z/n, w/n
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
def trs(t, R):
    M = np.eye(4); M[:3, :3] = R; M[:3, 3] = t; return M
def unit(v):
    v = np.asarray(v, dtype=np.float64); n = np.linalg.norm(v); return v / n if n > 1e-9 else v
def axis_angle(axis, ang):
    a = unit(axis); x, y, z = a; c, s = math.cos(ang), math.sin(ang); t = 1 - c
    return np.array([[t*x*x+c, t*x*y-s*z, t*x*z+s*y], [t*x*y+s*z, t*y*y+c, t*y*z-s*x], [t*x*z-s*y, t*y*z+s*x, t*z*z+c]])
def toward(a, b, frac=1, cap=math.pi):
    """rotation that turns direction a towards b by frac of the angle, at most cap radians"""
    a, b = unit(a), unit(b); ax = np.cross(a, b); s = np.linalg.norm(ax); ang = math.atan2(s, float(a @ b))
    if s < 1e-6: return np.eye(3)
    return axis_angle(ax / s, min(ang * frac, cap))

# ---------------------------------------------------------------- model
class Model:
    def __init__(self, name):
        self.name = name
        sem = SEM.read_semodel(GH/'xmodels'/name/(name+'_LOD0.semodel')); self.sem = sem
        B = sem['bones']; self.names = [b['name'] for b in B]; self.idx = {n: i for i, n in enumerate(self.names)}
        self.parent = [b['parent'] for b in B]; nb = len(B)
        self.bind = [None] * nb; self.local = [None] * nb
        for i, b in enumerate(B):
            if 'wpos' in b: self.bind[i] = trs(np.array(b['wpos']) * CM, qmat(b['wrot']))
            else:
                L = trs(np.array(b['lpos']) * CM, qmat(b['lrot'])); self.bind[i] = L if b['parent'] < 0 else self.bind[b['parent']] @ L
        for i, b in enumerate(B):
            self.local[i] = self.bind[i] if b['parent'] < 0 else np.linalg.inv(self.bind[b['parent']]) @ self.bind[i]
        self.ibind = [np.linalg.inv(m) for m in self.bind]
        self.kids = [[] for _ in range(nb)]
        for i, p in enumerate(self.parent):
            if p >= 0: self.kids[p].append(i)
        self.meshes = []
        for m in sem['meshes']:
            pos = np.array(m['pos'], dtype=np.float64) * CM; nrm = np.array(m['nrm'], dtype=np.float64)
            k = max(len(w) for w in m['w']) if nb > 1 else 1
            J = np.zeros((len(pos), k), dtype=np.int64); W = np.zeros((len(pos), k))
            if nb > 1:
                for v, w in enumerate(m['w']):
                    for c, (j, x) in enumerate(w): J[v, c] = j; W[v, c] = x
                W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
            else: W[:] = 1
            self.meshes.append((pos, nrm, J, W))
        self.pos = np.concatenate([m[0] for m in self.meshes])
        self.dom = np.concatenate([m[2][np.arange(len(m[0])), m[3].argmax(1)] for m in self.meshes])   # heaviest bone per vertex

    def bone(self, n): return self.idx[n]
    def below(self, i):
        out = [i]
        for k in self.kids[i]: out += self.below(k)
        return out
    def world(self, local):
        W = [None] * len(local)
        for i, p in enumerate(self.parent): W[i] = local[i] if p < 0 else W[p] @ local[i]
        return W
    def clip_pose(self, clip, frame=-1):
        """world matrices of a clip's frame: rotations are absolute local, translations offsets from the bind position"""
        a = read_seanim(GH/'xanims'/(clip+'.seanim')); f = a['frames'] - 1 if frame < 0 else frame
        local = [m.copy() for m in self.local]
        def key(keys):
            best = None
            for fr, v in keys:
                if fr <= f: best = v
            return best if best is not None else (keys[0][1] if keys else None)
        for n, b in a['bones'].items():
            i = self.idx.get(n)
            if i is None or n == 'tag_origin': continue
            r = key(b.get('rot', [])); t = key(b.get('loc', []))
            if r is not None: local[i][:3, :3] = qmat(r)
            if t is not None: local[i][:3, 3] = self.local[i][:3, 3] + np.array(t) * CM
        return self.world(local)
    def turn(self, W, bone, R):
        """turn a joint and everything below it about the joint, in world space"""
        i = self.idx.get(bone) if isinstance(bone, str) else bone
        if i is None: return
        p = W[i][:3, 3].copy(); T = trs(p - R @ p, R)
        for j in self.below(i): W[j] = T @ W[j]
    def skin(self, W):
        S = np.stack([W[i] @ self.ibind[i] for i in range(len(W))])
        out = []
        for pos, nrm, J, Wt in self.meshes:
            P = np.zeros_like(pos); N = np.zeros_like(nrm)
            for c in range(J.shape[1]):
                M = S[J[:, c]]; w = Wt[:, c:c+1]
                P += w * (np.einsum('nij,nj->ni', M[:, :3, :3], pos) + M[:, :3, 3]); N += w * np.einsum('nij,nj->ni', M[:, :3, :3], nrm)
            N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9); out.append((P, N))
        return out

SPINE = ('j_mainroot', 'j_spinelower', 'j_spineupper', 'j_spine4')
def first(m, *names):
    for n in names:
        if n in m.idx: return m.idx[n]
    raise KeyError(names)

def lying_pose(m, clip):
    """a death clip's rest pose in its own lying frame: x towards the head, z out of the ground, hips over the origin.
    -> (skinned meshes, face up?, how flat the body is 0..1)"""
    W = m.clip_pose(clip); sk = m.skin(W)
    hips = W[m.bone('j_mainroot')][:3, 3]; chest = first(m, 'j_spine4', 'j_spineupper'); neck = W[first(m, 'j_neck', 'j_spine4')][:3, 3]
    d = neck - hips; flat = 1 - abs(d[2]) / (np.linalg.norm(d) or 1)
    h = unit([d[0], d[1], 0]); fwd = (W[chest] @ m.ibind[chest])[:3, :3] @ np.array([1., 0, 0])
    allp = np.concatenate([p for p, _ in sk]); z0 = np.percentile(allp[:, 2], 3)
    R = np.stack([h, np.cross([0, 0, 1.], h), [0, 0, 1.]])   # rows: the lying frame's axes
    o = np.array([hips[0], hips[1], z0])
    return [((p - o) @ R.T, n @ R.T) for p, n in sk], bool(fwd[2] > 0), float(flat), float(abs(fwd[2])), float(np.sign((R @ fwd)[1]) or 1)

def limp_pose(m, g, seed):
    """the bind pose gone limp under gravity g (unit, model space: x forward, y left, z up the body)"""
    rnd = np.random.default_rng(seed); W = [b.copy() for b in m.bind]; g = unit(g)
    def pos(n): return W[m.idx[n]][:3, 3]
    def has(*n): return all(x in m.idx for x in n)
    # the back gives a little, the head drops: forward when the body is upright, otherwise the way gravity pulls
    drop = unit(g + np.array([.55, rnd.uniform(-.25, .25), 0]) * max(0, -g[2]))
    for b, a in (('j_spinelower', .05), ('j_spineupper', .07), ('j_spine4', .08)):
        if has(b): m.turn(W, b, toward([0, 0, 1], drop, a, .16) if abs(g[2]) < .95 else axis_angle([0, 1, 0], a * rnd.uniform(.6, 1.4)))
    if has('j_neck', 'j_head'):
        up = unit(pos('j_head') - pos('j_neck'))
        m.turn(W, 'j_neck', toward(up, drop, .22, .45)); up = unit(pos('j_head') - pos('j_neck'))
        m.turn(W, 'j_head', toward(up, drop, .2, .4) @ axis_angle(up, rnd.uniform(-.3, .3)))
    for s in ('le', 'ri'):
        side = 1 if s == 'le' else -1
        sh, el, wr = 'j_shoulder_'+s, 'j_elbow_'+s, 'j_wrist_'+s
        if has(sh, el, wr):
            # the upper arm hangs with gravity, kept a little clear of the ribs; the forearm follows with a bent elbow
            hang = unit(g + np.array([rnd.uniform(-.05, .2), side * rnd.uniform(.1, .22), 0]))
            m.turn(W, sh, toward(pos(el) - pos(sh), hang, rnd.uniform(.8, .95)))
            fore = unit(hang + np.array([rnd.uniform(.05, .45), -side * rnd.uniform(0, .25), 0]))
            m.turn(W, el, toward(pos(wr) - pos(el), fore, .9, 1.9))
            m.turn(W, wr, axis_angle(unit(pos(wr) - pos(el)), rnd.uniform(-.5, .5)))
        hip, kn, an = 'j_hip_'+s, 'j_knee_'+s, 'j_ankle_'+s
        if has(hip, kn, an):
            leg = unit(pos(kn) - pos(hip))
            # legs: pulled a little by gravity at the hip; the knee folds back by an amount that differs per leg
            m.turn(W, hip, toward(leg, unit(leg + g * .35 + np.array([rnd.uniform(-.12, .18), side * rnd.uniform(-.05, .1), 0])), 1, .5))
            axis = W[m.idx[kn]][:3, :3] @ m.ibind[m.idx[kn]][:3, :3] @ np.array([0, 1., 0])
            m.turn(W, kn, axis_angle(axis, rnd.uniform(.08, .5)))
            foot = unit(pos(an) - pos(kn)); m.turn(W, an, toward(foot + np.array([.6, 0, 0]), foot + np.array([.6, 0, 0]) + g * .5, 1, .5))
    return m.skin(W)

# ---------------------------------------------------------------- previews
def splat(points, w=220, span=64):
    img = np.zeros((w * 2, w), dtype=np.uint8)
    for row, (a, b) in enumerate(((0, 1), (0, 2))):
        u = ((points[:, a] / span + .5) * w).astype(int); v = ((.5 - points[:, b] / span) * w).astype(int)
        ok = (u >= 0) & (u < w) & (v >= 0) & (v < w); d = points[:, 3 - a - b]
        shade = np.clip(110 + (d - d.min()) / max(1e-6, d.max() - d.min()) * 145, 0, 255).astype(np.uint8)
        o = np.argsort(d[ok])
        for du in (0, 1):
            for dv in (0, 1): img[row * w + np.minimum(v[ok][o] + dv, w - 1), np.minimum(u[ok][o] + du, w - 1)] = shade[ok][o]
        if row: img[row * w + w // 2, :] = np.maximum(img[row * w + w // 2, :], 60)
    return img
def sheet(images, out, cols=8):
    out = pathlib.Path(out); out.parent.mkdir(parents=True, exist_ok=True)
    h, w = images[0].shape; rows = -(-len(images) // cols); big = np.zeros((rows * h, cols * w), dtype=np.uint8)
    for i, im in enumerate(images): big[(i // cols) * h:(i // cols + 1) * h, (i % cols) * w:(i % cols + 1) * w] = im
    pgm = out.with_suffix('.pgm'); pgm.write_bytes(b'P5 %d %d 255\n' % (big.shape[1], big.shape[0]) + big.tobytes())
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(pgm), '-q:v', '3', str(out)], check=True); pgm.unlink()

# ---------------------------------------------------------------- textures and the GLB
_tex = {}
def texture_loader(stem, kind):
    if not TEX: return None
    k = (stem, kind)
    if k in _tex: return _tex[k]
    src = GH/'ximages'/(stem+'.png'); _tex[k] = None
    if src.exists():
        vf = f"scale='min({CAPS[0] if kind == 'diffuse' else CAPS[1]},iw)':-2"
        if kind == 'rough': vf = 'format=gray,negate,format=rgb24,' + vf
        with tempfile.NamedTemporaryFile(suffix='.webp') as out:
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', vf, '-c:v', 'libwebp',
                            '-quality', '92' if kind == 'normal' else '85', out.name], check=True)
            _tex[k] = (pathlib.Path(out.name).read_bytes(), 'image/webp')
    return _tex[k]

class Glb:
    """several semodel_to_glb files merged: equal buffers, images and materials are stored once"""
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.acc = []; self.images = []; self.textures = []; self.materials = []
        self.meshes = []; self.nodes = []; self._v = {}; self._a = {}; self._i = {}; self._m = {}
    def view(self, data, target=None):
        k = (hashlib.md5(data).digest(), target)
        if k not in self._v:
            while len(self.bin) % 4: self.bin.append(0)
            v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
            if target: v['target'] = target
            self.bin += data; self._v[k] = len(self.views); self.views.append(v)
        return self._v[k]
    def add_mesh(self, name, sem):
        """sem: a semodel dict without bones (plain mesh, CoD axes, inches) -> mesh index"""
        with tempfile.NamedTemporaryFile(suffix='.glb') as f:
            SEM.to_glb(sem, f.name, texture_loader=texture_loader); raw = pathlib.Path(f.name).read_bytes()
        jl, = struct.unpack_from('<I', raw, 12); g = json.loads(raw[20:20+jl]); b = raw[28+jl:]
        def data(v): return bytes(b[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']])
        def acc(i):
            a = dict(g['accessors'][i]); v = g['bufferViews'][a['bufferView']]
            a['bufferView'] = self.view(data(v), v.get('target')); k = json.dumps(a, sort_keys=True)
            if k not in self._a: self._a[k] = len(self.acc); self.acc.append(a)
            return self._a[k]
        def tex(t):
            src = g['textures'][t['index']]; im = (src.get('extensions', {}).get('EXT_texture_webp') or src)['source']
            img = g['images'][im]; raw_ = data(g['bufferViews'][img['bufferView']]); k = hashlib.md5(raw_).digest()
            if k not in self._i:
                self._i[k] = len(self.textures); self.images.append({'bufferView': self.view(raw_), 'mimeType': img['mimeType']})
                self.textures.append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(self.images)-1}}} if img['mimeType'] == 'image/webp'
                                     else {'sampler': 0, 'source': len(self.images)-1})
            return {**t, 'index': self._i[k]}
        def mat(i):
            m = json.loads(json.dumps(g['materials'][i])); p = m.get('pbrMetallicRoughness', {})
            for holder, key in ((p, 'baseColorTexture'), (p, 'metallicRoughnessTexture'), (m, 'normalTexture'), (m, 'emissiveTexture'), (m, 'occlusionTexture')):
                if key in holder: holder[key] = tex(holder[key])
            k = json.dumps(m, sort_keys=True)
            if k not in self._m: self._m[k] = len(self.materials); self.materials.append(m)
            return self._m[k]
        prims = []
        for p in g['meshes'][0]['primitives']:
            q = {'attributes': {k: acc(v) for k, v in p['attributes'].items()}, 'indices': acc(p['indices'])}
            if 'material' in p: q['material'] = mat(p['material'])
            prims.append(q)
        self.meshes.append({'name': name, 'primitives': prims}); return len(self.meshes) - 1
    def add_instances(self, name, mesh, mats):
        """mats: 4x4 world matrices in glTF axes"""
        T = np.array([M[:3, 3] for M in mats], dtype=np.float32); S = []; Q = []
        for M in mats:
            R = M[:3, :3]; s = np.linalg.norm(R, axis=0); S.append(s); R = R / s
            w = math.sqrt(max(0, 1 + R[0, 0] + R[1, 1] + R[2, 2])) / 2
            if w > 1e-4: q = [(R[2, 1]-R[1, 2])/(4*w), (R[0, 2]-R[2, 0])/(4*w), (R[1, 0]-R[0, 1])/(4*w), w]
            else:
                i = int(np.argmax(np.diag(R))); j, k = (i+1) % 3, (i+2) % 3; r = math.sqrt(max(1e-12, 1 + R[i, i] - R[j, j] - R[k, k]))
                q = [0, 0, 0, 0]; q[i] = r / 2; q[j] = (R[j, i] + R[i, j]) / (2*r); q[k] = (R[k, i] + R[i, k]) / (2*r); q[3] = (R[k, j] - R[j, k]) / (2*r)
            Q.append(q)
        def a(arr, typ):
            arr = np.asarray(arr, dtype=np.float32); self.acc.append({'bufferView': self.view(arr.tobytes()), 'componentType': 5126, 'count': len(arr), 'type': typ})
            return len(self.acc) - 1
        self.nodes.append({'name': name, 'mesh': mesh, 'extensions': {'EXT_mesh_gpu_instancing': {'attributes': {
            'TRANSLATION': a(T, 'VEC3'), 'ROTATION': a(Q, 'VEC4'), 'SCALE': a(S, 'VEC3')}}}})
    def write(self, out):
        while len(self.bin) % 4: self.bin.append(0)
        g = {'asset': {'version': '2.0', 'generator': 'build_posed_bodies.py'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(self.nodes)))}],
             'nodes': self.nodes, 'meshes': self.meshes, 'materials': self.materials, 'accessors': self.acc, 'bufferViews': self.views,
             'images': self.images, 'textures': self.textures, 'samplers': [{}], 'buffers': [{'byteLength': len(self.bin)}],
             'extensionsUsed': ['EXT_texture_webp', 'EXT_mesh_gpu_instancing'], 'extensionsRequired': ['EXT_texture_webp', 'EXT_mesh_gpu_instancing']}
        js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
        pathlib.Path(out).write_bytes(struct.pack('<III', 0x46546c67, 2, 28+len(js)+len(self.bin)) + struct.pack('<II', len(js), 0x4e4f534a) + js
                                      + struct.pack('<II', len(self.bin), 0x004e4942) + bytes(self.bin))

def plain(m, skinned, mirror=False):
    """a Model's semodel with new positions and normals and no bones (so semodel_to_glb writes a plain mesh)"""
    meshes = []
    for src, (p, n) in zip(m.sem['meshes'], skinned):
        if mirror: p = p * MIRROR; n = n * MIRROR
        meshes.append({**{k: v for k, v in src.items() if k != 'w'}, 'pos': [tuple(x) for x in p.tolist()], 'nrm': [tuple(x) for x in n.tolist()],
                       'faces': [(f[0], f[2], f[1]) for f in src['faces']] if mirror else src['faces']})
    return {'bones': [], 'meshes': meshes, 'materials': m.sem['materials']}

# ---------------------------------------------------------------- main
def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; map_id = args[0]; cfg = MAPS[map_id]
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    dump = json.load(open(ROOT/'export_game/bo3/maps'/cfg['dump']/(cfg['dump']+'.json')))
    posed_re = re.compile(cfg['posed']); rigid_re = re.compile(cfg['rigid']) if cfg['rigid'] else None
    seen = set(); inst = {}
    for it in dump['models']:
        n = it['name']
        if not (posed_re.match(n) or rigid_re and rigid_re.match(n)): continue
        k = (n, tuple(round(x, 1) for x in it['origin']), tuple(round(x, 3) for x in it['axes']))
        if k in seen: continue
        seen.add(k); inst.setdefault(n, []).append(it)
    print({n: len(v) for n, v in inst.items()})
    models = {n: Model(n) for n in inst}
    UP = np.array([0, 0, 1.])

    if preview:
        m = max((models[n] for n in inst if posed_re.match(n)), key=lambda x: len(x.pos)); ims = []; rows = []
        for c in CLIPS:
            if not (GH/'xanims'/(c+'.seanim')).exists(): print('missing clip', c); continue
            sk, up, flat, facing, _ = lying_pose(m, c); pts = np.concatenate([p for p, _ in sk]); ims.append(splat(pts))
            rows.append((c, 'up' if up else 'down', round(flat, 2), round(facing, 2), [round(float(x), 1) for x in pts.min(0)], [round(float(x), 1) for x in pts.max(0)]))
        for i, r in enumerate(rows): print(i, *r)
        sheet(ims, pathlib.Path(preview)/'lying.jpg')
        ims = [splat(np.concatenate([p for p, _ in limp_pose(m, g, s)]) - np.array([0, 0, 36]), span=84)
               for g in ([0, 0, -1], [.6, 0, -.8], [-.6, 0, -.8], [.9, 0, -.4], [-.9, 0, -.4], [0, .7, -.7], [0, 0, 1]) for s in (1, 2)]
        sheet(ims, pathlib.Path(preview)/'limp.jpg', cols=7)
        return

    global TEX, CAPS
    TEX = cfg['tex']; CAPS = cfg.get('caps', CAPS); glb = Glb(); C4 = np.eye(4); C4[:3, :3] = C; report = {}; total = 0
    def placed(it):   # the mapper's own transform (CoD axes)
        W = np.eye(4); W[:3, :3] = np.array(it['axes'], dtype=np.float64).reshape(3, 3).T * it.get('scale', 1); W[:3, 3] = it['origin']; return W
    def emit(node, m, skinned, mats, mirror=False):
        nonlocal total
        glb.add_instances(node, glb.add_mesh(node, plain(m, skinned, mirror)), [C4 @ W @ C4.T for W in mats]); total += len(mats)
    stiff = sys.argv[sys.argv.index('--stiff') + 1] if '--stiff' in sys.argv else None   # the bodies as the map has them, to measure against
    for name in sorted(inst):
        m = models[name]; items = inst[name]
        if stiff or not posed_re.match(name):
            emit('body_' + name, m, [(p, n) for p, n, _, _ in m.meshes], [placed(it) for it in items]); report[name] = {'as placed': len(items)}; continue
        # every usable rest pose of this model: {way of lying: [(clip, mirrored)]}, plain ones before their mirror images
        rest = {}; pool = {'up': [], 'down': [], 'side': []}
        for c in CLIPS:
            if c in SKIP_CLIPS or not (GH/'xanims'/(c+'.seanim')).exists(): continue
            sk, up, flat, facing, fy = lying_pose(m, c)
            if flat < FLAT: continue
            rest[c] = (sk, fy); pool['side' if facing < .45 else 'up' if up else 'down'].append(c)
        pool = {k: [(c, mir) for mir in (False, True) for c in v] for k, v in pool.items()}
        pelvis = m.bind[m.bone('j_mainroot')][:3, 3]; torso = np.isin(m.dom, [m.idx[b] for b in SPINE if b in m.idx])
        lying = {'up': [], 'down': [], 'side': []}; limp = {}; rep = collections.Counter()
        for it in items:
            A = np.array(it['axes'], dtype=np.float64).reshape(3, 3); sc = it.get('scale', 1); o = np.array(it['origin'], dtype=np.float64)
            a, f = unit(A[2]), unit(A[0])
            if abs(a[2]) >= LYING:   # standing, hanging or propped up: stays where it is and goes limp
                gm = A @ -UP; limp.setdefault(tuple((np.round(gm * 3) / 3).tolist()), []).append(placed(it)); continue
            n = unit(UP - (UP @ a) * a); c = float(n @ f)
            if abs(c) > .8: n = f * np.sign(c)   # lying on its back or front: the plane it was laid on
            way = 'up' if c > .5 else 'down' if c < -.5 else 'side'
            if not pool[way]: way = 'up' if c > 0 and pool['up'] else 'down'
            support = float(np.percentile((m.pos[torso] - pelvis) @ (A @ -n), 95))   # hips to the surface it lay on
            ground = o + sc * (A.T @ pelvis) - n * sc * support
            W = np.eye(4); W[:3, 0] = a * sc; W[:3, 1] = np.cross(n, a) * sc; W[:3, 2] = n * sc; W[:3, 3] = ground
            lying[way].append((W, float(np.sign(f @ np.cross(n, a)) or 1), o))
        for way, L in lying.items():
            if not L: continue
            cand = pool[way][:max(2, min(POOL[way], math.ceil(len(L) / 4)))] if way != 'side' else pool[way]
            used = collections.Counter(); chosen = []
            for i, (W, side, o) in enumerate(L):
                ok = [v for v in cand if way != 'side' or rest[v[0]][1] * (-1 if v[1] else 1) == side] or cand
                def cost(v):
                    near = sum(1 for (W2, _, o2), v2 in zip(L, chosen) if v2 == v and np.linalg.norm(o2 - o) < NEAR)
                    return (near, used[v], zlib.crc32(repr((v, o.tolist())).encode()))
                v = min(ok, key=cost); chosen.append(v); used[v] += 1
            for k, v in enumerate(sorted(used, key=lambda v: (v[1], v[0]))):
                emit(f'body_{name}_{way}{k}', m, rest[v[0]][0], [W for (W, _, _), v2 in zip(L, chosen) if v2 == v], v[1])
            rep[way] = len(L); rep[way + ' poses'] = len(used)
        for k, (g, mats) in enumerate(sorted(limp.items())):
            halves = [mats[0::2], mats[1::2]] if len(mats) >= 4 else [mats]
            for h, part in enumerate(halves):
                emit(f'body_{name}_limp{k}{"ab"[h]}', m, limp_pose(m, np.array(g), zlib.crc32(f'{name}{k}{h}'.encode())), part)
            rep['limp'] += len(mats); rep['limp poses'] += len(halves)
        report[name] = dict(rep)
    out = pathlib.Path(stiff).resolve() if stiff else ROOT/'export/web/mods/maps'/map_id/'bodies.glb'; glb.write(out)
    for n, r in report.items(): print(n, r)
    print(f'{out.relative_to(ROOT)}: {total} bodies and pieces, {len(glb.meshes)} meshes, {out.stat().st_size/1e6:.1f} MB')

if __name__ == '__main__':
    main()
