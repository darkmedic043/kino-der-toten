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
import hashlib, json, pathlib, subprocess, sys, tempfile
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

# heavy assets are browser-cached for a day (kino-server.mjs): stamp URLs with a content hash so rebuilds reach players
def ver(path): return '?v='+hashlib.md5(pathlib.Path(path).read_bytes()).hexdigest()[:8]

def model(name, out_name=None, rename=None, glow=None, glow_maps=None):
    sem = SEM.read_semodel(SRC/'xmodels'/name/(name+'_LOD0.semodel'))
    out = MOD/'models'/((out_name or name)+'.glb')
    SEM.to_glb(sem, out, texture_loader=webp, rename=rename, glow=glow, glow_maps=glow_maps)
    print('model', out.name, f'{out.stat().st_size/1e6:.1f} MB')
    return WEB+'models/'+out.name+ver(out), sem

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
            # BO3 already stores gun-part translations as offsets from the part's bind (bulbs and bolt are 0 at
            # rest; the clip parks itself far out of view), which is what animation.js makeClip expects; hands are absolute.
            vals = [c for _, v in tracks['loc'] for c in v]
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
          'handsModel': hands, 'animations': A, 'bo3': True, 'tesla': True, 'weaponClass': 'Wonder weapon',
          'viewOffset': [6, -8, -1]}   # sits low in the bottom-right corner at the hip, like BO3 (animation.js; gone in ADS)
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
# the bulbs' and tubes' emissive map (BO3's glass _e), for the mod's lights
fx = {}
glow = SRC/'ximages'/'i_wpn_t7_zmb_dg2_glass_e.png'
if glow.exists():
    (MOD/'textures').mkdir(exist_ok=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(glow), '-c:v', 'libwebp', '-quality', '92', str(MOD/'textures'/'dg2_glow_e.webp')], check=True)
    fx['dg2'] = {'glow': WEB+'textures/dg2_glow_e.webp'+ver(MOD/'textures'/'dg2_glow_e.webp')}
# ---- weapons from the user's "CoD Online" workshop mod (2014476142) ---------------------------------
# Viewmodels <name>_vmgun, animations vm_<gun>_* on BO3's arm rig (Dempsey's arms fit), sounds from
# the mod's core_mod.all.sabl/.sabs under sounds/codolbf/weapons/<gun>/ (see docs/fork/weapons.md).
import random
GAME = json.loads((ROOT/'export/web/game-data.json').read_text())['weapons']
SND = SRC/'sounds'/'codolbf'/'weapons'
all_wavs = {w.stem: w for w in SND.rglob('*.wav')} if SND.is_dir() else {}
audio_keys = {}
def snd(stem):
    w = all_wavs.get(stem)
    if not w: return None
    key = 'mod/' + str(w.relative_to(SND).with_suffix(''))
    out = MOD/'audio'/(key + '.ogg'); out.parent.mkdir(parents=True, exist_ok=True)
    if not out.exists():
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(w), '-ac', '2', '-c:a', 'libvorbis', '-q:a', '5', str(out)], check=True)
    audio_keys[key] = WEB+'audio/'+key+'.ogg'
    return key
# BO3 glow materials whose colour map is blank ('fullalpha'): the real image, found by name in ximages
# (pattern in alpha), its scroll speed [u, v] per second (guessed: BO3's scroll shader parameters
# aren't exported; 'ani' = animated, 'lowspeed' = slow), and whether the gun's glow colour tints it
GLOW_MAPS = {
    'mtl_m1014_glow_ani': ('i_glow_blue_ani_c', [.5, 0], True),
    'mtl_wea_vectorhw_glow_lowspeed': ('wea_vectorhw_glow', [.2, 0], True),
    'wea_ak47orbit_glow_01': ('i_wea_ak47orbit_glow_01_c', [.4, 0], False),
    'mtl_as50_as50heloderma_glow': ('i_as50_as50heloderma_glow_e', [.3, 0], True),
    'mtl_wea_augoctopus_glow': ('i_wea_augoctopus_glow_c_rightone', [.25, 0], True),
    'mtl_iro_glow_m4a1techdeatheg': ('i_iro_glow_m4a1techdeatheg_e', [0, 0], False),
}
# notetrack aliases with no file of that name in the mod's bank (its alias table isn't exportable):
# stand-ins from the same bank, copied to sounds/codolbf/weapons/_generic/ (see docs/fork/weapons.md)
NOTE_ALIAS = {'ins1': 'fly_cloth_01', 'ins2': 'fly_cloth_02', 'ins3': 'fly_cloth_03', 'weap_raise_plr': 'weap_ariarm27_raise_plr'}
_png = {}
def png(stem):   # RGBA png, at most 256 px (keeps alpha, unlike the webp path)
    if stem not in _png:
        src = SRC/'ximages'/(stem+'.png'); _png[stem] = None
        if src.exists():
            with tempfile.NamedTemporaryFile(suffix='.png') as out:
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(256,iw)':-2", '-pix_fmt', 'rgba', out.name], check=True)
                _png[stem] = pathlib.Path(out.name).read_bytes()
    return _png[stem]
MODW = [
  # id, name, upgrade name, model, anim prefix, template, overrides, roles, shots, last shot, glow colour
  dict(cls='Rifle', id='bo3_mr23_tesla', name='MR23 Tesla', up='MR23 Storm Coil', model='mr23_tesla_vmgun', pre='vm_mr23_tesla', tpl='aug_acog_zm',
       stats=dict(clipSize=30, maxAmmo=240, startAmmo=240, damage=150, minDamage=100, fireTime=.08, price=1500),
       roles=dict(idle='idle', fire='fire', adsFire='adsfire', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runloop', sprintOut='runover'),
       ads=('vm_mr23_adsup', 'vm_mr23_adsdown'), shots=['weap_scar_saprtesla_fire_plr'], last=['weap_scar_saprtesla_fire_final_plr'], glow='#46e6ff', arc=True),
  dict(cls='Rifle', id='bo3_aug_octopus', name='AUG Octopus', up='AUG Kraken', model='aug_octopus_vmgun', pre='vm_aug', tpl='aug_acog_zm',
       stats=dict(clipSize=30, maxAmmo=270, startAmmo=270, damage=140, minDamage=90, fireTime=.07, price=1200),
       roles=dict(idle='idle', fire='fire', adsFire='adsfire', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_aug_adsup', 'vm_aug_adsdown'), shots=['aug-1', 'aug-2', 'aug-3'], glow='#b45cff'),
  dict(cls='Shotgun', id='bo3_m1014_jellyfish', name='M1014 Jellyfish', up="Man o' War", model='m1014_jellyfish_vmgun', pre='vm_m1014', tpl='spas_zm',
       stats=dict(clipSize=7, maxAmmo=56, startAmmo=56, damage=160, minDamage=20, fireTime=.25, pellets=8, price=1500, segmentedReload=True, reloadAmmoAdd=1, reloadStartAdd=0),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reloading', reloadStart='reloadstart', reloadEnd='reloadend', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_m1014_adsup', 'vm_m1014_adsdown'), shots=['m1014-1', 'm1014-2', 'm1014-3'], glow='#ff5ac8'),
  dict(cls='Submachine gun', id='bo3_p90_orbit', name='P90 Orbit', up='P90 Event Horizon', model='p90_orbit_vmgun', pre='vm_p90', tpl='mp5k_zm',
       stats=dict(clipSize=50, maxAmmo=300, startAmmo=300, damage=100, minDamage=60, fireTime=.06, price=1300),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_p90_adsup', 'vm_p90_adsdown'), shots=['p90-1', 'p90-2', 'p90-3'], glow='#ffa53a', offset=[-1.5, -2, 0]),   # bulky: less to the right
  dict(cls='Pistol', id='bo3_g18_death', name='G18 Death', up='G18 Reaper', model='g18_death_vmgun', pre='vm_g18', tpl='cz75_zm',
       stats=dict(clipSize=33, maxAmmo=264, startAmmo=264, damage=110, minDamage=70, fireTime=.055, automatic=True, fireType='Full Auto', price=900),
       roles=dict(idle='idle', emptyIdle='idle_empty', fire='fire', lastShot='lastshot', adsFire='fireads', adsLastShot='lastshotads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_g18_adsup', 'vm_g18_adsdown'), shots=['g18-1', 'g18-2', 'g18-3'], glow='#ff3a3a'),
]
# the mod's attachment models, mounted on the guns' tags by the weapon-levels mod (def.mounts)
MOUNTS = {}
for att, mdl, tag in [('reddot', 'reflex_vmgun', 'tag_red_dot'), ('holo', 'eotech_vmgun', 'tag_eotech'),
                      ('reflex2x', '2xreflex_vmgun', 'tag_red_dot'), ('suppressor', 'vm_sup', 'tag_silencer')]:
    if (SRC/'xmodels'/mdl).exists(): MOUNTS[att] = {'model': model(mdl, 'attach_'+mdl)[0], 'tag': tag}
# in-model parts that start hidden and unlock (lasers, foregrips), and stat-only unlocks
PARTS = {'bo3_mr23_tesla': ['tag_sra', 'tag_foregrip'], 'bo3_p90_orbit': ['tag_sra1'], 'bo3_m1014_jellyfish': ['tag_foregripd']}
modsounds = {}
for w in MODW:
    if not (SRC/'xmodels'/w['model']).exists(): print('skip', w['id']); continue
    view, gm = model(w['model'], glow=w['glow'], glow_maps={k: (png(v[0]), v[1], v[2]) for k, v in GLOW_MAPS.items() if png(v[0])})
    gb = {b['name']: b['lpos'] for b in gm['bones'] if 'lpos' in b and b['parent'] >= 0}
    A2, T2, notes = {}, {}, set()
    for role, suffix in w['roles'].items():
        role = 'raise' if role == 'rais' else role   # ('raise' is a Python keyword)
        name = w['pre']+'_'+suffix
        if not (SRC/'xanims'/(name+'.seanim')).exists(): print('  no anim', name); continue
        A2[role+'Anim'], T2[role] = animation(name, gb, role in ('idle', 'emptyIdle', 'sprintLoop'))
        notes |= {n for _, n in read_seanim(SRC/'xanims'/(name+'.seanim'))['notes'] if n.startswith('sndnt#')}
    for name in (w['pre']+'_inspect', w['pre']+'_inspect_full'):   # weapon inspect (hold reload; mods/inspect)
        if (SRC/'xanims'/(name+'.seanim')).exists():
            A2['inspectAnim'], T2['inspect'] = animation(name, gb)
            notes |= {n for _, n in read_seanim(SRC/'xanims'/(name+'.seanim'))['notes'] if n.startswith('sndnt#')}; break
    for key, name in zip(('adsUpAnim', 'adsDownAnim'), w['ads']):
        if (SRC/'xanims'/(name+'.seanim')).exists(): A2[key], _ = animation(name, gb)
    A2.setdefault('emptyIdleAnim', A2['idleAnim']); A2.setdefault('lastShotAnim', A2['fireAnim'])
    A2.setdefault('adsFireAnim', A2['fireAnim']); A2.setdefault('adsLastShotAnim', A2['adsFireAnim'])
    A2.setdefault('reloadEmptyAnim', A2['reloadAnim']); A2['quickRaiseAnim'] = A2['raiseAnim']; A2['quickDropAnim'] = A2['dropAnim']
    t = {k: v for k, v in GAME[w['tpl']].items() if k not in ('animations', 'upgrade', 'sounds', 'notetrackSounds', 'hideTags', 'model', 'worldModel', 'id', 'name')}
    t.update(w['stats'])
    t.update(raiseTime=T2['raise'], dropTime=T2['drop'], sprintInTime=T2['sprintIn'], sprintLoopTime=T2['sprintLoop'], sprintOutTime=T2['sprintOut'],
             reloadTime=T2['reload'], reloadEmptyTime=T2.get('reloadEmpty', T2['reload']))
    if 'inspect' in T2: t['inspectTime'] = T2['inspect']
    if t.get('segmentedReload'): t.update(reloadStartTime=T2['reloadStart'], reloadEndTime=T2['reloadEnd'])
    mounts = {k: v for k, v in MOUNTS.items() if v['tag'] in {b['name'] for b in gm['bones']}}
    common2 = {**t, 'hideTags': PARTS.get(w['id'], []), 'mounts': mounts, 'statAttachments': ['extmag'], 'sounds': {}, 'notetrackSounds': {}, 'handsModel': hands, 'animations': A2, 'model': view, 'worldModel': view,
               'bo3': True, 'modWeapon': True, 'glow': w['glow'], 'arc': w.get('arc', False), 'viewOffset': w.get('offset', [3, -4, 0]), 'weaponClass': w['cls']}
    up = {**common2, 'name': w['up'], 'clipSize': int(t['clipSize']*1.5), 'maxAmmo': int(t['maxAmmo']*1.5), 'startAmmo': int(t['maxAmmo']*1.5),
          'damage': t['damage']*2.2, 'minDamage': t['minDamage']*2.2}
    for k in ('bo3', 'modWeapon', 'price'): up.pop(k, None)
    weapons[w['id']] = {'id': w['id'], 'name': w['name'], **common2, 'upgrade': up}
    modsounds[w['id']] = {'shots': [k for k in map(snd, w['shots']) if k], 'last': [k for k in map(snd, w.get('last', [])) if k],
                          'notes': {n: k for n in sorted(notes) if (k := snd(n[6:]) or snd(n[6:]+'_r') or snd(NOTE_ALIAS.get(n[6:], '')))}}
    print(w['id'], 'anims', len(A2), 'sounds', len(modsounds[w['id']]['shots']), '+', len(modsounds[w['id']]['notes']), 'notes of', len(notes))
(MOD/'weapons.json').write_text(json.dumps({'weapons': weapons, 'sounds': {'dg2': sounds, 'mod': modsounds, 'audio': audio_keys}, 'fx': fx}, indent=1))
print('wrote', MOD/'weapons.json')
