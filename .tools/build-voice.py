#!/usr/bin/env python3
"""Cut an operator's voice lines out of one long recording (mods/operator-voice).

usage: build-voice.py <audio> <picks.json> <out dir>
       build-voice.py --convos <audio> <convos.json picks> <out dir>

picks.json = {"event": [{"s": start sec, "e": end sec, "t": "caption"}, ...]}
(start/end from a silence split, e.g. ffmpeg silencedetect). Writes one
loudness-normalised mono ogg per line (<event>_<nn>.ogg) and lines.json,
{event: [{f, t}]}, into <out dir>. Events: see EVENTS in mods/operator-voice/mod.js.

--convos: picks = [{"id", "lines": [{"v": speaker voice id, "s", "e", "t"}]}],
conversations between two operators. Clips go to <out dir>/convo/<id>_<n>.ogg
and convos.json = [{id, lines: [{v, f, t}]}] to <out dir>.
"""
import json, os, subprocess, sys

convos = sys.argv[1] == '--convos'
src, picks, out = sys.argv[1 + convos:4 + convos]
def cut(it, path):
    s = max(0, it['s'] - .05); d = it['e'] - s + .12
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{s:.3f}', '-t', f'{d:.3f}', '-i', src, '-ac', '1', '-ar', '44100',
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.02,areverse,afade=t=in:d=0.05,areverse',
                    '-c:a', 'libvorbis', '-q:a', '4', path], check=True)
if convos:
    os.makedirs(os.path.join(out, 'convo'), exist_ok=True)
    for f in os.listdir(os.path.join(out, 'convo')):
        if f.endswith('.ogg'): os.remove(os.path.join(out, 'convo', f))
    res = []
    for c in json.load(open(picks)):
        ls = []
        for n, it in enumerate(c['lines']):
            f = f"convo/{c['id']}_{n}.ogg"; cut(it, os.path.join(out, f)); ls.append({'v': it['v'], 'f': f, 't': it['t']})
        res.append({'id': c['id'], 'lines': ls})
    json.dump(res, open(os.path.join(out, 'convos.json'), 'w'), indent=1)
    print(len(res), 'conversations ->', out); sys.exit()
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    if f.endswith('.ogg'): os.remove(os.path.join(out, f))
lines = {}
for ev, items in json.load(open(picks)).items():
    for n, it in enumerate(items):
        f = f'{ev}_{n:02d}.ogg'
        cut(it, os.path.join(out, f))
        lines.setdefault(ev, []).append({'f': f, 't': it['t']})
json.dump(lines, open(os.path.join(out, 'lines.json'), 'w'), indent=1)
print(sum(len(v) for v in lines.values()), 'lines in', len(lines), 'events ->', out)
