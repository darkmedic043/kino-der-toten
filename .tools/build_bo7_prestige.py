#!/usr/bin/env python3
"""BO7 guns' own prestige camos (docs/fork/bo7-rips.md, Prestige camos).

Reads .tools/bo7-prestige.json ({gun codename: {"names": [P1, P2, Master], "camos": ["prestige_NNN", ...]}}, picked
from the user's rips by eye against the game's per-weapon camo names), copies each pattern out of the rips into
export/web/mods/bo7-rips/camos/ (git-ignored: ripped), makes the Master's glow mask (its brightest parts) and two
glow colours, and writes export/web/mods/bo7-rips/prestige.json for mod.js, which registers them in camo.js
PRESTIGE_OWN. Run with python3 -I.
"""
import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RIPS = os.environ.get('BO7_RIPS', '/mass_drive/RIPS/melon-pipeline')
TEX = os.path.join(RIPS, 'out', 'tex')
OUT = os.path.join(ROOT, 'export', 'web', 'mods', 'bo7-rips')
CAMOS = os.path.join(OUT, 'camos')


def src(camo):
    name = camo if camo.startswith(('sat_', 'jup_')) else 'sat_camo_prestige_' + camo
    return os.path.join(TEX, f'camo_{name}_c.webp'), name


def pixels(path, n=48):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-vf', f'scale={n}:{n}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         check=True, capture_output=True).stdout
    return [tuple(raw[i:i + 3]) for i in range(0, len(raw), 3)]


def glow_colours(path):
    """the two most saturated hue groups among the bright pixels, as 0..1 rgb (the Master's pulse colours)"""
    import colorsys
    px = [p for p in pixels(path) if max(p) > 90]
    bins = {}
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < .25:
            continue
        k = int(h * 12) % 12
        bins.setdefault(k, []).append((h, s, v))
    top = sorted(bins.items(), key=lambda kv: -len(kv[1]))[:2]
    out = []
    for _, l in top:
        h = sum(x[0] for x in l) / len(l)
        out.append([round(c, 3) for c in colorsys.hsv_to_rgb(h, 1, 1)])
    while len(out) < 2:
        out.append(out[0] if out else [1, .45, 1])
    if out[0] == out[1]:
        h = colorsys.rgb_to_hsv(*out[0])[0]
        out[1] = [round(c, 3) for c in colorsys.hsv_to_rgb((h + .12) % 1, 1, 1)]
    return out


def make(c):
    """one camo entry -> its webp under camos/ (file name), or None (no pattern in the rips)"""
    if c is None:
        return None, None
    if isinstance(c, str):
        c = {'p': c}
    if 'flat' in c:   # the plain-colour camos: the colour with a little grain
        name = 'flat_' + c['flat'].lstrip('#')
        dst = os.path.join(CAMOS, name + '.webp')
        if not os.path.exists(dst):
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', f"color=c=0x{c['flat'].lstrip('#')}:s=256x256",
                            '-vf', 'noise=alls=7:allf=u', '-frames:v', '1', '-q:v', '85', dst], check=True)
        return name, None
    p, name = src(c['p'])
    if not os.path.exists(p):
        sys.exit(f'no pattern {p}')
    if c.get('fx'):   # ripped as a colour mask: recoloured toward the game's look
        name += '_' + str(abs(__import__("zlib").crc32(c["fx"].encode())) % 10**6)
    dst = os.path.join(CAMOS, name + '.webp')
    if not os.path.exists(dst):
        if c.get('fx'):
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', p, '-vf', c['fx'], '-q:v', '88', dst], check=True)
        else:
            shutil.copyfile(p, dst)
    return name, dst


def main():
    table = json.load(open(os.path.join(ROOT, '.tools', 'bo7-prestige.json')))
    os.makedirs(CAMOS, exist_ok=True)
    out = {}
    for gun, e in table.items():
        if gun.startswith('_'):
            continue
        made = [make(c) for c in e['camos']]
        entry = {'names': e['names'], 'tex': [('../bo7-rips/camos/' + n + '.webp') if n else None for n, _ in made]}
        name, path = made[2]
        if path:
            glow = os.path.join(CAMOS, name + '_glow.webp')
            if not os.path.exists(glow):
                # the brightest part of the pattern, soft-edged: what pulses on the Master camo. The cut-off follows the
                # pattern's own brightness (its top ~18% glows), or a dark pattern gave an all-black mask.
                lum = sorted(.299 * r + .587 * g + .114 * b for r, g, b in pixels(path, 64))
                lo, hi = lum[int(len(lum) * .82)] / 255, lum[int(len(lum) * .985)] / 255
                lo, hi = min(lo, .9), max(min(hi, 1), min(lo, .9) + .05)
                curve = f'0/0 {lo:.3f}/0 {hi:.3f}/0.85' + (' 1/1' if hi < .999 else '')
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-vf',
                                f'scale=512:512,format=gray,curves=all={curve},gblur=sigma=1.5', '-q:v', '80', glow], check=True)
            entry['glow'] = '../bo7-rips/camos/' + name + '_glow.webp'
            entry['c1'], entry['c2'] = e.get('glow') or glow_colours(path)
        out['bo7_' + gun] = entry
        print(gun, e['names'], [n for n, _ in made])
    json.dump(out, open(os.path.join(OUT, 'prestige.json'), 'w'), separators=(',', ':'))
    print(len(out), 'guns ->', os.path.join(OUT, 'prestige.json'))


if __name__ == '__main__':
    main()
