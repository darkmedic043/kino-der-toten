#!/usr/bin/env python3
"""Cheese Cube Iron Man suit HUD images and sounds (the JARVIS HUD and voices), from the map's .iwd, into the shared
folder every map reads (git-ignored): export/web/mods/stark/jarvis (hud/, sounds/).

usage: cheese_cube_suit_assets.py <path to nazi_zombie_ccube_u.iwd> <export/web/mods/stark/jarvis>

Images are WaW IWI v6 (DXT1/3/5 with mips, smallest first): the full-size level is wrapped in a DDS header and converted
with ffmpeg to webp in hud/. Sounds are converted to ogg in sounds/.
"""
import os, struct, subprocess, sys, tempfile, zipfile

IMAGES = {   # iwi name -> output name
    'iron_man_interface_glow8': 'interface_mk3', 'iron_man_interface_mk4': 'interface_mk4',
    'iron_man_interface_mk5': 'interface_mk5', 'iron_man_interface_mk6_blue': 'interface_mk6',
    'iron_man_interface_mk6_red': 'interface_mk6_red', 'iron_man_interface_wm3': 'interface_wm',
    'iron_man_interface_mk16': 'interface_mk16',
    'iron_man_mask2': 'mask', 'iron_man_mk1_mask2': 'mask_mk1',
    'hud_iron_man_repulsor': 'icon_repulsor', 'hud_iron_man_rocket': 'icon_rocket',
    'hud_iron_man_mk1': 'icon_mk1', 'hud_war_machine_gun': 'icon_wm',
}
SOUNDS = {   # path in the iwd -> output name
    'sound/iron_man/weapons/repulsor_fire.wav': 'suit_repulsor', 'sound/iron_man/weapons/repulsor_impact.wav': 'suit_repulsor_hit',
    'sound/iron_man/weapons/missile_fire.wav': 'suit_missile', 'sound/iron_man/weapons/missile_explo.wav': 'suit_missile_hit',
    'sound/iron_man/weapons/minigun_fire.wav': 'suit_minigun',
    'sound/iron_man/weapons/cloak_start.wav': 'suit_cloak_on', 'sound/iron_man/weapons/cloak_stop.wav': 'suit_cloak_off',
    'sound/iron_man/suit_up/jarvis_startup_suit_on.wav': 'suit_on', 'sound/iron_man/suit_up/jarvis_shutdown_suit_off.wav': 'suit_off',
    'sound/iron_man/suit_up/mk1_suit_on.wav': 'suit_on_mk1', 'sound/iron_man/suit_up/mk1_suit_off.wav': 'suit_off_mk1',
    'sound/iron_man/suit_up/suitup_quick.wav': 'suit_up_quick',
    'sound/iron_man/jump_boost.wav': 'suit_boost', 'sound/iron_man/mk1_jump_boost.wav': 'suit_boost_mk1',
    **{f'sound/iron_man/jarvis/health_low_0{i}.wav': f'jarvis_health_low_{i}' for i in range(6)},
    **{f'sound/iron_man/jarvis/power_low_0{i}.wav': f'jarvis_power_low_{i}' for i in range(6)},
}
FOURCC = {11: b'DXT1', 12: b'DXT3', 13: b'DXT5'}
BLOCK = {11: 8, 12: 16, 13: 16}


def iwi_to_dds(data):
    if data[:3] != b'IWi' or data[3] != 6: raise ValueError('not an IWI v6 image')
    fmt, w, h = data[4], *struct.unpack('<HH', data[6:10])
    if fmt not in FOURCC: raise ValueError(f'unsupported IWI format {fmt}')
    size = max(1, (w + 3) // 4) * max(1, (h + 3) // 4) * BLOCK[fmt]
    top = data[-size:]   # the largest mip is stored last
    header = struct.pack('<4sIIIIIII44xII4s20xI16x', b'DDS ', 124, 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, h, w, size, 0, 1,
                         32, 0x4, FOURCC[fmt], 0x1000)
    return header + top


def main(iwd, out):
    os.makedirs(os.path.join(out, 'hud'), exist_ok=True); os.makedirs(os.path.join(out, 'sounds'), exist_ok=True)
    with zipfile.ZipFile(iwd) as z, tempfile.TemporaryDirectory() as tmp:
        names = set(z.namelist())
        for src, dst in IMAGES.items():
            path = f'images/{src}.iwi'
            if path not in names: print('missing', path); continue
            dds = os.path.join(tmp, dst + '.dds'); open(dds, 'wb').write(iwi_to_dds(z.read(path)))
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', dds, '-c:v', 'libwebp', '-lossless', '0', '-quality', '90',
                            os.path.join(out, 'hud', dst + '.webp')], check=True)
        for src, dst in SOUNDS.items():
            if src not in names: print('missing', src); continue
            wav = os.path.join(tmp, dst + '.wav'); open(wav, 'wb').write(z.read(src))
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4',
                            os.path.join(out, 'sounds', dst + '.ogg')], check=True)
    print('done')


if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
