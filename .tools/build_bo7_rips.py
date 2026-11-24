#!/usr/bin/env python3
"""Black Ops 7 weapons from the user's own rips (Cordycep/Saluki Cast exports, ~/RIPS melon-pipeline) into the
git-ignored mod export/web/mods/bo7-rips/ (models, animations, audio, weapons.json; docs/fork/bo7-rips.md).

  python3 -I .tools/build_bo7_rips.py <pipeline dir> [gun codename ...]     (default: kite = AK-27)

Needs numpy, Pillow and fast-simplification (nix-shell -p "python3.withPackages(ps:[ps.numpy ps.pillow ps.fast-simplification])") and ffmpeg. Reads
<pipeline>/exports/bo7 (Cast models, animations, sounds, sndbanks) and the colour/normal/ORM WebPs the pipeline's
cod2gltf.py wrote to <pipeline>/out*/tex with its data/models.json. Ripped data: never commit the output.

Rig: BO7's arms (viewhands_base_iw8) carry the gun on j_gun under the right wrist, as BO1/BO3 do on tag_weapon;
j_gun is renamed tag_weapon (the engine's attach bone) in the arms and in every clip, and the gun model hangs
from its own j_gun root. Units: Cast is in centimetres, written here in inches (BO1's scale).
Clips: rotations are local and absolute; translations marked relative are offsets from the bone's rest position
(checked by FK on the idle: j_gun lands 38 cm ahead of tag_view only read that way). The engine wants absolute
positions for the arms and offsets for gun parts (animation.js makeClip), so arms get rest + offset.
"""
import sys, json, math, pathlib, subprocess, hashlib, csv, io, random
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
PIPE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mass_drive/RIPS/melon-pipeline')
GUNS = [a for a in sys.argv[2:] if not a.startswith('--')] or ['kite']
sys.path.insert(0, str(PIPE/'scripts')); import castlib          # the pipeline's Cast reader (the user's code)
sys.path.insert(0, str(ROOT/'.tools')); import semodel_to_glb as SEM
EXP = PIPE/'exports'/'bo7'
MOD = ROOT/'export/web/mods/bo7-rips'
WEB = 'mods/bo7-rips/'
CM = 1/2.54
WORLD_KEEP = .1   # share of the world model's triangles kept (simplify())
REST = {'restPose': True}   # world models: their bind pose is the gun at rest (the spare mag inside the gun), so pose.js poseIdle leaves them be;
                                # the viewmodel's idle frame tilted the 1911's slide in every static view (2026-11-24)
for sub in ['models', 'animations', 'audio']: (MOD/sub).mkdir(parents=True, exist_ok=True)

# colour / normal / ORM WebPs by material name, from every pipeline output folder that has them
TEX = {}
for out in sorted(PIPE.glob('out*')):
    mj = out/'data'/'models.json'
    if not mj.exists(): continue
    for mdl in json.loads(mj.read_text()).values():
        for mname, t in (mdl.get('materials') or {}).items():
            TEX.setdefault(mname, {k: out/'tex'/v for k, v in t.items() if k in ('color', 'normal', 'orm')})

def ver(path): return '?v='+hashlib.md5(pathlib.Path(path).read_bytes()).hexdigest()[:8]

def tex_loader(light):
    def load(stem, kind):
        mname, suf = stem.rsplit('_', 1)
        key = {'c': 'color', 'n': 'normal', 'g': 'orm'}[suf]
        if light and key != 'color': return None
        p = TEX.get(mname, {}).get(key)
        if not p or not p.exists(): return None
        im = Image.open(p); im.load()
        size = 256 if light else (512 if key == 'orm' else 1024)
        if max(im.size) > size: im = im.resize((max(1, im.width*size//max(im.size)), max(1, im.height*size//max(im.size))), Image.LANCZOS)
        if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGB')
        if key != 'color' and im.mode == 'RGBA': im = im.convert('RGB')
        b = io.BytesIO(); im.save(b, 'WEBP', quality=92 if key == 'normal' else 85); return b.getvalue(), 'image/webp'
    return load

# ---- quaternions (xyzw) ---------------------------------------------------------------------------------
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return np.array([aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz])
def qinv(q): return np.array([-q[0], -q[1], -q[2], q[3]])
def qrot(q, v):   # v: (3,) or (n,3)
    u, w = np.asarray(q[:3]), q[3]; v = np.asarray(v, float)
    t = 2*np.cross(u, v); return v + w*t + np.cross(u, t)

BLUEPRINT = {'oman': ('polarb', 'redteeth', 'techwar', 'bamboo'), 'otter': ('pforce', 'arctic', 'evhunter', 'training')}   # preferred, for one look
_ALL = None
def model_dir(name):
    """a model's export folder by its stock name. Guns ripped only as blueprints answer too: the MXR-17's stock parts are
    att_<name>; the Warden 308's and RK-9's only exist as <slot>_<blueprint>_vm_sat_<c>_<g>_<part> (the stock mesh with the
    stock colour maps, a blueprint's overlay on top), BLUEPRINT[g] first so the parts share one"""
    global _ALL
    p = EXP/'models'/name
    if p.is_dir(): return p
    if (EXP/'models'/('att_'+name)).is_dir(): return EXP/'models'/('att_'+name)
    # a melee ripped as one model (the Katana: sat_vm_me_nashira; its wpn_ copy is an empty bone, so the knife came out with 0 verts)
    if name.endswith('_rec') and '_me_' in name and (EXP/'models'/name[:-4]).is_dir(): return EXP/'models'/name[:-4]
    if name.endswith('_rec') and (EXP/'models'/('wpn_'+name[:-4])).is_dir(): return EXP/'models'/('wpn_'+name[:-4])   # the AAROW: one model
    m = __import__('re').match(r'sat_(vm|wm)_([a-z]{2})_([a-z0-9]+)_(.+)$', name)
    if not m: return p
    v, c, g, part = m.groups()
    if _ALL is None: _ALL = sorted(x.name for x in (EXP/'models').iterdir())
    head, tail = f'sat_{v}_{c}_{g}_{part.split("_")[0]}_', f'_{v}_sat_{c}_{g}_{part}'
    cands = [x for x in _ALL if x.startswith(head) and x.endswith(tail)]
    pref = BLUEPRINT.get(g, ())
    cands.sort(key=lambda x: next((i for i, b in enumerate(pref) if f'_{b}_' in x), 99))
    return EXP/'models'/cands[0] if cands else p

def load_model(name):
    d = model_dir(name)
    roots = castlib.load(d/(d.name+'_LOD0.cast'))
    m = next(n for r in roots for n in r.walk() if n.type == 'model')
    return castlib.skeleton(m), castlib.meshes(m), castlib.materials(m)

def simplify(pos, nrm, uv, w, faces, keep):
    """Quadric decimation (fast-simplification) of one mesh down to about `keep` of its triangles, for the world model
    (the Mystery Box display, third person, the HUD icon). The game splits a vertex at every UV seam and hard edge, and
    decimated as-is each split was an open border the simplifier tore: slides came out with holes, spikes and flipped
    faces (user 2026-11-24, "gun icons are severely broken"). So the mesh is welded by position first, decimated, and
    every corner of a new face takes the attributes (normal, UV, weights) of the original vertex merged into it whose
    own faces lie nearest that face: the seam's split comes back on the side the face is on."""
    import fast_simplification as FS
    f = np.asarray(faces, dtype=np.int64)
    if len(f) < 400: return pos, nrm, uv, w, faces
    p = np.asarray(pos, dtype=np.float64)
    # welded only within one bone's piece: across bones (a round against its mag) the pieces must stay apart, or a
    # face spans both and stretches when they move apart in the pose
    dom = np.array([max(v, key=lambda e: e[1])[0] for v in w], np.float64)[:, None]
    _, first, inv = np.unique(np.hstack([np.round(p, 4), dom]), axis=0, return_index=True, return_inverse=True); inv = inv.reshape(-1)
    pw, fw = p[first].astype(np.float32), inv[f]
    fw = fw[(fw[:, 0] != fw[:, 1]) & (fw[:, 1] != fw[:, 2]) & (fw[:, 0] != fw[:, 2])]
    if len(fw) < 400: return pos, nrm, uv, w, faces
    used = np.unique(fw); re = np.full(len(pw), -1, np.int64); re[used] = np.arange(len(used))   # only vertices a face uses: replay_simplification
    pw, fw, inv = pw[used], re[fw], re[inv]                                                       # breaks on a loose one (wren, 2026-11-24)
    _, _, col = FS.simplify(pw, fw, 1-keep, return_collapses=True)
    p2, f2, mp = FS.replay_simplification(pw, fw, col)
    if not len(f2): return pos, nrm, uv, w, faces
    # where each original vertex's faces lie: the mean of their centroids
    cen = p[f].mean(1); acc = np.zeros_like(p); cnt = np.zeros(len(p))
    for k in range(3): np.add.at(acc, f[:, k], cen); np.add.at(cnt, f[:, k], 1)
    side = acc/np.maximum(cnt, 1)[:, None]
    out_of = np.where(inv >= 0, mp[np.maximum(inv, 0)], -1)   # original vertex -> output vertex (-1: only in faces welded flat)
    order = np.argsort(out_of, kind='stable'); order = order[out_of[order] >= 0]; starts = np.searchsorted(out_of[order], np.arange(len(p2)+1))
    fc2 = np.asarray(p2, np.float64)[f2].mean(1)
    src, key, nf = [], {}, np.empty_like(f2)
    for t in range(len(f2)):
        for k in range(3):
            o = f2[t, k]; cands = order[starts[o]:starts[o+1]]
            i = int(cands[np.argmin(((side[cands]-fc2[t])**2).sum(1))]) if len(cands) > 1 else int(cands[0])
            if (o, i) not in key: key[(o, i)] = len(src); src.append((o, i))
            nf[t, k] = key[(o, i)]
    so = np.array([o for o, _ in src]); si = np.array([i for _, i in src])
    return np.asarray(p2)[so], None if nrm is None else np.asarray(nrm)[si], np.asarray(uv)[si], [w[i] for i in si], nf

def quantize_glb(path, extras=None):
    """Smaller vertex data in a written GLB: 16-bit indices where they fit, joints as bytes (under 256 bones), weights as normalized bytes summing to
    255, normals as normalized signed bytes (KHR_mesh_quantization, which three's GLTFLoader reads). 56 -> 32 bytes a
    vertex; positions and UVs stay float (UVs run past 0..1)."""
    import struct
    raw = path.read_bytes(); n = struct.unpack('<I', raw[12:16])[0]
    j = json.loads(raw[20:20+n]); b0 = 20+n+8; binc = raw[b0:b0+struct.unpack('<I', raw[20+n:24+n])[0]]
    if extras: j['scenes'][j.get('scene', 0)].setdefault('extras', {}).update(extras)   # three: gltf.scene.userData
    acc, bvs = j['accessors'], j['bufferViews']
    if any(len(sk['joints']) > 255 for sk in j.get('skins', [])): return
    if len({a['bufferView'] for a in acc}) != len(acc): raise SystemExit('quantize_glb: accessors share buffer views')
    new = {}   # bufferView index -> (bytes, stride)
    def arr(a):
        v = bvs[a['bufferView']]; dt = {5126: np.float32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        k = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        return np.frombuffer(binc, dt, a['count']*k, v.get('byteOffset', 0)+a.get('byteOffset', 0)).reshape(-1, k)
    for m in j['meshes']:
        for pr in m['primitives']:
            ia = acc[pr['indices']] if 'indices' in pr else None
            if ia and ia['componentType'] == 5125 and ia['bufferView'] not in new:
                v = bvs[ia['bufferView']]; x = np.frombuffer(binc, np.uint32, ia['count'], v.get('byteOffset', 0)+ia.get('byteOffset', 0))
                if x.max() < 65535: new[ia['bufferView']] = (x.astype(np.uint16).tobytes(), None); ia['componentType'] = 5123
            at = pr['attributes']
            for key, i in at.items():
                a = acc[i]
                if a['bufferView'] in new or a['componentType'] != 5126 and key != 'JOINTS_0': continue
                x = arr(a)
                if key == 'JOINTS_0' and a['componentType'] == 5123:
                    new[a['bufferView']] = (x.astype(np.uint8).tobytes(), None); a['componentType'] = 5121
                elif key == 'WEIGHTS_0':
                    q = np.rint(x*255).astype(np.int32); big = q.argmax(1); q[np.arange(len(q)), big] += 255-q.sum(1)
                    new[a['bufferView']] = (np.clip(q, 0, 255).astype(np.uint8).tobytes(), None); a['componentType'] = 5121; a['normalized'] = True
                elif key == 'NORMAL':
                    q = np.zeros((len(x), 4), np.int8); q[:, :3] = np.clip(np.rint(x*127), -127, 127)
                    new[a['bufferView']] = (q.tobytes(), 4); a['componentType'] = 5120; a['normalized'] = True
                    a.pop('min', None); a.pop('max', None)
    out = bytearray()
    for vi, v in enumerate(bvs):
        data, stride = new.get(vi, (binc[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']], v.get('byteStride')))
        while len(out) % 4: out.append(0)
        v['byteOffset'] = len(out); v['byteLength'] = len(data); out += data
        if stride: v['byteStride'] = stride
    while len(out) % 4: out.append(0)
    j['buffers'][0]['byteLength'] = len(out)
    j.setdefault('extensionsUsed', []).append('KHR_mesh_quantization'); j.setdefault('extensionsRequired', []).append('KHR_mesh_quantization')
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' '*(-len(js) % 4)
    body = struct.pack('<II', len(js), 0x4E4F534A)+js+struct.pack('<II', len(out), 0x004E4942)+bytes(out)
    path.write_bytes(struct.pack('<III', 0x46546C67, 2, 12+len(body))+body)

def build(parts, out_name, light=False, rename=None, keep=None, animated=frozenset(), decimate=None, extras=None):
    """Cast models -> one engine GLB. parts[0] is the base; each later part's root bone is a bone of the same name
    in what's built so far and is merged into it (its other bones and its meshes follow it there).
    A part given as (name, 'base'|'var', head) is a swappable Gunsmith part (docs/fork/bo7-rips.md, Attachments):
    - 'base': the stock part, built as usual, but its vertices hang from hide bones (head on its root, head__<bone> on the
      others, identity children), so hiding `head` (b7_base_<slot>) takes the stock part off;
    - 'var': a variant part (a longer barrel, a drum mag). Every bone becomes head__<bone> (the root: head itself, on the
      attach tag); one the clips move (the mag's j_mag1) hangs from the real bone of that name so the variant follows the
      reload, the rest from the variant's own parents. Its tag_* bones under the attach tag are recorded as moves:
      the base tag goes where the variant has it (the muzzle on a longer barrel), applied in mounts.js syncTagGroups.
    Materials of these parts are named head~<material>, so a hidden part's meshes can stop drawing too."""
    bones, meshes, mats, mat_ix = [], [], [], {}
    index = {}
    moves, tag_rest = {}, {}
    def add_bone(name, parent, wp, wr):
        bones.append({'name': name, 'parent': parent, 'wpos': wp, 'wrot': wr / np.linalg.norm(wr)}); index[name] = len(bones)-1; return len(bones)-1
    def local(i, wp, wr):   # world -> local to bone i
        a = bones[i]; return qrot(qinv(a['wrot']), wp-a['wpos']), qmul(qinv(a['wrot']), wr)
    for pi, part in enumerate(parts):
        role = head = None
        if isinstance(part, tuple): part, role, head = part
        sk, ms, mt = load_model(part)
        if not sk: continue
        if pi == 0: xf_t, xf_q = np.zeros(3), np.array([0, 0, 0, 1.])
        else:
            root = sk[0]['name']
            if root not in index: print('  skip part', part, '(no bone', root+')'); continue
            a = bones[index[root]]
            ri = qinv(sk[0]['wr'])   # x' = A ∘ R⁻¹ (x)
            xf_q = qmul(a['wrot'], ri); xf_t = a['wpos'] - qrot(xf_q, sk[0]['wp']*CM)
        remap, wmap = [], {}
        for bi, b in enumerate(sk):
            wp = qrot(xf_q, b['wp']*CM) + xf_t; wr = qmul(xf_q, b['wr'])
            if role == 'var':
                if bi == 0: remap.append(add_bone(head, index[b['name']], wp, wr)); continue
                real = index.get(b['name'])
                if real is not None and b['name'].startswith('tag_') and bones[real]['parent'] == index[sk[0]['name']]:
                    att = index[sk[0]['name']]
                    moves.setdefault(head, {})[b['name']] = [round(float(x), 5) for x in (*local(att, wp, wr)[0], *local(att, wp, wr)[1])]
                    tag_rest[b['name']] = [round(float(x), 5) for x in (*local(att, bones[real]['wpos'], bones[real]['wrot'])[0], *local(att, bones[real]['wpos'], bones[real]['wrot'])[1])]
                par = real if (real is not None and b['name'] in animated) else remap[b['parent']]
                remap.append(add_bone(head+'__'+b['name'], par, wp, wr)); continue
            if b['name'] in index and (pi > 0): remap.append(index[b['name']]); continue
            par = remap[b['parent']] if b['parent'] >= 0 else -1
            remap.append(add_bone(b['name'], par, wp, wr))
        if role == 'base':   # an identity hide bone under every bone that carries the stock part's vertices
            used = {int(j) for m in ms if m['wb'] is not None for jj, ww in zip(m['wb'], m['wv']) for j, x in zip(jj, ww) if x > 1e-4} | {0}
            for j in sorted(used):
                r = bones[remap[j]]; wmap[j] = add_bone(head if j == 0 else head+'__'+sk[j]['name'], remap[j], r['wpos'], r['wrot'])
        wb_of = lambda j: wmap.get(j, remap[j])
        for h, m in mt.items():
            short = m['name'].replace('\\', '/').split('/')[-1]
            if (part, h) in mat_ix: continue
            if keep and not keep(short): mat_ix[(part, h)] = None; continue
            mat_ix[(part, h)] = len(mats)
            mats.append({'name': (head+'~'+short) if head else short, 'diffuse': short+'_c.png', 'normal': short+'_n.png'})
        for m in ms:
            mi = mat_ix.get((part, m['material']))
            if mi is None: continue
            pos = qrot(xf_q, m['vp']*CM) + xf_t
            nrm = qrot(xf_q, m['vn']) if m['vn'] is not None else None
            uv = m['uv'][0] if m['uv'] else np.zeros((len(pos), 2))
            if m['wb'] is not None:
                w = [[(wb_of(int(j)), float(x)) for j, x in zip(jj, ww) if x > 1e-4] or [(wb_of(0), 1.)] for jj, ww in zip(m['wb'], m['wv'])]
            else: w = [[(wb_of(0), 1.)]]*len(pos)
            fc = m['f']
            if decimate: pos, nrm, uv, w, fc = simplify(pos, None if nrm is None else np.asarray(nrm), np.asarray(uv), w, fc, decimate)
            # Cast stores triangles counter-clockwise (normals agree with the winding), but SEM.to_glb flips every face
            # for SEModel's clockwise CoD winding: pre-swap, or the gun is inside out (the far side's inside showed
            # through the near side, user 2026-11-24 "transparent when you look at them at front")
            fc = np.asarray(fc)[:, [0, 2, 1]]
            meshes.append({'pos': [tuple(p) for p in pos.tolist()], 'nrm': [tuple(n) for n in nrm.tolist()] if nrm is not None else None,
                           'uv': [[tuple(u)] for u in np.asarray(uv).tolist()], 'w': w,
                           'faces': [tuple(f) for f in np.asarray(fc).tolist()], 'mats': [mi]})
            if meshes[-1]['nrm'] is None: del meshes[-1]['nrm']
    sem = {'bones': [{'name': b['name'], 'parent': b['parent'], 'wpos': tuple(b['wpos']), 'wrot': tuple(b['wrot'])} for b in bones],
           'meshes': meshes, 'materials': mats}
    out = MOD/'models'/(out_name+'.glb'); out.parent.mkdir(parents=True, exist_ok=True)
    SEM.to_glb(sem, out, texture_loader=tex_loader(light), rename=rename)
    quantize_glb(out, extras)
    print('model', out.relative_to(MOD), f'{out.stat().st_size/1e6:.1f} MB', len(bones), 'bones', sum(len(m['pos']) for m in meshes), 'verts')
    rest = {}   # local rest position (inches) by (renamed) bone name, for the clips
    for i, b in enumerate(bones):
        if b['parent'] >= 0:
            p = bones[b['parent']]; lp = qrot(qinv(p['wrot']), b['wpos']-p['wpos'])
        else: lp = b['wpos']
        rest[(rename or {}).get(b['name'], b['name'])] = lp
    build.extra = {'moves': moves, 'tag_rest': tag_rest, 'bones': [b['name'] for b in bones]}
    return WEB+'models/'+str(out.relative_to(MOD/'models'))+ver(out), rest

# ---- animations ---------------------------------------------------------------------------------------
ARM_RENAME = {'j_gun': 'tag_weapon', 'tag_weapon_right': 'tag_weapon_right_iw', 'tag_weapon': 'tag_weapon_iw',
              'tag_weapon_left': 'tag_weapon1'}   # the left wrist's gun tag: where an akimbo pair's second gun hangs (animation.js)
# BO7 numbers finger joints 1..4 from the knuckle where BO1 uses 0..3 (its meta* joints are the extra bases): shifted so
# the operators' first-person arms (fp-arms.js) find BO1's names, as the BO3 import does
ARM_RENAME.update({f'j_{f}_{s}_{k}': f'j_{f}_{s}_{k-1}' for f in ['index', 'mid', 'ring', 'pinky', 'thumb'] for s in ['le', 'ri'] for k in (1, 2, 3, 4)})

def clip(name, arms_rest, gun_rest, loop=False, then=None, base=None, gun_rename=None, keep=None, write=True):
    """one clip; `then` appends a second clip after it (a pump or bolt gun's rechamber after its fire: the engine plays
    one fire clip a shot); `base` = a clip whose first frame this one is added onto (see below); gun_rename: the gun's
    bone names in the model the clip drives (an akimbo pair's left gun, bones suffixed _le); keep(name): which (output)
    bones stay; write=False: only return the data"""
    a = castlib.animation(EXP/'animations'/(name+'.cast'))
    fps = a['fps'] or 30
    by = {}
    for c in a['curves']: by.setdefault(c['bone'], {})[c['prop']] = c
    if base:
        # BO7's walk/sprint clips are offsets the game adds onto the idle pose: every arm bone and j_gun at identity, only
        # the clavicles and tag_weapon moving (a few degrees and inches), though Cast marks the rotations "absolute".
        # Played as poses they snapped the arms to bind and dropped the gun under the screen (user 2026-11-24: "sprint
        # anim is severely broken"). So each bone becomes base frame 0 rotated by the clip's rotation (local) and moved
        # by its offset; bones the clip lacks hold the base pose.
        # The loop is a small bob around the held sprint pose (sprint_offset_additive = walk_to_sprint's last frame =
        # sprint_to_walk's first), so it gets both: idle * sprint pose * bob. Bases apply innermost first.
        for bn in reversed([base] if isinstance(base, str) else base):
            b0 = castlib.animation(EXP/'animations'/(bn+'.cast'))
            for c in b0['curves']:
                v0 = np.asarray(c['values']).reshape(-1, 4 if c['prop'] == 'rq' else 1)[0]
                o = by.setdefault(c['bone'], {}).get(c['prop'])
                if o is None: by[c['bone']][c['prop']] = {**c, 'frames': np.asarray([0]), 'values': v0.copy()}; continue
                v = np.asarray(o['values']).reshape(-1, 4 if c['prop'] == 'rq' else 1)
                v = np.stack([qmul(v0, q) for q in v]) if c['prop'] == 'rq' else v+v0
                by[c['bone']][c['prop']] = {**o, 'mode': c['mode'], 'values': v.reshape(-1)}
    m = __import__('re').match(r'(sat_vm_[a-z]+_[a-z0-9]+_)', name)
    if not __import__('os').environ.get('NOFILL') and not base and not keep and not gun_rename and m and name != m[1]+'idle' and (EXP/'animations'/(m[1]+'idle.cast')).exists():
        # bones the clip doesn't key at all hold the idle pose: the AAROW's, CBRS-3's and Ryden's fire, the TR51's raise etc. leave out j_gun
        # (child of the right wrist), which then sat at its bind far off screen (the launcher vanished on every shot)
        for c in castlib.animation(EXP/'animations'/(m[1]+'idle.cast'))['curves']:
            if c['bone'] != 'j_gun' or (c['bone'] in by and not by[c['bone']].get('_fill')): continue   # only j_gun: filling every idle bone left the whole rig at its bind (2026-11-24)
            v0 = np.asarray(c['values']).reshape(-1, 4 if c['prop'] == 'rq' else 1)[0]
            by.setdefault(c['bone'], {'_fill': True})[c['prop']] = {**c, 'frames': np.asarray([0]), 'values': v0.copy()}
        for cs in by.values(): cs.pop('_fill', None)
    if then:
        b2 = castlib.animation(EXP/'animations'/(then+'.cast')); off = max(int(c['frames'][-1]) for c in a['curves'] if len(c['frames']))+1
        k2 = fps/(b2['fps'] or 30)   # fire clips are 60 fps, rechambers 30: joined unscaled, the rechamber ran at double speed (2026-11-24)
        a['notes'] = list(a['notes'])+[(n, f*k2+off) for n, f in b2['notes']]
        for c in b2['curves']:
            o = by.setdefault(c['bone'], {}).get(c['prop'])
            fr = np.asarray(c['frames'])*k2+off
            if o is None: by[c['bone']][c['prop']] = {**c, 'frames': fr}; continue
            by[c['bone']][c['prop']] = {**o, 'frames': np.concatenate([np.asarray(o['frames']), fr]),
                                        'values': np.concatenate([np.asarray(o['values']).reshape(-1), np.asarray(c['values']).reshape(-1)])}
        name = name+'+rechamber'
    out, last, modes = [], 0, {}
    for bone, cs in by.items():
        if bone in ('tag_origin', 'tag_sync'): continue
        nm = ARM_RENAME.get(bone, bone)
        arm = nm in arms_rest
        if not arm: nm = (gun_rename or {}).get(bone, bone)
        if not arm and nm not in gun_rest: continue
        if keep and not keep(nm): continue
        rest = arms_rest[nm] if arm else gun_rest[nm]
        b = {'name': nm, 'rot': None, 'pos': None}
        if 'rq' in cs:
            c = cs['rq']; modes[c['mode']] = modes.get(c['mode'], 0)+1
            v = c['values'].reshape(-1, 4)
            b['rot'] = {'frames': [int(f) for f in c['frames']], 'values': [round(float(x), 5) for x in v.reshape(-1)]}
            last = max(last, int(c['frames'][-1]))
        tc = [cs.get(k) for k in ('tx', 'ty', 'tz')]
        if any(tc):
            frames = sorted({int(f) for c in tc if c is not None for f in c['frames']})
            vals = np.zeros((len(frames), 3))
            for k, c in enumerate(tc):
                rel = c is None or c['mode'] != 'absolute'
                if c is not None: modes[c['mode']] = modes.get(c['mode'], 0)+1
                x = np.interp(frames, c['frames'], c['values'].reshape(-1))*CM if c is not None else np.zeros(len(frames))
                # arms: absolute local positions; gun parts: offsets from the part's bind
                if arm and rel: x = x + rest[k]
                if not arm and not rel: x = x - rest[k]
                vals[:, k] = x
            b['pos'] = {'frames': frames, 'values': [round(float(x), 4) for x in vals.reshape(-1)]}
            last = max(last, frames[-1])
        if b['rot'] or b['pos']: out.append(b)
    dur = max(last, 1)/fps
    data = {'name': name, 'fps': fps, 'loop': loop, 'duration': round(dur, 4),
            'notifies': [{'name': n, 'time': round(f/fps, 4)} for n, f in a['notes']], 'bones': out}
    if set(modes) - {'relative', 'absolute'}: print('  ', name, 'curve modes', modes)
    return write_clip(data) if write else (None, data)

def write_clip(data):
    p = MOD/'animations'/(data['name'].replace('+', '_')+'.json'); p.write_text(json.dumps(data, separators=(',', ':')))
    return WEB+'animations/'+p.name+ver(p), data

# ---- sounds -------------------------------------------------------------------------------------------
def ogg(srcs, out, gains=None, force=False):
    """one or more WAVs (layered) -> ogg"""
    out.parent.mkdir(parents=True, exist_ok=True)
    if force or not out.exists():
        cmd = ['ffmpeg', '-loglevel', 'error', '-y']
        for s in srcs: cmd += ['-i', str(s)]
        if len(srcs) > 1:
            g = gains or [1]*len(srcs)
            f = ''.join(f'[{i}:a]volume={g[i]}[a{i}];' for i in range(len(srcs)))+''.join(f'[a{i}]' for i in range(len(srcs)))+f'amix=inputs={len(srcs)}:normalize=0:duration=longest'
            cmd += ['-filter_complex', f]
        cmd += ['-ac', '2', '-c:a', 'libvorbis', '-q:a', '5', str(out)]
        subprocess.run(cmd, check=True)
    return WEB+str(out.relative_to(MOD))

SND_NAME = {'serval': 'orca', 'knife': 'combat_knife', 'shockbaton': 'shock_baton', 'ballisticknife': 'ballistic_knife'}   # the Gremlin's bank names its shots after its internal codename
def bank(cls, gun):
    p = EXP/'sndbanks'/'csv'/f'weapon_sat_{cls}_{gun}_plr.all.csv'
    if not p.exists(): p = EXP/'sndbanks'/'csv'/f'weapon_sat_{gun}_plr.all.csv'   # the NX Ravager's bank leaves out the class
    if not p.exists(): p = EXP/'sndbanks'/'csv'/f'weapon_sat_{cls}_{SND_NAME.get(gun, gun)}.all.csv'   # melees: no _plr
    rows = {}
    if p.exists():
        for r in csv.DictReader(p.open()): rows.setdefault(r['name'], []).append(EXP/'sounds'/(r['file']+'.wav'))
    return rows

# ---- guns ---------------------------------------------------------------------------------------------
NAMES = json.loads((PIPE/'dumps'/'names.json').read_text()) if (PIPE/'dumps'/'names.json').exists() else {}
# ---- guns: every BO7 gun with a full rip (viewmodel, idle, sound bank), from the dumps -------------------------------
# Stats: BO7's own clip, ammo and fire time (dumps/weapons.json); damage on BO1 zombies' scale per class, scaled by the
# fire time against the class's reference (slower guns hit harder). Pack-a-Punch: x1.5 clip, x1.33 ammo, class damage.
# CLS: weaponClass (weapon-levels camo.js CLASSES), damage, min damage, range, head multiplier, reference fire time,
# Pack-a-Punch damage and min damage, pellets, price, hip view offset (right, up, back; gone in ADS)
CLS = {
    'ar': ('Rifle', 110, 80, 1600, 4, .088, 180, 130, 1, 1500, [2, -.5, -7]),
    'sm': ('Submachine gun', 95, 60, 900, 4, .07, 150, 100, 1, 1200, [2, -.5, -7]),
    'lm': ('Light machine gun', 130, 95, 1400, 3, .1, 190, 140, 1, 2000, [2, -.5, -7]),
    'dm': ('Rifle', 200, 160, 2400, 4, .12, 320, 260, 1, 1500, [2, -.5, -7]),
    'sn': ('Sniper rifle', 600, 600, 4000, 8, .3, 1200, 1200, 1, 2000, [2, -.5, -7]),
    'sh': ('Shotgun', 160, 15, 300, 1, .28, 300, 30, 8, 1500, [2, -.5, -7]),
    'pi': ('Pistol', 120, 80, 700, 3.5, .12, 260, 180, 1, 500, [1.5, -.5, -5]),
    'la': ('Launcher', 1500, 0, 8000, 1, .4, 2500, 0, 1, 2000, [2, -.5, -7]),   # direct-hit damage; the blast is in PROJ
    'sl': ('Special', 1200, 1200, 8000, 2, .33, 2400, 2400, 1, 1500, [2, -.5, -7]),
}
# launchers and the crossbow fire the engine's projectiles (kino-features.js shoot: rocket flies straight, grenade arcs, a bolt
# sticks and bursts after fuseTime). BO7's own projectile models weren't ripped: BO1's rocket, grenade and bolt.
# maxAmmo is raised from the multiplayer dump's (8 rockets) to zombies numbers.
# Guns that rechamber every few shots (bo7-rips mod.js): the Echo 12 is a double barrel that pumps after both barrels,
# the CBRS-3 turns its 60-round helical mag every third of it (rechamberParts: clip/parts, so the Mk II's 90 turn at 30)
RECHAMBER = {'husky': {'rechamberEvery': 2}, 'marmot': {'rechamberParts': 3}}

PROJ_CLS = {'la', 'sl'}
PROJ = {
    'fang': ({'projectileType': 'rocket', 'projectileSpeed': 2500, 'projectileModel': 'models/projectile_at4.glb', 'projectileLifetime': 7,
              'explosionRadius': 240, 'explosionInnerDamage': 900, 'explosionOuterDamage': 150, 'maxAmmo': 16, 'startAmmo': 10},
             {'explosionRadius': 300, 'explosionInnerDamage': 2200, 'explosionOuterDamage': 400, 'maxAmmo': 24, 'startAmmo': 24, 'clipSize': 2}),
    'polis': ({'projectileType': 'grenade', 'fireTime': .5, 'projectileSpeed': 2400, 'projectileSpeedUp': 10, 'projectileModel': 'models/projectile_m203grenade.glb',
               'projectileLifetime': 30, 'explosionRadius': 200, 'explosionInnerDamage': 600, 'explosionOuterDamage': 90, 'maxAmmo': 24, 'startAmmo': 15},
              {'fireTime': .45, 'explosionRadius': 250, 'explosionInnerDamage': 1400, 'explosionOuterDamage': 220, 'maxAmmo': 36, 'startAmmo': 36, 'clipSize': 5}),
    'crossbow': ({'projectileType': 'bolt', 'projectileSpeed': 4180, 'projectileSpeedUp': 90, 'projectileModel': 'models/t5_weapon_crossbow_bolt.glb',
                  'projectileLifetime': 30, 'fuseTime': 1.5, 'explosionRadius': 160, 'explosionInnerDamage': 400, 'explosionOuterDamage': 75, 'maxAmmo': 24, 'startAmmo': 15},
                 {'explosionRadius': 230, 'explosionInnerDamage': 1100, 'explosionOuterDamage': 200, 'maxAmmo': 36, 'startAmmo': 36, 'clipSize': 3}),
}
EXTRA_PARTS = {'polis': ['scope'], 'crossbow': ['reflex']}   # their stock sights are separate models
BURST_DM = (120, 90, 200, 150)   # the burst marksman rifles: per shot
AUTO = {'ar', 'sm', 'lm'}; AUTO_GUNS = {'atlas', 'akita'}   # the CODA 9 is a machine pistol, the Akita an auto shotgun
SEMI_GUNS = {'emu'}   # the TR51 Para is semi-auto (full auto only with its Fallen Angel barrel); the dump's firetype is empty
BURST_DELAY = .12   # pause after a burst before the next one may start (the M8A1's 'moderate burst cooldown', ~0.12 s)
TWINS = {'zeus', 'atria', 'carina', 'nembus', 'sargas'}   # already in the fork as Blender rebuilds (mods/bo7-weapons, weapons.md)
UP = {   # Pack-a-Punch names (the fork's own)
    'albatross': 'Actuated Neutralizer 94000', 'condor': 'Peacemaker Mk Infinity', 'egret': 'Egret Eradicator', 'emu': 'Paranormal TR-5100',
    'falcon': 'X9 Renegade', 'finch': 'Insidious Singing Reaper', 'hawk': 'M15 MOD 115', 'heron': 'Voyak Kill-Tank', 'kite': 'Kronos Reaper',
    'kiwi': 'VX Compacted Carnage', 'macaw': 'Madhouse RFB', 'vulture': 'DS20 Oasis of Ash', 'wren': 'Fallschirmgeist 420',
    'kara': 'Supernovaline', 'samar': 'KRS-115 Kreuzer', 'scotia': 'M8A1 Mauler', 'solomon': 'Sawfish Abyssal',
    'hades': 'MK.78 Underworld', 'hildr': 'Woolly Ruin', 'typhon': 'Sokol Stormcrow',
    'alcor': '1911 Last Rites', 'atlas': 'CODA Requiem', 'orion': 'Velox Velocirapture', 'timir': 'Jagermeister 450',
    'akita': "Hachiko's Howl", 'corso': 'M10 Bonebreaker', 'husky': 'Echo Chamber', 'shepherd': 'Good Shepherd',
    'bear': 'VST Grizzly Maul', 'bengal': 'Sturmwolf Rudelfuhrer', 'civet': 'Very Mean Person', 'cobra': 'King Cobra-25',
    'gecko': 'REV-46 Revenant', 'hyena': 'Kogot Cackler', 'komodo': 'Razorback Dragon', 'marmot': 'Groundhog Doomsday',
    'orca': 'Ryden Leviathan', 'puma': 'Carbon Copy Killer', 'zebra': 'Dravec Stampede',
    'aden': 'Hawker Hellfire', 'baltic': 'XR-3 Ionic Storm', 'caspian': 'Shadow Soul Keeper', 'coral': 'Strider 3000', 'drake': 'VS Reckoning',
    'eagle': 'MXR-17 Raptor Talon', 'oman': 'Warden of the Grave', 'otter': 'RK-9 Riverkiller', 'serval': 'Gremlin Gang'}
VIEW = {}   # per-gun hip view offsets, where the class's doesn't fit (tuned in Sandbox)
WDUMP = json.loads((PIPE/'dumps'/'weapons.json').read_text()) if (PIPE/'dumps'/'weapons.json').exists() else {}

def gun_table():
    out = {}
    for gid in sorted(json.loads((PIPE/'dumps'/'gunsmith.json').read_text())):
        _, c, *rest = gid.split('_'); g = '_'.join(rest[:-1] if rest[-1] in ('mp', 'zm') else rest)
        if c not in CLS or g in TWINS or g.endswith('exotic'): continue
        pre = f'sat_vm_{c}_{g}_'
        # pair_only: the Gremlin has only akimbo clips (it is always two guns in BO7): its def is the pair (build_akimbo)
        pair_only = not (EXP/'animations'/(pre+'idle.cast')).exists() and (EXP/'animations'/(pre+'akimbo_r_idle.cast')).exists()
        if not (model_dir(pre+'rec').is_dir() and ((EXP/'animations'/(pre+'idle.cast')).exists() or pair_only)
                and bank(c, g)): continue
        f = (WDUMP.get(gid) or {}).get('fields', {})
        if f.get('type') != ('projectile' if c in PROJ_CLS else 'bullet'): continue
        num = lambda k, d: float(f[k]) if f.get(k) not in (None, '-') else d
        wc, dmg, mn, rng, head, ref, udmg, umn, pel, price, view = CLS[c]
        ft, burst = num('firetime', ref), int(num('burstcount', 0))
        fire = f'{burst}-Round Burst' if burst >= 2 else 'Full Auto' if (c in AUTO or g in AUTO_GUNS) and g not in SEMI_GUNS else 'Single Shot'
        if c == 'dm' and burst >= 2: dmg, mn, udmg, umn = BURST_DM
        k = min(1.6, max(.75, (ft/ref)**.7))
        clip_, mx = int(num('clipsize', 30)), int(num('maxammo', 270))
        st = {'clipSize': clip_, 'startAmmo': int(num('startammo', mx*.75)), 'maxAmmo': mx, 'damage': round(dmg*k), 'minDamage': round(mn*k),
              'range': rng, 'fireTime': ft, 'headMultiplier': head, 'pellets': pel, 'fireType': fire, 'automatic': fire == 'Full Auto', **({'burstCount': burst, 'burstDelay': BURST_DELAY} if burst >= 2 else {})}
        uclip = round(clip_*1.5) if clip_ > 2 else clip_
        up = {'clipSize': uclip, 'maxAmmo': round(mx*1.33), 'startAmmo': round(mx*1.33), 'damage': round(udmg*k), 'minDamage': round(umn*k), 'headMultiplier': head+1}
        if g in PROJ: st.update(PROJ[g][0]); up.update(PROJ[g][1])
        out[g] = {'name': NAMES.get(gid, {}).get('name') or g, 'up': UP.get(g, (NAMES.get(gid, {}).get('name') or g)+' Mk II'), 'cls': c,
                  'wclass': wc, 'price': price, 'view': VIEW.get(g, view), 'stats': st, 'up_stats': up, 'pair_only': pair_only}
    return out
GUN = gun_table()
ROLES = [('idleAnim', 'idle', True), ('fireAnim', 'fire', False), ('lastShotAnim', 'fire_last', False), ('adsFireAnim', 'fire_ads', False),
         ('adsLastShotAnim', 'fire_last_ads', False), ('reloadAnim', 'reload', False), ('reloadEmptyAnim', 'reload_empty', False),
         ('raiseAnim', 'raise', False), ('firstRaiseAnim', 'raise_first', False), ('quickRaiseAnim', 'raise_quick', False),
         ('dropAnim', 'drop', False), ('quickDropAnim', 'drop_quick', False), ('adsUpAnim', 'ads_up', False), ('adsDownAnim', 'ads_down', False),
         ('sprintInAnim', 'walk_to_sprint', False), ('sprintLoopAnim', 'sprint_loop', True), ('sprintOutAnim', 'sprint_to_walk', False),
         ('inspectAnim', 'inspect', False)]

# ---- Gunsmith attachments (docs/fork/bo7-rips.md, Attachments) ----------------------------------------------------
# A gun's list is <pipeline>/dumps/gunsmith.json (refs like sat_mag_extmag_ar_kite, class optics like sat_reflex01_ar),
# in its BO7 unlock order from dumps/unlocks.json. The kinds map onto part models (mined from the blueprint names
# sat_vm_<cls>_<gun>_<slot>_<kind>_<skin>_sat_vm_<cls>_<gun>_<part>, consistent across guns): candidates in order,
# one not yet used by another kind of the same slot first. Catalogue ids: b7_<slot>_<kind> (attachments.json).
PART_SLOT = {'bar': ('bar', 'barrel'), 'mag': ('mag', 'mag'), 'grip': ('pgrip', 'grip'), 'stock': ('stock', 'stock')}
PART = {
    'bar': {'velocity': ['bar_long', 'bar_velocity'], 'jump': ['bar_short', 'bar_jump'], 'range': ['bar_xlong', 'bar_range', 'bar_long'],
            'highcal': ['bar_heavy', 'bar_hvy', 'bar_highcal'], 'mixbarrel': ['bar_med', 'bar_mix', 'bar_mixbarrel'], 'sprintout': ['bar_short']},
    'mag': {'extmag': ['mag_lrg', 'mag_large', 'mag_ext', 'ext_mag'], 'extmag2': ['mag_xlrg', 'mag_drum', 'mag_xlong', 'mag_xlarge'],
            'fastmag': ['mag_fast', 'mag_short', 'mag_flip'], 'flipmag': ['mag_flip', 'mag_fast', 'mag_short'], 'fastmag2': ['mag_fast2', 'mag_short', 'mag_flip']},
    'grip': {'mixgrip': ['pgrip_light'], 'quickdraw': ['pgrip_quick'], 'quickdraw2': ['pgrip_tac'], 'sprintout': ['pgrip_cqb'], 'sprintout2': ['pgrip_rcvr']},
    'stock': {'adsmove': ['stock_tac'], 'flinch': ['stock_heavy'], 'hipfiremove': ['stock_light'], 'mixstock': ['stock_skel', 'stock_full'], 'mixstock2': ['stock_full', 'stock_skel']},
}
CALS = ['556n', '762n', '762s', '45cal', '9x21', '5x28']
MUZZLE = {'suppressor': ['suppressor_{c}_01', 'suppressor_{c}', 'suppressor_{c}_02'], 'comp': ['comp_{c}_01', 'comp_{c}'], 'brake': ['brake_{c}_01', 'brake_{c}'],
          'mixmuzzle': ['mix_{c}_01', 'mix_{c}'], 'mono_suppressor': ['suppressor_mono']}
LASER = {'focuslaser': 'laser_cyl_01', 'hipaccuracy': 'laser_box_02', 'strelok': 'laser_box_03', 'mixlaser': 'laser_cyl_02', 'mixlaser2': 'laser_box_04'}
UNDER = {'recoil': 'grip_vert_recoil_01', 'sway': 'grip_angled_02', 'focus': 'grip_vert_short_01', 'mixunder': 'grip_angled_short_01', 'mixunder2': 'grip_vert_03'}
OPTIC_MODEL = {'holo_range01': 'optic_holorange_01', 'thermal01': 'optic_thermal_01', 'thermal_holo01': 'optic_thermal_holo_01', 'thermal_scope01': 'optic_thermal_sniper_01',
               'scope_snpr01': 'optic_snprscope_01', 'dualzoom01': 'optic_dualzoom_01', 'targetfinder01': 'optic_target_finder', 'rangefinder01': 'optic_rangefinder_01',
               'mm_scanner01': 'optic_mms_01', 'microreflex03': 'optic_elo'}
OPTIC_TAG = {'tag_reflex', 'tag_holo', 'tag_acog_2', 'tag_scope', 'tag_scope2', 'tag_thermal', 'tag_hybrid'}
GUNSMITH = json.loads((PIPE/'dumps'/'gunsmith.json').read_text()) if (PIPE/'dumps'/'gunsmith.json').exists() else {}
UNLOCKS = json.loads((PIPE/'dumps'/'unlocks.json').read_text()) if (PIPE/'dumps'/'unlocks.json').exists() else {}
MAX_OPTICS = 6

def optic_model(ref):
    if ref in OPTIC_MODEL: return OPTIC_MODEL[ref]
    import re; m = re.fullmatch(r'([a-z_]+?)(\d\d)', ref)
    if not m: return None
    fam = {'varizoom': 'variablezoom'}.get(m.group(1), m.group(1))
    return f'optic_{fam}_{m.group(2)}'

def has_model(n): d = model_dir(n); return (d/(d.name+'_LOD0.cast')).exists()

def mount_glb(model):
    """a shared attachment model (optic, muzzle, laser, foregrip): built once into models/att/, its root bone sits on the tag"""
    out = MOD/'models'/'att'/(model+'.glb')
    if out.exists() and '--force' not in sys.argv: url = WEB+'models/att/'+out.name+ver(out)
    else: url, _ = build(['sat_vm_'+model], 'att/'+model)
    sk, _, _ = load_model('sat_vm_'+model)
    return url, sk[0]['name']

# ---- Underbarrel grenade launchers (docs/fork/bo7-rips.md, Underbarrel launchers) ------------------------------------
# BO7 has four (sat_ub_gl_<kind>): Standard ("40mm Grenades"), High Explosive ("40mm Fuse Grenades"), Drill Charge and
# Smoke. One launcher model (sat_vm_ub_gl_01, its root on the barrel's tag_grenade_launcher) goes into the gun's own model
# as a hidden part (head b7_ubgl, shown by any of the four), so the gun's ubgl_* clips move its grenade and lever. The
# launcher is a second form like the AW Energy Launcher (gunsmith.js energyLauncher, key 5): ubgl_to_grenade plays into
# it, ubgl_from_grenade back. What each kind fires is our own pick (no launcher data in the dumps); `upgrade` applies on a
# Pack-a-Punched gun.
UBGL = {}   # g: [kinds] (filled by gun_attachments)
UBGL_KIND = {
    'std': {'name': 'Grenade Launcher', 'damage': 300, 'explosionRadius': 300, 'explosionInnerDamage': 600, 'explosionOuterDamage': 100,
            'upgrade': {'explosionRadius': 340, 'explosionInnerDamage': 1300, 'explosionOuterDamage': 220}},
    'he': {'name': 'HE Launcher', 'damage': 250, 'explosionRadius': 400, 'explosionInnerDamage': 850, 'explosionOuterDamage': 160,
           'upgrade': {'explosionRadius': 440, 'explosionInnerDamage': 1800, 'explosionOuterDamage': 340}},
    'dc': {'name': 'Drill Charge Launcher', 'projectileType': 'bolt', 'fuseTime': 1.0, 'damage': 200, 'explosionRadius': 220,
           'explosionInnerDamage': 1500, 'explosionOuterDamage': 250, 'upgrade': {'explosionInnerDamage': 3200, 'explosionOuterDamage': 500, 'fuseTime': .7}},
    'smoke': {'name': 'Smoke Launcher', 'damage': 60, 'explosionRadius': 10, 'explosionInnerDamage': 0, 'explosionOuterDamage': 0,
              'smokeLauncher': 1, 'noSelfSplash': True, 'upgrade': {'smokeLauncher': 1.3}},
}
UBGL_ROLES = [('idleAnim', 'idle', True), ('fireAnim', 'fire', False), ('reloadAnim', 'reload', False), ('adsReloadAnim', 'reload_ads', False),
              ('raiseAnim', 'raise', False), ('quickRaiseAnim', 'raise_quick', False), ('dropAnim', 'drop', False), ('quickDropAnim', 'drop_quick', False),
              ('inspectAnim', 'inspect', False), ('attachInAnim', 'to_grenade', False)]
UBGL_SND = EXP/'sounds'/'sat'/'wpn'/'ar'/'vulture'/'ubgl'   # the DS20 Mirage's built-in launcher: the only launcher shots in the rips

def ubgl_sounds(c, g, notes):
    """the launcher form's sounds: shared shots (shot + mechanism + low end) and the gun's own ubgl foley"""
    shot, mech, lfe = (sorted(UBGL_SND.glob(f'wpn_ar_vulture_ubgl_{k}*.wav')) for k in ('shot_', 'mech_', 'lfe'))
    S = {'shots': [ogg([f]+([mech[i % len(mech)]] if mech else [])+lfe[:1], MOD/'audio'/'ubgl'/f'shot_{i}.ogg', [1, .8, .7][:1+bool(mech)]+[.7]) for i, f in enumerate(shot)],
         'last': [], 'notes': {}}
    B = bank(c, g)
    for n in sorted(notes):
        if '@' not in n: continue
        files = [f for f in B.get(n.split('@', 1)[1], []) if f.exists()]
        if files: S['notes'][n] = [ogg([f], MOD/'audio'/g/'foley'/(f.name.split('.')[0]+'.ogg')) for f in files]
    print(f'  {g}: launcher {len(S["shots"])} shots, {len(S["notes"])} foley notes')
    return S

def ubgl_form(g, pre, gun_rest, notes):
    """-> the gun's attachAnims for its launchers ({att id: {animations (the gun's way out), alt (the launcher form)}})"""
    LA, LT, unotes = {}, {}, set()
    for role, nm, loop in UBGL_ROLES:
        if (EXP/'animations'/(pre+'ubgl_'+nm+'.cast')).exists():
            LA[role], d = clip(pre+'ubgl_'+nm, arms_rest, gun_rest, loop); LT[role] = d['duration']; unotes |= {n['name'] for n in d['notifies']}
    for k, v in (('emptyIdleAnim', 'idleAnim'), ('adsFireAnim', 'fireAnim'), ('lastShotAnim', 'fireAnim'), ('adsLastShotAnim', 'fireAnim'),
                 ('reloadEmptyAnim', 'reloadAnim'), ('firstRaiseAnim', 'raiseAnim')):
        if v in LA: LA.setdefault(k, LA[v])
    GA = {}
    if (EXP/'animations'/(pre+'ubgl_from_grenade.cast')).exists():
        GA['attachOutAnim'], d = clip(pre+'ubgl_from_grenade', arms_rest, gun_rest); notes |= {n['name'] for n in d['notifies']}
    sounds['bo7_'+g+'_ubgl'] = ubgl_sounds(GUN[g]['cls'], g, unotes)
    times = {'raiseTime': LT.get('raiseAnim', .6), 'dropTime': LT.get('dropAnim', .5), 'inspectTime': LT.get('inspectAnim'),
             'reloadTime': round(LT.get('reloadAnim', 2.5)*.85, 3), 'reloadEmptyTime': round(LT.get('reloadAnim', 2.5)*.85, 3)}
    off = {'ownSprint': False, 'burstCount': 0, 'burstDelay': 0, 'rechamberEvery': 0, 'rechamberParts': 0, 'bo7Sounds': 'bo7_'+g+'_ubgl'}
    return {'b7_ub_gl_'+k: {'animations': GA, 'alt': {'animations': LA, **times, **off, 'id': f'bo7_ubgl_{k}', **UBGL_KIND[k]}} for k in UBGL.get(g, [])}

MOUNT_ALT = {'tag_grip_attach': ['tag_underbarrel_attach'], 'tag_folding_grip': ['tag_underbarrel_attach'], 'tag_laser_attach': ['tag_laser_attach2']}

def gun_attachments(g, c, gid, bones, part_dir):
    """-> (variants [(part model, 'var', head)], mounts {att id: {model, tag}}, stat ids, order [att ids])"""
    refs = GUNSMITH.get(gid, [])
    order_refs = [u.get('ref') for u in UNLOCKS.get(gid, [])]
    refs = sorted(refs, key=lambda r: order_refs.index(r) if r in order_refs else 999)
    tail = f'_{c}_{g}'
    cal = next((r.split('_')[2] for r in refs if r.startswith('sat_ammo_')), None)
    variants, mounts, stat, order, used, optics = [], {}, [], [], {}, 0
    for r in refs:
        if r.endswith(tail):
            sk = r[4:-len(tail)]; slot, _, kind = sk.partition('_')
            if slot == 'ammo':
                kind = kind.split('_', 1)[1]; aid = f'b7_ammo_{kind}'
                if kind in ('fmj', 'velocity', 'db', 'slug', 'short'): stat.append(aid); order.append(aid)   # db = Dragon's Breath
                continue
            if slot == 'firemod':   # fire mods: stats/behaviour only (attachments.json b7_firemod_*), no model
                aid = 'b7_firemod_'+kind.split('_')[0]; stat.append(aid); order.append(aid); continue
            if slot in PART:
                if kind == 'akimbo': order.append('akimbo'); continue   # a second gun: its own pair def (build_akimbo)
                aid = f'b7_{PART_SLOT[slot][1]}_{kind}'
                cands = [x for x in PART[slot].get(kind, []) if model_dir(f'sat_vm_{c}_{g}_'+x).is_dir()]
                spare = sorted(p.name[len(f'sat_vm_{c}_{g}_'):] for p in part_dir.glob(f'sat_vm_{c}_{g}_{PART_SLOT[slot][0]}_*')
                               if '_sat_vm_' not in p.name and has_model(p.name) and p.name.count('_') == len(f'sat_vm_{c}_{g}_{PART_SLOT[slot][0]}_x'.split('_'))-1)
                taken = used.setdefault(slot, set())
                pick = next((x for x in cands if x not in taken), None) or next((x for x in spare if x not in taken and not x.endswith('_bone')), None) or (cands[0] if cands else None)
                if not pick: stat.append(aid); order.append(aid); print('   ', aid, 'no model: stats only'); continue
                taken.add(pick); variants.append((f'sat_vm_{c}_{g}_'+pick, 'var', aid)); order.append(aid); continue
            model = None
            if slot == 'muzzle':
                for cc in ([cal] if cal else [])+CALS:
                    model = next(('muzzle_'+x.format(c=cc) for x in MUZZLE.get(kind, []) if has_model('sat_vm_muzzle_'+x.format(c=cc))), None)
                    if model: break
            elif slot == 'laser': model = LASER.get(kind)
            elif slot == 'underbarrel': model = UNDER.get(kind); slot = 'under'
            elif slot == 'ub' and kind == 'crossbar': model = 'ub_crossbar_01'; slot = 'under'
            elif slot == 'ub' and kind.startswith('gl_'):   # the underbarrel launchers: a part of the gun's model + a second form (UBGL)
                aid = f'b7_ub_{kind}'
                if (EXP/'animations'/f'sat_vm_{c}_{g}_ubgl_idle.cast').exists() and 'tag_grenade_launcher' in bones:
                    UBGL.setdefault(g, []).append(kind[3:]); order.append(aid)
                else: print('   ', aid, 'no launcher clips or tag: left out')
                continue
            else: continue
            if not model or not has_model('sat_vm_'+model): print('   ', slot, kind, 'no model'); continue
            aid = f'b7_{slot}_{kind}'; url, tag = mount_glb(model)
            if tag not in bones:   # the snipers name their grip point tag_underbarrel_attach; a gun with no laser point keeps the stats
                tag = next((t for t in MOUNT_ALT.get(tag, []) if t in bones), None)
                if not tag: stat.append(aid); order.append(aid); print('   ', aid, 'no tag on this gun: stats only'); continue
            mounts[aid] = {'model': url, 'tag': tag}; order.append(aid)
        elif r.startswith('sat_') and r.count('_') >= 2 and r.rsplit('_', 1)[0] != 'sat':
            ref = r[4:].rsplit('_', 1)[0]; model = optic_model(ref)
            if not model or not has_model('sat_vm_'+model) or optics >= MAX_OPTICS: continue
            aid = 'b7_optic_'+ref; url, tag = mount_glb(model)
            if tag not in bones: tag = 'tag_reflex'
            mounts[aid] = {'model': url, 'tag': tag}; order.append(aid); optics += 1
    for aid in KITS.get(g, []): stat.append(aid); order.append(aid)
    return variants, mounts, stat, order

# behaviour kits the rips have no unlock for (attachments.json): the Echo 12's Backlash Launcher Kit
KITS = {'husky': ['b7_kit_backlash']}

def animated_bones(pre):
    """bone names any of the gun's clips move (a variant's bone of that name hangs from the real one)"""
    out = set()
    for _, nm, _ in ROLES:
        f = EXP/'animations'/(pre+nm+'.cast')
        if f.exists(): out |= {cc['bone'] for cc in castlib.animation(f)['curves']}
    return frozenset(out)

hands_url, arms_rest = build(['viewhands_base_iw8'], 'bo7_viewhands', rename=ARM_RENAME) if '--sounds' not in sys.argv else (None, None)
# the left arm (everything under j_clavicle_le, by the names the clips use): an akimbo pair's left clips drive only these
_hsk = load_model('viewhands_base_iw8')[0]
def _under(i, top): return i >= 0 and (_hsk[i]['name'] == top or _under(_hsk[i]['parent'], top))
LEFT_ARM = frozenset(ARM_RENAME.get(b['name'], b['name']) for i, b in enumerate(_hsk) if _under(i, 'j_clavicle_le'))
weapons, sounds = {}, {}
if GUNS == ['all']: GUNS = list(GUN)
old = MOD/'weapons.json'   # a run with some guns keeps the others already built
if old.exists():
    o = json.loads(old.read_text()); weapons.update(o.get('weapons', {})); sounds.update(o.get('sounds', {}))
# raise_first's markers are only numbered (fly_plr_<cls>_<gun>_raise_first_01..) and no bank lists them, but the gun's
# folder has one named WAV per marker (wfoly_plr_..._raise_first_<action>): sorted by where the action falls in the
# motion, they go to the markers in turn ("end" on the last). Variants (akimbo, optics, extended mags, belt) are left out.
RAISE_ORDER = ['start', 'raise', 'up', 'lift', 'mvmt', 'mvmnt', 'shoulder', 'tilt', 'rotate', 'dip', 'dropgrab', 'grab', 'grabhandle',
               'grabbarrel', 'boltgrab', 'foregrip', 'arm', 'chambercheck', 'chamberopen', 'boltopen', 'boltback', 'pullbolt', 'slideback',
               'bolt', 'chargebolt', 'charge', 'magslide', 'magin', 'maghit', 'rattle', 'rattle1', 'rattle2', 'linkaway', 'hitbody',
               'boltrelease', 'slideforward', 'boltclose', 'close', 'closed', 'chamberclosed', 'letgo', 'regrip', 'drop', 'lower', 'end']
def raise_first_files(c, g, markers):
    fs = {}
    for f in (EXP/'sounds'/'sat'/'wpn'/c/g).rglob('*raise_first_*.wav'):
        w = f.name.split('raise_first_', 1)[1].split('.')[0]
        if w in RAISE_ORDER: fs.setdefault(w, f)
    files = [fs[w] for w in RAISE_ORDER if w in fs]
    if not files or not markers: return {}
    out = dict(zip(markers, files))
    if 'end' in fs and len(files) < len(markers): out = {**dict(zip(markers, [f for f in files if f != fs['end']])), markers[-1]: fs['end']}
    return out

def gun_sounds(g, c, notes):
    """the gun's sound lists from its bank: shots, last shots and the clips' foley markers"""
    B = bank(c, g); sd = EXP/'sounds'/'sat'/'wpn'/c/g; P = f'wpn_{c}_{SND_NAME.get(g, g)}_fire_plr'
    def alias(*names, hip=True):   # first alias of the list the bank has files for; hip only (no ADS copies) when there are both
        for n in names:
            fs = list(dict.fromkeys(f for f in B.get(P+n, []) if f.exists()))
            if hip and any('ads' not in f.name for f in fs): fs = [f for f in fs if 'ads' not in f.name]
            if fs: return fs
        return []
    # each shot = the close shot + its mechanism + the low end, layered; the last shot = shot + the last-round mechanism.
    # The bank names the layers (_shot, or the whole alias, or _shot_single on burst guns); the folders differ per gun
    shots = alias('_shot', '', '_shot_single', '_shot_burst') or sorted((sd/'plr'/'fire').glob('*.wav'))
    mech = alias('_mech', '_mech_single', '_mech_burst') or sorted((sd/'plr'/'mech').glob('*.wav'))
    lfe = alias('_lfe') or sorted((sd/'lfe').glob('*.wav'))
    lshot = alias('_last_shot', '_last') or shots
    lastm = alias('_last_mech', '_last_mech_rechamber') or sorted((sd/'plr'/'mech'/'last').glob('*.wav'))
    S = {'shots': [], 'last': [], 'notes': {}}
    for i, s in enumerate(shots[:6]):
        S['shots'].append(ogg([s]+([mech[i % len(mech)]] if mech else [])+lfe[:1], MOD/'audio'/g/f'shot_{i}.ogg', [1, .8, .7][:1+bool(mech)]+[.7], force=True))
    if lshot: S['last'].append(ogg([lshot[0]]+([lastm[0]] if lastm else mech[:1])+lfe[:1], MOD/'audio'/g/'shot_last.ogg', [1, .8, .7], force=True))
    rf = raise_first_files(c, g, sorted(n for n in notes if '_raise_first_' in n and '@' in n))
    miss = []
    for n in sorted(notes):
        if '@' not in n: continue
        alias_ = n.split('@', 1)[1]
        files = [f for f in B.get(alias_, []) if f.exists()] or ([rf[n]] if n in rf else [])
        if not files: miss.append(alias_); continue
        S['notes'][n] = [ogg([f], MOD/'audio'/g/'foley'/(f.name.split('.')[0]+'.ogg')) for f in files]
    if miss: print('  notetrack sounds not found:', miss)
    print(f'  {g}: {len(S["shots"])} shots, {len(S["last"])} last, {len(S["notes"])} foley notes')
    return S

def sprint_base(pre, role):
    """what a sprint clip is added onto (clip(base=)): the idle pose, and for the loop the held sprint pose too"""
    if not role.startswith('sprint'): return None
    pose = pre+'sprint_offset_additive'
    return [pre+'idle', pose] if role == 'sprintLoopAnim' and (EXP/'animations'/(pose+'.cast')).exists() else pre+'idle'

# ---- Akimbo (docs/fork/bo7-rips.md, Akimbo) ---------------------------------------------------------------------------
# BO7 draws akimbo as two viewmodels, each a whole rig: the r clips hold the right gun up with the left arm down off the
# screen, the l clips the mirror. The shared bones (torso, spine) are identical in both. Here they become one rig, as the
# fork's dual wield wants (animation.js): the right clips without the left arm, the left clips with only the left arm,
# its gun tag (tag_weapon_left -> tag_weapon1, where the second gun hangs; it sits on the gun in every akimbo clip, as
# j_gun does) and the second gun's bones; clips that hold both guns (raise, drop, inspect) are the two halves joined.
# The second gun is the same parts built again with its bones suffixed _le (j_gun1 its root), so the clips find it.
# The pair def (bo7_<g>_dw, akimboOf) is folded into the single gun as its Akimbo attachment (weapon-levels akimbo.js).
AKIMBO_SIDED = [('idleAnim', 'idleAnimLeft', 'idle', True), ('fireAnim', 'fireAnimLeft', 'fire', False),
                ('lastShotAnim', 'lastShotAnimLeft', 'fire_last', False), ('reloadAnim', 'reloadAnimLeft', 'reload', False),
                ('reloadEmptyAnim', 'reloadEmptyAnimLeft', 'reload_empty', False)]
AKIMBO_BOTH = [('raiseAnim', 'raise'), ('firstRaiseAnim', 'raise_first'), ('quickRaiseAnim', 'raise_quick'),
               ('dropAnim', 'drop'), ('quickDropAnim', 'drop_quick'), ('inspectAnim', 'inspect')]

def build_akimbo(g, parts, single, gun_rest, bones):
    G = GUN[g]; c = G['cls']; pre = f'sat_vm_{c}_{g}_'
    side = next((pre+x for x in ('akimbo_', '') if (EXP/'animations'/(pre+x+'r_idle.cast')).exists()), None)
    if not side or not (EXP/'animations'/(side+'l_idle.cast')).exists(): print('  ', g, 'akimbo: no clips'); return
    has = lambda n: (EXP/'animations'/(n+'.cast')).exists()
    lren = {n: 'j_gun1' if n == 'j_gun' else n+'_le' for n in bones}
    lclips = [side+'l_'+nm for *_, nm, _ in AKIMBO_SIDED]+[side+'l_'+nm for _, nm in AKIMBO_BOTH]
    anim = animated_bones(pre) | {cc['bone'] for f in lclips if has(f) for cc in castlib.animation(EXP/'animations'/(f+'.cast'))['curves']}
    left, left_rest = build(parts, f'bo7_{g}_left', animated=frozenset(anim), rename=lren)
    right_only = lambda n: n not in LEFT_ARM
    left_only = lambda n: n in LEFT_ARM or (n.endswith('_le') and n not in arms_rest) or n == 'j_gun1'
    A, LA, T, notes = {}, {}, {}, set()
    for role, lrole, nm, loop in AKIMBO_SIDED:
        if not has(side+'r_'+nm): continue
        A[role], d = clip(side+'r_'+nm, arms_rest, gun_rest, loop, keep=right_only); T[role] = d['duration']; notes |= {n['name'] for n in d['notifies']}
        if has(side+'l_'+nm): LA[lrole], _ = clip(side+'l_'+nm, arms_rest, left_rest, loop, gun_rename=lren, keep=left_only)
    for role, nm in AKIMBO_BOTH:
        if not has(side+'r_'+nm): continue
        _, r = clip(side+'r_'+nm, arms_rest, gun_rest, keep=right_only, write=False)
        if has(side+'l_'+nm):
            _, l = clip(side+'l_'+nm, arms_rest, left_rest, gun_rename=lren, keep=left_only, write=False)
            r = {**r, 'name': f'{side}both_{nm}', 'duration': max(r['duration'], l['duration']), 'bones': r['bones']+l['bones']}
        A[role], _ = write_clip(r); T[role] = r['duration']; notes |= {n['name'] for n in r['notifies']}
    if 'idleAnim' not in A or 'idleAnimLeft' not in LA: print('  ', g, 'akimbo: no idle'); return
    A['emptyIdleAnim'] = A['idleAnim']
    for k in ('lastShotAnim', 'reloadEmptyAnim'): A.setdefault(k, A['fireAnim' if k == 'lastShotAnim' else 'reloadAnim'])
    times = {'raiseTime': T.get('raiseAnim', single['raiseTime']), 'dropTime': T.get('dropAnim', single['dropTime']),
             'reloadTime': round(T.get('reloadAnim', 2.5)*.8, 3), 'reloadEmptyTime': round(T.get('reloadEmptyAnim', T.get('reloadAnim', 3))*.8, 3),
             'inspectTime': T.get('inspectAnim', single.get('inspectTime'))}
    pair = lambda d: {**d, **times, 'clipSize': d['clipSize']*2, 'startAmmo': d['startAmmo']*2, 'maxAmmo': d['maxAmmo']*2,
                      'animations': A, 'leftModel': left, 'leftAnimations': LA, 'dualWield': True}
    no = ('sprintInTime', 'sprintLoopTime', 'sprintOutTime')   # no akimbo sprint clips: the motion layer's sprint pose
    wid = 'bo7_'+g
    weapons[wid+'_dw'] = {**{k: v for k, v in pair(single).items() if k not in no}, 'id': wid+'_dw', 'akimboOf': wid, 'noBox': True,
                          'upgrade': {k: v for k, v in pair(single['upgrade']).items() if k not in no}}
    print(f'  {g}: akimbo pair', len(A), 'clips +', len(LA), 'left')
    return notes

def build_gun(g):
    G = GUN[g]; c = G['cls']; pre = f'sat_vm_{c}_{g}_'
    gid = f'sat_{c}_{g}_mp'
    base_parts = [p for p in ('bar', 'mag', 'pgrip', 'stock') if model_dir(pre+p).is_dir()]+[p for p in EXTRA_PARTS.get(g, []) if model_dir(pre+p).is_dir()]
    # the receiver alone first, for its bone names (optic tags), then the Gunsmith list
    rec_bones = {b['name'] for b in load_model(pre+'rec')[0]}
    for p in base_parts: rec_bones |= {b['name'] for b in load_model(pre+p)[0]}   # the Warden and MXR-17 carry the muzzle tag on the barrel
    variants, mounts, stat_atts, order = gun_attachments(g, c, gid, rec_bones, EXP/'models')
    swap = {v[0].split('_'+c+'_'+g+'_')[1].split('_')[0] for v in variants}   # slots that have variants: their stock part gets hide bones
    parts = [pre+'rec']+[(pre+p, 'base', 'b7_base_'+PART_SLOT[{'pgrip': 'grip'}.get(p, p)][1]) if p in swap else pre+p for p in base_parts]+variants
    if UBGL.get(g): parts.append(('sat_vm_ub_gl_01', 'base', 'b7_ubgl'))   # the launcher, hidden until one is fitted
    view, gun_rest = build(parts, f'bo7_{g}_view', animated=animated_bones(pre))
    X = build.extra
    print(f'  {g}: {len(variants)} part variants, {len(mounts)} mounted, {len(stat_atts)} stat-only;', ' '.join(order))
    wpre = f'sat_wm_{c}_{g}_'
    world, _ = build([wpre+'rec']+[wpre+p for p in ('bar', 'mag', 'pgrip', 'stock', *EXTRA_PARTS.get(g, [])) if model_dir(wpre+p).is_dir()], f'bo7_{g}_world', light=True, decimate=WORLD_KEEP, extras=REST)
    A, T, notes = {}, {}, set()
    for role, nm, loop in ([] if G['pair_only'] else ROLES):
        full = pre.replace('sat_vm_', 'sat_vm_')+nm
        if not (EXP/'animations'/(full+'.cast')).exists(): print('  no clip', full); continue
        A[role], d = clip(full, arms_rest, gun_rest, loop, base=sprint_base(pre, role)); T[role] = d['duration']
        notes |= {n['name'] for n in d['notifies']}
    A.setdefault('emptyIdleAnim', A.get('idleAnim'))
    if 'reloadAnim' not in A and not G['pair_only']:   # the Warden 308: one clip per rounds loaded (reload_1..8); the full one for both
        ns = sorted(int(x.stem.rsplit('_', 1)[1]) for x in (EXP/'animations').glob(pre+'reload_[0-9].cast'))
        if ns:
            A['reloadAnim'], d = clip(pre+f'reload_{ns[-1]}', arms_rest, gun_rest); T['reloadAnim'] = d['duration']; notes |= {n['name'] for n in d['notifies']}
            A['reloadEmptyAnim'], T['reloadEmptyAnim'] = A['reloadAnim'], T['reloadAnim']
    seg = {}
    if (EXP/'animations'/(pre+'reload_loop.cast')).exists():   # shell by shell (the M10 Breacher), as BO1's Ithaca
        for role, nm in (('reloadStartAnim', 'reload_start'), ('reloadAnim', 'reload_loop'), ('reloadEndAnim', 'reload_end')):
            if (EXP/'animations'/(pre+nm+'.cast')).exists(): A[role], d = clip(pre+nm, arms_rest, gun_rest); T[role] = d['duration']; notes |= {n['name'] for n in d['notifies']}
        A['reloadEmptyAnim'] = A['reloadAnim']; T['reloadEmptyAnim'] = T['reloadAnim']
        seg = {'segmentedReload': True, 'reloadAmmoAdd': 1, 'reloadStartAdd': 0, 'reloadStartTime': T.get('reloadStartAnim', .5), 'reloadEndTime': T.get('reloadEndAnim', .6)}
    fire_len, rech = 0, {}
    if g in RECHAMBER:   # rechambers every few shots, not after each (mod.js): the clip is the last-shot kick, then the rechamber
        for role, nm, rc in (('rechamberAnim', 'fire_last', 'rechamber'), ('adsRechamberAnim', 'fire_last_ads', 'rechamber_ads')):
            if not (EXP/'animations'/(pre+nm+'.cast')).exists(): nm = 'fire_last'
            if not (EXP/'animations'/(pre+rc+'.cast')).exists(): rc = 'rechamber'
            A[role], d = clip(pre+nm, arms_rest, gun_rest, then=pre+rc); notes |= {n['name'] for n in d['notifies']}
            rech['rechamberTime'] = round(max(rech.get('rechamberTime', 0), d['duration']*.95), 3)
        rech.update(RECHAMBER[g])
    elif G['stats']['fireType'] == 'Single Shot' and (EXP/'animations'/(pre+'rechamber.cast')).exists():   # pump and bolt guns
        for role, nm, rc in (('fireAnim', 'fire', 'rechamber'), ('adsFireAnim', 'fire_ads', 'rechamber_ads')):
            if not (EXP/'animations'/(pre+nm+'.cast')).exists(): continue
            if not (EXP/'animations'/(pre+rc+'.cast')).exists(): rc = 'rechamber'
            A[role], d = clip(pre+nm, arms_rest, gun_rest, then=pre+rc); notes |= {n['name'] for n in d['notifies']}; fire_len = max(fire_len, d['duration'])
    att_anims = ubgl_form(g, pre, gun_rest, notes) if UBGL.get(g) else {}
    sounds['bo7_'+g] = gun_sounds(g, c, notes)
    st = dict(G['stats'])
    if fire_len: st['fireTime'] = round(max(st['fireTime'], fire_len*.95), 3)
    st.update(rech)
    common = {'explosionRadius': 0, 'explosionInnerDamage': 0, 'explosionOuterDamage': 0,
              'projectileSpeed': 0, 'adsInTime': .25, 'adsOutTime': .25, 'adsFov': 50.0,
              'raiseTime': T.get('raiseAnim', .6), 'dropTime': T.get('dropAnim', .5), 'sprintInTime': T.get('sprintInAnim', .3),
              'sprintLoopTime': T.get('sprintLoopAnim', .8), 'sprintOutTime': T.get('sprintOutAnim', .3), 'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0],
              'reloadTime': round(T.get('reloadAnim', 2.5)*.8, 3), 'reloadEmptyTime': round(T.get('reloadEmptyAnim', 3)*.8, 3), 'inspectTime': T.get('inspectAnim'),
              'hideTags': [v[2] for v in variants]+(['b7_ubgl'] if att_anims else []), **({'attachAnims': att_anims} if att_anims else {}), 'sounds': {}, 'notetrackSounds': {}, 'handsModel': hands_url, 'animations': A, 'weaponClass': G['wclass'], 'bo7': True,
              'viewOffset': G.get('view', [2, -.5, -7]), **seg}
    if seg: common['reloadTime'] = common['reloadEmptyTime'] = T['reloadAnim']
    wid = 'bo7_'+g
    # Gunsmith: swappable parts are tags (b7_<slot>_<kind>, hidden until fitted; the stock part is b7_base_<slot>), shared
    # parts are mounts, ammo is stat-only; tagGroups: head__bone hide bones follow their head (mounts.js syncTagGroups)
    common.update({'mounts': mounts, 'statAttachments': stat_atts, 'attachOrder': order, 'tagGroups': True,
                   'tagMoves': X['moves'], 'tagRest': X['tag_rest'], 'flashFollowsMuzzle': True})
    weapons[wid] = {'id': wid, 'name': G['name'], 'price': G['price'], 'model': view, 'worldModel': world, 'lazyWorld': True, **common, **st,
                    'upgrade': {'name': G['up'], 'model': view, 'worldModel': world, **common, **{**st, **G['up_stats']}}}
    weapons.pop(wid+'_dw', None)
    if G['pair_only']:   # the pair is the gun: own id, in the box, no Akimbo attachment to fit
        notes |= build_akimbo(g, parts, weapons[wid], gun_rest, X['bones']) or set()
        p = weapons.pop(wid+'_dw', None)
        if not p: raise RuntimeError(g+': pair-only gun without akimbo clips')
        for d in (p, p['upgrade']):
            d.pop('akimboOf', None); d.pop('noBox', None); d['id'] = wid; d['attachOrder'] = [a for a in d['attachOrder'] if a != 'akimbo']
        p['upgrade'].pop('id'); weapons[wid] = p; sounds[wid] = gun_sounds(g, c, notes)
    elif 'akimbo' in order: build_akimbo(g, parts, weapons[wid], gun_rest, X['bones'])

# ---- melees (docs/fork/bo7-rips.md, Melees) ---------------------------------------------------------------------------
# A melee is a def bo7_me_<g> with BO7's own clips on the BO7 hands: idle, raise, drop, sprint, inspect, two light swings
# (meleeAnim, backslashAnim: the fork's slash and backhand) and a heavy one (meleeChargeAnim). It is never in the box: the
# melee mod (mods/melee, melee.json entries with `ownClips`) builds its melee_<key> on it and plays these clips.
MELEES = {   # g: (light swing clips, heavy swing clips), the first that exists
    'knife': (['melee_hit_01', 'melee_hit_02'], ['swipe_heavy_01']),
    'castor': (['melee_hit_01', 'melee_hit_02'], ['heavy_melee_01']),
    'nashira': (['melee_slash_01', 'melee_slash_02'], ['heavy_slash_01']),
    'saiph': (['swing_hit_01', 'swing_hit_02'], ['swing_heavy_01']),
    'shockbaton': (['melee_hit_01', 'melee_hit_02'], ['melee_hit_03']),
    'wasat': (['melee_hit_01', 'melee_hit_02'], ['swipe_heavy_01']),
}
def build_melee(g):
    c, pre = 'me', f'sat_vm_me_{g}_'
    view, gun_rest = build([pre+'rec'], f'bo7_me_{g}_view', animated=animated_bones(pre))
    wpre = f'sat_wm_me_{g}_'
    world = build([wpre+'rec'], f'bo7_me_{g}_world', light=True, decimate=WORLD_KEEP, extras=REST)[0] if model_dir(wpre+'rec').is_dir() else None
    A, T, notes = {}, {}, set()
    light, heavy = MELEES[g]
    roles = [(r, n, l) for r, n, l in ROLES if r in ('idleAnim', 'raiseAnim', 'firstRaiseAnim', 'quickRaiseAnim', 'dropAnim', 'quickDropAnim',
                                                     'sprintInAnim', 'sprintLoopAnim', 'sprintOutAnim', 'inspectAnim')]
    roles += [('meleeAnim', light[0], False), ('backslashAnim', light[1], False), ('meleeChargeAnim', heavy[0], False)]
    for role, nm, loop in roles:
        if not (EXP/'animations'/(pre+nm+'.cast')).exists(): print('  no clip', pre+nm); continue
        A[role], d = clip(pre+nm, arms_rest, gun_rest, loop, base=sprint_base(pre, role)); T[role] = d['duration']
        notes |= {n['name'] for n in d['notifies']}
    wid = 'bo7_me_'+g
    sounds[wid] = gun_sounds(g, c, notes)
    d = {'id': wid, 'name': NAMES.get(f'sat_me_{g}_mp', {}).get('name') or g, 'model': view, 'worldModel': world, 'lazyWorld': True, 'bo7': True,
         'bo7Melee': True, 'noBox': True, 'weaponClass': 'Melee', 'handsModel': hands_url, 'animations': A, 'hideTags': [], 'sounds': {}, 'notetrackSounds': {},
         'raiseTime': T.get('raiseAnim', .6), 'dropTime': T.get('dropAnim', .5), 'sprintInTime': T.get('sprintInAnim', .3),
         'sprintLoopTime': T.get('sprintLoopAnim', .8), 'sprintOutTime': T.get('sprintOutAnim', .3), 'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0],
         'inspectTime': T.get('inspectAnim'), 'viewOffset': [0, 0, 0], 'clipSize': 1, 'startAmmo': 0, 'maxAmmo': 0, 'damage': 0, 'minDamage': 0,
         'fireTime': 1, 'fireType': 'Single Shot', 'automatic': False, 'projectileSpeed': 0, 'explosionRadius': 0, 'explosionInnerDamage': 0,
         'explosionOuterDamage': 0, 'pellets': 1, 'range': 100, 'headMultiplier': 1, 'adsFov': 50.0, 'adsInTime': .25, 'adsOutTime': .25,
         'attachOrder': [], 'statAttachments': [], 'mounts': {},
         # the swings' own lengths: melee.json's swing / heavy times are set near these
         'meleeClipTimes': {'light': round(T.get('meleeAnim', .5), 3), 'back': round(T.get('backslashAnim', .5), 3), 'heavy': round(T.get('meleeChargeAnim', .9), 3)}}
    d['upgrade'] = {k: v for k, v in d.items() if k not in ('id', 'upgrade')}
    weapons[wid] = d
    print(f'  {g}: melee, {len(A)} clips', d['meleeClipTimes'])

if '--sounds' in sys.argv:   # sounds only: markers from the clips already built, models left alone
    for g in GUNS:
        if 'bo7_'+g not in weapons: continue
        c = GUN[g]['cls']; notes = set()
        for f in (MOD/'animations').glob(f'sat_vm_{c}_{g}_*.json'): notes |= {n['name'] for n in json.loads(f.read_text())['notifies']}
        sounds['bo7_'+g] = gun_sounds(g, c, notes)
    (MOD/'weapons.json').write_text(json.dumps({'weapons': weapons, 'sounds': sounds}, indent=1)); print('wrote sounds'); sys.exit()
if '--new' in sys.argv: GUNS = [g for g in GUNS if 'bo7_'+g not in weapons]   # only guns not built yet
failed = []
def save():
    for w in weapons.values():   # one hands model for every gun: guns not rebuilt this run take its new version too
        for d in (w, w.get('upgrade') or {}):
            if 'handsModel' in d: d['handsModel'] = hands_url
    (MOD/'weapons.json').write_text(json.dumps({'weapons': weapons, 'sounds': sounds}, indent=1))
for g in GUNS:
  try:
    (build_melee if g in MELEES else build_gun)(g); save()   # after every gun, so a later failure keeps the ones done
  except Exception as e:
    import traceback; traceback.print_exc(); failed.append(g); print('  FAILED', g, e)
if failed: print('failed:', ' '.join(failed))
print('wrote', MOD/'weapons.json')
