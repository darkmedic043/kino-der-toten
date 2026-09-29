#!/usr/bin/env python3
"""Build standard normal maps for Kino's map materials.

The Kino export never attached normal maps, although 400+ of them sit in
export/web/textures. They are stored the Call of Duty way (X in alpha, Y in
green, red/blue a copy of green), so this converts each one a material uses
into an ordinary RGB normal map (Z rebuilt) and writes

    export/web/textures/nrm/<name>.webp      the converted maps
    export/web/mods/map-materials/normals.json   material name -> normal map

Matching is by name: "~-g<stem>_c.png" pairs with "<stem>_n.png" (or _nml);
truncated names ("...~hash.png") match by prefix.

    python3 .tools/build-kino-normals.py
"""
import json, os, re, subprocess, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'export/web'
TEX = ROOT / 'textures'
OUT = TEX / 'nrm'
OUT.mkdir(exist_ok=True)
gltf = json.loads((ROOT / 'kino.gltf').read_text())
normals = sorted(t for t in os.listdir(TEX) if re.search(r'_(n|nml)\.png$', t))

def colour(m):
    t = m.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index')
    return os.path.basename(gltf['images'][gltf['textures'][t]['source']]['uri']) if t is not None else None

def stem(name):
    s = re.sub(r'^~+-g', '', name)
    s = re.sub(r'\.png$', '', s).split('~')[0]
    return re.sub(r'_(c|col|d)$', '', s)

pairs = {}
for m in gltf['materials']:
    c = colour(m)
    if not c or c in pairs: continue
    s = stem(c)
    exact = [n for n in normals if n in (s + '_n.png', s + '_nml.png')]
    cand = exact or [n for n in normals if n.startswith(s)]
    if cand: pairs[c] = cand[0]

# X is in alpha, Y in green; rebuild Z so the result is a standard tangent-space map.
expr = ("r='alpha(X,Y)':g='g(X,Y)':"
        "b='127.5+127.5*sqrt(max(0,1-pow(alpha(X,Y)/127.5-1,2)-pow(g(X,Y)/127.5-1,2)))':a='255'")
done = 0
for src in sorted(set(pairs.values())):
    out = OUT / (src.rsplit('.', 1)[0] + '.webp')
    if not out.exists():
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(TEX / src), '-vf', f'format=rgba,geq={expr},format=rgb24',
                        '-c:v', 'libwebp', '-quality', '92', str(out)], check=True)
    done += 1
# Keyed by material name: in the browser the loaded textures no longer carry file names.
mapping = {m['name']: 'textures/nrm/' + pairs[colour(m)].rsplit('.', 1)[0] + '.webp' for m in gltf['materials'] if colour(m) in pairs}
(ROOT / 'mods/map-materials/normals.json').write_text(json.dumps(mapping, indent=1, sort_keys=True))
print(f'{len(pairs)} materials matched, {done} normal maps in {OUT}')
