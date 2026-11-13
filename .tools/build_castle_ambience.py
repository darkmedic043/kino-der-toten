#!/usr/bin/env python3
"""Der Eisendrache's ambience (2026-11-13): the map's own placed sound emitters and the zm_castle bank's wind, room,
creak and bird sounds, for mods/der-eisendrache/ambience.js.

  python3 -I .tools/build_castle_ambience.py [--no-audio]

Reads export_game/bo3/maps/zm_castle/zm_castle.ents (script_structs with script_sound: `looper` = a loop at a point,
`line_emitter` = a loop along origin -> targetOrigin, `random` = one-shots every script_wait_min..max seconds) and
writes audio/ambience.json (emitters in map units: CoD x,y,z -> x,z,-y) plus audio/amb_*.ogg from the sound bank
(ripped: audio/ is git-ignored, never published). The aliases' own volumes and ranges are in the fastfile, not
exported: the numbers in SOUNDS are by ear. `sound_rattle` structs (shaken by explosions) and aliases with no clear
bank file (chains, flies, amb_air) are left out."""
import json, mmap, os, pathlib, re, struct, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENTS = ROOT / 'export_game/bo3/maps/zm_castle/zm_castle.ents'
OUT = ROOT / 'export/web/mods/der-eisendrache/audio'
BANK = pathlib.Path(os.environ.get('BO3_SND', '/mass_drive/SteamLibrary/steamapps/common/Call of Duty Black Ops III/zone/snd/all/zm_castle.all.sabl'))

# key: loop/shot, bank files (substring of the bank name; a list of two = a left/right pair joined to stereo; a shot's
# pattern takes every numbered variant), volume, range in map units, and the map aliases that use it
SOUNDS = {
    'cold_edge':  dict(loop=['wind/cold/cold_edge_close.'], vol=.30, range=900, alias=['amb_cold_edge']),
    'tunnel':     dict(loop=['wind/tunnel/tunnel_wind.'], vol=.32, range=900, alias=['amb_tunnel_wind']),
    'window':     dict(loop=['wind/window/wind_window_00.'], vol=.28, range=700, alias=['amb_window_wind']),
    'dank':       dict(loop=['wind/dank/air_dank_heavy.'], vol=.30, range=900, alias=['amb_dank_wind']),
    'whistle':    dict(loop=['wind/interior/amb_wind_int_whistle.'], vol=.22, range=700, alias=['amb_int_wind_whistle']),
    'roof_gap':   dict(loop=['wind/rooftop/rooftop_wind_01.'], vol=.30, range=900, alias=['amb_roof_gap_wind']),
    'cold_light': dict(loop=['wind/cold/amb_air_cold_light.'], vol=.25, range=800, alias=['amb_cold_light_wind']),
    'howl':       dict(loop=['wind/cold/cold_howl_l.', 'wind/cold/cold_howl_r.'], vol=.30, range=1000, alias=['amb_cold_howl_l', 'amb_cold_howl_r']),
    'ruin_room':  dict(loop=['castle/ruin_room_amb_l.', 'castle/ruin_room_amb_r.'], vol=.30, range=1000, alias=['amb_ruinroom_l', 'amb_ruinroom_r']),
    'dungeon':    dict(loop=['castle/dungeon_amb_l.', 'castle/dungeon_amb_r.'], vol=.32, range=1000, alias=['amb_dungeon_l', 'amb_dungeon_r']),
    'torch':      dict(loop=['fire/torch/fire_torch.'], vol=.35, range=450, alias=['amb_torches']),
    'radio_1':    dict(loop=['radio/loops/loop_01.'], vol=.20, range=450, alias=['amb_radio_1']),
    'radio_2':    dict(loop=['radio/loops/loop_02.'], vol=.20, range=450, alias=['amb_radio_2']),
    'radio_3':    dict(loop=['radio/loops/loop_06.'], vol=.20, range=450, alias=['amb_radio_3']),
    'radio_beep': dict(loop=['radio/tower/tower_radio.'], vol=.16, range=400, alias=['amb_radio_beep']),
    'flag':       dict(loop=['cloth/sheet/sheet_flap_00.'], vol=.30, range=600, alias=['amb_flag_flap']),
    'snow':       dict(loop=['snow_fall/amb_snowfall_with_air.'], vol=.22, range=700, alias=['amb_snow_transitions']),
    'drips':      dict(loop=['cave_drips/loop/water_drip_cave_loop.'], vol=.30, range=600, alias=['amb_well_drips']),
    'gust':       dict(shot='wind/gusts/cold/long/wind_gust_long_', vol=.38, range=1100, alias=['amb_wind_gust_cold']),
    'wood':       dict(shot='creaks/wood/hvy/hvy_wood_creak_', vol=.30, range=700, alias=['amb_wood_creak']),
    'wood_light': dict(shot='creaks/wood/stress/wood_stress_', vol=.26, range=600, alias=['amb_wood_creak_light']),
    'metal':      dict(shot='creaks/metal/structure/short/metal_struct_creak_short_', vol=.26, range=600, alias=['amb_metal_creak', 'amb_metal_creak_light']),
    'groan':      dict(shot='creak/metal/stress/metal_stress_', vol=.28, range=800, alias=['amb_metal_groan']),
    'owl':        dict(shot='owl/hoot/owl_hoot_', vol=.35, range=2200, alias=['amb_owls']),
    'rock':       dict(shot='pipe_rock/pipe_rock_fall.', vol=.30, range=900, alias=['amb_rock_fall']),
    # beds that follow the player (no emitters): open sky = the mountain wind, under a roof = the keep's air
    'bed_out':    dict(loop=['wind/strong/wind_strong.'], vol=.26, bed='out'),
    'bed_in':     dict(loop=['wind/interior/amb_wind_int_mid.'], vol=.12, bed='in'),
    'raven':      dict(shot='raven_caws/amb_raven_caws_', vol=.22, bed='out', wait=[18, 50]),
}

def emitters():
    t = ENTS.read_text(errors='replace')
    ents = [dict(re.findall(r'"([^"]*)" "([^"]*)"', b)) for b in re.findall(r'\{([^{}]*)\}', t)]
    key = {a: k for k, s in SOUNDS.items() for a in s.get('alias', [])}
    mp = lambda s: [round(v, 1) for v in (lambda x, y, z: (x, z, -y))(*map(float, s.split()))]
    out, seen, skipped = [], set(), {}
    for e in ents:
        a, lab = e.get('script_sound'), e.get('script_label')
        if not a or e.get('classname') != 'script_struct' or lab not in ('looper', 'line_emitter', 'random'): continue
        k = key.get(a)
        if not k: skipped[a] = skipped.get(a, 0) + 1; continue
        em = dict(s=k, p=mp(e['origin']))
        if lab == 'line_emitter' and e.get('targetOrigin'): em['q'] = mp(e['targetOrigin'])
        if lab == 'random': em['w'] = [float(e.get('script_wait_min', 5)), float(e.get('script_wait_max', 15))]
        sig = json.dumps(em, sort_keys=True)
        if sig in seen: continue   # the map stacks copies of some prefabs
        seen.add(sig); out.append(em)
    return out, skipped

def bank_index(m):
    count = struct.unpack_from('<I', m, 0x14)[0]; table = struct.unpack_from('<Q', m, 0x28)[0]; names = len(m) - count * 128
    idx = {}
    for i in range(count):
        name = m[names + i * 128:names + (i + 1) * 128].split(b'\0')[0].decode(errors='replace').replace('\\', '/')
        _id, size, _frames, _pad, off = struct.unpack_from('<IIIIQ', m, table + i * 36); idx[name] = (off, size)
    return idx

def encode(srcs, dst, tmp):
    """one FLAC -> mono-or-as-is Ogg; two FLACs -> one stereo Ogg (left, right)"""
    cmd = ['ffmpeg', '-v', 'error', '-y']
    for s in srcs: cmd += ['-i', str(s)]
    if len(srcs) == 2: cmd += ['-filter_complex', '[0:a][1:a]amerge=inputs=2,pan=stereo|c0=c0|c1=c1[a]', '-map', '[a]']
    subprocess.run(cmd + ['-c:a', 'libvorbis', '-q:a', '3', str(dst)], check=True)

def audio(sounds):
    if not BANK.exists(): sys.exit(f'no sound bank at {BANK} (set BO3_SND)')
    with open(BANK, 'rb') as f, tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as tmp:
        m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        if m[:4] != b'2UX#': sys.exit('not a sound bank')
        idx = bank_index(m); n = 0
        def flac(name):
            nonlocal n; off, size = idx[name]; p = pathlib.Path(tmp) / f'{n}.flac'; n += 1; p.write_bytes(m[off:off + size]); return p
        for k, s in SOUNDS.items():
            if 'loop' in s:
                names = [next((x for x in idx if pat in x), None) for pat in s['loop']]
                if None in names: print('MISSING', k, s['loop']); continue
                encode([flac(x) for x in names], OUT / f'amb_{k}.ogg', tmp); sounds[k]['n'] = 0
            else:
                names = sorted(x for x in idx if s['shot'] in x)
                if not names: print('MISSING', k, s['shot']); continue
                for i, x in enumerate(names): encode([flac(x)], OUT / f'amb_{k}_{i}.ogg', tmp)
                sounds[k]['n'] = len(names)

def main():
    em, skipped = emitters()
    sounds = {k: {a: b for a, b in s.items() if a in ('vol', 'range', 'bed', 'wait')} | dict(loop='loop' in s) for k, s in SOUNDS.items()}
    OUT.mkdir(parents=True, exist_ok=True)
    js = OUT / 'ambience.json'
    if '--no-audio' in sys.argv:   # emitters only: keep the variant counts of the last full build
        old = json.loads(js.read_text())['sounds'] if js.exists() else {}
        for k in sounds: sounds[k]['n'] = old.get(k, {}).get('n', 0)
    else: audio(sounds)
    sounds = {k: s for k, s in sounds.items() if 'n' in s and (s['loop'] or s['n'])}
    em = [e for e in em if e['s'] in sounds]
    js.write_text(json.dumps(dict(sounds=sounds, emitters=em), separators=(',', ':')))
    by = {}
    for e in em: by[e['s']] = by.get(e['s'], 0) + 1
    print(f'{len(sounds)} sounds, {len(em)} emitters', by); print('left out:', skipped)

main()
