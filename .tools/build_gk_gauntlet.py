"""Build Gorod Krovi's Gauntlet of Siegfried from Greyhound exports into the git-ignored
export/web/mods/maps/gorod-krovi/gauntlet/ (read by mods/gorod-krovi/gauntlet.js).

    python3 -I .tools/build_gk_gauntlet.py [export_dir]   (default: Greyhound's black_ops_3 folder)

Inputs (the user's own BO3 install, exported with Greyhound): xmodels/<name>/<name>_LOD0.semodel,
xanims/*.seanim, ximages/*.png. Same clip format and helpers as .tools/build_bo3_weapons.py.

Two viewmodels, one per mode (BO3's weapons dragon_gauntlet_flamethrower and dragon_gauntlet):
  wpn_t7_zmb_dlc3_gauntlet_dragon_view      + vm_z_dragon_gaunt_*     flamethrower, whelp on the arm
  wpn_t7_zmb_dlc3_gauntlet_dragon_upg_view  + vm_z_aint_no_dragon_*   punch mode, whelp released (blue trim)
BO3's script attaches `elbow_upg_world` for the punch weapon: `_upg` is the punch form, not a Pack-a-Punch.
The whelp on its own: c_zom_dlc3_dragon_small + ai_zm_dlc3_dragon_whelp_*. The quest egg: p7_zm_sta_dragon_egg_01.
Sounds: 27 clips (flame start/loop/stop, the whelp's screams and wing flaps, the punch, the egg) are read straight from
the installed game's sound bank zone/snd/all/zm_stalingrad.all.sabl (SOUNDS maps bank names to ours) and turned
into mono Ogg with ffmpeg; the json lists them under `sounds`.
Nothing here may be published or listed in .tools/install-manifest.mjs OWN.
"""
import hashlib, json, pathlib, subprocess, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from seanim import read_seanim
import importlib.util
_spec = importlib.util.spec_from_file_location('semodel_to_glb', pathlib.Path(__file__).parent/'semodel_to_glb.py')
SEM = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(SEM)

ROOT = pathlib.Path(__file__).resolve().parents[1]
GH = '/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3'
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else GH)
OUT = ROOT/'export/web/mods/maps/gorod-krovi/gauntlet'
WEB = 'mods/maps/gorod-krovi/gauntlet/'
for sub in ['models', 'animations', 'textures']: (OUT/sub).mkdir(parents=True, exist_ok=True)
(OUT/'.gitignore').write_text('*\n')
RENAME = {'tag_weapon_right': 'tag_weapon', 'tag_weapon_left': 'tag_weapon1'}
RENAME.update({f'j_{f}_{s}_{k}': f'j_{f}_{s}_{k-1}' for f in ['index', 'mid', 'ring', 'pinky', 'thumb'] for s in ['le', 'ri'] for k in (1, 2, 3)})

def ver(path): return '?v='+hashlib.md5(pathlib.Path(path).read_bytes()).hexdigest()[:8]

def loader(cap_colour, cap_other):
    def load(stem, kind):
        src = SRC/'ximages'/(stem+'.png')
        if not src.exists(): return None
        size = cap_other if kind in ('rough', 'normal') else cap_colour
        vf = f"scale='min({size},iw)':-2"
        if kind == 'rough': vf = 'format=gray,negate,format=rgb24,'+vf
        with tempfile.NamedTemporaryFile(suffix='.webp') as out:
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', vf, '-c:v', 'libwebp',
                            '-quality', '92' if kind == 'normal' else '85', out.name], check=True)
            return pathlib.Path(out.name).read_bytes(), 'image/webp'
    return load

def model(name, out_name, rename=None, load=loader(1024, 512)):
    sem = SEM.read_semodel(SRC/'xmodels'/name/(name+'_LOD0.semodel'))
    out = OUT/'models'/(out_name+'.glb')
    SEM.to_glb(sem, out, texture_loader=load, rename=rename)
    print('model', out.name, f'{out.stat().st_size/1e6:.1f} MB')
    return WEB+'models/'+out.name+ver(out), sem

def round_list(v, n): return [round(x, n) for x in v]

def animation(name, loop=False, rot_only=False):
    a = read_seanim(SRC/'xanims'/(name+'.seanim'))
    fps = a['framerate'] or 30
    bones, last = [], 0
    for bone, tracks in a['bones'].items():
        if bone in ('tag_weapon', 'tag_weapon_le', 'tag_origin'): continue
        out = {'name': RENAME.get(bone, bone), 'rot': None, 'pos': None}
        if tracks.get('rot'):
            out['rot'] = {'frames': [f for f, _ in tracks['rot']], 'values': round_list([c for _, q in tracks['rot'] for c in q], 5)}
            last = max(last, tracks['rot'][-1][0])
        if tracks.get('loc') and not rot_only:
            out['pos'] = {'frames': [f for f, _ in tracks['loc']], 'values': round_list([c for _, v in tracks['loc'] for c in v], 4)}
            last = max(last, tracks['loc'][-1][0])
        if out['rot'] or out['pos']: bones.append(out)
    frames = max(last, a['frames']-1, 1)
    clip = {'name': name, 'fps': fps, 'loop': loop, 'duration': round(frames/fps, 4),
            'notifies': [{'name': n, 'time': round(f/fps, 4)} for f, n in a['notes']], 'bones': bones}
    p = OUT/'animations'/(name+'.json')
    p.write_text(json.dumps(clip, separators=(',', ':')))
    return WEB+'animations/'+name+'.json'+ver(p), clip['duration']

hands = model('c_zom_der_dempsey_viewhands', 'viewhands_dempsey', RENAME)[0]
flame_view = model('wpn_t7_zmb_dlc3_gauntlet_dragon_view', 'gauntlet_view', RENAME)[0]
punch_view = model('wpn_t7_zmb_dlc3_gauntlet_dragon_upg_view', 'gauntlet_punch_view', RENAME)[0]
world = model('wpn_t7_zmb_dlc3_gauntlet_dragon_world', 'gauntlet_world', load=loader(256, 128))[0]
whelp = model('c_zom_dlc3_dragon_small', 'whelp', load=loader(512, 256))[0]
egg = model('p7_zm_sta_dragon_egg_01', 'egg', load=loader(512, 256))[0]

# engine key -> clip suffix; the rest of each set is kept under its own name for the module (crawl, slide, jump...)
KEYS = {'idleAnim': 'idle', 'raiseAnim': 'pullout', 'firstRaiseAnim': 'first_raise', 'dropAnim': 'putaway',
        'sprintInAnim': 'sprint_in', 'sprintLoopAnim': 'sprint_loop', 'sprintOutAnim': 'sprint_out',
        'meleeAnim': 'melee_swipe', 'adsUpAnim': 'ads_base_up', 'adsDownAnim': 'ads_base_down',
        'fireInAnim': 'fire_in', 'fireLoopAnim': 'fire_loop', 'fireOutAnim': 'fire_out',
        'altRaiseAnim': 'alt_raise', 'altDropAnim': 'alt_putaway', 'meleeInAnim': 'melee_in', 'tauntAnim': 'taunt',
        'walkAnim': 'walk_f', 'jumpAnim': 'jump', 'landAnim': 'jump_land', 'fallAnim': 'fall',
        'slideInAnim': 'slide_in', 'slideLoopAnim': 'slide_loop', 'slideOutAnim': 'slide_out', 'slideAirInAnim': 'slide_air_in',
        'crawlInAnim': 'crawl_in', 'crawlOutAnim': 'crawl_out', 'crawlFAnim': 'crawl_f', 'crawlBAnim': 'crawl_b',
        'crawlLAnim': 'crawl_l', 'crawlRAnim': 'crawl_r'}
LOOPS = {'idle', 'sprint_loop', 'fire_loop', 'slide_loop', 'walk_f', 'crawl_f', 'crawl_b', 'crawl_l', 'crawl_r', 'fall'}

def clip_set(prefix):
    A, T = {}, {}
    for key, suf in KEYS.items():
        n = prefix+suf
        if (SRC/'xanims'/(n+'.seanim')).exists(): A[key], T[key] = animation(n, suf in LOOPS)
    return A, T

def opdef(id_, view, A, T, extra):
    return {'id': id_, 'model': view, 'worldModel': world, 'handsModel': hands, 'animations': A, 'durations': T, 'sounds': {},
            'raiseTime': T.get('raiseAnim', .6), 'dropTime': T.get('dropAnim', .6), 'sprintInTime': T.get('sprintInAnim', .2),
            'sprintLoopTime': T.get('sprintLoopAnim', 1), 'sprintOutTime': T.get('sprintOutAnim', .2), 'adsInTime': .2, 'adsOutTime': .2,
            'viewOffset': [3, -4, 0], 'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0], 'hideTags': [], **extra}

FA, FT = clip_set('vm_z_dragon_gaunt_')
PA, PT = clip_set('vm_z_aint_no_dragon_')
WA, WT = {}, {}
for key, suf, loop in [('idle', 'idle', True), ('f', 'f', True), ('b', 'b', True), ('l', 'l', True), ('r', 'r', True), ('attack', 'attack', False)]:
    n = 'ai_zm_dlc3_dragon_whelp_'+suf
    if (SRC/'xanims'/(n+'.seanim')).exists(): WA[key], WT[key] = animation(n, loop, rot_only=True)   # bone lengths stay the bind's

# The quest's fxanim props (script models / scene bundles in BO3, so not in the map build): Pavlov's boards with the egg
# that rolls down into the basement, and the basement incubator with its egg. Built in inches (the map's units, as
# .tools/build_gorod_bosses.py does). fxanim clips: rot = absolute local quaternions, pos = offsets from the bind
# position (the module sets userData.bindPosition); the root bone's motion (the rolling egg) is kept under `rig_root`.
CM = 1 / 2.54
AXQ = (-2 ** -.5, 0, 0, 2 ** -.5)   # semodel_to_glb's Z-up -> Y-up turn on root bones
def scaled(sem):
    for b in sem['bones']:
        for k in ('wpos', 'lpos'):
            if k in b: b[k] = tuple(v * CM for v in b[k])
    for m in sem['meshes']: m['pos'] = [tuple(v * CM for v in p) for p in m['pos']]
    return sem

def prop(name, out_name):
    src = SRC/'xmodels'/name/(name+'_LOD0.semodel')
    if not src.exists(): print('prop not exported:', name); return None, None
    sem = scaled(SEM.read_semodel(src)); out = OUT/'models'/(out_name+'.glb')
    SEM.to_glb(sem, out, texture_loader=loader(512, 256), rename={'tag_origin': 'rig_root'})
    print('prop', out.name, f'{out.stat().st_size/1e6:.1f} MB')
    return WEB+'models/'+out.name+ver(out), {b['name'] for b in sem['bones'] if b['parent'] < 0}

def prop_anim(name, roots, loop=False):
    src = SRC/'xanims'/(name+'.seanim')
    if not src.exists(): print('anim not exported:', name); return None, 0
    a = read_seanim(src); fps = a['framerate'] or 30; bones = []
    for bone, tracks in a['bones'].items():
        root = bone in roots; out = {'name': 'rig_root' if bone == 'tag_origin' else bone, 'rot': None, 'pos': None}
        if tracks.get('rot') and len(tracks['rot']) > 1:
            qs = [SEM.qmul(AXQ, q) if root else q for _, q in tracks['rot']]
            out['rot'] = {'frames': [f for f, _ in tracks['rot']], 'values': round_list([c for q in qs for c in q], 5)}
        if tracks.get('loc'):
            ps = [SEM.qrot(AXQ, v) if root else v for _, v in tracks['loc']]
            out['pos'] = {'frames': [f for f, _ in tracks['loc']], 'values': round_list([c * CM for v in ps for c in v], 3)}
        if out['rot'] or out['pos']: bones.append(out)
    clip = {'name': name, 'fps': fps, 'loop': loop, 'duration': round(max(a['frames']-1, 1)/fps, 4),
            'notifies': [{'name': n, 'time': round(f/fps, 4)} for f, n in a['notes']], 'bones': bones}
    p = OUT/'animations'/(name+'.json'); p.write_text(json.dumps(clip, separators=(',', ':')))
    return WEB+'animations/'+name+'.json'+ver(p), clip['duration']

PROPS = {}
for key, model_name, anims in [
        ('boards', 'p7_fxanim_zm_stal_pavlov_boards_mod', {'fall': 'p7_fxanim_zm_stal_pavlov_boards_anim'}),
        ('boards_egg', 'p7_fxanim_zm_stal_pavlov_boards_de_mod', {'fall': 'p7_fxanim_zm_stal_pavlov_boards_de_anim'}),
        ('incubator', 'p7_fxanim_zm_stal_dragon_incubator_mod', {k: f'p7_fxanim_zm_stal_dragon_incubator_{k}_anim' for k in ('place', 'warm', 'end')}),
        ('incubator_egg', 'p7_fxanim_zm_stal_dragon_incubator_egg_mod', {k: f'p7_fxanim_zm_stal_dragon_incubator_egg_{k}_anim' for k in ('place', 'warm', 'end')})]:
    url, roots = prop(model_name, key)
    if not url: continue
    A_, T_ = {}, {}
    for k, an in anims.items():
        u, d = prop_anim(an, roots | {'tag_origin'}, k == 'warm')
        if u: A_[k], T_[k] = u, d
    PROPS[key] = {'model': url, 'animations': A_, 'durations': T_}

icons = {}
for stem in ['uie_t7_zm_dragon_gauntlet_ammo_icon_gun', 'uie_t7_zm_dragon_gauntlet_ammo_icon_gun_ready', 'uie_t7_zm_dragon_gauntlet_ammo_icon_gun_readyflash']:
    src = SRC/'ximages'/(stem+'.png')
    if src.exists():
        dst = OUT/'textures'/(stem.replace('uie_t7_zm_dragon_gauntlet_ammo_icon_', 'icon_')+'.png')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(128,iw)':-2", '-pix_fmt', 'rgba', str(dst)], check=True)
        icons[dst.stem] = WEB+'textures/'+dst.name+ver(dst)
# the egg's inventory icons (HUD while the quest runs: outline, fill by step)
for stem in ['uie_t7_icon_inventory_dlc3_dragon_egg', 'uie_t7_icon_inventory_dlc3_dragon_egg_fill', 'uie_t7_icon_inventory_dlc3_dragon_egg_meter', 'uie_t7_icon_inventory_dlc3_dragon_egg_new']:
    src = SRC/'ximages'/(stem+'.png')
    if src.exists():
        dst = OUT/'textures'/(stem.replace('uie_t7_icon_inventory_dlc3_dragon_', '')+'.png')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(128,iw)':-2", '-pix_fmt', 'rgba', str(dst)], check=True)
        icons[dst.stem] = WEB+'textures/'+dst.name+ver(dst)
# the glow card's emissive image (the yellow trim's colour map is blank in the material; the module sets it emissive)
glow = SRC/'ximages'/'i_wpn_t7_zmb_dlc3_gauntlet_dragon_glo_e.png'
if glow.exists():
    dst = OUT/'textures'/'glow_e.webp'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(glow), '-c:v', 'libwebp', '-quality', '90', str(dst)], check=True)
    icons['glow_e'] = WEB+'textures/glow_e.webp'+ver(dst)
# sounds: straight from the map's sound bank (the user's install, as .tools/build_gorod_dragon.py does), FLAC entries
# converted to Ogg; a <export_dir>/sounds/gauntlet/ folder of wavs, if there is one, is added on top (keyed by stem)
BANK = pathlib.Path('/mass_drive/SteamLibrary/steamapps/common/Call of Duty Black Ops III/zone/snd/all/zm_stalingrad.all.sabl')
SOUNDS = {   # bank path fragment -> our name
    r'gauntlet\fire\wpn_dragon_gauntlet_start': 'flame_start', r'gauntlet\fire\wpn_dragon_gauntlet_loop': 'flame_loop',
    r'gauntlet\fire\wpn_dragon_gauntlet_stop': 'flame_stop', r'gauntlet\fly_gaunt_attach': 'attach', r'gauntlet\fly_gaunt_shake': 'shake',
    **{rf'gauntlet\fly_gaunt_scream_{i}': f'scream{i}' for i in range(1, 6)},
    **{rf'gauntlet\launch\dragon_gaunt_fire_short_0{i}': f'fireball{i}' for i in range(4)},
    r'gauntlet\poof\wpn_gaunt_poof_00': 'poof0', r'gauntlet\poof\wpn_gaunt_poof_01': 'poof1',
    **{rf'whelp\wing_flaps\wing_flap_0{i}': f'flap{i}' for i in range(1, 4)},
    r'incubator\zmb_drag_egg_pickup': 'egg_pickup', r'incubator\zmb_inc_close': 'inc_close', r'incubator\zmb_inc_grab': 'inc_grab',
    r'incubator\zmb_inc_open': 'inc_open', r'pavlov_crash\egg_roll': 'egg_roll', r'pavlov_crash\pavlov_boards_upper': 'boards_up',
    r'pavlov_crash\pavlov_boards_lower': 'boards_down', r'swordquest\egg_place\egg_place': 'egg_place',
    r'amb\alarms\lock_down\lock_down_alarm_00': 'alarm', r'trap\electrical\ignite\body_burn\body_burn_00': 'body_burn',
}
snd = {}
if BANK.exists():
    import mmap, struct
    (OUT/'audio').mkdir(exist_ok=True)
    with open(BANK, 'rb') as f:
        m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        count = struct.unpack_from('<I', m, 0x14)[0]; table = struct.unpack_from('<Q', m, 0x28)[0]; names = len(m) - count * 128
        for i in range(count):
            stem = m[names + i * 128:names + (i + 1) * 128].split(b'\0')[0].decode(errors='replace').split('.')[0]
            key = next((v for k, v in SOUNDS.items() if stem.endswith(k)), None)
            if not key or key in snd: continue
            _id, size, _fr, _pad, off = struct.unpack_from('<IIIIQ', m, table + i * 36)
            dst = OUT/'audio'/(key + '.ogg')
            if not dst.exists():
                with tempfile.NamedTemporaryFile(suffix='.flac') as t:
                    t.write(m[off:off + size]); t.flush()
                    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', t.name, '-ac', '1', '-c:a', 'libvorbis', '-q:a', '3', str(dst)], check=True)
            snd[key] = WEB+'audio/'+dst.name+ver(dst)
    print('bank sounds', len(snd), 'missing', sorted(set(SOUNDS.values()) - set(snd)))
for wav in sorted((SRC/'sounds'/'gauntlet').rglob('*.wav')) if (SRC/'sounds'/'gauntlet').is_dir() else []:
    dst = OUT/'audio'/(wav.stem+'.ogg'); dst.parent.mkdir(exist_ok=True)
    if not dst.exists(): subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-ac', '2', '-c:a', 'libvorbis', '-q:a', '5', str(dst)], check=True)
    snd[wav.stem] = WEB+'audio/'+dst.name

data = {'flame': opdef('dragon_gauntlet_flame', flame_view, FA, FT, {'mode': 'flame'}),
        'punch': opdef('dragon_gauntlet_punch', punch_view, PA, PT, {'mode': 'punch'}),
        'whelp': {'model': whelp, 'animations': WA, 'durations': WT}, 'egg': egg, 'world': world, 'props': PROPS, 'textures': icons, 'sounds': snd}
(OUT/'gauntlet.json').write_text(json.dumps(data, indent=1))
print('flame clips', len(FA), 'punch clips', len(PA), 'whelp clips', len(WA), 'icons', len(icons), 'sounds', len(snd))
print('wrote', OUT/'gauntlet.json')
