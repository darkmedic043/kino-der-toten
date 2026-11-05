"""Build the BO3 Trip Mine and Smoke Grenade world models and sounds into export/web/mods/bo3-equipment/.

    python3 .tools/build_bo3_equipment.py [export_dir]   (default export_game/bo3)

Inputs come from the user's own BO3 install via Greyhound (docs/fork/weapons.md, "BO3 MP lethals and
tacticals"). Outputs are git-ignored and never installed by Rind (models/ and sounds/ are asset folders):
models/*.glb (256 px WebP colour maps, like the BO3 guns' world models) and sounds/*.ogg.
"""
import pathlib, subprocess, sys, tempfile, importlib.util
TOOLS = pathlib.Path(__file__).parent
_spec = importlib.util.spec_from_file_location('semodel_to_glb', TOOLS/'semodel_to_glb.py')
SEM = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(SEM)
ROOT = TOOLS.parent
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT/'export_game/bo3')
MOD = ROOT/'export/web/mods/bo3-equipment'

def tex(stem, kind):
    if kind != 'diffuse': return None
    src = SRC/'ximages'/(stem+'.png')
    if not src.exists(): return None
    with tempfile.NamedTemporaryFile(suffix='.webp') as out:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(256,iw)':-2", '-c:v', 'libwebp', '-quality', '82', out.name], check=True)
        return pathlib.Path(out.name).read_bytes(), 'image/webp'

(MOD/'models').mkdir(parents=True, exist_ok=True); (MOD/'sounds').mkdir(exist_ok=True)
for name, out in [('wpn_t7_spider_mine_world', 'tripmine'), ('wpn_t7_grenade_smoke_world', 'smoke')]:
    sem = SEM.read_semodel(SRC/'xmodels'/name/(name+'_LOD0.semodel'))
    SEM.to_glb(sem, MOD/'models'/(out+'.glb'), texture_loader=tex)
    print('model', out, (MOD/'models'/(out+'.glb')).stat().st_size, 'bytes')
SOUNDS = {
    'plant': 'wpn/grenade/claymore/claymore_plant_00.wav',
    'smoke_start': 'wpn/grenade/smoke/hiss/smoke_hiss_start.wav',
    'smoke_loop': 'wpn/grenade/smoke/hiss/smoke_hiss_lp.wav',
    'smoke_end': 'wpn/grenade/smoke/hiss/smoke_hiss_end.wav',
    'smoke_bounce': 'wpn/grenade/bounce/smoke/earth/smoke_bounce_earth_01.wav',
    'trip': 'uin/c4_proximity/c4_enemy_detect_alert.wav',
    'arm': 'uin/c4_proximity/start.wav',
    'zap': 'pfx/sparks/short/elec_spark_shrt_01.wav',
    'zap2': 'pfx/sparks/bounce/elec_spark_hit_02.wav',
    'link': 'pfx/sparks/long/elec_spark_lng_00.wav',
    'short': 'pfx/sparks/lrg/spark_lrg_01.wav',
}
for key, rel in SOUNDS.items():
    src = SRC/'sounds'/rel
    if not src.exists(): print('missing', rel); continue
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-ac', '2', '-c:a', 'libvorbis', '-q:a', '4', str(MOD/'sounds'/(key+'.ogg'))], check=True)
print('sounds', len(list((MOD/'sounds').glob('*.ogg'))))
