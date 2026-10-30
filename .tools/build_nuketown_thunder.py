"""Decode BO1's thunder clips (the user's own install) for Nuketown's storm into the map's
git-ignored sounds folder: thunder_clap_00..05 (a strike overhead) and thunder_distant_00..02
(sheet lightning far off). Nothing here is committed or installed by Rind.

    python3 -I .tools/build_nuketown_thunder.py [path to Call of Duty Black Ops]
"""
import pathlib, subprocess, sys, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
GAME = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '~/.local/share/Steam/steamapps/common/Call of Duty Black Ops').expanduser()
OUT = ROOT / 'export/web/mods/maps/nuketown/sounds'; OUT.mkdir(parents=True, exist_ok=True)
TEMP = ROOT / 'artifacts/nuke-thunder'; TEMP.mkdir(parents=True, exist_ok=True)
WANT = {f'thunder_clap_{i:02d}': f'sound/amb/weather/thunder/clap/clap_{i:02d}.wav' for i in range(6)}
WANT.update({f'thunder_distant_{i:02d}': f'sound/amb/weather/thunder/distant/distant_{i:02d}.wav' for i in range(3)})
left = dict(WANT)
for iwd in sorted((GAME / 'main').glob('*.iwd')):
    with zipfile.ZipFile(iwd) as z:
        names = set(z.namelist())
        for key, name in list(left.items()):
            if name not in names: continue
            src = TEMP / (key + '.wav'); src.write_bytes(z.read(name))
            # a short fade in and out: the clips have hard starts; peak-normalised so the claps sit at one level
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-af', 'afade=t=in:d=0.02,areverse,afade=t=in:d=0.3,areverse,dynaudnorm=p=0.9:m=4',
                            '-c:a', 'libvorbis', '-q:a', '4', str(OUT / (key + '.ogg'))], check=True)
            print(key, '<-', iwd.name, name); del left[key]
if left: raise SystemExit('missing: ' + ', '.join(left.values()))
