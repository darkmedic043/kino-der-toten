#!/usr/bin/env python3
"""Gorod Krovi's Guard of Fafnir (the dragon shield) and Der Wunderfizz, from Greyhound's BO3 export, into the git-ignored
map dir (ripped game art: never publish it, never add it to install-manifest OWN):
  export/web/mods/maps/gorod-krovi/shield/  shield.json (the ViewWeapon defs, plain and upgraded), dmg0/1/2 view GLBs,
                                            the vm_dragon_shield_zm_* clips, the parts, the table's display model, the rune
  export/web/mods/maps/gorod-krovi/widows/  fizz.glb (p7_zm_vending_wonder)
  python3 -I .tools/build_gk_shield.py [greyhound_export_dir]
Used by mods/gorod-krovi/shield.js and widows.js. Viewmodels go through build_bo3_weapons.py's own helpers (its header is
run here, not the whole build); map props are converted from Greyhound's centimetres to inches like build_bo3_machines.py.
"""
import json, pathlib, subprocess, sys, tempfile
TOOLS = pathlib.Path(__file__).resolve().parent
ROOT = TOOLS.parent
GH = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
OUT = ROOT/'export/web/mods/maps/gorod-krovi/shield'
WEB = 'mods/maps/gorod-krovi/shield/'
FIZZ = ROOT/'export/web/mods/maps/gorod-krovi/widows'
for d in (OUT, FIZZ):
    (d/'animations').mkdir(parents=True, exist_ok=True); (d/'.gitignore').write_text('*\n')

# build_bo3_weapons.py's helpers (model, animation, RENAME...): its header only, with our export and output dirs
src = (TOOLS/'build_bo3_weapons.py').read_text(); head = src[:src.index("hands, _ = model(")]
sys.argv = [sys.argv[0], str(GH)]
B = {'__file__': str(TOOLS/'build_bo3_weapons.py'), '__name__': 'bo3_weapons_header'}
exec(compile(head, 'build_bo3_weapons.py (header)', 'exec'), B)
B['MOD'] = OUT; B['WEB'] = WEB
(OUT/'models').mkdir(exist_ok=True)
SEM = B['SEM']; RENAME = B['RENAME']; model = B['model']; animation = B['animation']; ver = B['ver']

# ---- the viewmodels and clips ----------------------------------------------------------------------------------------
N = 'wpn_t7_zmb_dlc3_dragon_shield_'
views = {s: [model(f'{N}dmg{k}{s}_view', f'dragon_shield_dmg{k}{s}_view', RENAME) for k in (0, 1, 2)] for s in ('', '_upg')}
sm = views[''][0][1]
sb = {b['name']: b['lpos'] for b in sm['bones'] if 'lpos' in b and b['parent'] >= 0}
A, T = {}, {}
for key, name, loop in [('idleAnim', 'idle', True), ('raiseAnim', 'raise', False), ('dropAnim', 'putaway', False), ('meleeAnim', 'melee', False),
                        ('boostInAnim', 'rocket_boost_in', False), ('boostOutAnim', 'rocket_boost_out', False), ('sprintInAnim', 'sprint_in', False),
                        ('sprintLoopAnim', 'sprint_loop', True), ('sprintOutAnim', 'sprint_out', False), ('adsUpAnim', 'ads_up', False),
                        ('adsDownAnim', 'ads_down', False), ('slideInAnim', 'slide_in', False), ('slideLoopAnim', 'slide_loop', True), ('slideOutAnim', 'slide_out', False)]:
    n = 'vm_dragon_shield_zm_' + name
    if (GH/'xanims'/(n+'.seanim')).exists(): A[key], T[key] = animation(n, sb, loop)
# the rocket shield's Dempsey arms (bo3-weapons build), the same rig
hands = json.loads((ROOT/'export/web/mods/bo3-weapons/weapons.json').read_text())['operator']['rocketShield']['handsModel']
def shield_def(s, ident):
    v = views[s]
    return {'id': ident, 'model': v[0][0], 'worn': [v[1][0], v[2][0]], 'handsModel': hands, 'animations': A, 'durations': T,
            'raiseTime': T.get('raiseAnim', .5), 'dropTime': T.get('dropAnim', .5), 'sprintInTime': T.get('sprintInAnim', .2),
            'sprintLoopTime': T.get('sprintLoopAnim', .6), 'sprintOutTime': T.get('sprintOutAnim', .2), 'adsInTime': .25, 'adsOutTime': .25,
            'viewOffset': [0, 0, 0], 'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0], 'hideTags': []}

# ---- map props (centimetres -> inches, 512 px textures) --------------------------------------------------------------
def webp512(stem, kind):
    p = GH/'ximages'/(stem+'.png')
    if not p.exists(): return None
    vf = "scale='min(512,iw)':-2"
    if kind == 'rough': vf = 'format=gray,negate,format=rgb24,'+vf
    with tempfile.NamedTemporaryFile(suffix='.webp') as o:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(p), '-vf', vf, '-c:v', 'libwebp', '-quality', '85', o.name], check=True)
        return pathlib.Path(o.name).read_bytes(), 'image/webp'
CM = 1/2.54
def prop(name, out_dir, out_name, web):
    sem = SEM.read_semodel(GH/'xmodels'/name/(name+'_LOD0.semodel'))
    for m in sem['meshes']: m['pos'] = [(x*CM, y*CM, z*CM) for x, y, z in m['pos']]
    for b in sem['bones']:
        for k in ('wpos', 'lpos'):
            if k in b: b[k] = tuple(v*CM for v in b[k])
    out = out_dir/(out_name+'.glb'); SEM.to_glb(sem, out, texture_loader=webp512)
    print('prop', out.name, f'{out.stat().st_size/1e6:.2f} MB')
    return web+out.name+ver(out)
props = {k: prop(n, OUT, k, WEB) for k, n in [('dolly', 'wpn_t7_zmb_dlc3_dragon_head'), ('door', 'wpn_t7_zmb_dlc3_dragon_pelvis'), ('clamp', 'wpn_t7_zmb_dlc3_dragon_window'),
                                            ('world', N+'dmg0_world'), ('world_upg', N+'dmg0_upg_world'), ('rune', 'p7_zm_sta_dragon_shield_rune_shoot_light')]}
json.dump({'shield': shield_def('', 'dragon_shield'), 'upgraded': shield_def('_upg', 'dragon_shield_upg'), 'props': props},
          (OUT/'shield.json').open('w'), indent=1)
fizz = prop('p7_zm_vending_wonder', FIZZ, 'fizz', 'mods/maps/gorod-krovi/widows/')
json.dump({'fizz': fizz}, (FIZZ/'widows.json').open('w'))
print('clips', len(A), 'done')
