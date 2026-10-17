#!/usr/bin/env python3
"""Der Eisendrache's Panzersoldat for the der-eisendrache mod: BO3's c_zom_mech_body (+ the spinning gun barrel and the
faceplate / power-supply cap that come off) as skinned GLBs, and its ai_zm_dlc1_soldat_* animations as the engine's
animation JSON (animation.js makeClip). Exported with Greyhound from a running game that had spawned one.

  python3 .tools/build_castle_panzer.py

Greyhound writes centimetres: models and translation keys are scaled to inches. The clips are BO3 "delta" anims: joint
rotations are absolute local quaternions; joint translations are offsets from the joint's bind position (the mod sets
userData.bindPosition so makeClip adds them); tag_origin carries the root motion, which is left out and kept only as
the clip's travel speed (`speed`, inches/s) for the mod to move the actor at. Output (git-ignored, ripped):
export/web/mods/der-eisendrache/panzer/.
"""
import importlib.util, json, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GH = pathlib.Path('/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
OUT = ROOT/'export/web/mods/der-eisendrache/panzer'
sys.path.insert(0, str(ROOT/'.tools'))
from seanim import read_seanim
_spec = importlib.util.spec_from_file_location('semodel_to_glb', ROOT/'.tools'/'semodel_to_glb.py')
SEM = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(SEM)
CM = 1 / 2.54
MODELS = ['c_zom_mech_body', 'c_zom_mech_gun_barrel', 'c_zom_mech_faceplate', 'c_zom_mech_powersupply_cap']
ANIMS = ['arrive_2', 'berserk_2', 'chaingun_fire', 'death', 'death_2', 'ft_aim_idle', 'ft_run', 'ft_sweep', 'head_stun_intro', 'head_stun_loop',
         'head_stun_outro', 'hover_land', 'hover_loop', 'hover_start', 'melee_a', 'melee_b', 'pain_faceplate', 'powercore_pain', 'run', 'sprint',
         'stumble_intro', 'stumble_loop', 'stumble_outro', 'walk_basic', 'chaingun_intro_sprint_to_aim_5']

def webp(stem, kind):
    if kind not in ('diffuse', 'normal'): return None
    src = GH/'ximages'/(stem + '.png')
    if not src.exists(): return None
    with tempfile.NamedTemporaryFile(suffix='.webp') as out:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(1024,iw)':-2", '-c:v', 'libwebp', '-quality', '82', out.name], check=True)
        return pathlib.Path(out.name).read_bytes(), 'image/webp'

def scaled(sem):
    for b in sem['bones']:
        for k in ('wpos', 'lpos'):
            if k in b: b[k] = tuple(v * CM for v in b[k])
    for m in sem['meshes']: m['pos'] = [tuple(v * CM for v in p) for p in m['pos']]
    return sem

def r(v, n): return [round(x, n) for x in v]

def anim(name, src=None, dest=None):
    a = read_seanim(GH/'xanims'/((src or f'ai_zm_dlc1_soldat_{name}') + '.seanim'))
    fps = a['framerate'] or 30; frames = max(a['frames'] - 1, 1)
    bones = []
    for bone, k in a['bones'].items():
        if bone in ('tag_origin', 'tag_sync'): continue
        out = {'name': bone, 'rot': None, 'pos': None}
        if k.get('rot'): out['rot'] = {'frames': [f for f, _ in k['rot']], 'values': r([c for _, q in k['rot'] for c in q], 5)}
        if k.get('loc'): out['pos'] = {'frames': [f for f, _ in k['loc']], 'values': r([c * CM for _, v in k['loc'] for c in v], 3)}
        if out['rot'] or out['pos']: bones.append(out)
    o = a['bones'].get('tag_origin', {}).get('loc') or []
    travel = sum(((o[i][1][0] - o[i - 1][1][0]) ** 2 + (o[i][1][1] - o[i - 1][1][1]) ** 2) ** .5 for i in range(1, len(o))) * CM if len(o) > 1 else 0
    clip = {'name': name, 'fps': fps, 'duration': round(frames / fps, 4), 'speed': round(travel / (frames / fps), 1),
            'notifies': [{'name': n, 'time': round(f / fps, 4)} for f, n in a['notes']], 'bones': bones}
    ((dest or OUT)/'anims'/(name + '.json')).write_text(json.dumps(clip, separators=(',', ':')))
    return clip

# ---- the Wolf Bow's spirit wolves (and Skadi): BO3's c_gen_direwolf_ghost and its ai_direwolf_base_* clips -> wolf/
#   python3 .tools/build_castle_panzer.py wolf   (just this part)
def build_wolf():
    WOUT = ROOT/'export/web/mods/der-eisendrache/wolf'
    (WOUT/'anims').mkdir(parents=True, exist_ok=True); (WOUT/'.gitignore').write_text('*\n')
    SEM.to_glb(scaled(SEM.read_semodel(GH/'xmodels'/'c_gen_direwolf_ghost'/'c_gen_direwolf_ghost_LOD0.semodel')), WOUT/'wolf.glb', texture_loader=webp)
    print('wolf', round((WOUT/'wolf.glb').stat().st_size / 1e6, 2), 'MB')
    windex = {}
    for key, src in {'run': 'ai_direwolf_base_run', 'trot': 'ai_direwolf_base_trot', 'howl': 'ai_direwolf_base_howl', 'attack': 'ai_direwolf_base_run_attack',
                     'idle': 'ai_direwolf_base_idle_howl', 'dig': 'ai_zm_dlc1_wolf_digging'}.items():
        if not (GH/'xanims'/(src + '.seanim')).exists(): print('no anim', src); continue
        c = anim(key, src, WOUT); windex[key] = {'duration': c['duration'], 'speed': c['speed']}
    (WOUT/'anims.json').write_text(json.dumps(windex, indent=1))
    print('wolf', windex)
if sys.argv[1:2] == ['wolf']: build_wolf(); sys.exit()

(OUT/'anims').mkdir(parents=True, exist_ok=True); (OUT/'.gitignore').write_text('*\n')
for name in MODELS:
    src = GH/'xmodels'/name/(name + '_LOD0.semodel')
    if not src.exists(): print('not exported:', name); continue
    SEM.to_glb(scaled(SEM.read_semodel(src)), OUT/(name + '.glb'), texture_loader=webp)
    print('model', name, round((OUT/(name + '.glb')).stat().st_size / 1e6, 1), 'MB')
index = {}
for n in ANIMS:
    if not (GH/'xanims'/f'ai_zm_dlc1_soldat_{n}.seanim').exists(): print('no anim', n); continue
    c = anim(n); index[n] = {'duration': c['duration'], 'speed': c['speed'], 'notes': [x['name'] for x in c['notifies']]}
(OUT/'anims.json').write_text(json.dumps(index, indent=1))
print(json.dumps({k: (v['duration'], v['speed']) for k, v in index.items()}))

# ---- the dragon heads (zm_castle_weap_quest.gsc's soul catchers): c_zom_dragonhead and its o_zm_dlc1_dragonhead_* clips
DOUT = ROOT/'export/web/mods/der-eisendrache/dragon'
(DOUT/'anims').mkdir(parents=True, exist_ok=True); (DOUT/'.gitignore').write_text('*\n')
SEM.to_glb(scaled(SEM.read_semodel(GH/'xmodels'/'c_zom_dragonhead'/'c_zom_dragonhead_LOD0.semodel')), DOUT/'c_zom_dragonhead.glb', texture_loader=webp)
dindex = {}
for n in ['idle', 'idle_b', 'idle_twitch_roar', 'intro', 'outtro', 'static', 'consume_pre_eat_f', 'consume_pre_eat_l', 'consume_pre_eat_r', 'consume_align_f', 'consume_align_l', 'consume_align_r']:
    src = f'o_zm_dlc1_dragonhead_{n}'
    if not (GH/'xanims'/(src + '.seanim')).exists(): print('no anim', src); continue
    c = anim(n, src, DOUT); dindex[n] = {'duration': c['duration']}
(DOUT/'anims.json').write_text(json.dumps(dindex, indent=1))
print('dragon', json.dumps(dindex))

# ---- the Keeper (the Easter egg's protector at the channeling stones, and the boss: zm_castle_ee*.gsc): BO3's
# c_zom_dlc1_keeper_archon_fb and its float / spell / stun clips -> keeper/
KOUT = ROOT/'export/web/mods/der-eisendrache/keeper'
(KOUT/'anims').mkdir(parents=True, exist_ok=True); (KOUT/'.gitignore').write_text('*\n')
SEM.to_glb(scaled(SEM.read_semodel(GH/'xmodels'/'c_zom_dlc1_keeper_archon_fb'/'c_zom_dlc1_keeper_archon_fb_LOD0.semodel')), KOUT/'keeper.glb', texture_loader=webp)
print('keeper', round((KOUT/'keeper.glb').stat().st_size / 1e6, 1), 'MB')
kindex = {}
KANIMS = {'idle': 'ai_zm_dlc1_archon_float_idle', 'roar': 'ai_zm_dlc1_archon_float_roar', 'ending': 'ai_zm_dlc1_archon_float_cleanse_ending',
          'stun': 'ai_zm_dlc1_archon_float_spell_elemental_pain_hitspike', 'stunIdle': 'ai_zm_dlc1_archon_float_spell_elemental_pain_hitspike_idle',
          'stunOut': 'ai_zm_dlc1_archon_float_spell_elemental_pain_hitspike_2_float',
          'emerge': 'ai_zm_dlc1_corrupted_keeper_float_emerge', 'keeperIdle': 'ai_zm_dlc1_corrupted_keeper_float_idle',
          'stoneIn': 'ai_zm_dlc1_corrupted_keeper_charge_stone_intro', 'stoneLoop': 'ai_zm_dlc1_corrupted_keeper_charge_stone_loop', 'stoneOut': 'ai_zm_dlc1_corrupted_keeper_charge_stone_outro'}
for spell in ('demongate', 'elemental', 'runeprison', 'wolfhowl'):
    for part, sfx in (('In', 'charge_intro'), ('Loop', 'charge_loop'), ('Deploy', 'deploy' if spell != 'elemental' else 'charge_outro')):
        KANIMS[spell + part] = f'ai_zm_dlc1_archon_float_spell_{spell}_{sfx}'
for key, src in KANIMS.items():
    if not (GH/'xanims'/(src + '.seanim')).exists(): print('no anim', src); continue
    c = anim(key, src, KOUT); kindex[key] = {'duration': c['duration']}
(KOUT/'anims.json').write_text(json.dumps(kindex, indent=1))
print('keeper', len(kindex), 'anims')

# ---- the plunger (zm_castle_ee_side.gsc's knife_plunger, a melee upgrade): its world model on the knife tag -> plunger/
POUT = ROOT/'export/web/mods/der-eisendrache/plunger'
POUT.mkdir(parents=True, exist_ok=True); (POUT/'.gitignore').write_text('*\n')
SEM.to_glb(scaled(SEM.read_semodel(GH/'xmodels'/'wpn_t7_zmb_dlc1_plunger_world'/'wpn_t7_zmb_dlc1_plunger_world_LOD0.semodel')), POUT/'plunger.glb', texture_loader=webp)
print('plunger', round((POUT/'plunger.glb').stat().st_size / 1e6, 2), 'MB')

# ---- the claw hat (zm_castle_ee_side.gsc: three Panzersoldats killed by their own claws) for the character's head -> claw/
COUT = ROOT/'export/web/mods/der-eisendrache/claw'
COUT.mkdir(parents=True, exist_ok=True); (COUT/'.gitignore').write_text('*\n')
SEM.to_glb(scaled(SEM.read_semodel(GH/'xmodels'/'c_t6_zom_mech_claw_hat'/'c_t6_zom_mech_claw_hat_LOD0.semodel')), COUT/'claw_hat.glb', texture_loader=webp)
print('claw hat', round((COUT/'claw_hat.glb').stat().st_size / 1e6, 2), 'MB')
build_wolf()
