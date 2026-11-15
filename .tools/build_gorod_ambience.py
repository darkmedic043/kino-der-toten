#!/usr/bin/env python3
"""Gorod Krovi's ambience (2026-11-15): the map's own placed sound emitters, the air-raid siren, Pavlov's basement
machines, the mortar barrages and the zm_stalingrad bank's wind, battle, creak and drip sounds, for
mods/gorod-krovi/sounds.js. The pattern is build_castle_ambience.py (Der Eisendrache).

  python3 -I .tools/build_gorod_ambience.py [--no-audio]

Reads export_game/bo3/maps/zm_stalingrad/zm_stalingrad.ents: script_structs with script_sound (`looper` = a loop at a
point, `line_emitter` = a loop along origin -> targetOrigin, `random` = one-shots every script_wait_min..max seconds)
and the 88 `ambient_mortar` structs (script_string = area, script_int 0/1/2 = small/medium/large). Writes
maps/gorod-krovi/audio/ambience.json (map units: CoD x,y,z -> x,z,-y) and audio/amb_*.ogg from the sound bank (ripped:
that folder is git-ignored, never published, not in Rind's OWN list). Volumes and ranges are by ear: the aliases' own
numbers are in the fastfile, not exported. The siren and the basement machines are placed by the map's script, not
its .ents: their points are in EXTRA (scratch/gk/spec/other.md §9).
Left out: amb_flies, amb_air_l/_r (no clear bank file), amb_piano_spooky (a use prompt with a cooldown, not done),
mx_packa_jingle and the traps' fire_med. The music (area underscores, the song eggs, round stingers) is in the
streamed .sabs, not this bank."""
import json, mmap, os, pathlib, re, struct, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENTS = ROOT / 'export_game/bo3/maps/zm_stalingrad/zm_stalingrad.ents'
OUT = ROOT / 'export/web/mods/maps/gorod-krovi/audio'
BANK = pathlib.Path(os.environ.get('BO3_SND', '/mass_drive/SteamLibrary/steamapps/common/Call of Duty Black Ops III/zone/snd/all/zm_stalingrad.all.sabl'))

# key: loop/shot (bank name substrings; a shot takes every numbered variant), volume, range in map units, the .ents
# aliases that use it; bed = follows the player (out = open sky, in = under a roof), wait = a bed shot's gap
SOUNDS = {
    'sewer':      dict(loop=['sewer/flow/amb_sewer_flow.'], vol=.30, range=700, alias=['amb_sewer_pipe']),
    'sewer_big':  dict(loop=['sewer/flow/amb_sewer_flow_01.'], vol=.30, range=800, alias=['amb_sewer_pipe_2']),
    'torture':    dict(loop=['pavlov/torture/loop/torture_loop.'], vol=.30, range=600, alias=['amb_torture']),
    'siren':      dict(loop=['air_raid/air_raid_horn_00_l.'], vol=.20, range=6000),
    'machine_0':  dict(loop=['machinery/amb_comp_loop_00.'], vol=.30, range=700),
    'machine_1':  dict(loop=['machinery/amb_comp_loop_01.'], vol=.30, range=700),
    'machine_2':  dict(loop=['machinery/amb_comp_loop_02.'], vol=.30, range=700),
    'room_tone':  dict(loop=['pavlov_blend/amb_pavlov_room_tone.'], vol=.26, range=1100),
    # the war outside, heard through walls (indoors), and the .ents' small-arms lines (the bank has no small-arms loop)
    'battle':     dict(loop=['dist_interior/amb_dist_interior.'], vol=.16, range=1400, bed='in', alias=['amb_small_arms_l', 'amb_small_arms_r']),
    'bed_out':    dict(loop=['wind/strong/wind_strong.'], vol=.20, bed='out'),
    'wood':       dict(shot='creaks/wood/hvy/hvy_wood_creak_', vol=.30, range=700, alias=['amb_wood_creak']),
    'metal':      dict(shot='creaks/metal/structure/short/metal_struct_creak_short_', vol=.26, range=600, alias=['amb_metal_creak']),
    'groan':      dict(shot='creak/metal/stress/metal_stress_', vol=.28, range=800, alias=['amb_metal_groan']),
    'monster_box': dict(shot='monster_box/new/monster_box_new_', vol=.32, range=700, alias=['amb_monster_box']),
    'furnace':    dict(shot='monster_furnace/new/monster_furnace', vol=.32, range=700, alias=['amb_monster_furnace']),
    'lapping':    dict(shot='water/drip/hit/water_drip_hit_', vol=.26, range=500, alias=['amb_water_lapping']),
    'bang':       dict(shot='pavlov/bang/bang_', vol=.30, range=900),
    'whispers':   dict(shot='zmb/amb/creepy/whispers/whispers_', vol=.24, range=700),
    'sweets':     dict(shot='zm_island/comp_sweets/comp_sweeps_', vol=.22, range=700),
    'flicker':    dict(shot='lights/bad/flicker/buzz_flicker_', vol=.22, range=500),
    'drip':       dict(shot='drip/concrete/drip_concrete_', vol=.22, bed='in', wait=[6, 18]),
    'gust':       dict(shot='wind/gusts/cold/long/wind_gust_long_', vol=.32, bed='out', wait=[14, 40]),
    'far_boom':   dict(shot='explos/dist/full_verb/dist_huge_explos_full_', vol=.26, bed='both', wait=[10, 30]),
    'thunder':    dict(shot='thunder/flash/lightning_flash_', vol=.22, bed='out', wait=[35, 90]),
    # the barrages (sounds.js): incoming, then mortars in Pavlov's and the alley, artillery shells elsewhere
    'incoming':   dict(shot='incoming/tonal/var/shell_incoming_tonal_', vol=.45, range=3500),
    'mortar':     dict(shot='mortar_sm/exp/exp_mortar_small_', vol=.7, range=3500),
    'shell':      dict(shot='shell_nodebris/exp_shell_nodebris_', vol=.7, range=4500),
    'dirt':       dict(shot='pfx/dirt/mortar/dirt_plume_', vol=.45, range=1500),
}
# placed by the map's script (CoD units): the siren all game; Pavlov's basement machine loops, room tone and randoms
PAV = [(-3271, 21733, -86), (-3078, 22000, -108), (-2765, 21978, -106)]
EXTRA = [('siren', (-1819, 2705, 1167), None)] + [(f'machine_{i}', p, None) for i, p in enumerate(PAV)] + [
    ('room_tone', (-3038, 21904, -100), None), ('bang', PAV[1], [9, 26]), ('whispers', PAV[0], [12, 34]),
    ('sweets', PAV[2], [10, 30]), ('flicker', (-3038, 21904, -60), [7, 20])]

mp = lambda x, y, z: [round(float(x), 1), round(float(z), 1), round(-float(y), 1)]

def ents():
    t = ENTS.read_text(errors='replace')
    return [dict(re.findall(r'"([^"]*)" "([^"]*)"', b)) for b in re.findall(r'\{([^{}]*)\}', t)]

def emitters(all_ents):
    key = {a: k for k, s in SOUNDS.items() for a in s.get('alias', [])}
    out, seen, skipped = [], set(), {}
    for e in all_ents:
        a, lab = e.get('script_sound'), e.get('script_label')
        if not a or e.get('classname') != 'script_struct' or lab not in ('looper', 'line_emitter', 'random'): continue
        k = key.get(a)
        if not k: skipped[a] = skipped.get(a, 0) + 1; continue
        em = dict(s=k, p=mp(*e['origin'].split()))
        if lab == 'line_emitter' and e.get('targetOrigin'): em['q'] = mp(*e['targetOrigin'].split())
        if lab == 'random': em['w'] = [float(e.get('script_wait_min', 5)), float(e.get('script_wait_max', 15))]
        sig = json.dumps(em, sort_keys=True)
        if sig in seen: continue   # stacked prefab copies
        seen.add(sig); out.append(em)
    for k, p, w in EXTRA:
        em = dict(s=k, p=mp(*p))
        if w: em['w'] = w
        out.append(em)
    return out, skipped

def mortars(all_ents):
    return [dict(p=mp(*e['origin'].split()), a=e.get('script_string', 'start'), s=int(e.get('script_int', 1)))
            for e in all_ents if e.get('targetname') == 'ambient_mortar' and e.get('origin')]

def bank_index(m):
    count = struct.unpack_from('<I', m, 0x14)[0]; table = struct.unpack_from('<Q', m, 0x28)[0]; names = len(m) - count * 128
    idx = {}
    for i in range(count):
        name = m[names + i * 128:names + (i + 1) * 128].split(b'\0')[0].decode(errors='replace').replace('\\', '/')
        _id, size, _frames, _pad, off = struct.unpack_from('<IIIIQ', m, table + i * 36)
        if name not in idx or '.LL' in name: idx[name] = (off, size)
    return idx

def encode(src, dst, pad=False):   # pad: a one-shot under 0.4 s gets silence to 0.4 s (Chromium refused a 0.1 s Ogg: NotSupportedError)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src)] + (['-af', 'apad=whole_dur=0.4'] if pad else []) + ['-c:a', 'libvorbis', '-q:a', '3', str(dst)], check=True)

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
                name = next((x for x in idx if s['loop'][0] in x), None)
                if not name: print('MISSING', k, s['loop']); continue
                encode(flac(name), OUT / f'amb_{k}.ogg'); sounds[k]['n'] = 0
            else:   # one file per variant (a name in the bank twice, LL and LN, counts once)
                names = sorted({re.sub(r'\.L[LN]\d+\..*', '', x): x for x in idx if s['shot'] in x}.values())
                if not names: print('MISSING', k, s['shot']); continue
                for i, x in enumerate(names): encode(flac(x), OUT / f'amb_{k}_{i}.ogg', pad=True)
                sounds[k]['n'] = len(names)

def main():
    all_ents = ents(); em, skipped = emitters(all_ents); mo = mortars(all_ents)
    sounds = {k: {a: b for a, b in s.items() if a in ('vol', 'range', 'bed', 'wait')} | dict(loop='loop' in s) for k, s in SOUNDS.items()}
    OUT.mkdir(parents=True, exist_ok=True)
    js = OUT / 'ambience.json'
    if '--no-audio' in sys.argv:
        old = json.loads(js.read_text())['sounds'] if js.exists() else {}
        for k in sounds: sounds[k]['n'] = old.get(k, {}).get('n', 0)
    else: audio(sounds)
    sounds = {k: s for k, s in sounds.items() if 'n' in s and (s['loop'] or s['n'])}
    em = [e for e in em if e['s'] in sounds]
    js.write_text(json.dumps(dict(sounds=sounds, emitters=em, mortars=mo), separators=(',', ':')))
    by = {}
    for e in em: by[e['s']] = by.get(e['s'], 0) + 1
    print(f'{len(sounds)} sounds, {len(em)} emitters, {len(mo)} mortar points', by); print('left out:', skipped)

main()
