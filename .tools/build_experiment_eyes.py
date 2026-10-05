# Blender (headless, for its numpy) helper of .tools/build_experiment.sh: the Experiment's eye colours. Turns the hue of
# the amber eye atlas in HSV, keeping each pixel's saturation and value (as the avatar's Poiyomi hue shift does).
# ffmpeg's `hue` keeps luma instead, so bright amber came out a washed lavender for blue.
# usage: blender -b -P build_experiment_eyes.py -- <eyes.png> <out dir> name:degrees ...
import bpy, sys, os
import numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
src, out, specs = args[0], args[1], args[2:]
im = bpy.data.images.load(src); im.scale(1024, 1024)
w, h = im.size; px = np.empty(w * h * 4, 'f'); im.pixels.foreach_get(px); px = px.reshape(-1, 4)
rgb = px[:, :3]; mx = rgb.max(1); mn = rgb.min(1); d = mx - mn
hue = np.zeros_like(mx); nz = d > 1e-6
r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
m = nz & (mx == r); hue[m] = ((g[m] - b[m]) / d[m]) % 6
m = nz & (mx == g) & (mx != r); hue[m] = (b[m] - r[m]) / d[m] + 2
m = nz & (mx == b) & (mx != r) & (mx != g); hue[m] = (r[m] - g[m]) / d[m] + 4
sat = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0); val = mx
for spec in specs:
    name, deg = spec.split(':')
    hh = (hue + float(deg) / 60) % 6
    c = val * sat; x = c * (1 - np.abs(hh % 2 - 1)); z = np.zeros_like(c); i = hh.astype(int) % 6
    table = [(c, x, z), (x, c, z), (z, c, x), (z, x, c), (x, z, c), (c, z, x)]
    o = np.empty_like(rgb)
    for k, (a0, a1, a2) in enumerate(table):
        s = i == k; o[s, 0], o[s, 1], o[s, 2] = a0[s], a1[s], a2[s]
    o += (val - c)[:, None]
    res = px.copy(); res[:, :3] = o
    oi = bpy.data.images.new(name, w, h, alpha=True); oi.pixels.foreach_set(res.ravel())
    oi.filepath_raw = os.path.join(out, f'eyes_{name}.png'); oi.file_format = 'PNG'; oi.save()
print('eyes done')
