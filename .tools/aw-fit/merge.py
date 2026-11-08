# python3 .tools/aw-fit/merge.py aw_ak12 aw_m1911 ...  -> adds (or replaces) those guns in aw-kits.json from scratch/aw2/fit/out/<id>.json.
# Mounts listed in opts.json "<id>": {"veto": [...]} are left out (the attachment stays stat-only). Existing entries keep their text.
import json, re, sys
K = 'export/web/mods/bo3-weapons/aw-kits.json'
src = open(K).read()
opts = json.load(open('.tools/aw-fit/opts.json'))
cur = json.loads(src)['guns']
def entry(i):
    d = json.load(open(f'scratch/aw2/fit/out/{i}.json'))
    veto = set(opts.get(i, {}).get('veto', []))
    ms = {k: {kk: m[kk] for kk in ('part', 'tag', 'at', 'rot', 'scale') if kk in m} for k, m in d['mounts'].items() if k not in veto}
    for k, u in (d.get('upFix') or {}).items():   # the Pack-a-Punch model's own placement (or none: false)
        if k in ms: ms[k]['up'] = False if u is False else {kk: u[kk] for kk in ('tag', 'at', 'rot', 'scale') if kk in u and u[kk] != ms[k].get(kk)}
    lines = [f'    "{i}":{{"kit":{json.dumps(d["kit"], separators=(",", ":"))}' + (',' if ms else '}')]
    if ms:
        lines.append('     "mounts":{')
        lines += [f'      "{k}":{json.dumps(m, separators=(",", ":"))}' + (',' if n < len(ms) - 1 else '}}') for n, (k, m) in enumerate(ms.items())]
    return '\n'.join(lines), len(ms)
for i in sys.argv[1:]:
    text, n = entry(i)
    if i in cur:   # replace the old block: from its key line to the next gun key or the end of guns
        m = re.search(r'\n    "' + re.escape(i) + r'":\{.*?(?=,\n    "aw_|\n  \}\n\}\s*$)', src, re.S)
        src = src[:m.start()] + '\n' + text + src[m.end():]
    else:
        end = src.rstrip().rfind('\n  }')
        src = src[:end] + ',\n' + text + src[end:]
    print(i, n, 'mounts')
json.loads(src)
open(K, 'w').write(src)
