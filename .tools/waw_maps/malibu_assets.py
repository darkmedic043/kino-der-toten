#!/usr/bin/env python3
"""Malibu Drive's own assets for mods/malibu-drive (the heroes, the Iron Man armors, their weapons and sounds), from the
map's OpenAssetTools dumps (see docs/fork/waw-ports.md, "Malibu Drive"):

  python3 .tools/waw_maps/malibu_assets.py ~/projects/waw-malibu-drive

reads <dir>/dump_mod/mod and <dir>/dump/nazi_zombie_malibu (xmodel GLBs, materials, DDS images), <dir>/dump_anim/*/xanim,
<dir>/iwd (the unpacked .iwd: weapons/sp, sound/, images/*.iwi) and writes into export/web/mods/maps/malibu-drive/
(git-ignored: ripped data):
  models/<name>.glb      the models with their colour maps as WebP (textures/), normal and specular maps dropped
  anims/<name>.json      every xanim (WaW's version 17) through .tools/xanim_to_json.mjs
  weapons.json           the hero and armor weapons (the map's weapons/sp files) as this game's weapon definitions
  sounds/<name>.ogg      the iwd's sounds (file name without folders)
  hud/<name>.webp        HUD images (IWI v6) the mod draws
Standard library plus ffmpeg and node.
"""
import json, math, pathlib, re, struct, subprocess, sys, zipfile
from urllib.parse import quote

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '~/projects/waw-malibu-drive').expanduser()
OUT = ROOT / 'export/web/mods/maps/malibu-drive'
WEB = 'mods/maps/malibu-drive/'
ZONES = [SRC / 'dump/nazi_zombie_malibu', SRC / 'dump_mod/mod']   # later wins
IWD = SRC / 'iwd'

# the heroes' and armors' weapons (names of the map's weapons/sp files)
WEAPONS = ['tony_phone', 'mk3_repulsor', 'mk3_rocket', 'mk1_flamethrower', 'mk1_rocket', 'mk6_rocket', 'mk16_cloaking', 'mk33_blades',
           'mk42_flare', 'heavy_repulsor', 'mk5_suitcase', 'wm_minigun', 'wm_handgun', 'thor_hammer', 'cap_shield', 'hawkeye_bow1',
           'hawkeye_bow2', 'hawkeye_bow3', 'widow_pistols', 'widow_pistols_upgraded', 'hulk_hands', 'mean_juice', 'spiderman',
           'scarlet_witch', 'colt']
# models the mod places itself (lobby figures, statues, flying armors, props)
MODELS = ['captain_america', 'backmodel_cap_shield', 'hawkeye_full_body', 'spider_man', 'spider_man_black', 'hulk', 'hulk_red', 'black_widow_0',
          'quicksilver_torso', 'quicksilver_legs', 'quicksilver_head', 'worldmodel_tony_stark', 'rhode1', 'rhode', 'vision', 'vision_ghost',
          'thor_full_body_model', 'thor', 'scarlet_witch_0', 'malibu_gold_statue_1', 'malibu_gold_statue_2', 'malibu_gold_lion', 'worldmodel_banner',
          'iron_man_worldmodel_mk1', 'iron_man_worldmodel_mk4', 'iron_man_worldmodel_mk5', 'iron_man_worldmodel_mk6', 'iron_man_worldmodel_mk16',
          'iron_man_worldmodel_mk16_cloak', 'iron_man_worldmodel_mk33', 'iron_man_worldmodel_mk42', 'iron_man_worldmodel_mk42_pieces',
          'iron_man_worldmodel_mk44', 'iron_man_world_prototype', 'iron_wm_world', 'world_wm_minigun', 'iron_man_missile_model',
          'malibu_tesserrect_top', 'malibu_tesserrect_bottom', 'malibu_web_glob', 'malibu_web_glob_2', 'scarlet_shield', 'hawkeye_arrow1',
          'thor_hammer', 'cap_shield', 'worldmodel_hawkeye_bow1', 'wm_battery', 'iron_patriot', 'iron_man_mk42',
          # viewhands: a weapon whose hands are viewmodel_hands_no_model uses the player's (SetViewmodel: the hero's or the armor's)
          'viewhands_tony_stark', 'viewhands_banner', 'viewhands_cap', 'viewhands_hawkeye', 'viewhands_quicksilver', 'viewhands_scarlet_witch',
          'viewhands_thor', 'viewhands_vision', 'viewhands_vision_ghost', 'black_widow_viewhands', 'spider_man_view', 'spider_man_view_black', 'hulk_view',
          'mk1_viewhands', 'mk3_viewhands', 'mk5_viewhands', 'mk16_viewhands', 'mk16_viewhands_cloak', 'mk42_viewhands', 'wm_viewhands', 'bo2_suit_viewhands']
# HUD images (iwd images/<name>.iwi)
HUD = ['hud_tony_stark', 'jarvis_interface1', 'jarvis_interface2', 'jarvis_interface_mk4', 'jarvis_interface_mk5', 'jarvis_interface_mk16',
       'iron_man_mask', 'iron_man_mk1_mask', 'hud_iron_man_mk1', 'fxt_iron_man_summon_waypoint', '1stperson_view_freeplay', '1stperson_view_hulk']

for sub in ['models', 'textures', 'anims', 'sounds', 'hud']:
    (OUT / sub).mkdir(parents=True, exist_ok=True)

def find(rel):
    return next((z / rel for z in reversed(ZONES) if (z / rel).is_file()), None)

def ffmpeg(*args):
    return subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], capture_output=True, text=True)

def texture(name, size=1024):
    src = find('images/' + name + '.dds')
    if not src:
        return None
    safe = re.sub(r'[^A-Za-z0-9_.-]', '_', name) + '.webp'
    target = OUT / 'textures' / safe
    if not target.exists():
        r = ffmpeg('-i', src, '-vf', f"scale='min({size},iw)':-2", '-c:v', 'libwebp', '-quality', '88', target)
        if r.returncode:
            print('texture failed', name, r.stderr.strip()[:200]); return None
    return '../textures/' + quote(safe)

done_models = {}
def model(name):
    name = (name or '').lstrip(',')
    if not name:
        return None
    if name in done_models:
        return done_models[name]
    src = find('model_export/' + name + '_lod0.glb')
    if not src:
        print('missing model', name); done_models[name] = None; return None
    b = src.read_bytes(); n = struct.unpack_from('<I', b, 12)[0]; doc = json.loads(b[20:20 + n])
    doc['images'], doc['textures'] = [], []
    doc['samplers'] = [{'wrapS': 10497, 'wrapT': 10497, 'magFilter': 9729, 'minFilter': 9987}]
    for m in doc.get('materials', []):
        m.pop('normalTexture', None); m.pop('occlusionTexture', None)
        m['pbrMetallicRoughness'] = {'metallicFactor': 0, 'roughnessFactor': .8}
        p = find('materials/' + m['name'] + '.json')
        info = json.loads(p.read_text()) if p else {}
        slots = info.get('textures', [])
        color = next((t.get('image') for t in slots if t.get('semantic') == 'colorMap' or t.get('name') == 'colorMap'), None)
        uri = texture(color) if color and not color.startswith('$') else None
        if uri:
            ix = len(doc['images']); doc['images'].append({'uri': uri}); doc['textures'].append({'source': ix, 'sampler': 0})
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': ix}
        bits = info.get('stateBits', [])
        if any(sb.get('alphaTest', 'disabled') != 'disabled' for sb in bits):
            m['alphaMode'] = 'MASK'; m['alphaCutoff'] = .5
        elif any(sb.get('blendOpRgb', 'disabled') != 'disabled' and sb.get('dstBlendRgb') not in (None, 'zero') for sb in bits):
            m['alphaMode'] = 'BLEND'
        if re.search(r'holo|glow|repulsor|_fx|lightning', m['name'], re.I):
            m['emissiveFactor'] = [1, 1, 1]
            if uri:
                m['emissiveTexture'] = {'index': ix}
    raw = json.dumps(doc, separators=(',', ':')).encode(); raw += b' ' * (-len(raw) % 4); tail = b[20 + n:]
    (OUT / 'models' / (name + '.glb')).write_bytes(struct.pack('<III', 0x46546c67, 2, 20 + len(raw) + len(tail)) + struct.pack('<II', len(raw), 0x4e4f534a) + raw + tail)
    done_models[name] = WEB + 'models/' + name + '.glb'
    return done_models[name]

ANIM_DIRS = [SRC / 'dump_anim/nazi_zombie_malibu/xanim', SRC / 'dump_anim/mod/xanim']
def animation(name):
    if not name:
        return None
    target = OUT / 'anims' / (name + '.json')
    if not target.exists():
        src = next((d / name for d in reversed(ANIM_DIRS) if (d / name).is_file()), None)
        if not src:
            return None
        r = subprocess.run(['node', str(ROOT / '.tools/xanim_to_json.mjs'), str(src), '-o', str(OUT / 'anims')], capture_output=True, text=True)
        if r.returncode:
            print('anim failed', name, r.stderr.strip().splitlines()[-1:]); return None
    return WEB + 'anims/' + name + '.json'

ANIMATION_KEYS = ['idleAnim', 'emptyIdleAnim', 'fireAnim', 'lastShotAnim', 'adsFireAnim', 'adsLastShotAnim', 'meleeAnim', 'meleeChargeAnim',
                  'reloadAnim', 'reloadEmptyAnim', 'reloadStartAnim', 'reloadEndAnim', 'raiseAnim', 'firstRaiseAnim', 'quickRaiseAnim',
                  'dropAnim', 'quickDropAnim', 'sprintInAnim', 'sprintLoopAnim', 'sprintOutAnim', 'adsUpAnim', 'adsDownAnim', 'holdFireAnim']

def weapon(name):
    path = IWD / 'weapons/sp' / name
    if not path.exists():
        path = find('weapons/sp/' + name) or find('weapons/' + name)
    if not path:
        print('missing weapon', name); return None
    a = path.read_text(errors='replace').split('\\'); d = dict(zip(a[1::2], a[2::2]))
    num = lambda k, default=0: float(d.get(k) or default)
    anims = {k: animation(d[k]) for k in ANIMATION_KEYS if d.get(k)}
    projectile = d.get('weaponType') == 'projectile'
    return {'id': 'malibu_' + name, 'mapWeapon': name, 'name': d.get('displayName') or name, 'price': 0, 'clipSize': int(num('clipSize', 1)),
            'startAmmo': int(num('startAmmo', 0)), 'maxAmmo': int(num('maxAmmo', 0)), 'damage': num('damage'), 'minDamage': num('minDamage', num('damage')),
            'meleeDamage': num('meleeDamage', 150), 'range': 2000, 'fireTime': num('fireTime', .33), 'reloadTime': num('reloadTime', 2),
            'reloadEmptyTime': num('reloadEmptyTime', num('reloadTime', 2)), 'automatic': d.get('fireType') == 'Full Auto', 'fireType': d.get('fireType') or 'Single Shot',
            'pellets': 1, 'headMultiplier': 1, 'hideTags': d.get('hideTags', '').split(),
            'projectileSpeed': num('projectileSpeed') if projectile else 0, 'explosionRadius': num('explosionRadius') if projectile else 0,
            'explosionInnerDamage': num('explosionInnerDamage') if projectile else 0, 'explosionOuterDamage': num('explosionOuterDamage') if projectile else 0,
            'model': model(d.get('gunModel')), 'handsModel': model(d.get('handModel')), 'worldModel': model(d.get('worldModel')),
            'projectileModel': model(d.get('projectileModel')) if projectile and d.get('projectileModel') not in ('tag_flash', 'tag_origin') else None,
            'animations': {k: v for k, v in anims.items() if v},
            'adsInTime': num('adsTransInTime', .2), 'adsOutTime': num('adsTransOutTime', .2), 'adsFov': num('adsZoomFov1', 65),
            'raiseTime': num('raiseTime', .5), 'dropTime': num('dropTime', .3), 'meleeTime': num('meleeTime', .5),
            'sprintInTime': num('sprintInTime', .3), 'sprintLoopTime': num('sprintLoopTime', .7), 'sprintOutTime': num('sprintOutTime', .3),
            'sprintOffset': [num('sprintOfsR'), num('sprintOfsU'), -num('sprintOfsF')],
            'sprintRotation': [math.radians(num('sprintRotP')), math.radians(num('sprintRotY')), math.radians(num('sprintRotR'))],
            'fireSound': d.get('fireSound') or None, 'sounds': {}, 'notetrackSounds': dict(re.findall(r'(\S+)\s+(\S+)', d.get('notetrackSoundMap', '')))}

FOURCC = {11: b'DXT1', 12: b'DXT3', 13: b'DXT5'}
BLOCK = {11: 8, 12: 16, 13: 16}
def iwi_to_dds(data):
    if data[:3] != b'IWi' or data[3] != 6:
        raise ValueError('not an IWI v6 image')
    fmt, w, h = data[4], *struct.unpack('<HH', data[6:10])
    if fmt not in FOURCC:
        raise ValueError(f'unsupported IWI format {fmt}')
    size = max(1, (w + 3) // 4) * max(1, (h + 3) // 4) * BLOCK[fmt]
    header = struct.pack('<4sIIIIIII44xII4s20xI16x', b'DDS ', 124, 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, h, w, size, 0, 1, 32, 0x4, FOURCC[fmt], 0x1000)
    return header + data[-size:]

def main():
    defs = {}
    for w in WEAPONS:
        d = weapon(w)
        if d:
            defs[d['id']] = d
    for m in MODELS:
        model(m)
    # every other animation (lobby figures, flight, the armors' transport...)
    for d in ANIM_DIRS:
        for f in sorted(d.glob('*')):
            if not re.match(r'(ai_|zombie_|exposed_|crouch_|prone_|stand_|run_|walk_|pain_|death_|traverse|bo2_|dog_)', f.name):
                animation(f.name)
    (OUT / 'weapons.json').write_text(json.dumps(defs, indent=1))
    n = 0
    for wav in sorted((IWD / 'sound').rglob('*.wav')):
        target = OUT / 'sounds' / (wav.stem + '.ogg')
        if not target.exists() and not ffmpeg('-i', wav, '-c:a', 'libvorbis', '-q:a', '4', target).returncode:
            n += 1
    tmp = OUT / 'hud' / '_tmp.dds'
    for h in HUD:
        src = IWD / 'images' / (h + '.iwi')
        if not src.exists():
            print('missing hud image', h); continue
        try:
            tmp.write_bytes(iwi_to_dds(src.read_bytes()))
            if ffmpeg('-i', tmp, '-c:v', 'libwebp', '-quality', '90', OUT / 'hud' / (h + '.webp')).returncode:
                print('hud failed', h)
        except ValueError as e:
            print('hud', h, e)
    tmp.unlink(missing_ok=True)
    print(f'{len(defs)} weapons, {sum(1 for v in done_models.values() if v)} models, {len(list((OUT / "anims").glob("*.json")))} anims,'
          f' {len(list((OUT / "sounds").glob("*.ogg")))} sounds ({n} new), {len(list((OUT / "hud").glob("*.webp")))} hud images')

if __name__ == '__main__':
    main()
