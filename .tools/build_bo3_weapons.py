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
import importlib.util, re
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

def webp_small(stem, kind):
    # world models (Mystery Box, Pack-a-Punch, co-op third person): every weapon's is preloaded at startup, and the
    # viewmodel GLBs add up to ~60 MB; these carry only a 256 px colour map (no normal/roughness)
    if kind != 'diffuse': return None
    src = SRC/'ximages'/(stem+'.png')
    if not src.exists(): return None
    with tempfile.NamedTemporaryFile(suffix='.webp') as out:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(256,iw)':-2", '-c:v', 'libwebp', '-quality', '80', out.name], check=True)
        return pathlib.Path(out.name).read_bytes(), 'image/webp'

def model(name, out_name=None, rename=None, glow=None, glow_maps=None, light=False, drop=None):
    sem = SEM.read_semodel(SRC/'xmodels'/name/(name+'_LOD0.semodel'))
    if drop:   # meshes whose material matches `drop` left out (Der Eisendrache's bow carries every variant's arrow)
        sem['meshes'] = [m for m in sem['meshes'] if not (m['mats'] and re.search(drop, sem['materials'][m['mats'][0]]['name'], re.I))]
    out = MOD/'models'/((out_name or name)+'.glb')
    SEM.to_glb(sem, out, texture_loader=webp_small if light else webp, rename=rename, glow=glow, glow_maps=glow_maps)
    print('model', out.name, f'{out.stat().st_size/1e6:.1f} MB')
    return WEB+'models/'+out.name+ver(out), sem

def round_list(v, n): return [round(x, n) for x in v]

def read_clips(names):
    # several clips played back to back as one (the Tac-19's fire + pump: the engine has no rechamber step)
    parts = [read_seanim(SRC/'xanims'/(n+'.seanim')) for n in names]
    out, off = {'framerate': parts[0]['framerate'], 'bones': {}, 'notes': []}, 0
    for a in parts:
        for bone, tracks in a['bones'].items():
            o = out['bones'].setdefault(bone, {})
            for k in ('rot', 'loc'):
                if tracks.get(k): o.setdefault(k, []).extend((f+off, v) for f, v in tracks[k])
        out['notes'] += [(f+off, n) for f, n in a['notes']]
        off += max(a['frames']-1, 1)
    out['frames'] = off+1
    return out

def animation(name, gun_bind, loop=False):
    if isinstance(name, (list, tuple)):
        a = read_clips(name); name = name[0]+''.join('_'+n.rsplit('_', 1)[-1] for n in name[1:])
    else: a = read_seanim(SRC/'xanims'/(name+'.seanim'))
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
# the Advanced Warfare pack's bank (skye_ports/s1_<gun>/{fire,foley}/wpn_s1_*.wav): its notetracks name the files directly
SND_ROOTS = [(SND, 'mod/'), (SRC/'sounds'/'skye_ports', 'aw/')]
all_wavs = {}
for root, pre in SND_ROOTS:
    if root.is_dir(): all_wavs.update({w.name.split('.')[0]: (w, pre+str(w.relative_to(root)).split('.')[0]) for w in root.rglob('*.wav')})
audio_keys = {}
def snd(stem):
    w, key = all_wavs.get(stem, (None, None))
    if not w: return None
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
    'mtl_wea_ak47_ak47_blue_led': ('i_wea_ak47_ak47_blue_led_c', [.4, 0], False),       # Uzi: travelling cyan spot
    'mtl_wea_ak47_ak47_blue_bullet': ('i_wea_ak47_ak47_blue_bullet_c', [0, 0], True),
    'mtl_wea_ak47_ak47_blue_lighting': ('i_wea_ak47_ak47_blue_lighting_c', [.15, .07], False),   # lightning ring, crawling
    'mtl_wea_aa12btf_purple_lighting': ('i_wea_aa12btf_purple_lighting_c', [.15, .07], True),
    'mtl_wea_aa12btf_purple_lighting_2': ('i_wea_aa12btf_purple_lighting_2_c', [0, 0], True),
    'mtl_aa12_glow_ani': ('i_glow_blue_ani_c', [.5, 0], True),   # its own image isn't in the mod's packages
    'mtl_bow_heloderma_glow': ('i_as50_as50heloderma_glow_e', [.3, 0], True),
    'mtl_wea_bow_bowss_light': ('i_wea_bow_bowss_light_e', [0, 0], True),
    'mtl_wea_bow_bowss_blk_glow': ('i_wea_bow_bowss_blk_glow_e', [0, 0], True),
}
# notetrack aliases with no file of that name in the mod's bank (its alias table isn't exportable):
# stand-ins from the same bank, copied to sounds/codolbf/weapons/_generic/ (see docs/fork/weapons.md)
NOTE_ALIAS = {'ins1': 'fly_cloth_01', 'ins2': 'fly_cloth_02', 'ins3': 'fly_cloth_03', 'weap_raise_plr': 'weap_ariarm27_raise_plr',
              # AS50 and 93R reload foley isn't in the mod's banks (base-game aliases): other guns' bolt and mag sounds
              'wpfoly_as50_reload_chamber_v1': 'sr2_boltpull1', 'wpfoly_as50_reload_open_v1': 'sr2_boltpull2', 'wpfoly_as50_reload_clipout_v1': 'm240_boxout',
              'wpfoly_as50_reload_lift_v1': 'm240_coverup1', 'wpfoly_as50_reload_clipin_v1': 'm240_boxin', '93r_clipout': 'js2_clipout', '93r_clipin': 'js2_clipin',
              'wpfoly_spas12_reload_loop_v1': 'dao12_insertshell', 'wpfoly_spas12_reload_open_v1': 'm240_coverup2', 'wpfoly_spas12_reload_close_v1': 'm240_coverdown2',
              'wpfoly_spas12_reload_lift_v1': 'm240_coverup1', 'ins': 'fly_cloth_02', 'wpn_bowss_pull': 'wpn_bowss_pull_01',
              'aek971_clipin': 'aek971_clipin2', 'wpfoly_ak47_reload_lift_v4': 'fly_cloth_02',
              'wpfoly_g36c_reload_chamber_v1': 'sa80_boltpull1', 'wpfoly_g36c_reload_chamber_v2': 'sa80_boltpull2', 'wpfoly_g36c_reload_lift_v1': 'fly_cloth_01',
              'wpfoly_g36c_reload_clipout_v1': 'sa80_clipout', 'wpfoly_g36c_reload_clipin_v1': 'sa80_clipin',
              'weap_vector_chamber_plr': 'ump_boltback', 'weap_vector_clipout_plr': 'weap_vectorhw_clipout_hvn_plr', 'weap_vector_lift_plr': 'weap_vectorhw_lift_plr', 'weap_vector_clipin_plr': 'weap_vectorhw_clipin_hvn_plr',
              'wpfoly_mp5k_reload_lift_v1': 'fly_cloth_01', 'wpfoly_mp5k_reload_clipout_v1': 'mp7_clipout', 'wpfoly_mp5k_reload_clipin_v1': 'mp7_clipin1',
              'weap_m1887_open_plr': 'js2_boltpull1', 'weap_m1887_close_plr': 'js2_boltpull2', 'weap_m1887_lift_plr': 'fly_cloth_03', 'weap_m1887_loop_plr': 'dao12_insertshell',
              'weap_mg4_chamber_plr': 'm240_boltpull1', 'weap_mg4_chamber_plr2': 'm240_boltpull2', 'weap_mg4_cliphit_plr': 'm240_chain', 'weap_mg4_clipin_plr': 'm240_boxin',
              'weap_mg4_clipout_plr': 'm240_boxout', 'weap_mg4_clippull_plr': 'm240_chain', 'weap_mg4_close_plr': 'm240_coverdown1', 'weap_mg4_close_plr2': 'm240_coverdown2',
              'weap_mg4_open_plr': 'm240_coverup1', 'weap_mg4_open_plr2': 'm240_coverup2'}
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
  # second batch (2026-10-04)
  dict(cls='Light machine gun', id='bo3_m240_ice', name='M240 Ice', up='M240 Permafrost', model='m240_ice_vmgun', pre='vm_m240', tpl='rpk_zm',
       stats=dict(clipSize=100, maxAmmo=400, startAmmo=400, damage=130, minDamage=90, fireTime=.075, price=2000),
       roles=dict(idle='idle', emptyIdle='idle_empty', fire='fire', lastShot='lastshot', adsFire='fireads', adsLastShot='lastshot_ads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart_empty', sprintLoop='runing_empty', sprintOut='runover_empty'),
       ads=('vm_m240_adsup', 'vm_m240_adsdown'), shots=['m240-1', 'm240-2', 'm240-3'], glow='#8fe3ff'),
  dict(cls='Sniper rifle', id='bo3_as50_rare', name='AS50 Overgrowth', up='AS50 Wildwood', model='as50_rare_vmgun', pre='vm_as50', tpl='dragunov_zm',
       stats=dict(clipSize=10, maxAmmo=60, startAmmo=60, damage=1000, minDamage=700, fireTime=.3, price=2500, scope='duplex'),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reloadempty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_as50_adsup', 'vm_as50_adsdown'), shots=['m82-1', 'm82-2', 'm82-3'], glow='#9aff6a', fixed=[('as50_rare_scope_vmgun', 'tag_scope')]),
  dict(cls='Submachine gun', id='bo3_uzi_irradiated', name='Uzi Irradiated', up='Uzi Meltdown', model='uzi_irradiated_blue_vmgun', pre='vm_uzi', tpl='mp5k_zm',
       stats=dict(clipSize=32, maxAmmo=256, startAmmo=256, damage=90, minDamage=55, fireTime=.055, price=1100),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_uzi_adsup', 'vm_uzi_adsdown'), shots=['wpn_miniuziss_rifle_fire_plr'], glow='#36e0ff'),
  dict(cls='Pistol', id='bo3_93r_dystopic', name='93R Dystopic', up='93R Collapse', model='93r_dystopic_vmgun', pre='vm_93r', tpl='cz75_zm',
       stats=dict(clipSize=20, maxAmmo=180, startAmmo=180, damage=120, minDamage=80, fireTime=.06, fireType='3-Round Burst', automatic=False, price=800),
       roles=dict(idle='idle', emptyIdle='idle_empty', fire='fire', lastShot='lastshot', adsFire='adsfire', adsLastShot='lastshot_ads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_93r_adsup', 'vm_93r_adsdown'), shots=['93r-1', '93r-2', '93r-3'], glow='#ff5a3a'),
  dict(cls='Shotgun', id='bo3_aa12_btf', name='AA-12 Breach', up='AA-12 Rift', model='aa12_btf_vmgun', pre='vm_aa12_grip', tpl='spas_zm',
       stats=dict(clipSize=20, maxAmmo=120, startAmmo=120, damage=140, minDamage=20, fireTime=.2, pellets=8, automatic=True, fireType='Full Auto', segmentedReload=False, price=2000),
       roles=dict(idle='idle', fire='fire', adsFire='fire_ads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='run_start', sprintLoop='run_in', sprintOut='run_stop'),
       ads=('vm_aa12_adsup', 'vm_aa12_adsdown'), shots=['u12-1', 'u12-2', 'u12-3'], glow='#b45cff'),
  # third batch (2026-10-04)
  dict(cls='Light machine gun', id='bo3_rpd_ornate', name='RPD Ornate', up='RPD Gilded', model='rpd_ornate_vmgun', pre='vm_rpd', tpl='rpk_zm',
       stats=dict(clipSize=100, maxAmmo=400, startAmmo=400, damage=125, minDamage=85, fireTime=.08, price=1800),
       roles=dict(idle='idle', fire='fire', adsFire='adsfire', reload='reload', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_rpd_adsup', 'vm_rpd_adsdown'), shots=['wpn_h1_rpd_shot_01', 'wpn_h1_rpd_shot_02', 'wpn_h1_rpd_shot_03', 'wpn_h1_rpd_shot_04'], glow='#ffd36a'),
  dict(cls='Shotgun', id='bo3_spas12_irradiated', name='SPAS-12 Irradiated', up='SPAS-12 Fallout', model='spas12_irradiated_vmgun', pre='vm_spas12', tpl='spas_zm',
       stats=dict(clipSize=8, maxAmmo=64, startAmmo=64, damage=170, minDamage=25, fireTime=.7, pellets=8, price=1500),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reloadloop', reloadStart='reloadstart', reloadEnd='reloadend_irr', rais='pullout', firstRaise='pullout_first_irr', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_spas12_adsup', 'vm_spas12_adsdown'), shots=['spas12-1', 'spas12-2', 'spas12-3'], glow='#7dff3a'),
  dict(cls='Submachine gun', id='bo3_mp7_flanker', name='MP7 Flanker', up='MP7 Outrider', model='mp7_flanker_vmgun', pre='vm_mp7', tpl='mp5k_zm',
       stats=dict(clipSize=40, maxAmmo=280, startAmmo=280, damage=95, minDamage=60, fireTime=.06, price=1200),
       roles=dict(idle='idle', fire='fire', adsFire='fire_ads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runing', sprintLoop='runing', sprintOut='runing'),
       ads=('vm_mp7_adsup', 'vm_mp7_adsdown'), shots=['mp7-1', 'mp7-2', 'mp7-3'], glow='#5ab4ff'),
  dict(cls='Submachine gun', id='bo3_tommy_modern', name='Tommy Modern', up='Tommy Syndicate', model='tommy_modern_vmgun', pre='vm_tommy', tpl='mp40_zm',
       stats=dict(clipSize=50, maxAmmo=300, startAmmo=300, damage=110, minDamage=70, fireTime=.075, price=1400, soundAs='mp40_zm'),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', lastShot='lastshot', adsLastShot='lastshotads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_tommy_adsup', 'vm_tommy_adsdown'), shots=[], glow='#ff9a3a',
       # the model is rigged as the left gun of an akimbo pair (tag_weapon_le, bones suffixed 1): renamed so the single-gun anims drive it
       rename={'tag_weapon_le': 'tag_weapon', 'tag_flash_le': 'tag_flash', 'tag_brass_le': 'tag_brass', **{b+'1': b for b in ['j_bolt', 'tag_up', 'tag_down', 'tag_stock', 'tag_clip', 'tag_ironsight', 'tag_grip', 'tag_foregrip', 'tag_flash', 'tag_brass', 'tag_silencer', 'tag_sra']}}),
  # unique ones
  dict(cls='Wonder weapon', id='bo3_bow', name='Heloderma Bow', up="Gila's Wrath", model='bowss_vmgun', pre='vm_bow', tpl='crossbow_explosive_zm',
       stats=dict(clipSize=1, maxAmmo=40, startAmmo=40, damage=900, minDamage=0, explosionRadius=200, explosionInnerDamage=900, explosionOuterDamage=150, price=3000),
       roles=dict(idle='idle', fire='fire', reload='charge', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runloop', sprintOut='runover'),
       ads=('vm_bow_ads_up', 'vm_bow_ads_down'), shots=['wpn_bowss_fire_quick', 'wpn_bowss_fire_med', 'wpn_bowss_fire_long'], glow='#ff7a2a'),
  dict(cls='Launcher', id='bo3_rpg_dragon', name='RPG Dragon', up='RPG Wyrm', model='rpg_dragon_rh_vmgun', pre='vm_rpg', tpl='m72_law_zm',
       stats=dict(clipSize=1, maxAmmo=12, startAmmo=12, price=2500, soundAs='m72_law_zm', hideClipEmpty=True),
       roles=dict(idle='idle', fire='fire', reload='reload', rais='pullout', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_rpg_adsup', 'vm_rpg_adsdown'), shots=[], glow='#ff5a1a', fixed=[('rpg_dragon_rocket_vmgun', 'tag_clip')], projectile='rpg_dragon_rocket_vmgun'),  # fourth batch (2026-10-04)
  dict(cls='Rifle', id='bo3_ak117', name='AK117', up='AK117 Overdrive', model='ak117_vmgun', pre='vm_ak117', tpl='galil_zm',
       stats=dict(clipSize=30, maxAmmo=270, startAmmo=270, damage=135, minDamage=87, fireTime=0.075, automatic=True, fireType='Full Auto', price=1300),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_ak117_adsup', 'vm_ak117_adsdown'), shots=['ak12-1', 'ak12-2', 'ak12-3'], glow='#ff7a3a'),
  dict(cls='Rifle', id='bo3_f2000_tech', name='F2000 Tech', up='F2000 Mainframe', model='f2000tech_vmgun', pre='vm_f2000', tpl='famas_zm',
       stats=dict(clipSize=30, maxAmmo=270, startAmmo=270, damage=130, minDamage=84, fireTime=0.068, automatic=True, fireType='Full Auto', price=1300),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_f2000_adsup', 'vm_f2000_adsdown'), shots=['f2000-1', 'f2000-2', 'f2000-3'], glow='#3affd2'),
  dict(cls='Rifle', id='bo3_g37h_water', name='G37H Tidal', up='G37H Riptide', model='g37h_water_vmgun', pre='vm_g37h', tpl='commando_zm',
       stats=dict(clipSize=30, maxAmmo=270, startAmmo=270, damage=125, minDamage=81, fireTime=0.07, automatic=True, fireType='Full Auto', price=1300),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_g37h_adsup', 'vm_g37h_adsdown'), shots=['g36-1', 'g36-2', 'g36-3'], glow='#3aa8ff'),
  dict(cls='Rifle', id='bo3_sa80', name='SA80', up='SA80 Sovereign', model='sa80_vmgun', pre='vm_sa80', tpl='m16_zm',
       stats=dict(clipSize=30, maxAmmo=270, startAmmo=270, damage=140, minDamage=91, fireTime=0.08, automatic=True, fireType='Full Auto', price=1300),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_sa80_adsup', 'vm_sa80_adsdown'), shots=['l85-1', 'l85-2', 'l85-3'], glow='#ffcf5a'),
  dict(cls='Submachine gun', id='bo3_k9_heaven', name='K9 Heaven', up='K9 Seraph', model='k9_heaven_vmgun', pre='vm_k9', tpl='mp5k_zm',
       stats=dict(clipSize=33, maxAmmo=264, startAmmo=264, damage=95, minDamage=61, fireTime=0.05, automatic=True, fireType='Full Auto', price=1200),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reloadempty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_k9_adsup', 'vm_k9_adsdown'), shots=['weap_decho_fire_plr_01', 'weap_decho_fire_plr_02', 'weap_decho_fire_plr_03', 'weap_decho_fire_plr_04', 'weap_decho_fire_plr_05', 'weap_decho_fire_plr_06'], glow='#fff2a8'),
  dict(cls='Submachine gun', id='bo3_smg5_tool', name='SMG5 Tool', up='SMG5 Workshop', model='smg5_tool_vmgun', pre='vm_smg5', tpl='mp5k_zm',
       stats=dict(clipSize=30, maxAmmo=240, startAmmo=240, damage=95, minDamage=61, fireTime=0.065, automatic=True, fireType='Full Auto', price=1000),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_smg5_adsup', 'vm_smg5_adsdown'), shots=['wpn_h1_ak74u_shot_01'], glow='#ffb03a'),
  dict(cls='Submachine gun', id='bo3_umg_dmz', name='UMG DMZ', up='UMG Exclusion Zone', model='umg_dmz_vmgun', pre='vm_umg', tpl='mp5k_zm',
       stats=dict(clipSize=25, maxAmmo=250, startAmmo=250, damage=110, minDamage=71, fireTime=0.09, automatic=True, fireType='Full Auto', price=1100),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_umg_adsup', 'vm_umg_adsdown'), shots=['ump45-1', 'ump45-2', 'ump45-3'], glow='#9aff3a'),
  dict(cls='Shotgun', id='bo3_m1887', name='M1887', up='M1887 Lead Rain', model='m1887_vmgun', pre='vm_m1887', tpl='spas_zm',
       stats=dict(clipSize=7, maxAmmo=56, startAmmo=56, damage=180, minDamage=25, fireTime=.8, pellets=8, price=1500),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reloading', reloadStart='reloadstart', reloadEnd='reloadend', rais='pullout', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_m1887_adsup', 'vm_m1887_adsdown'), shots=['870-1', '870-2', '870-3'], glow='#ffa23a'),
  dict(cls='Shotgun', id='bo3_striker', name='Striker', up='Striker Thunderclap', model='striker_vmgun', pre='vm_striker', tpl='spas_zm',
       stats=dict(clipSize=12, maxAmmo=72, startAmmo=72, damage=150, minDamage=20, fireTime=.25, pellets=8, price=1700),
       roles=dict(idle='idle', fire='fire', reload='reload_loop', reloadStart='reload_start', reloadEnd='reload_end', rais='pullout_first', firstRaise='pullout_first', drop='putaway', sprintIn='runstart', sprintLoop='runloop', sprintOut='runover'),
       ads=('vm_striker_adsup', 'vm_striker_adsdown'), shots=['spas12-1', 'spas12-2', 'spas12-3'], glow='#5affd8'),
  dict(cls='Light machine gun', id='bo3_mg4_heaven', name='MG4 Heaven', up='MG4 Archangel', model='mag43_heaven_vmgun', pre='vm_mag43', tpl='rpk_zm',
       stats=dict(clipSize=100, maxAmmo=400, startAmmo=400, damage=135, minDamage=90, fireTime=.07, price=2200),
       roles=dict(idle='idle', fire='fire', adsFire='fireads', reload='reload', rais='pullout', drop='putaway', sprintIn='runstart', sprintLoop='runing', sprintOut='runover'),
       ads=('vm_mag43_adsup', 'vm_mag43_adsdown'), shots=['weap_mg4_hvn_fire_plr'], glow='#ff3a3a'),
  # Der Eisendrache's Wrath of the Ancients (BO3's own bow, wpn_t7_zmb_bow_base_*, exported from zm_castle; the
  # vm_bow_launcher_* clips): a quest weapon (mods/der-eisendrache), not in the Mystery Box. Fire looses the arrow;
  # bows.js plays draw / draw_loop / draw_cancel (chargeAnim...) while the shot is held and nocks the next arrow itself
  # (no reload); the arrow explodes on impact like the crossbow.
  dict(cls='Wonder weapon', id='bo3_wrath_ancients', name='Wrath of the Ancients', up="Wrath of the Ancients", model='wpn_t7_zmb_bow_base_view', world='wpn_t7_zmb_bow_base_world',
       pre='vm_bow_launcher', tpl='crossbow_explosive_zm', drop=r'rune|storm|demon|wolf', noBox=True,
       stats=dict(clipSize=1, maxAmmo=60, startAmmo=60, damage=1100, minDamage=0, explosionRadius=180, explosionInnerDamage=1100, explosionOuterDamage=250, price=0),
       roles=dict(idle='idle', fire='fire', reload='draw', charge='draw', chargeLoop='draw_loop', chargeCancel='draw_cancel', rais='pullout', firstRaise='first_raise', drop='putaway', sprintIn='sprint_in', sprintLoop='sprint_loop', sprintOut='sprint_out'),
       ads=('vm_bow_launcher_ads_base_up', 'vm_bow_launcher_ads_base_down'), shots=['wpn_bowss_fire_quick', 'wpn_bowss_fire_med', 'wpn_bowss_fire_long'], glow='#ff6a1a',
       projectile='wpn_t7_zmb_bow_base_projectile', offset=[0, -2, 0]),
]
# its four upgrades (zm_castle_weap_quest_upgrade.gsc; mods/der-eisendrache/bows.js runs the quests and the element
# effects): each view model carries every element's arrows and trims, so the others' are dropped
ELEMENTS = {'storm': ('Storm Bow', '#7fd0ff'), 'rune': ('Fire Bow', '#ff6a1a'), 'wolf': ('Wolf Bow', '#9fd8ff'), 'demon': ('Void Bow', '#b06bff')}
for el, (nm, col) in ELEMENTS.items():
    others = [o for o in ELEMENTS if o != el]
    drop = '|'.join([f'bow_{o}_(missile|missle)' for o in ['base'] + others] + [f'bow_{o}_(crystals|rocks|arches)' for o in others])
    MODW.append(dict(cls='Wonder weapon', id=f'bo3_bow_{el}', name=nm, up=nm, model=f'wpn_t7_zmb_bow_{el}_view', world=f'wpn_t7_zmb_bow_{el}_world',
                     pre='vm_bow_launcher', tpl='crossbow_explosive_zm', drop=drop, noBox=True,
                     stats=dict(clipSize=1, maxAmmo=60, startAmmo=60, damage=1500, minDamage=0, explosionRadius=200, explosionInnerDamage=1500, explosionOuterDamage=400, price=0),
                     roles=MODW[-1]['roles'], ads=MODW[-1]['ads'], shots=MODW[-1]['shots'], glow=col, projectile=f'wpn_t7_zmb_bow_{el}_projectile', offset=[0, -2, 0], element=el))
# ---- the Advanced Warfare pack (workshop 1793220683, Skye's s1_ ports: models vm_s1_*/wm_s1_*, clips am_s1_<gun>_*,
# sounds skye_ports/s1_<gun>/; its streamed images need the pack's xpaks hard-linked into BO3's zone folder while
# Greyhound exports, see docs/fork/weapons.md). Each has its own Pack-a-Punched model (_up).
def aw(cls, gid, name, up, gun, tpl, stats, glow, single=True, **kw):
    pre = 'am_s1_'+gun.removesuffix('_turret')
    roles = dict(idle='idle', fire='fire', adsFire='ads_fire', reload='reload', reloadEmpty='reload_empty', rais='pullout', firstRaise='first_raise',
                 drop='putaway', sprintIn='sprint_in', sprintLoop='sprint_loop', sprintOut='sprint_out')
    roles.update(kw.pop('roles', {}))
    mdl = kw.pop('model', 'vm_s1_'+gun+('' if single else '_rdw'))
    return dict(cls=cls, id='aw_'+gid, name=name, up=up, model=mdl, world=kw.pop('world', 'wm_s1_'+gun+('' if single else '_rdw')),
                upModel=kw.pop('upModel', mdl+'_up'), upWorld=kw.pop('upWorld', 'wm_s1_'+gun+('' if single else '_rdw')+'_up'), pre=pre, tpl=tpl, stats=stats, roles=roles,
                ads=kw.pop('ads', (pre+'_ads_up', pre+'_ads_down')), shots=['wpn_s1_'+gun+'_shot'], upShots=['wpn_s1_'+gun+'_pap_shot'], glow=glow, **kw)
DW_ROLES = dict(idle='rdw_idle', fire='rdw_fire', adsFire='rdw_fire', reload='rdw_reload', reloadEmpty='rdw_reload_empty', rais='fdw_pullout', firstRaise='fdw_pullout',
                drop='fdw_putaway', sprintIn='fdw_sprint_in', sprintLoop='fdw_sprint_loop', sprintOut='fdw_sprint_out')
MODW += [
  aw('Shotgun', 'cel3', 'CEL-3 Cauterizer', 'CEL-3 Immolator', 'cel3', 'spas_zm', glow='#ff7a2a',
     stats=dict(clipSize=20, maxAmmo=120, startAmmo=120, damage=150, minDamage=20, fireTime=.2, pellets=8, automatic=True, fireType='Full Auto', segmentedReload=False, price=2000),
     roles=dict(lastShot='fire_last', adsLastShot='ads_fire_last', firstRaise='pullout')),
  aw('Shotgun', 'blunderbuss', 'Blunderbuss', 'Thunderbuss', 'blunderbuss', 'spas_zm', glow='#ffb45a',
     stats=dict(clipSize=4, maxAmmo=48, startAmmo=48, damage=200, minDamage=25, fireTime=.4, pellets=12, segmentedReload=False, price=1500),
     roles=dict(adsFire='fire', reloadEmpty='reload', firstRaise='pullout')),
  # pump action: fire and pump joined into one clip (fireTime covers both), shells one at a time
  aw('Shotgun', 'tac19', 'Tac-19', 'Tac-19 Hellfire', 'tac19', 'ithaca_zm', glow='#ff4a3a',
     stats=dict(clipSize=6, maxAmmo=54, startAmmo=54, damage=170, minDamage=20, fireTime=.9, pellets=8, price=1500, segmentedReload=True, reloadAmmoAdd=1, reloadStartAdd=0),
     roles=dict(fire=('fire', 'pump'), adsFire=('ads_fire', 'ads_pump'), reload='reload_loop', reloadStart='reload_in', reloadEnd='reload_out', reloadEmpty=None, firstRaise='pullout'),
     sight=dict(tag='tag_weapon', offset=[8, 0, 15.5]),
     # its grip variant: a vertical foregrip (BO3's Man-O-War grip) on the pump, and the grip_* clip set with it
     grip=dict(model='attach_t7_ar_talon_foregrip_01_view', tag='tag_foregrip',
               roles=dict(idle='grip_idle', fire=('grip_fire', 'grip_pump'), adsFire=('grip_ads_fire', 'grip_ads_pump'), reload='grip_reload_loop', reloadStart='grip_reload_in',
                          reloadEnd='grip_reload_out', rais='grip_pullout', firstRaise='grip_pullout', drop='grip_putaway', sprintIn='grip_sprint_in',
                          sprintLoop='grip_sprint_loop', sprintOut='grip_sprint_out'))),
  aw('Shotgun', 'bulldog', 'Bulldog', 'Bulldog Rabid', 'bulldog', 'spas_zm', glow='#5ad0ff',
     stats=dict(clipSize=6, maxAmmo=60, startAmmo=60, damage=160, minDamage=20, fireTime=.25, pellets=8, segmentedReload=False, price=1500),
     roles=dict(reloadEmpty='reload')),
  # alt: its shotgun form (the engine's attachment toggle, key 5), the gun folding open between them
  aw('Light machine gun', 'ohm', 'Ohm', 'Ohm Overload', 'ohm', 'rpk_zm', glow='#7affd2',
     stats=dict(clipSize=60, maxAmmo=360, startAmmo=360, damage=130, minDamage=90, fireTime=.085, price=2500),
     roles=dict(reloadEmpty='reload', firstRaise='pullout'), sight=dict(tag='tag_sight_on', offset=[-4, 0, 0]),
     alt=dict(name='Shotgun', tpl='spas_zm', into='to_shotty', out='out_shotty',
              stats=dict(clipSize=6, maxAmmo=48, startAmmo=48, damage=150, minDamage=25, fireTime=.45, pellets=8, automatic=False, fireType='Single Shot', segmentedReload=False),
              roles=dict(idle='shotty_idle', fire='shotty_fire', adsFire='shotty_ads_fire', reload='shotty_reload', rais='shotty_pullout', firstRaise='shotty_pullout',
                         drop='shotty_putaway', sprintIn='shotty_sprint_in', sprintLoop='shotty_sprint_loop', sprintOut='shotty_sprint_out'))),
  # arm-mounted exo guns, one per forearm: dual wield (rdw right, ldw left; the fdw clips move both)
  aw('Light machine gun', 'xmg', 'XMG', 'XMG Exterminator', 'xmg', 'rpk_zm', glow='#ff5a5a', single=False,
     stats=dict(clipSize=100, maxAmmo=500, startAmmo=500, damage=120, minDamage=85, fireTime=.065, price=3000),
     roles=dict(idle='rdw_idle', fire='rdw_fire', adsFire='rdw_fire', reload='rdw_reload', reloadEmpty='rdw_reload', rais='fdw_pullout', firstRaise='fdw_pullout',
                drop='fdw_putaway', sprintIn='fdw_sprint_in', sprintLoop='fdw_sprint_loop', sprintOut='fdw_sprint_out'),
     ads=('am_s1_xmg_fdw_ads_up', 'am_s1_xmg_fdw_ads_down'),
     left=dict(model='vm_s1_xmg_ldw', idle='ldw_idle', fire='ldw_fire', reload='ldw_reload'), upLeft='vm_s1_xmg_ldw_up',
     lockdown=('fdw_to_lockdown', 'fdw_out_lockdown')),   # aiming locks the guns down (mods/bo3-weapons/aw.js)
  aw('Pistol', 'm1_irons', 'M1 Irons', 'M1 Ironclad', 'm1_irons', 'm1911_zm', glow='#ffd36a',
     stats=dict(clipSize=8, maxAmmo=96, startAmmo=96, damage=350, minDamage=200, fireTime=.18, automatic=False, fireType='Single Shot', price=1000),
     offset=[-1, 4, 0]),   # its idle holds the revolver ~9 units lower than the Atlas 45's: raise it into view
  aw('Light machine gun', 'sentry', 'MG Turret', 'MG Fortress', 'sentry_turret', 'rpk_zm', glow='#ffcf5a',
     stats=dict(clipSize=150, maxAmmo=600, startAmmo=600, damage=135, minDamage=95, fireTime=.06, price=4000),
     roles={r: 'turret_'+s for r, s in dict(idle='idle', fire='fire', adsFire='fire', reload='reload', reloadEmpty='reload', rais='pullout', firstRaise='pullout',
                                             drop='putaway', sprintIn='sprint_in', sprintLoop='sprint_loop', sprintOut='sprint_out').items()},
     ads=('am_s1_sentry_turret_ads_up', 'am_s1_sentry_turret_ads_down')),
  aw('Launcher', 'mdl', 'MDL', 'MDL Devastator', 'mdl', 'china_lake_zm', glow='#ff9a3a',
     stats=dict(clipSize=6, maxAmmo=36, startAmmo=36, damage=600, minDamage=0, fireTime=.6, price=2500, segmentedReload=True, reloadAmmoAdd=1, reloadStartAdd=0),
     roles=dict(reload='reload_loop', reloadStart='reload_in', reloadEnd='reload_out', reloadEmpty=None)),
  aw('Pistol', 'rw1', 'RW1', 'RW1 Railstorm', 'rw1', 'm1911_zm', glow='#5a9aff',
     stats=dict(clipSize=1, maxAmmo=40, startAmmo=40, damage=2500, minDamage=1500, fireTime=.3, automatic=False, fireType='Single Shot', price=1200),
     roles=dict(reloadEmpty='reload', firstRaise='pullout'), sight=dict(tag='tag_weapon', offset=[8, 0, 10.5])),
  aw('Pistol', 'atlas45', 'Atlas 45', 'Atlas 45 Titan', 'atlas45', 'm1911_zm', glow='#ffa04a',
     stats=dict(clipSize=12, maxAmmo=120, startAmmo=120, damage=150, minDamage=90, fireTime=.12, automatic=False, fireType='Single Shot', price=900),
     roles=dict(firstRaise='pullout'), upModel='vm_s1_atlas45_rdw_up', upWorld='wm_s1_atlas45_rdw_up'),
  # akimbo pistols (rdw right, ldw left, fdw both). The pack has no plain left Atlas: the single one's bones get the _le names
  aw('Pistol', 'm1_irons_dw', 'M1 Irons Akimbo', 'M1 Ironclads', 'm1_irons', 'm1911_zm', glow='#ffd36a', single=False,
     stats=dict(clipSize=16, maxAmmo=160, startAmmo=160, damage=350, minDamage=200, fireTime=.12, automatic=False, fireType='Single Shot', price=2000),
     roles=DW_ROLES, ads=('am_s1_m1_irons_fdw_ads_up', 'am_s1_m1_irons_fdw_ads_down'),
     left=dict(model='vm_s1_m1_irons_ldw', idle='ldw_idle', fire='ldw_fire', reload='ldw_reload')),
  aw('Pistol', 'atlas45_dw', 'Atlas 45 Akimbo', 'Atlas 45 Titans', 'atlas45', 'm1911_zm', glow='#ffa04a', single=False,
     stats=dict(clipSize=24, maxAmmo=240, startAmmo=240, damage=150, minDamage=90, fireTime=.08, automatic=False, fireType='Single Shot', price=1800),
     roles=DW_ROLES, ads=('am_s1_atlas45_fdw_ads_up', 'am_s1_atlas45_fdw_ads_down'), model='vm_s1_atlas45', world='wm_s1_atlas45',
     upModel='vm_s1_atlas45_rdw_up', upWorld='wm_s1_atlas45_rdw_up',
     left=dict(model='vm_s1_atlas45', out='vm_s1_atlas45_ldw', suffix='_le', idle='ldw_idle', fire='ldw_fire', reload='ldw_reload', reloadEmpty='ldw_reload_empty'),
     upLeft='vm_s1_atlas45_ldw_up'),
]
for w in MODW:
    if w['id'].startswith('aw_'): w['roles'] = {k: v for k, v in w['roles'].items() if v}
# the mod's attachment models, mounted on the guns' tags by the weapon-levels mod (def.mounts)
MOUNTS = {}
for att, mdl, tag in [('reddot', 'reflex_vmgun', 'tag_red_dot'), ('holo', 'eotech_vmgun', 'tag_eotech'),
                      ('reflex2x', '2xreflex_vmgun', 'tag_red_dot'), ('suppressor', 'vm_sup', 'tag_silencer')]:
    if (SRC/'xmodels'/mdl).exists(): MOUNTS[att] = {'model': model(mdl, 'attach_'+mdl)[0], 'tag': tag}
# in-model parts that start hidden and unlock (lasers, foregrips), and stat-only unlocks
BUILT_IN_SIGHT = {'bo3_g18_death'}
# j_frontsight (MR23): a front-sight block the animations never position, hovering above the barrel
PARTS = {'bo3_mr23_tesla': ['tag_sra', 'tag_foregrip', 'j_frontsight'], 'bo3_p90_orbit': ['tag_sra1'], 'bo3_m1014_jellyfish': ['tag_foregripd'],
         'bo3_m240_ice': ['tag_foregrip'], 'bo3_uzi_irradiated': ['tag_sight', 'tag_foregrip'], 'bo3_aa12_btf': ['tag_foregrip'],
         'bo3_spas12_irradiated': ['tag_sra'], 'bo3_ak117': ['tag_sra'], 'bo3_f2000_tech': ['tag_foregrip'], 'bo3_g37h_water': ['tag_sra', 'tag_foregrip'],
         'bo3_sa80': ['tag_sra'], 'bo3_smg5_tool': ['tag_sra'], 'bo3_umg_dmz': ['tag_sra', 'tag_foregrip'], 'bo3_m1887': ['tag_sra', 'tag_foregrip'],
         'bo3_mg4_heaven': ['tag_sra', 'tag_foregrip']}
modsounds = {}
SOUND_NOTES = ('sndnt#', 'wpn_s1_')   # the codolbf pack's markers carry a prefix; the AW pack's are the sound names
def clip_notes(names): return {n for nm in names for _, n in read_seanim(SRC/'xanims'/(nm+'.seanim'))['notes'] if n.startswith(SOUND_NOTES)}
def clipset(w, roles, notes):
    # one clip per role ('fire': ('fire', 'pump') joins clips back to back); returns the animations and their lengths
    A, T = {}, {}
    for role, suffix in roles.items():
        role = 'raise' if role == 'rais' else role   # ('raise' is a Python keyword)
        names = [w['pre']+'_'+x for x in (suffix if isinstance(suffix, tuple) else (suffix,))]
        if not all((SRC/'xanims'/(n+'.seanim')).exists() for n in names): print('  no anim', names); continue
        A[role+'Anim'], T[role] = animation(names if len(names) > 1 else names[0], {}, role in ('idle', 'emptyIdle', 'sprintLoop', 'chargeLoop'))
        notes |= clip_notes(names)
    return A, T
def fill(A):
    A.setdefault('emptyIdleAnim', A['idleAnim']); A.setdefault('lastShotAnim', A['fireAnim'])
    A.setdefault('adsFireAnim', A['fireAnim']); A.setdefault('adsLastShotAnim', A['adsFireAnim'])
    A.setdefault('reloadEmptyAnim', A['reloadAnim']); A['quickRaiseAnim'] = A['raiseAnim']; A['quickDropAnim'] = A['dropAnim']
    return A
def times(T):
    t = dict(raiseTime=T['raise'], dropTime=T['drop'], sprintInTime=T.get('sprintIn'), sprintLoopTime=T.get('sprintLoop'), sprintOutTime=T.get('sprintOut'),
             reloadTime=T['reload'], reloadEmptyTime=T.get('reloadEmpty', T['reload']), reloadStartTime=T.get('reloadStart'), reloadEndTime=T.get('reloadEnd'))
    return {k: v for k, v in t.items() if v is not None}
def tpl_fields(tpl): return {k: v for k, v in GAME[tpl].items() if k not in ('animations', 'upgrade', 'sounds', 'notetrackSounds', 'hideTags', 'model', 'worldModel', 'id', 'name')}
for w in MODW:
    if not (SRC/'xmodels'/w['model']).exists(): print('skip', w['id']); continue
    view, gm = model(w['model'], rename=w.get('rename'), glow=w['glow'], glow_maps={k: (png(v[0]), v[1], v[2]) for k, v in GLOW_MAPS.items() if png(v[0])}, drop=w.get('drop'))
    world_url = model(w.get('world', w['model']), (w.get('world') or w['model'])+'_world', rename=w.get('rename'), glow=w['glow'], light=True, drop=w.get('drop'))[0]
    gb = {b['name']: b['lpos'] for b in gm['bones'] if 'lpos' in b and b['parent'] >= 0}
    notes = set()
    A2, T2 = clipset(w, w['roles'], notes)
    for name in (w['pre']+'_inspect', w['pre']+'_inspect_full'):   # weapon inspect (hold reload; mods/inspect)
        if (SRC/'xanims'/(name+'.seanim')).exists():
            A2['inspectAnim'], T2['inspect'] = animation(name, gb)
            notes |= {n for _, n in read_seanim(SRC/'xanims'/(name+'.seanim'))['notes'] if n.startswith(SOUND_NOTES)}; break
    for key, name in zip(('adsUpAnim', 'adsDownAnim'), w['ads']):
        if (SRC/'xanims'/(name+'.seanim')).exists(): A2[key], _ = animation(name, gb)
    fill(A2)
    if w.get('lockdown'):   # the XMG's lockdown: its fold-in and fold-out clips, posed while aiming (mods/bo3-weapons/aw.js)
        for key, suf in zip(('lockdownInAnim', 'lockdownOutAnim'), w['lockdown']): A2[key], _ = animation(w['pre']+'_'+suf, {})
    t = tpl_fields(w['tpl'])
    t.update(w['stats'])
    t.update(raiseTime=T2['raise'], dropTime=T2['drop'], sprintInTime=T2['sprintIn'], sprintLoopTime=T2['sprintLoop'], sprintOutTime=T2['sprintOut'],
             reloadTime=T2['reload'], reloadEmptyTime=T2.get('reloadEmpty', T2['reload']))
    if 'inspect' in T2: t['inspectTime'] = T2['inspect']
    if t.get('segmentedReload'): t.update(reloadStartTime=T2['reloadStart'], reloadEndTime=T2['reloadEnd'])
    # guns with their own sight built in take no optic mounts (the G18's tag_eotech sits behind the slide and its
    # tag_red_dot inside the built-in holo, so a mounted sight floated off the gun)
    mounts = {k: v for k, v in MOUNTS.items() if v['tag'] in {b['name'] for b in gm['bones']} and not (w['id'] in BUILT_IN_SIGHT and k in ('reddot', 'holo', 'reflex2x'))}
    # attachments that bring their own clips (gunsmith.js def.attachAnims): the AW guns' red dot (no rail tag: BO3's reflex
    # placed by an offset from a bone) with its own aim clips, and the Tac-19's foregrip with its grip clip set
    attach_anims = {}
    if w.get('sight') and 'reddot' in MOUNTS:
        mounts['reddot'] = {**MOUNTS['reddot'], **w['sight']}
        ads = [w['pre']+'_reddot_ads_'+d for d in ('up', 'down')]
        if all((SRC/'xanims'/(n+'.seanim')).exists() for n in ads): attach_anims['reddot'] = {'animations': {'adsUpAnim': animation(ads[0], {})[0], 'adsDownAnim': animation(ads[1], {})[0]}}
    if w.get('grip') and (SRC/'xmodels'/w['grip']['model']).exists():
        mounts['grip'] = {'model': model(w['grip']['model'], 'attach_'+w['grip']['model'])[0], 'tag': w['grip']['tag']}
        GA, GT = clipset(w, w['grip']['roles'], notes)
        attach_anims['grip'] = {'animations': fill(GA), **times(GT)}
    common2 = {**t, 'hideTags': PARTS.get(w['id'], []), 'mounts': mounts, 'statAttachments': ['extmag'], 'sounds': {}, 'notetrackSounds': {}, 'handsModel': hands, 'animations': A2, 'model': view, 'worldModel': world_url, 'lazyWorld': True,
               'bo3': True, 'modWeapon': True, **({'noBox': True} if w.get('noBox') else {}), **({'scope': 'reflex'} if w['id'] in BUILT_IN_SIGHT else {}), 'glow': w['glow'], 'arc': w.get('arc', False), **({'element': w['element']} if w.get('element') else {}), 'viewOffset': w.get('offset', [3, -4, 0]), 'weaponClass': w['cls'],
               # parts that are always on (the AS50's scope is its own model): mounted like attachments (mods/weapon-levels/mounts.js)
               'fixedParts': [{'model': model(mdl, 'part_'+mdl)[0], 'tag': tag} for mdl, tag in w.get('fixed', []) if (SRC/'xmodels'/mdl).exists()],
               **({'attachAnims': attach_anims} if attach_anims else {}), **({'lockdown': True} if w.get('lockdown') else {})}
    if w.get('projectile'): common2['projectileModel'] = model(w['projectile'], 'part_'+w['projectile'])[0]   # fired as the rocket
    up = {**common2, 'name': w['up'], 'clipSize': int(t['clipSize']*1.5), 'maxAmmo': int(t['maxAmmo']*1.5), 'startAmmo': int(t['maxAmmo']*1.5),
          'damage': t['damage']*2.2, 'minDamage': t['minDamage']*2.2}
    for k in ('bo3', 'modWeapon', 'price'): up.pop(k, None)
    if w.get('left'):   # dual wield (animation.js): the left gun's own clips ride on top of the right's; ADS is off
        lw = w['left']   # suffix: a single gun's bones renamed as the left hand's (lw['out'] names the copy)
        rn = lw.get('suffix') and {b['name']: b['name']+lw['suffix'] for b in SEM.read_semodel(SRC/'xmodels'/lw['model']/(lw['model']+'_LOD0.semodel'))['bones']}
        lv, lm = model(lw['model'], lw.get('out'), rename=rn or None, glow=w['glow'])
        LA = {'idleAnimLeft': None, 'fireAnimLeft': None, 'reloadAnimLeft': None, 'reloadEmptyAnimLeft': None}
        for key in list(LA):
            suf = w['left'].get(key[:-8])
            LA[key] = suf and (SRC/'xanims'/(w['pre']+'_'+suf+'.seanim')).exists() and animation(w['pre']+'_'+suf, {})[0]
        LA = {k: v for k, v in LA.items() if v}
        for d in (common2, up): d.update(dualWield=True, leftModel=lv, leftAnimations=LA)
        if w.get('upLeft') and (SRC/'xmodels'/w['upLeft']).exists(): up['leftModel'] = model(w['upLeft'], glow=w['glow'])[0]
    if w.get('upModel') and (SRC/'xmodels'/w['upModel']).exists():   # the pack's own Pack-a-Punched model
        up['model'] = model(w['upModel'], rename=w.get('rename'), glow=w['glow'], drop=w.get('drop'))[0]
        uw = w.get('upWorld', w['upModel'])
        if (SRC/'xmodels'/uw).exists(): up['worldModel'] = model(uw, uw+'_world', rename=w.get('rename'), glow=w['glow'], light=True, drop=w.get('drop'))[0]
    if w.get('alt'):   # a second form on the same model (the OHM's shotgun): def.attachment, entered and left through its own clips
        al = w['alt']; A3, T3 = clipset(w, al['roles'], notes); fill(A3)
        A3['attachInAnim'], _ = animation(w['pre']+'_'+al['into'], {}); A2['attachOutAnim'], _ = animation(w['pre']+'_'+al['out'], {})
        notes |= clip_notes([w['pre']+'_'+al['into'], w['pre']+'_'+al['out']])
        ta = {**tpl_fields(al['tpl']), **al['stats'], **times(T3)}; ta.pop('price', None)
        drop = ('attachAnims', 'statAttachments', 'mounts', 'price')
        common2['attachment'] = {**{k: v for k, v in common2.items() if k not in drop}, **ta, 'name': al['name'], 'animations': A3, 'altForm': True}
        up['attachment'] = {**common2['attachment'], 'model': up['model'], 'worldModel': up['worldModel'], 'clipSize': int(ta['clipSize']*1.5), 'maxAmmo': int(ta['maxAmmo']*1.5),
                            'startAmmo': int(ta['maxAmmo']*1.5), 'damage': ta['damage']*2.2, 'minDamage': ta['minDamage']*2.2}
    weapons[w['id']] = {'id': w['id'], 'name': w['name'], **common2, 'upgrade': up}
    modsounds[w['id']] = {'shots': [k for k in map(snd, w['shots']) if k], 'last': [k for k in map(snd, w.get('last', [])) if k],
                          'notes': {n: k for n in sorted(notes) if (k := snd(st := n.removeprefix('sndnt#')) or snd(st+'_r') or snd(st+'1') or snd(NOTE_ALIAS.get(st, '')))}}
    if w.get('upShots'): modsounds[w['id']]['upShots'] = [k for k in map(snd, w['upShots']) if k]
    print(w['id'], 'anims', len(A2), 'sounds', len(modsounds[w['id']]['shots']), '+', len(modsounds[w['id']]['notes']), 'notes of', len(notes))
# ---- operator weapons (mods/operator-weapons), not guns: the Ragnarok DG-4 (BO3's talon spikes, exported from
# zm_castle with its vm_talon_spike_* clips) on the same arms, as a def for its own ViewWeapon, plus the planted prop
operator = {}
if (SRC/'xmodels'/'wpn_zmb_dlc1_talon_spikes_view').exists():
    rv, rm = model('wpn_zmb_dlc1_talon_spikes_view', 'ragnarok_view', RENAME)
    rp = model('wpn_zmb_dlc1_talon_spikes_prop', 'ragnarok_prop', light=True)[0]
    rb = {b['name']: b['lpos'] for b in rm['bones'] if 'lpos' in b and b['parent'] >= 0}
    RA, RT = {}, {}
    for key, name, loop in [('idleAnim', 'idle', True), ('raiseAnim', 'raise', False), ('firstRaiseAnim', 'first_raise', False), ('dropAnim', 'putaway', False),
                            ('slamInAnim', 'slam_in', False), ('slamOutAnim', 'slam_out', False), ('plantAnim', 'plant', False), ('swipeAnim', 'melee_swipe', False),
                            ('sprintInAnim', 'sprint_in', False), ('sprintLoopAnim', 'sprint_loop', True), ('sprintOutAnim', 'sprint_out', False), ('adsUpAnim', 'ads_up', False)]:
        n = 'vm_talon_spike_' + name
        if (SRC/'xanims'/(n+'.seanim')).exists(): RA[key], RT[key] = animation(n, rb, loop)
    operator['ragnarok'] = {'id': 'ragnarok', 'model': rv, 'prop': rp, 'handsModel': hands, 'animations': RA, 'durations': RT,
                            'raiseTime': RT.get('raiseAnim', .5), 'dropTime': RT.get('dropAnim', .5), 'sprintInTime': RT.get('sprintInAnim', .2),
                            'sprintLoopTime': RT.get('sprintLoopAnim', .6), 'sprintOutTime': RT.get('sprintOutAnim', .2), 'adsInTime': .25, 'adsOutTime': .25,
                            'viewOffset': [3, -4, 0], 'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0], 'hideTags': []}
    print('ragnarok anims', len(RA))
# Der Eisendrache's rocket shield (wpn_t7_zmb_dlc1_rocket_shield_*, the vm_riotshield_zm_* clips): its own ViewWeapon in
# the der-eisendrache mod; dmg1/dmg2 are the worn looks
if (SRC/'xmodels'/'wpn_t7_zmb_dlc1_rocket_shield_view').exists():
    sv, sm = model('wpn_t7_zmb_dlc1_rocket_shield_view', 'rocket_shield_view', RENAME)
    worn = [model(f'wpn_t7_zmb_dlc1_rocket_shield_dmg{k}_view', f'rocket_shield_dmg{k}_view', RENAME)[0] for k in (1, 2)]
    sb = {b['name']: b['lpos'] for b in sm['bones'] if 'lpos' in b and b['parent'] >= 0}
    SA, ST = {}, {}
    for key, name, loop in [('idleAnim', 'idle', True), ('raiseAnim', 'raise', False), ('dropAnim', 'putaway', False), ('meleeAnim', 'melee', False),
                            ('boostInAnim', 'rocket_boost_in', False), ('boostOutAnim', 'rocket_boost_out', False), ('sprintInAnim', 'sprint_in', False),
                            ('sprintLoopAnim', 'sprint_loop', True), ('sprintOutAnim', 'sprint_out', False), ('adsUpAnim', 'ads_up', False)]:
        n = 'vm_riotshield_zm_' + name
        if (SRC/'xanims'/(n+'.seanim')).exists(): SA[key], ST[key] = animation(n, sb, loop)
    operator['rocketShield'] = {'id': 'rocket_shield', 'model': sv, 'worn': worn, 'handsModel': hands, 'animations': SA, 'durations': ST,
                                'raiseTime': ST.get('raiseAnim', .5), 'dropTime': ST.get('dropAnim', .5), 'sprintInTime': ST.get('sprintInAnim', .2),
                                'sprintLoopTime': ST.get('sprintLoopAnim', .6), 'sprintOutTime': ST.get('sprintOutAnim', .2), 'adsInTime': .25, 'adsOutTime': .25,
                                'viewOffset': [0, 0, 0], 'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0], 'hideTags': []}
    print('rocket shield anims', len(SA))
# The Annihilator (BO3's hero_annihilator, The Giant's Fly Trap prize; exported from zm_factory with its vm_annihilator_*
# clips): an operator weapon with its own ViewWeapon (mods/operator-weapons/annihilator.js). Sounds from Greyhound's Load
# File on zone/snd/all/zm_factory.all.sabl (search "annihilator,anni_"), copied to <export_dir>/sounds/annihilator/.
if (SRC/'xmodels'/'wpn_t7_hero_annihilator_view').exists():
    av, am = model('wpn_t7_hero_annihilator_view', 'annihilator_view', RENAME)
    aw = model('wpn_t7_hero_annihilator_world', 'annihilator_world', light=True)[0]
    ab = {b['name']: b['lpos'] for b in am['bones'] if 'lpos' in b and b['parent'] >= 0}
    AA, AT = {}, {}
    for key, name, loop in [('idleAnim', 'idle', True), ('raiseAnim', 'pullout', False), ('firstRaiseAnim', 'first_raise', False), ('dropAnim', 'putaway', False),
                            ('fireAnim', 'fire', False), ('adsFireAnim', 'fire_ads', False), ('rechamberAnim', 'rechamber', False),
                            ('adsRechamberAnim', 'rechamber_ads', False), ('meleeAnim', 'gunbutt_swipe', False), ('sprintInAnim', 'sprint_in', False),
                            ('sprintLoopAnim', 'sprint_loop', True), ('sprintOutAnim', 'sprint_out', False), ('adsUpAnim', 'ads_base_up', False)]:
        n = 'vm_annihilator_' + name
        if (SRC/'xanims'/(n+'.seanim')).exists(): AA[key], AT[key] = animation(n, ab, loop)
    asnd = {}
    for wav in sorted((SRC/'sounds'/'annihilator').glob('*.wav')):
        out = MOD/'audio'/'annihilator'/(wav.stem+'.ogg'); out.parent.mkdir(parents=True, exist_ok=True)
        if not out.exists(): subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-ac', '2', '-c:a', 'libvorbis', '-q:a', '5', str(out)], check=True)
        asnd[wav.stem] = WEB+'audio/annihilator/'+out.name
    operator['annihilator'] = {'id': 'annihilator', 'model': av, 'worldModel': aw, 'handsModel': hands, 'animations': AA, 'durations': AT, 'sounds': asnd,
                               'raiseTime': AT.get('raiseAnim', .6), 'dropTime': AT.get('dropAnim', .6), 'sprintInTime': AT.get('sprintInAnim', .2),
                               'sprintLoopTime': AT.get('sprintLoopAnim', 1), 'sprintOutTime': AT.get('sprintOutAnim', .2), 'adsInTime': .2, 'adsOutTime': .2,
                               'viewOffset': [3, -4, 0], 'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0], 'hideTags': []}
    print('annihilator anims', len(AA), 'sounds', len(asnd))
(MOD/'weapons.json').write_text(json.dumps({'weapons': weapons, 'sounds': {'dg2': sounds, 'mod': modsounds, 'audio': audio_keys}, 'fx': fx, 'operator': operator}, indent=1))
print('wrote', MOD/'weapons.json')
