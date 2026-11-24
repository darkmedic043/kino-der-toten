#!/usr/bin/env python3
"""Black Ops 7 weapons from the user's own rips (Cordycep/Saluki Cast exports, ~/RIPS melon-pipeline) into the
git-ignored mod export/web/mods/bo7-rips/ (models, animations, audio, weapons.json; docs/fork/bo7-rips.md).

  python3 -I .tools/build_bo7_rips.py <pipeline dir> [gun codename ...]     (default: kite = AK-27)

Needs numpy + Pillow (nix-shell -p "python3.withPackages(ps:[ps.numpy ps.pillow])") and ffmpeg. Reads
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
GUNS = sys.argv[2:] or ['kite']
sys.path.insert(0, str(PIPE/'scripts')); import castlib          # the pipeline's Cast reader (the user's code)
sys.path.insert(0, str(ROOT/'.tools')); import semodel_to_glb as SEM
EXP = PIPE/'exports'/'bo7'
MOD = ROOT/'export/web/mods/bo7-rips'
WEB = 'mods/bo7-rips/'
CM = 1/2.54
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

def load_model(name):
    roots = castlib.load(EXP/'models'/name/(name+'_LOD0.cast'))
    m = next(n for r in roots for n in r.walk() if n.type == 'model')
    return castlib.skeleton(m), castlib.meshes(m), castlib.materials(m)

def build(parts, out_name, light=False, rename=None, keep=None):
    """Cast models -> one engine GLB. parts[0] is the base; each later part's root bone is a bone of the same name
    in what's built so far and is merged into it (its other bones and its meshes follow it there)."""
    bones, meshes, mats, mat_ix = [], [], [], {}
    index = {}
    for pi, part in enumerate(parts):
        sk, ms, mt = load_model(part)
        if not sk: continue
        if pi == 0: xf_t, xf_q = np.zeros(3), np.array([0, 0, 0, 1.])
        else:
            root = sk[0]['name']
            if root not in index: print('  skip part', part, '(no bone', root+')'); continue
            a = bones[index[root]]
            ri = qinv(sk[0]['wr'])   # x' = A ∘ R⁻¹ (x)
            xf_q = qmul(a['wrot'], ri); xf_t = a['wpos'] - qrot(xf_q, sk[0]['wp']*CM)
        remap = []
        for b in sk:
            if b['name'] in index and (pi > 0): remap.append(index[b['name']]); continue
            wp = qrot(xf_q, b['wp']*CM) + xf_t; wr = qmul(xf_q, b['wr'])
            par = remap[b['parent']] if b['parent'] >= 0 else -1
            bones.append({'name': b['name'], 'parent': par, 'wpos': wp, 'wrot': wr / np.linalg.norm(wr)})
            index[b['name']] = len(bones)-1; remap.append(len(bones)-1)
        for h, m in mt.items():
            short = m['name'].replace('\\', '/').split('/')[-1]
            if (part, h) in mat_ix: continue
            if keep and not keep(short): mat_ix[(part, h)] = None; continue
            mat_ix[(part, h)] = len(mats)
            mats.append({'name': short, 'diffuse': short+'_c.png', 'normal': short+'_n.png'})
        for m in ms:
            mi = mat_ix.get((part, m['material']))
            if mi is None: continue
            pos = qrot(xf_q, m['vp']*CM) + xf_t
            nrm = qrot(xf_q, m['vn']) if m['vn'] is not None else None
            uv = m['uv'][0] if m['uv'] else np.zeros((len(pos), 2))
            if m['wb'] is not None:
                w = [[(remap[int(j)], float(x)) for j, x in zip(jj, ww) if x > 1e-4] or [(remap[0], 1.)] for jj, ww in zip(m['wb'], m['wv'])]
            else: w = [[(remap[0], 1.)]]*len(pos)
            meshes.append({'pos': [tuple(p) for p in pos.tolist()], 'nrm': [tuple(n) for n in nrm.tolist()] if nrm is not None else None,
                           'uv': [[tuple(u)] for u in np.asarray(uv).tolist()], 'w': w,
                           'faces': [tuple(f) for f in m['f'].tolist()], 'mats': [mi]})
            if meshes[-1]['nrm'] is None: del meshes[-1]['nrm']
    sem = {'bones': [{'name': b['name'], 'parent': b['parent'], 'wpos': tuple(b['wpos']), 'wrot': tuple(b['wrot'])} for b in bones],
           'meshes': meshes, 'materials': mats}
    out = MOD/'models'/(out_name+'.glb')
    SEM.to_glb(sem, out, texture_loader=tex_loader(light), rename=rename)
    print('model', out.name, f'{out.stat().st_size/1e6:.1f} MB', len(bones), 'bones', sum(len(m['pos']) for m in meshes), 'verts')
    rest = {}   # local rest position (inches) by (renamed) bone name, for the clips
    for i, b in enumerate(bones):
        if b['parent'] >= 0:
            p = bones[b['parent']]; lp = qrot(qinv(p['wrot']), b['wpos']-p['wpos'])
        else: lp = b['wpos']
        rest[(rename or {}).get(b['name'], b['name'])] = lp
    return WEB+'models/'+out.name+ver(out), rest

# ---- animations ---------------------------------------------------------------------------------------
ARM_RENAME = {'j_gun': 'tag_weapon', 'tag_weapon_right': 'tag_weapon_right_iw', 'tag_weapon': 'tag_weapon_iw'}
# BO7 numbers finger joints 1..4 from the knuckle where BO1 uses 0..3 (its meta* joints are the extra bases): shifted so
# the operators' first-person arms (fp-arms.js) find BO1's names, as the BO3 import does
ARM_RENAME.update({f'j_{f}_{s}_{k}': f'j_{f}_{s}_{k-1}' for f in ['index', 'mid', 'ring', 'pinky', 'thumb'] for s in ['le', 'ri'] for k in (1, 2, 3, 4)})

def clip(name, arms_rest, gun_rest, loop=False):
    a = castlib.animation(EXP/'animations'/(name+'.cast'))
    fps = a['fps'] or 30
    by = {}
    for c in a['curves']: by.setdefault(c['bone'], {})[c['prop']] = c
    out, last, modes = [], 0, {}
    for bone, cs in by.items():
        if bone in ('tag_origin', 'tag_sync'): continue
        nm = ARM_RENAME.get(bone, bone)
        arm = nm in arms_rest
        if not arm and bone not in gun_rest: continue
        rest = arms_rest[nm] if arm else gun_rest[bone]
        b = {'name': nm if arm else bone, 'rot': None, 'pos': None}
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
    p = MOD/'animations'/(name+'.json'); p.write_text(json.dumps(data, separators=(',', ':')))
    if set(modes) - {'relative', 'absolute'}: print('  ', name, 'curve modes', modes)
    return WEB+'animations/'+p.name+ver(p), data

# ---- sounds -------------------------------------------------------------------------------------------
def ogg(srcs, out, gains=None):
    """one or more WAVs (layered) -> ogg"""
    out.parent.mkdir(parents=True, exist_ok=True)
    if not out.exists():
        cmd = ['ffmpeg', '-loglevel', 'error', '-y']
        for s in srcs: cmd += ['-i', str(s)]
        if len(srcs) > 1:
            g = gains or [1]*len(srcs)
            f = ''.join(f'[{i}:a]volume={g[i]}[a{i}];' for i in range(len(srcs)))+''.join(f'[a{i}]' for i in range(len(srcs)))+f'amix=inputs={len(srcs)}:normalize=0:duration=longest'
            cmd += ['-filter_complex', f]
        cmd += ['-ac', '2', '-c:a', 'libvorbis', '-q:a', '5', str(out)]
        subprocess.run(cmd, check=True)
    return WEB+str(out.relative_to(MOD))

def bank(gun):
    p = EXP/'sndbanks'/'csv'/f'weapon_sat_ar_{gun}_plr.all.csv'
    rows = {}
    if p.exists():
        for r in csv.DictReader(p.open()): rows.setdefault(r['name'], []).append(EXP/'sounds'/(r['file']+'.wav'))
    return rows

# ---- guns ---------------------------------------------------------------------------------------------
NAMES = json.loads((PIPE/'dumps'/'names.json').read_text()) if (PIPE/'dumps'/'names.json').exists() else {}
GUN = {   # per gun: display name, Pack-a-Punch name, stats (BO1 zombies scale: an AR does ~100 at close range)
    # view: def.viewOffset, the hip position (view space: right, up, back; gone in ADS). The rigs' own idle holds the
    # gun close with the right hand below the frame; this pushes it out so both hands show (tuned in Sandbox, 2026-11-24)
    'kite': {'name': 'AK-27', 'up': 'Kronos Reaper', 'cls': 'ar', 'price': 1500, 'view': [2, -.5, -7],
             'stats': {'clipSize': 30, 'startAmmo': 210, 'maxAmmo': 270, 'damage': 110, 'minDamage': 80, 'range': 1600, 'fireTime': .088, 'headMultiplier': 4},
             'up_stats': {'clipSize': 45, 'startAmmo': 360, 'maxAmmo': 360, 'damage': 180, 'minDamage': 130, 'headMultiplier': 5}},
}
ROLES = [('idleAnim', 'idle', True), ('fireAnim', 'fire', False), ('lastShotAnim', 'fire_last', False), ('adsFireAnim', 'fire_ads', False),
         ('adsLastShotAnim', 'fire_last_ads', False), ('reloadAnim', 'reload', False), ('reloadEmptyAnim', 'reload_empty', False),
         ('raiseAnim', 'raise', False), ('firstRaiseAnim', 'raise_first', False), ('quickRaiseAnim', 'raise_quick', False),
         ('dropAnim', 'drop', False), ('quickDropAnim', 'drop_quick', False), ('adsUpAnim', 'ads_up', False), ('adsDownAnim', 'ads_down', False),
         ('sprintInAnim', 'walk_to_sprint', False), ('sprintLoopAnim', 'sprint_loop', True), ('sprintOutAnim', 'sprint_to_walk', False),
         ('inspectAnim', 'inspect', False)]

hands_url, arms_rest = build(['viewhands_base_iw8'], 'bo7_viewhands', rename=ARM_RENAME)
weapons, sounds = {}, {}
for g in GUNS:
    G = GUN[g]; c = G['cls']; pre = f'sat_vm_{c}_{g}_'
    parts = [pre+'rec']+[pre+p for p in ('bar', 'mag', 'pgrip', 'stock') if (EXP/'models'/(pre+p)).is_dir()]
    view, gun_rest = build(parts, f'bo7_{g}_view')
    wpre = f'sat_wm_{c}_{g}_'
    world, _ = build([wpre+'rec']+[wpre+p for p in ('bar', 'mag', 'pgrip', 'stock') if (EXP/'models'/(wpre+p)).is_dir()], f'bo7_{g}_world', light=True)
    A, T, notes = {}, {}, set()
    for role, nm, loop in ROLES:
        full = pre.replace('sat_vm_', 'sat_vm_')+nm
        if not (EXP/'animations'/(full+'.cast')).exists(): print('  no clip', full); continue
        A[role], d = clip(full, arms_rest, gun_rest, loop); T[role] = d['duration']
        notes |= {n['name'] for n in d['notifies']}
    A.setdefault('emptyIdleAnim', A['idleAnim'])
    # sounds: each shot = the gun's close shot + its mechanism + the low end, layered; last shot = shot + last mech
    B = bank(g); sd = EXP/'sounds'/'sat'/'wpn'/c/g
    shots = sorted((sd/'plr'/'fire').glob('*.wav')); mech = sorted((sd/'plr'/'mech').glob('*.wav')); lfe = sorted((sd/'lfe').glob('*.wav'))
    lastm = sorted((sd/'plr'/'mech'/'last').glob('*.wav'))
    S = {'shots': [], 'last': [], 'notes': {}}
    for i, s in enumerate(shots):
        S['shots'].append(ogg([s, mech[i % len(mech)]]+lfe[:1], MOD/'audio'/g/f'shot_{i}.ogg', [1, .8, .7]))
    if shots and lastm: S['last'].append(ogg([shots[0], lastm[0]]+lfe[:1], MOD/'audio'/g/'shot_last.ogg', [1, .8, .7]))
    miss = []
    for n in sorted(notes):
        if '@' not in n: continue
        alias = n.split('@', 1)[1]
        files = [f for f in B.get(alias, []) if f.exists()]
        if not files: miss.append(alias); continue
        S['notes'][n] = [ogg([f], MOD/'audio'/g/'foley'/(f.name.split('.')[0]+'.ogg')) for f in files]
    if miss: print('  notetrack sounds not found:', miss)
    print(f'  {g}: {len(A)} clips, {len(S["shots"])} shots, {len(S["notes"])} foley notes')
    sounds['bo7_'+g] = S
    st = G['stats']
    common = {'automatic': True, 'fireType': 'Full Auto', 'pellets': 1, 'explosionRadius': 0, 'explosionInnerDamage': 0, 'explosionOuterDamage': 0,
              'projectileSpeed': 0, 'adsInTime': .25, 'adsOutTime': .25, 'adsFov': 50.0,
              'raiseTime': T.get('raiseAnim', .6), 'dropTime': T.get('dropAnim', .5), 'sprintInTime': T.get('sprintInAnim', .3),
              'sprintLoopTime': T.get('sprintLoopAnim', .8), 'sprintOutTime': T.get('sprintOutAnim', .3), 'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0],
              'reloadTime': round(T.get('reloadAnim', 2.5)*.8, 3), 'reloadEmptyTime': round(T.get('reloadEmptyAnim', 3)*.8, 3), 'inspectTime': T.get('inspectAnim'),
              'hideTags': [], 'sounds': {}, 'notetrackSounds': {}, 'handsModel': hands_url, 'animations': A, 'weaponClass': 'Assault Rifle', 'bo7': True,
              'viewOffset': G.get('view', [2, -.5, -7])}
    wid = 'bo7_'+g
    weapons[wid] = {'id': wid, 'name': G['name'], 'price': G['price'], 'model': view, 'worldModel': world, 'lazyWorld': True, **common, **st,
                    'upgrade': {'name': G['up'], 'model': view, 'worldModel': world, **common, **{**st, **G['up_stats']}}}
(MOD/'weapons.json').write_text(json.dumps({'weapons': weapons, 'sounds': sounds}, indent=1))
print('wrote', MOD/'weapons.json')
