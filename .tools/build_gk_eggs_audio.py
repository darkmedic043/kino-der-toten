#!/usr/bin/env python3
"""Gorod Krovi's Easter egg sounds (side eggs and the main quest): the songs, the egg one-shots and loops, Sophia's
logs and the ethereal 935 logs, read from BO3's own sound banks (zone/snd: zm_stalingrad.all.sabl/.sabs,
zm_stalingrad.en.sabs, zm_common.all.sabl) into export/web/mods/maps/gorod-krovi/audio/ (git-ignored: ripped).
A VO log of several lines (vox_stal_abcd_<name>_0..n) becomes one file with 0.35 s between lines; the _s alternates
are skipped. Run: python3 -I .tools/build_gk_eggs_audio.py [--only <regex>]   (needs ffmpeg)."""
import mmap, os, pathlib, re, struct, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SND = pathlib.Path(os.environ.get('BO3_SND', '/mass_drive/SteamLibrary/steamapps/common/Call of Duty Black Ops III/zone/snd'))
OUT = ROOT / 'export/web/mods/maps/gorod-krovi/audio'
ONLY = re.compile(sys.argv[sys.argv.index('--only') + 1]) if '--only' in sys.argv else None
L, S, V, C = 'all/zm_stalingrad.all.sabl', 'all/zm_stalingrad.all.sabs', 'en/zm_stalingrad.en.sabs', 'all/zm_common.all.sabl'
Z = 'zmb/level/zm_stalingrad/'
Q = Z + 'quest/'
# out name -> (bank, path prefix in the bank)
ONE = {
    # songs (sndmusicsystem_playstate)
    'mus_dead_ended': (S, 'mus/zm/stalingrad/dead_ended/dead_ended_35b.'),
    'mus_ace_of_spades': (S, 'mus/zm/stalingrad/ace_of_spades/ace_of_spades_master_'),
    'mus_sam': (S, 'mus/zm/stalingrad/sam/samanthas_sorrows_v1_mas2.'),
    'mus_outro': (S, 'mus/zm/stalingrad/outro/mus_outro.'),
    'mus_dragon_fight': (S, 'mus/zm/stalingrad/dragon_fight/dragon_fight_v1_mas.'),
    'mus_nikolai_trans': (S, 'mus/zm/stalingrad/dragon_death/ddeath_to_nikolai_trans_v1_mas.'),
    'mus_anthem_start': (S, 'mus/zm/stalingrad/nikolai_fight/anthem_start.'),
    'mus_musicbox_lp': (L, 'mus/zm/stalingrad/musicbox_lp/musicbox_lp.'),
    # the songs' bottles and cards
    'ee_mus_lp': (C, 'zmb/egg/meteor_loop.'), 'ee_mus_activate': (C, 'zmb/egg/meteor_affirm.'),
    'card_activate': (L, Z + 'card_activate/card_activate.'),
    # Samantha's music box, the anthem speakers, the pianos
    'sam_good': (L, Z + 'sam/good.'), 'sam_disappear_0': (L, Z + 'sam/disppear/target_disappear_00.'),
    'sam_disappear_1': (L, Z + 'sam/disppear/target_disappear_01.'),
    'pa_anthem_start': (L, Z + 'pa/anthem_start.'), 'pa_destruct_0': (L, Z + 'pa/destruct/pa_destruct_00.'),
    'pa_destruct_1': (L, Z + 'pa/destruct/pa_destruct_01.'),
    **{f'piano_{i}': (L, Z + f'piano/spooky_piano_0{i}.') for i in range(10)},
    # wearables
    'wear_helmet': (L, Z + 'wearables/helmet_puton.'), 'wear_wings': (L, Z + 'wearables/wings_puton.'),
    'wear_teleport': (L, Z + 'wearables/teleport_plr.'),
    # Sophia's logs
    **{f'sophia_log_{i}': (V, f'vox_stal_soph_sophia_log_{i}.') for i in range(1, 6)},
    'sophia_log_2_sfx': (S, Z + 'sophia_log_2_sfx.'),
    # the main quest
    'power_on': (L, Z + 'power_on.'),
    'tube_airflow': (L, Q + 'pneumatictube/airflow.'), 'tube_door': (L, Q + 'pneumatictube/door_open.'),
    'gen_lp': (L, Q + 'pneumatictube/gen_lp.'), 'gen_start': (L, Q + 'pneumatictube/gen_start.'),
    'gen_stop': (L, Q + 'pneumatictube/gen_stop.'), 'tube_lever': (L, Q + 'pneumatictube/lever.'),
    'tube_enter': (L, Q + 'pneumatictube/tube_enter.'), 'tube_shake': (L, Q + 'pneumatictube/tube_idle_shake.'),
    'tube_imp': (L, Q + 'pneumatictube/tube_imp.'),
    'key_window': (L, Q + 'keyskeyskeys/window_hit.'), **{f'key_imp_{i}': (L, Q + f'keyskeyskeys/imp/imp_0{i}.') for i in range(6)},
    'key_swirl': (L, Q + 'keyskeyskeys/toilet/toilet_swirl_00.'),
    'magneto_start': (L, Q + 'magneto/fx_start.'), 'magneto_loop': (L, Q + 'magneto/fx_loop.'), 'magneto_end': (L, Q + 'magneto/fx_end.'),
    'magneto_grab': (L, Q + 'magneto/magneto_grab.'), 'sonar_lp': (L, Q + 'magneto/sonar_lp.'),
    'rb_alarm_lp': (L, Q + 'rigged_button/rb_alarm_lp.'), 'rb_open': (L, Q + 'rigged_button/rb_open.'), 'rb_close': (L, Q + 'rigged_button/rb_close.'),
    'cd_3s': (L, Q + 'finalcountdown/3_secs.'), 'cd_30s': (L, Q + 'finalcountdown/30_sec_marker.'),
    'cd_click': (L, Q + 'finalcountdown/timer_click.'), 'cd_click_close': (L, Q + 'finalcountdown/timer_click_close.'),
    'cd_stop': (L, Q + 'finalcountdown/timer_stop.'),
    'card_pickup': (L, Q + 'scenarios/torrent/card_pickup.'), 'hack_lp': (L, Q + 'scenarios/torrent/cc_hack_lp.'),
    'hack_start': (L, Q + 'scenarios/torrent/cc_hack_start.'), 'hack_success': (L, Q + 'scenarios/torrent/cc_hack_success.'),
    'ui_deny': (L, Q + 'scenarios/ui/button_deny.'), 'ui_yay': (L, Q + 'scenarios/ui/button_ui_yay.'),
    'ui_finish': (L, Q + 'scenarios/ui/finish_scenario.'), 'ui_finish_all': (L, Q + 'scenarios/ui/finish_scenario_all.'),
    'ui_beep': (L, Q + 'scenarios/ui/map_beep.'), 'ui_select': (L, Q + 'scenarios/ui/select.'),
    'soph_drawer_open': (L, Q + 'sophia/drawer_open.'), 'soph_drawer_close': (L, Q + 'sophia/drawer_close.'),
    'soph_slot_open': (L, Q + 'sophia/slot_open.'), 'soph_slot_close': (L, Q + 'sophia/slot_close.'),
    'soph_ratchet': (L, Q + 'sophia/wheel_ratchet.'), 'soph_takeoff': (L, Q + 'sophia/eye_takeoff_720.'),
    'soph_slide': (L, Q + 'sophia/sophia_comp_slide_30.'), 'soph_frm60': (L, Q + 'sophia/computer_sophia_frm60.'),
    'soph_core_door': (L, Z + 'sophia/anims/sophia_core_door_open.'), 'soph_open': (L, Z + 'sophia/anims/sophia_open.'),
    'soph_ring_open': (L, Z + 'sophia/anims/sophia_ring_door_open.'), 'soph_ring_close': (L, Z + 'sophia/anims/sophia_ring_door_close.'),
    'soph_trap_door': (L, Z + 'sophia/anims/sophia_trap_door.'), 'soph_boot': (L, Z + 'sophia/boot/amb_sophia_boot.'),
    'robohead_start': (L, Z + 'robohead/robot_head_start.'), 'robohead_lp': (L, Z + 'robohead/robot_head_lp.'),
    'robohead_end': (L, Z + 'robohead/robot_head_end.'), 'robohead_move': (L, Z + 'robohead/head_move.'),
    'gersh_lp': (L, Z + 'gersh/gersh_lp.'), 'gersh_off': (L, Z + 'gersh/gersh_speed_off.'),
}
# the ethereal 935 logs and the downed talk lines: name -> line count (vox_stal_abcd_<name>_<i>)
ABCD = {'first_contact': 2, 'second_contact': 2, 'broken_world_1': 6, 'broken_world_2': 1, 'broken_world_3': 4,
        'maxis_maxis': 3, 'samantha_samantha': 4, 'multiple_versions_1': 3, 'multiple_versions_2': 8, 'multiple_versions_3': 3,
        'before_ee_complete_1': 2, 'before_ee_complete_2': 2, 'introduction_x': 7,
        **{f'talk_{c}_{k}': n for c, ns in {'dempsey': (2, 2, 1), 'nikolai': (2, 3, 1), 'richtofen': (2, 1, 1), 'takeo': (2, 2, 2)}.items()
           for k, n in zip((1, 2, 3), ns)}}

def bank_index(m):   # build_gorod_ambience.py's reader: the entry table and the 128-byte names at the end
    count = struct.unpack_from('<I', m, 0x14)[0]; table = struct.unpack_from('<Q', m, 0x28)[0]; names = len(m) - count * 128
    idx = {}
    for i in range(count):
        name = m[names + i * 128:names + (i + 1) * 128].split(b'\0')[0].decode(errors='replace').replace('\\', '/')
        _id, size, _frames, _pad, off = struct.unpack_from('<IIIIQ', m, table + i * 36)
        if name not in idx or '.LL' in name: idx[name] = (off, size)
    return idx

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    banks = {}
    def bank(b):
        if b not in banks:
            f = open(SND / b, 'rb'); m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            if m[:4] != b'2UX#': sys.exit(f'{b}: not a sound bank')
            banks[b] = (m, bank_index(m))
        return banks[b]
    missing, n = [], 0
    with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as tmp:
        def raw(b, prefix):
            nonlocal n
            m, idx = bank(b); name = next((x for x in sorted(idx) if x.startswith(prefix) or x.rsplit('/', 1)[-1].startswith(prefix)), None)
            if not name: return None
            off, size = idx[name]; p = pathlib.Path(tmp) / f'{n}.flac'; n += 1; p.write_bytes(m[off:off + size]); return p
        for k, (b, prefix) in ONE.items():
            if ONLY and not ONLY.search(k): continue
            src = raw(b, prefix)
            if not src: missing.append(k); continue
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-af', 'apad=whole_dur=0.4', '-c:a', 'libvorbis', '-q:a', '3', str(OUT / f'{k}.ogg')], check=True)
        for k, cnt in ABCD.items():
            if ONLY and not ONLY.search(k): continue
            parts = [raw(V, f'vox_stal_abcd_{k}_{i}.') for i in range(cnt)]
            if not all(parts): missing.append(k); continue
            ins = sum((['-i', str(p)] for p in parts), [])
            filt = ''.join(f'[{i}:a]aresample=48000,aformat=channel_layouts=mono,apad=pad_dur=0.35[a{i}];' for i in range(cnt)) + \
                   ''.join(f'[a{i}]' for i in range(cnt)) + f'concat=n={cnt}:v=0:a=1[o]'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', filt, '-map', '[o]', '-c:a', 'libvorbis', '-q:a', '3', str(OUT / f'abcd_{k}.ogg')], check=True)
    print('wrote', len(ONE) + len(ABCD) - len(missing), 'files to', OUT, '; missing:', missing or 'none')

main()
