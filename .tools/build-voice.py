#!/usr/bin/env python3
"""Cut an operator's voice lines out of one long recording (mods/operator-voice).

usage: build-voice.py <audio> <picks.json> <out dir>

picks.json = {"event": [{"s": start sec, "e": end sec, "t": "caption"}, ...]}
(start/end from a silence split, e.g. ffmpeg silencedetect). Writes one
loudness-normalised mono ogg per line (<event>_<nn>.ogg) and lines.json,
{event: [{f, t}]}, into <out dir>. Events: see EVENTS in mods/operator-voice/mod.js.
"""
import json, os, subprocess, sys

src, picks, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    if f.endswith('.ogg'): os.remove(os.path.join(out, f))
lines = {}
for ev, items in json.load(open(picks)).items():
    for n, it in enumerate(items):
        f = f'{ev}_{n:02d}.ogg'
        s = max(0, it['s'] - .05); d = it['e'] - s + .12
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{s:.3f}', '-t', f'{d:.3f}', '-i', src, '-ac', '1', '-ar', '44100',
                        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.02,areverse,afade=t=in:d=0.05,areverse',
                        '-c:a', 'libvorbis', '-q:a', '4', os.path.join(out, f)], check=True)
        lines.setdefault(ev, []).append({'f': f, 't': it['t']})
json.dump(lines, open(os.path.join(out, 'lines.json'), 'w'), indent=1)
print(sum(len(v) for v in lines.values()), 'lines in', len(lines), 'events ->', out)
