"""Convert BO1 effect textures Kino doesn't ship (the Thundergun's smoky shockwave
ring) from the user's own zone dump into export/web/mods/fx/textures/ (git-ignored).
Needs export_game/zombie_theater (see build_dismemberment.py for the Unlinker line).

    python3 .tools/build_fx_textures.py
"""
import pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT/'export/web/mods/fx/textures'; OUT.mkdir(parents=True, exist_ok=True)
for name in ['fxt_fx_thundergun_ring']:
    src = ROOT/'export_game/zombie_theater/images'/(name+'.dds')
    if not src.exists(): print('missing', src); continue
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(src), '-vf', 'format=rgba', str(OUT/(name+'.png'))], check=True)
    print('wrote', name)
