"""Build Gorod Krovi's scene props and Sophia from Greyhound exports into the git-ignored
export/web/mods/maps/gorod-krovi/scenes/ (read by mods/gorod-krovi/sophia.js and scenes.js).

    python3 -I .tools/build_gk_scenes.py [export_dir]   (default: Greyhound's black_ops_3 folder)

These are BO3's fxanim props that the map spawns from scene bundles (scriptbundle_scene entities) or script models
the map script drives, so they are not in the static map build (.tools/build_bo3_map.py):
  Sophia: the computer (p7_fxanim_zm_stal_computer_sophia_mod, 230 joints) on its base, her eye screen, and the
          five tape reel pairs of her recordings;
  the dragon hazard props (library chandeliers and chains, ceiling debris, library banners, the department store
          wall, the fountain and judicial wreckage, the A and R letters and the truck debris under them), the five
          flinger traps, the generator tarp in Pavlov's, the drone window, the Raz cage, the robot arm's two
          aperture doors, the sewer gate and its switch.
Same helpers and clip format as .tools/build_gk_gauntlet.py: built in inches, Y-up, `tag_origin` renamed `rig_root`;
fxanim clips hold absolute local rotations and offsets from the bind position (the module sets userData.bindPosition).
Left out: the elevator trap (auto-run no, played by script), the dogfight dragons (no model with their 181 joints),
the tracer fire and the Y letter (invisible fx/link carriers), the pickups blob and nuke (models not exported),
Sophia's code rings (Easter egg only).
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
OUT = ROOT/'export/web/mods/maps/gorod-krovi/scenes'
WEB = 'mods/maps/gorod-krovi/scenes/'
for sub in ['models', 'animations']: (OUT/sub).mkdir(parents=True, exist_ok=True)
(OUT/'.gitignore').write_text('*\n')
CM = 1 / 2.54
AXQ = (-2 ** -.5, 0, 0, 2 ** -.5)   # semodel_to_glb's Z-up -> Y-up turn on root bones

def ver(path): return '?v='+hashlib.md5(pathlib.Path(path).read_bytes()).hexdigest()[:8]
def round_list(v, n): return [round(x, n) for x in v]

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

def scaled(sem):
    for b in sem['bones']:
        for k in ('wpos', 'lpos'):
            if k in b: b[k] = tuple(v * CM for v in b[k])
    for m in sem['meshes']: m['pos'] = [tuple(v * CM for v in p) for p in m['pos']]
    return sem

_done = {}
def prop(name, out_name, caps=(512, 256)):
    if name in _done: return _done[name]
    src = SRC/'xmodels'/name/(name+'_LOD0.semodel')
    if not src.exists(): print('prop not exported:', name); return None, None
    sem = scaled(SEM.read_semodel(src)); out = OUT/'models'/(out_name+'.glb')
    SEM.to_glb(sem, out, texture_loader=loader(*caps), rename={'tag_origin': 'rig_root'})
    print('prop', out.name, f'{out.stat().st_size/1e6:.1f} MB')
    _done[name] = WEB+'models/'+out.name+ver(out), {b['name'] for b in sem['bones'] if b['parent'] < 0}
    return _done[name]

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

F = 'p7_fxanim_zm_stal_'
H = F+'dragon_hazard_'
LOOPS = {'idle', 'idle2', 'end_idle'}
# key -> (model, {clip key: anim name}); keys are what the modules ask for
PROPS = [
    # Sophia (zm_stalingrad_ee_main / _sophia): the computer, its base (trap doors for the ending), her eye screen
    ('sophia', F+'computer_sophia_mod', {k: F+f'computer_sophia_{k}_anim' for k in
        ('code_door_open', 'code_door_close', 'core_door_open', 'drawer_open', 'drawer_close', 'open', 'end_idle')} | {'end': F+'computer_sophia_anim'}),
    ('sophia_base', F+'computer_sophia_base_mod', {'trap_door_open': F+'computer_sophia_trap_door_open_anim'}),
    ('sophia_eye', F+'computer_sophia_eye_mod', {k: F+f'computer_sophia_{k}_anim' for k in ('eye', 'eye_idle', 'eye_away')}),
    ('tape_01', 'p7_zm_ctl_radio_recorder_tape_01', {}),
    ('tape_02', 'p7_zm_ctl_radio_recorder_tape_02', {}),
    # the dragon hazards (zm_stalingrad_dragon: the dragon lands on a hazard spot and its wind/weight sets these off)
    ('chand_01', H+'library_chand_01_mod', {'idle': H+'library_chand_01_idle_anim', 'break': H+'library_chand_01_break_anim'}),
    ('chand_02', H+'library_chand_01_mod', {'idle': H+'library_chand_02_idle_anim', 'lands': H+'library_chand_02_dragon_lands_anim'}),
    ('chain_01', H+'library_chand_chain_01_mod', {'idle': H+'library_chand_chain_01_idle_anim', 'break': H+'library_chand_chain_01_break_anim'}),
    ('chain_02', H+'library_chand_chain_01_mod', {'idle': H+'library_chand_chain_02_idle_anim', 'lands': H+'library_chand_chain_02_dragon_lands_anim'}),
    ('ceiling_debris', H+'library_ceiling_debris_mod', {'break': H+'library_ceiling_debris_anim'}),
    ('library_banner', H+'library_banner_01_smod', {}),
    ('dept', H+'dept_store_01_mod', {'crash': H+'dept_store_01_anim'}),
    ('dept_bits', H+'dept_store_01_bits_mod', {'crash': H+'dept_store_01_bits_anim'}),
    ('dept_bookcase', H+'dept_store_01_bookcase_mod', {'crash': H+'dept_store_01_bookcase_anim'}),
    ('fountain', H+'fountain_01_mod', {'gust': H+'fountain_01_anim'}),
    ('judicial', H+'judicial_mod', {'gust': H+'judicial_gusty_anim'}),
    ('judicial_wires', F+'judicial_wires_smod', {}),
    ('letters_a', F+'letters_a_mod', {'fall': F+'letters_a_anim'}),
    ('letters_a_truck', F+'letters_a_truck_debris_mod', {'fall': F+'letters_a_truck_debris_anim'}),
    ('letters_r', F+'letters_r_mod', {'fall': F+'letters_r_anim'}),
    # the rest of the map's scenes
    ('flinger', F+'flinger_trap_mod', {'fling': F+'flinger_trap_anim'}),
    ('tarp', F+'generator_tarp_mod', {'idle': F+'generator_tarp_idle_anim', 'start': F+'generator_tarp_start_anim', 'end': F+'generator_tarp_end_anim'}),
    ('drone_window', F+'pickups_figure_drone_window_mod', {'break': F+'pickups_figure_drone_window_anim'}),
    ('raz_cage', F+'raz_cage_mod', {'grab': F+'raz_cage_sentinel_grab_anim'}),
    ('aperture', F+'robot_arm_aperture_door_mod', {'open': F+'robot_arm_aperture_door_anim'}),
    ('aperture_front', F+'robot_arm_aperture_door_front_mod', {'open': F+'robot_arm_aperture_door_front_anim'}),
    ('sewer_gate', F+'sewer_gate_mod', {'down': F+'sewer_gate_down_anim', 'up': F+'sewer_gate_up_anim'}),
    ('sewer_switch', F+'sewer_switch_mod', {'flip': F+'sewer_switch_anim'}),
]
data = {}
for key, model_name, anims in PROPS:
    url, roots = prop(model_name, model_name.removeprefix(F).removesuffix('_mod'), (1024, 512) if key == 'sophia' else (512, 256))
    if not url: continue
    A, T = {}, {}
    for k, an in anims.items():
        u, d = prop_anim(an, roots | {'tag_origin'}, k in LOOPS)
        if u: A[k], T[k] = u, d
    data[key] = {'model': url, 'animations': A, 'durations': T}
(OUT/'scenes.json').write_text(json.dumps({'props': data}, indent=1))
print('props', len(data), 'clips', sum(len(d['animations']) for d in data.values()))
print('wrote', OUT/'scenes.json')
