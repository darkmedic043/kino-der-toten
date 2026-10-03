"""Build Black Ops III weapons from Greyhound exports into export/web/mods/bo3-weapons/.

    python3 .tools/build_bo3_weapons.py [export_dir]   (default export_game/bo3)

Inputs (from the user's own BO3 install via Greyhound, see docs/fork/weapons.md):
xmodels/<name>/<name>_LOD0.semodel, xanims/*.seanim, ximages/*.png. Outputs are
git-ignored like the BO1 builds: models/*.glb (WebP textures), animations/*.json
(the same clip format as .tools/xanim_to_json.mjs), weapons.json.

BO3 first-person rigs match BO1's layout (tag_view > tag_ads > tag_torso >
shoulders...) at about twice the scale; the gun mounts on tag_weapon_right,
renamed tag_weapon here, which is what the engine's ViewWeapon attaches to.
"""
import json, pathlib, subprocess, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from seanim import read_seanim
import importlib.util
_spec = importlib.util.spec_from_file_location('semodel_to_glb', pathlib.Path(__file__).parent/'semodel_to_glb.py')
SEM = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(SEM)

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT/'export_game/bo3')
MOD = ROOT/'export/web/mods/bo3-weapons'
WEB = 'mods/bo3-weapons/'
for sub in ['models', 'animations']: (MOD/sub).mkdir(parents=True, exist_ok=True)
RENAME = {'tag_weapon_right': 'tag_weapon', 'tag_weapon_left': 'tag_weapon1'}
# BO3 numbers finger joints from the knuckle as _1.._3 where BO1 uses _0.._2 (BO3's *base joints are
# extra helpers): shift them so the character first-person arms (fp-arms.js) find BO1's names
RENAME.update({f'j_{f}_{s}_{k}': f'j_{f}_{s}_{k-1}' for f in ['index', 'mid', 'ring', 'pinky', 'thumb'] for s in ['le', 'ri'] for k in (1, 2, 3)})

def webp(stem, kind):
    src = SRC/'ximages'/(stem+'.png')
    if not src.exists(): return None
    size = 512 if kind == 'rough' else 1024
    vf = f"scale='min({size},iw)':-2"
    if kind == 'rough': vf = 'format=gray,negate,format=rgb24,'+vf   # BO3 gloss -> glTF roughness (G); metallic stays 0
    with tempfile.NamedTemporaryFile(suffix='.webp') as out:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', vf, '-c:v', 'libwebp',
                        '-quality', '92' if kind == 'normal' else '85', out.name], check=True)
        return pathlib.Path(out.name).read_bytes(), 'image/webp'

def model(name, out_name=None, rename=None):
    sem = SEM.read_semodel(SRC/'xmodels'/name/(name+'_LOD0.semodel'))
    out = MOD/'models'/((out_name or name)+'.glb')
    SEM.to_glb(sem, out, texture_loader=webp, rename=rename)
    print('model', out.name, f'{out.stat().st_size/1e6:.1f} MB')
    return WEB+'models/'+out.name, sem

def round_list(v, n): return [round(x, n) for x in v]

def animation(name, gun_bind, loop=False):
    a = read_seanim(SRC/'xanims'/(name+'.seanim'))
    fps = a['framerate'] or 30
    bones = []
    last = 0
    for bone, tracks in a['bones'].items():
        if bone in ('tag_weapon', 'tag_weapon_le', 'tag_origin'): continue   # the gun's own root is the attachment anchor
        out = {'name': RENAME.get(bone, bone), 'rot': None, 'pos': None}
        if tracks.get('rot'):
            out['rot'] = {'frames': [f for f, _ in tracks['rot']], 'values': round_list([c for _, q in tracks['rot'] for c in q], 5)}
            last = max(last, tracks['rot'][-1][0])
        if tracks.get('loc'):
            bind = gun_bind.get(bone)
            vals = [c-(bind[i] if bind else 0) for _, v in tracks['loc'] for i, c in enumerate(v)]   # gun parts: offsets from bind (see animation.js makeClip)
            out['pos'] = {'frames': [f for f, _ in tracks['loc']], 'values': round_list(vals, 4)}
            last = max(last, tracks['loc'][-1][0])
        if out['rot'] or out['pos']: bones.append(out)
    frames = max(last, a['frames']-1, 1)
    clip = {'name': name, 'fps': fps, 'loop': loop, 'duration': round(frames/fps, 4),
            'notifies': [{'name': n, 'time': round(f/fps, 4)} for f, n in a['notes']], 'bones': bones}
    (MOD/'animations'/(name+'.json')).write_text(json.dumps(clip, separators=(',', ':')))
    return WEB+'animations/'+name+'.json', clip['duration']

# ---- Wunderwaffe DG-2 ---------------------------------------------------------------------------
hands, _ = model('c_zom_der_dempsey_viewhands', 'bo3_viewhands_dempsey', RENAME)
view, gun = model('wpn_t7_zmb_dg2_view')
upg_view, _ = model('wpn_t7_zmb_dg2_upg_view')
world, _ = model('wpn_t7_zmb_dg2_world')
upg_world, _ = model('wpn_t7_zmb_dg2_upg_world')
gun_bind = {b['name']: b['lpos'] for b in gun['bones'] if 'lpos' in b and b['parent'] >= 0}

A, T = {}, {}
for key, name, loop in [('idleAnim', 'vm_dg2_idle', True), ('fireAnim', 'vm_dg2_fire', False), ('adsFireAnim', 'vm_dg2_fire_ads', False),
                        ('reloadAnim', 'vm_dg2_reload_empty', False), ('raiseAnim', 'vm_dg2_pullout', False),
                        ('firstRaiseAnim', 'vm_dg2_first_raise', False), ('quickRaiseAnim', 'vm_dg2_pullout_quick', False),
                        ('dropAnim', 'vm_dg2_putaway', False), ('quickDropAnim', 'vm_dg2_putaway_quick', False),
                        ('sprintInAnim', 'vm_dg2_sprint_in', False), ('sprintLoopAnim', 'vm_dg2_sprint_loop', True),
                        ('sprintOutAnim', 'vm_dg2_sprint_out', False)]:
    A[key], T[key] = animation(name, gun_bind, loop)
A['emptyIdleAnim'] = A['idleAnim']; A['lastShotAnim'] = A['fireAnim']; A['adsLastShotAnim'] = A['adsFireAnim']
for extra in ['vm_dg2_walk_f', 'vm_dg2_slide_in', 'vm_dg2_slide_loop', 'vm_dg2_slide_out', 'vm_dg2_jump', 'vm_dg2_jump_land', 'vm_dg2_fall']:
    if (SRC/'xanims'/(extra+'.seanim')).exists(): animation(extra, gun_bind, extra.endswith('loop'))

common = {'damage': 1, 'minDamage': 1, 'range': 40, 'automatic': False, 'fireType': 'Single Shot', 'pellets': 1, 'headMultiplier': 1,
          'hideTags': [], 'explosionRadius': 0, 'explosionInnerDamage': 0, 'explosionOuterDamage': 0, 'projectileSpeed': 0,
          'adsInTime': .3, 'adsOutTime': .3, 'adsFov': 65.0, 'raiseTime': T['raiseAnim'], 'dropTime': T['dropAnim'],
          'sprintInTime': T['sprintInAnim'], 'sprintLoopTime': T['sprintLoopAnim'], 'sprintOutTime': T['sprintOutAnim'],
          'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0], 'sounds': {}, 'notetrackSounds': {},
          'fireTime': max(.5, T['fireAnim']*.9), 'reloadTime': T['reloadAnim'], 'reloadEmptyTime': T['reloadAnim'],
          'handsModel': hands, 'animations': A, 'bo3': True, 'tesla': True}
weapons = {'tesla_gun_zm': {'id': 'tesla_gun_zm', 'name': 'Wunderwaffe DG-2', 'price': 950, 'clipSize': 3, 'startAmmo': 12, 'maxAmmo': 12,
                            'model': view, 'worldModel': world, **common,
                            'upgrade': {'name': 'Wunderwaffe DG-3 JZ', 'clipSize': 6, 'startAmmo': 24, 'maxAmmo': 24,
                                        'model': upg_view, 'worldModel': upg_world, **{k: v for k, v in common.items() if k not in ('bo3', 'tesla')}}}}
# ---- sounds (Greyhound "Load File" on zone/snd/all/zm_common.all.sabl, exported with their paths;
# the dg2 folder copied to <export_dir>/sounds/dg2) -> audio/dg2/<path>.ogg, keyed by path
sounds = {}
snd = SRC/'sounds'/'dg2'
if snd.is_dir():
    for wav in sorted(snd.rglob('*.wav')):
        rel = wav.relative_to(snd).with_suffix('')
        out = MOD/'audio'/'dg2'/rel.with_suffix('.ogg'); out.parent.mkdir(parents=True, exist_ok=True)
        if not out.exists():
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-ac', '2', '-c:a', 'libvorbis', '-q:a', '5', str(out)], check=True)
        sounds[str(rel)] = WEB+'audio/dg2/'+str(rel)+'.ogg'
    print('sounds', len(sounds))
(MOD/'weapons.json').write_text(json.dumps({'weapons': weapons, 'sounds': {'dg2': sounds}}, indent=1))
print('wrote', MOD/'weapons.json')
