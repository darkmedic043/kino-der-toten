"""Build BO1 wonder weapons that Kino doesn't ship, from the user's own game
install, into export/web/mods/wonder-weapons/.

Steps (each only reads the game files; nothing in the install is changed):
  1. OAT Unlinker dumps of the zones that hold each weapon (export_game/<zone>,
     git-ignored), made with:
       Unlinker --include-assets weapon,xmodel,xanim,image,material,rawfile
                --model-format GLB --image-format DDS
                --output-folder "export_game/?zone?" <zone>.ff
  2. this script: weapon definitions -> weapons.json, viewmodel/world models
     with their colour textures -> models/, xanims -> animations/ (via
     xanim_to_json.mjs), resident sounds decoded from common_zombie.ff -> audio/.

    python3 .tools/build_wonder_weapons.py "<path to Call of Duty Black Ops>"

Supported: Winter's Howl (freezegun_zm, zombie_pentagon) and the M67 frag grenade's
viewmodel and throw animations (frag_grenade_zm, common_zombie: dump it to
export_game/common_zombie_assets with --include-assets weapon,xmodel,xanim,image,material). The DLC wonder
weapons need their DLC zones installed.
"""
import json, math, pathlib, re, struct, subprocess, sys, zlib, importlib.util
from urllib.parse import quote

ROOT = pathlib.Path(__file__).resolve().parents[1]
GAME = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '~/.local/share/Steam/steamapps/common/Call of Duty Black Ops').expanduser()
MOD = ROOT/'export/web/mods/wonder-weapons'
WEB = 'mods/wonder-weapons/'
ZONES = [ROOT/'export_game'/z for z in ['common_zombie_assets', 'common_zombie', 'zombie_pentagon']]
for sub in ['models', 'textures', 'animations', 'audio']:
    (MOD/sub).mkdir(parents=True, exist_ok=True)

def find(rel):
    return next((z/rel for z in reversed(ZONES) if (z/rel).is_file()), None)

def texture(name):
    src = find('images/'+name+'.dds')
    if not src: return None
    safe = re.sub(r'[^A-Za-z0-9_.-]', '_', name)+'.webp'
    target = MOD/'textures'/safe
    if not target.exists():   # ffmpeg reads DXT DDS; no Pillow needed
        r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(1024,iw)':-2",
            '-c:v', 'libwebp', '-quality', '90', str(target)], capture_output=True, text=True)
        if r.returncode: print('texture failed', name, r.stderr.strip()[:200]); return None
    return '../textures/'+quote(safe)

def model(name):
    name = name.lstrip(',')
    src = find('model_export/'+name+'_lod0.glb')
    if not src: raise RuntimeError('missing model '+name)
    b = src.read_bytes(); n = struct.unpack_from('<I', b, 12)[0]; doc = json.loads(b[20:20+n])
    doc['images'], doc['textures'] = [], []
    doc['samplers'] = [{'wrapS': 10497, 'wrapT': 10497, 'magFilter': 9729, 'minFilter': 9987}]
    for m in doc.get('materials', []):
        m.pop('normalTexture', None); m.pop('occlusionTexture', None)
        m['pbrMetallicRoughness'] = {'metallicFactor': 0, 'roughnessFactor': .82}
        p = find('materials/'+m['name']+'.json')
        slots = (json.loads(p.read_text()) if p else {}).get('textures', [])
        color = next((t.get('image') for t in slots if t.get('name') == 'colorMap'), None) \
            or next((t.get('image') for t in slots if 'color' in t.get('name', '').lower()), None)
        uri = texture(color) if color else None
        if uri:
            ix = len(doc['images']); doc['images'].append({'uri': uri}); doc['textures'].append({'source': ix, 'sampler': 0})
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': ix}
        if m['name'] in ['mc/mtl_player_icon', 'mc/mtl_clan_tag']:
            m['alphaMode'] = 'BLEND'; m['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, 0]
        if 'ammo_unlit' in m['name']: m['emissiveFactor'] = [.55, .85, 1]   # the glowing ice canister
    raw = json.dumps(doc, separators=(',', ':')).encode(); raw += b' '*(-len(raw) % 4); tail = b[20+n:]
    (MOD/'models'/(name+'.glb')).write_bytes(struct.pack('<III', 0x46546c67, 2, 20+len(raw)+len(tail))+struct.pack('<II', len(raw), 0x4e4f534a)+raw+tail)
    return WEB+'models/'+name+'.glb'

ANIMATION_KEYS = ['idleAnim', 'emptyIdleAnim', 'fireAnim', 'lastShotAnim', 'adsFireAnim', 'adsLastShotAnim',
    'reloadAnim', 'reloadEmptyAnim', 'reloadStartAnim', 'reloadEndAnim', 'raiseAnim', 'firstRaiseAnim', 'quickRaiseAnim',
    'dropAnim', 'quickDropAnim', 'sprintInAnim', 'sprintLoopAnim', 'sprintOutAnim', 'adsUpAnim', 'adsDownAnim', 'holdFireAnim']

def animation(name):
    target = MOD/'animations'/(name+'.json')
    if not target.exists():
        src = find('xanim/'+name)
        if not src: return None
        r = subprocess.run(['node', str(ROOT/'.tools/xanim_to_json.mjs'), str(src), '-o', str(MOD/'animations')], capture_output=True, text=True)
        if r.returncode: raise RuntimeError(r.stderr)
    return WEB+'animations/'+name+'.json'

def weapon(name, label):
    a = find('weapons/'+name).read_text().split('\\'); d = dict(zip(a[1::2], a[2::2]))
    num = lambda k, default=0: float(d.get(k) or default)
    clip = int(num('clipSize', 6))
    anims = {k: animation(d[k]) for k in ANIMATION_KEYS if d.get(k)}
    return {'id': name, 'name': label, 'price': 950, 'clipSize': clip, 'startAmmo': int(num('startAmmo', 24)), 'maxAmmo': int(num('maxAmmo', 24)),
        'damage': 1, 'minDamage': 1, 'range': 40, 'fireTime': num('fireTime', .33), 'reloadTime': num('reloadTime', 3.8), 'reloadEmptyTime': num('reloadEmptyTime', num('reloadTime', 3.8)),
        'automatic': False, 'fireType': d.get('fireType'), 'pellets': 1, 'headMultiplier': 1, 'hideTags': d.get('hideTags', '').split(),
        'explosionRadius': 0, 'explosionInnerDamage': 0, 'explosionOuterDamage': 0, 'projectileSpeed': 0,
        'model': model(d['gunModel']), 'worldModel': model(d['worldModel']), 'animations': {k: v for k, v in anims.items() if v},
        'adsInTime': num('adsTransInTime', .2), 'adsOutTime': num('adsTransOutTime', .2), 'adsFov': num('adsZoomFov1', 65),
        'raiseTime': num('raiseTime', .5), 'dropTime': num('dropTime', .3),
        'sprintInTime': num('sprintInTime', .3), 'sprintLoopTime': num('sprintLoopTime', .7), 'sprintOutTime': num('sprintOutTime', .3),
        'sprintOffset': [num('sprintOfsR'), num('sprintOfsU'), -num('sprintOfsF')],
        'sprintRotation': [math.radians(num('sprintRotP')), math.radians(num('sprintRotY')), math.radians(num('sprintRotR'))],
        'sounds': {}, 'notetrackSounds': dict(re.findall(r'(\S+)\s+(\S+)', d.get('notetrackSoundMap', '')))}

# ---- sounds: resident records in common_zombie.ff --------------------------------------
spec = importlib.util.spec_from_file_location('era', ROOT/'.tools/extract_resident_audio.py'); era = importlib.util.module_from_spec(spec); spec.loader.exec_module(era)
def sounds(zone, prefix):
    data = zlib.decompress((GAME/'zone/Common'/(zone+'.ff')).read_bytes()[12:]); out = {}
    tmp = ROOT/'artifacts/wonder-audio'; tmp.mkdir(parents=True, exist_ok=True)
    for _, name, h, seek, payload in era.records(data):
        if not name.startswith(prefix): continue
        key = name.removeprefix(prefix).removesuffix('.wav')
        target = MOD/'audio'/(key.replace('/', '_')+'.ogg')
        if not target.exists():
            ext, raw = era.container(h, seek, payload); packed = tmp/(target.stem+ext); packed.write_bytes(raw)
            r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(packed),
                '-af', f'atrim=end_sample={h[2]},asetpts=N/SR/TB', '-c:a', 'libvorbis', '-q:a', '5', str(target)], capture_output=True, text=True)
            if r.returncode: raise RuntimeError('decode '+name+': '+r.stderr)
        out[key] = WEB+'audio/'+target.name
    return out

freeze_sounds = sounds('common_zombie', 'sound/wpn/energy/freezegun/')
freeze = weapon('freezegun_zm', "Winter's Howl")
up = weapon('freezegun_upgraded_zm', "Winter's Fury")
freeze['upgrade'] = {k: v for k, v in up.items() if k not in ['id', 'price']}
freeze['freeze'] = True
death = [animation(n) for n in ['ai_zombie_freeze_death_a', 'ai_zombie_freeze_death_b', 'ai_zombie_freeze_death_c', 'ai_zombie_freeze_death_d', 'ai_zombie_freeze_death_e']]
# M67 frag: hold to cook (pullpin), release to throw
frag = None
if find('weapons/frag_grenade_zm'):
    a = find('weapons/frag_grenade_zm').read_text().split('\\'); fd = dict(zip(a[1::2], a[2::2]))
    frag = {'id': 'frag_grenade_zm', 'name': 'Frag Grenade', 'model': model(fd['gunModel']), 'worldModel': model(fd.get('projectileModel') or fd['worldModel']),
        'animations': {k: v for k, v in {'idleAnim': animation(fd['idleAnim']), 'holdFireAnim': animation(fd['holdFireAnim']), 'fireAnim': animation(fd['fireAnim'])}.items() if v},
        'fuseTime': float(fd.get('fuseTime') or 3.5), 'holdFireTime': float(fd.get('holdFireTime') or .6), 'fireTime': float(fd.get('fireTime') or .35),
        'hideTags': [], 'sounds': {}, 'notetrackSounds': dict(re.findall(r'(\S+)\s+(\S+)', fd.get('notetrackSoundMap', '')))}
out = {'weapons': {'freezegun_zm': freeze}, 'equipment': {'frag_grenade_zm': frag} if frag else {}, 'freezeDeaths': [d for d in death if d], 'sounds': {'freezegun': freeze_sounds},
       'source': 'Built locally from the user\'s own Call of Duty: Black Ops install (zombie_pentagon, common_zombie). Not redistributable.'}
(MOD/'weapons.json').write_text(json.dumps(out, indent=1))
print('wrote', MOD/'weapons.json', '| frag', bool(frag), '| sounds', len(freeze_sounds), '| anims', len(freeze['animations']), '| deaths', len(out['freezeDeaths']))
