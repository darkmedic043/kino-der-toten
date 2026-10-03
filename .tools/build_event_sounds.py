"""Extract BO1 event sounds Kino doesn't ship (teleporter warm-up/beam/teleport, hellhound
spawn strikes, lightning flux, the Pack-a-Punch knuckle crack, grenade bounces and explosions)
from the user's own Black Ops install into export/web/mods/event-sounds/ (git-ignored).

    python3 .tools/build_event_sounds.py ["<path to Call of Duty Black Ops>"]
"""
import importlib.util, json, pathlib, re, subprocess, sys, zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
GAME = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '~/.local/share/Steam/steamapps/common/Call of Duty Black Ops').expanduser()
MOD = ROOT/'export/web/mods/event-sounds'; (MOD/'audio').mkdir(parents=True, exist_ok=True)
(MOD/'.gitignore').write_text('audio/\nsounds.json\n')
spec = importlib.util.spec_from_file_location('era', ROOT/'.tools/extract_resident_audio.py'); era = importlib.util.module_from_spec(spec); spec.loader.exec_module(era)
WANT = re.compile(r'^sound/(evt/zombie_global/(teleporter/|hellhounds/spawn/|lightning/|perksacola/packa/knuckle|pap/)'
                  r'|wpn/grenade/(bounce/frag/|explosion/explode/|explosion/debris/dirt/)|exp/generic/explosion/)')
tmp = ROOT/'artifacts/event-sounds'; tmp.mkdir(parents=True, exist_ok=True); out = {}
for zone in ['common_zombie', 'zombie_theater', 'zombie_pentagon']:
    data = zlib.decompress((GAME/'zone/Common'/(zone+'.ff')).read_bytes()[12:])
    for _, name, h, seek, payload in era.records(data):
        if not WANT.match(name): continue
        key = 'resident/'+name.removeprefix('sound/').removesuffix('.wav')
        if key in out: continue
        target = MOD/'audio'/(re.sub(r'[^A-Za-z0-9]+', '_', key.removeprefix('resident/'))+'.ogg')
        if not target.exists():
            ext, raw = era.container(h, seek, payload); packed = tmp/(target.stem+ext); packed.write_bytes(raw)
            r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(packed),
                '-af', f'atrim=end_sample={h[2]},asetpts=N/SR/TB', '-c:a', 'libvorbis', '-q:a', '5', str(target)], capture_output=True, text=True)
            if r.returncode: print('decode failed', name, r.stderr[:200]); continue
        out[key] = {'url': 'mods/event-sounds/audio/'+target.name}
(MOD/'sounds.json').write_text(json.dumps(out, indent=1))
print(len(out), 'sounds')
