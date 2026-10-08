#!/usr/bin/env python3
"""BO3's perk machines and Pack-a-Punch as GLBs for the perks-plus mod (export/web/mods/perks-plus/models/, git-ignored:
ripped game art). Source: Greyhound's export in BO3's Proton prefix (see docs/fork/waw-ports.md, Black Ops III maps).
  python3 .tools/build_bo3_machines.py
"""
import pathlib, subprocess, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import semodel_to_glb as SEM
GH = pathlib.Path('/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3')
OUT = pathlib.Path(__file__).resolve().parent.parent/'export'/'web'/'mods'/'perks-plus'/'models'
OUT.mkdir(parents=True, exist_ok=True)
MACHINES = ['p7_zm_vending_jugg', 'p7_zm_vending_revive', 'p7_zm_vending_doubletap2', 'p7_zm_vending_sleight', 'p7_zm_vending_marathon',
            'p7_zm_vending_ads', 'p7_zm_vending_three_gun', 'p7_zm_vending_packapunch']
def webp(stem, kind):
    src = GH/'ximages'/(stem+'.png')
    if not src.exists(): return None
    vf = "scale='min(512,iw)':-2"
    if kind == 'rough': vf = 'format=gray,negate,format=rgb24,'+vf   # BO3 gloss -> roughness
    with tempfile.NamedTemporaryFile(suffix='.webp') as out:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vf', vf, '-c:v', 'libwebp', '-quality', '85', out.name], check=True)
        return pathlib.Path(out.name).read_bytes(), 'image/webp'
for name in MACHINES:
    sem = SEM.read_semodel(GH/'xmodels'/name/(name+'_LOD0.semodel'))
    out = OUT/(name+'.glb')
    SEM.to_glb(sem, out, texture_loader=webp)
    print(name, f'{out.stat().st_size/1e6:.1f} MB')
