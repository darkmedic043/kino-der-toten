"""Extract the BO1 gunshot layers Kino doesn't ship (ring-off tails, LFE thumps,
suppressed shots, the RPG shot for the LAW, and body falls for dive landings) from the user's own Call of Duty:
Black Ops install into export/web/mods/gun-sounds/ (git-ignored).

    python3 .tools/build_gun_sounds.py ["<path to Call of Duty Black Ops>"]
"""
import importlib.util, json, pathlib, re, subprocess, sys, zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
GAME = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '~/.local/share/Steam/steamapps/common/Call of Duty Black Ops').expanduser()
MOD = ROOT/'export/web/mods/gun-sounds'; (MOD/'audio').mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('era', ROOT/'.tools/extract_resident_audio.py'); era = importlib.util.module_from_spec(spec); spec.loader.exec_module(era)
WANT = re.compile(r'^sound/(wpn/(.+/plr/ringoff/|.+/lfe/|.+/plr/shot/silenced/|sniper/ringoff/|rocket/rpg/plr/shot/)|fly/bodyfall/(wood|dirt)/)')   # body falls: dive landings
tmp = ROOT/'artifacts/gun-sounds'; tmp.mkdir(parents=True, exist_ok=True)
data = zlib.decompress((GAME/'zone/Common/common_zombie.ff').read_bytes()[12:]); out = {}
for _, name, h, seek, payload in era.records(data):
    if not WANT.match(name) or '/silenced/lfe/' in name: continue
    key = 'resident/'+name.removeprefix('sound/').removesuffix('.wav')
    target = MOD/'audio'/(re.sub(r'[^A-Za-z0-9]+', '_', key.removeprefix('resident/').removeprefix('wpn/'))+'.ogg')
    if not target.exists():
        ext, raw = era.container(h, seek, payload); packed = tmp/(target.stem+ext); packed.write_bytes(raw)
        r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(packed),
            '-af', f'atrim=end_sample={h[2]},asetpts=N/SR/TB', '-c:a', 'libvorbis', '-q:a', '5', str(target)], capture_output=True, text=True)
        if r.returncode: print('decode failed', name, r.stderr[:200]); continue
    out[key] = {'url': 'mods/gun-sounds/audio/'+target.name}
(MOD/'sounds.json').write_text(json.dumps(out, indent=1))
print(len(out), 'sounds')
