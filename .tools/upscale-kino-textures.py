#!/usr/bin/env python3
"""AI-upscale Kino's map textures with Real-ESRGAN (ncnn-vulkan, GPU).

Each colour texture Kino's map uses (128-512 px; 1024 ones and tiny ones are
left alone) is padded with a wrapped-around border so tiling textures stay
seamless, upscaled 4x with realesrgan-x4plus, cropped, resized to 2x
(Lanczos) and written as

    export/web/textures/hd/<name>.webp      (alpha kept)
    export/web/mods/map-materials/hd.json   original texture file -> HD file

The map-materials mod swaps them in after the game starts when Settings ->
HD textures is on. Needs the Real-ESRGAN release in ~/.local/opt/realesrgan
(https://github.com/xinntao/Real-ESRGAN/releases, v0.2.5.0 ncnn-vulkan).

    python3 .tools/upscale-kino-textures.py            # all, resumable
"""
import json, os, pathlib, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'export/web'
OUT = ROOT / 'textures/hd'; OUT.mkdir(exist_ok=True)
ESRGAN = pathlib.Path.home() / '.local/opt/realesrgan/realesrgan-ncnn-vulkan'
PAD = 24   # wrapped border (source pixels) so tiling edges upscale seamlessly

def size(path):
    w, h = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', str(path)],
                          capture_output=True, text=True, check=True).stdout.strip().split(',')
    return int(w), int(h)

gltf = json.loads((ROOT / 'kino.gltf').read_text())
WEAPONS = sys.argv[1:] == ['--weapons']
if WEAPONS:
    # Weapon models (viewmodels, world models, Moon weapons): every texture their glTFs reference.
    import struct
    def glb_images(path):
        b = path.read_bytes(); n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20 + n])
        return [os.path.normpath(path.parent / i['uri']) for i in j.get('images', []) if 'uri' in i]
    defs = list(json.loads((ROOT / 'game-data.json').read_text())['weapons'].values()) + list(json.loads((ROOT / 'moon/combat-data.json').read_text())['weapons'].values())
    files = set()
    for w in defs:
        for d in (w, w.get('upgrade') or {}):
            for k in ('model', 'worldModel', 'leftModel'):
                if d.get(k) and (ROOT / d[k]).exists(): files.update(glb_images(ROOT / d[k]))
    uris = sorted(os.path.relpath(f, ROOT) for f in files if os.path.exists(f))
    OUT = ROOT / 'textures/hd-weapons'; OUT.mkdir(exist_ok=True)
    TABLE, MAXSIZE = ROOT / 'mods/hd-weapons/hd.json', 1024
else:
    uris = None; TABLE, MAXSIZE = ROOT / 'mods/map-materials/hd.json', 512

def write_material_table(table):
    """hd-materials.json: material name -> HD file (the browser keys by material)."""
    out = {}
    for m in gltf['materials']:
        t = m.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index')
        if t is None: continue
        f = os.path.basename(gltf['images'][gltf['textures'][t]['source']].get('uri', ''))
        if f in table: out[m['name']] = table[f]
    (ROOT / 'mods/map-materials/hd-materials.json').write_text(json.dumps(out, indent=1, sort_keys=True))

if sys.argv[1:] == ['--table-only']:  # map textures only
    t = json.loads((ROOT / 'mods/map-materials/hd.json').read_text())
    write_material_table(t); print('hd-materials.json:', len(t), 'textures'); sys.exit()
uris = uris or sorted({i['uri'] for i in gltf['images'] if 'uri' in i})
todo = []
for u in uris:
    src = ROOT / u
    if not src.exists(): continue
    w, h = size(src)
    if max(w, h) < 128 or max(w, h) > MAXSIZE: continue
    todo.append((u, src, w, h))
table_path = TABLE
table = json.loads(table_path.read_text()) if table_path.exists() else {}
print(f'{len(todo)} textures to upscale', flush=True)

for n, (u, src, w, h) in enumerate(todo, 1):
    out = OUT / ((u.replace('/', '__').rsplit('.', 1)[0] if WEAPONS else src.stem) + '.webp')   
    if out.exists():
        table[u if WEAPONS else os.path.basename(u)] = os.path.relpath(out, ROOT); continue
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp); padded, up = tmp / 'in.png', tmp / 'up.png'
        p = min(PAD, w // 2, h // 2)
        # 3x3 tile, then keep the centre plus a wrapped border.
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-filter_complex',
            f'[0]format=rgba,split=3[a][b][c];[a][b][c]hstack=3,split=3[r1][r2][r3];[r1][r2][r3]vstack=3,crop={w+2*p}:{h+2*p}:{w-p}:{h-p}',
            str(padded)], check=True)
        subprocess.run([str(ESRGAN), '-i', str(padded), '-o', str(up), '-n', 'realesrgan-x4plus', '-g', '0'],
                       check=True, capture_output=True)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(up), '-vf',
            f'crop={w*4}:{h*4}:{p*4}:{p*4},scale={w*2}:{h*2}:flags=lanczos',
            '-c:v', 'libwebp', '-quality', '90', str(out)], check=True)
    table[u if WEAPONS else os.path.basename(u)] = os.path.relpath(out, ROOT)
    table_path.write_text(json.dumps(table, indent=1, sort_keys=True))
    print(f'[{n}/{len(todo)}] {src.name} {w}x{h} -> {w*2}x{h*2}', flush=True)
table_path.write_text(json.dumps(table, indent=1, sort_keys=True))
if not WEAPONS: write_material_table(table)
print('done', len(table), 'textures', flush=True)
