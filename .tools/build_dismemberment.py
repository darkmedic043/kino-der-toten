"""Build BO1 zombie gib parts and crawler animations for the dismemberment mod
from the user's own Call of Duty: Black Ops install, into
export/web/mods/dismemberment/ (git-ignored; never published).

Needs OAT Unlinker dumps (git-ignored) made with:
  Unlinker --include-assets xmodel,xanim,image,material --model-format GLB --image-format DDS
           --output-folder export_game/zombie_theater  <BO1>/zone/Common/zombie_theater.ff
  Unlinker --include-assets weapon,xmodel,xanim,image,material --model-format GLB --image-format DDS
           --output-folder export_game/common_zombie_assets  <BO1>/zone/Common/common_zombie.ff

    python3 .tools/build_dismemberment.py
"""
import json, pathlib, re, struct, subprocess
from urllib.parse import quote

ROOT = pathlib.Path(__file__).resolve().parents[1]
MOD = ROOT/'export/web/mods/dismemberment'
WEB = 'mods/dismemberment/'
ZONES = [ROOT/'export_game'/z for z in ['common_zombie_assets', 'zombie_theater']]
for sub in ['models', 'textures', 'animations']:
    (MOD/sub).mkdir(parents=True, exist_ok=True)

def find(rel):
    return next((z/rel for z in reversed(ZONES) if (z/rel).is_file()), None)

def texture(name):
    src = find('images/'+name+'.dds')
    if not src: return None
    safe = re.sub(r'[^A-Za-z0-9_.-]', '_', name)+'.webp'; target = MOD/'textures'/safe
    if not target.exists():
        r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-vf', "scale='min(1024,iw)':-2",
            '-c:v', 'libwebp', '-quality', '88', str(target)], capture_output=True, text=True)
        if r.returncode: print('texture failed', name, r.stderr.strip()[:200]); return None
    return '../textures/'+quote(safe)

def model(name):
    src = find('model_export/'+name+'_lod0.glb')
    if not src: print('missing model', name); return None
    b = src.read_bytes(); n = struct.unpack_from('<I', b, 12)[0]; doc = json.loads(b[20:20+n])
    doc['images'], doc['textures'] = [], []
    doc['samplers'] = [{'wrapS': 10497, 'wrapT': 10497, 'magFilter': 9729, 'minFilter': 9987}]
    for m in doc.get('materials', []):
        m.pop('normalTexture', None); m.pop('occlusionTexture', None)
        m['pbrMetallicRoughness'] = {'metallicFactor': 0, 'roughnessFactor': .85}
        p = find('materials/'+m['name']+'.json')
        slots = (json.loads(p.read_text()) if p else {}).get('textures', [])
        color = next((t.get('image') for t in slots if t.get('name') == 'colorMap'), None) \
            or next((t.get('image') for t in slots if 'color' in t.get('name', '').lower()), None)
        uri = texture(color) if color else None
        if uri:
            ix = len(doc['images']); doc['images'].append({'uri': uri}); doc['textures'].append({'source': ix, 'sampler': 0})
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': ix}
    raw = json.dumps(doc, separators=(',', ':')).encode(); raw += b' '*(-len(raw) % 4); tail = b[20+n:]
    (MOD/'models'/(name+'.glb')).write_bytes(struct.pack('<III', 0x46546c67, 2, 20+len(raw)+len(tail))+struct.pack('<II', len(raw), 0x4e4f534a)+raw+tail)
    return WEB+'models/'+name+'.glb'

def animation(name):
    target = MOD/'animations'/(name+'.json')
    if not target.exists():
        src = find('xanim/'+name)
        if not src: print('missing anim', name); return None
        r = subprocess.run(['node', str(ROOT/'.tools/xanim_to_json.mjs'), str(src), '-o', str(MOD/'animations')], capture_output=True, text=True)
        if r.returncode: raise RuntimeError(r.stderr)
    return WEB+'animations/'+name+'.json'

B = 'char_ger_honorgd_body1_g_'
parts = {k: model(B+k) for k in ['upclean', 'lowclean', 'behead', 'rarmoff_1', 'larmoff_1', 'legsoff_1', 'rlegoff_1', 'llegoff_1',
                                 'rarmspawn', 'larmspawn', 'rlegspawn', 'llegspawn']}
anims = {k: animation(v) for k, v in {'crawl': 'ai_zombie_crawl', 'crawlFast': 'ai_zombie_crawl_sprint', 'attack': 'ai_zombie_attack_crawl',
         'death': 'ai_zombie_crawl_death_v1', 'fallLeft': 'ai_zombie_shot_leg_left_2_crawl', 'fallRight': 'ai_zombie_shot_leg_right_2_crawl'}.items()}
out = {'parts': {k: v for k, v in parts.items() if v}, 'animations': {k: v for k, v in anims.items() if v},
       'source': "Built locally from the user's own Call of Duty: Black Ops install (zombie_theater, common_zombie). Not redistributable."}
(MOD/'gibs.json').write_text(json.dumps(out, indent=1))
print('parts', len(out['parts']), 'anims', len(out['animations']))
