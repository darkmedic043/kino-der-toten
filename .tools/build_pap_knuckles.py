"""BO1's Pack-a-Punch knuckle crack (zombie_knuckle_crack: hands only, raiseAnim
viewmodel_zombie_packopunch) for mods/pap-knuckles/ (git-ignored): converts the xanim from the
OAT dump of common_zombie_assets and writes an empty "gun" (just a j_gun node) for ViewWeapon.

    python3 .tools/build_pap_knuckles.py
"""
import json, pathlib, struct, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]
MOD = ROOT/'export/web/mods/pap-knuckles'; (MOD/'animations').mkdir(parents=True, exist_ok=True)
(MOD/'.gitignore').write_text('animations/\nno_model.glb\n')
subprocess.run(['node', str(ROOT/'.tools/xanim_to_json.mjs'), str(ROOT/'export_game/common_zombie_assets/xanim/viewmodel_zombie_packopunch'), '-o', str(MOD/'animations')], check=True)
doc = json.dumps({'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'j_gun'}]}, separators=(',', ':')).encode()
doc += b' ' * (-len(doc) % 4)
(MOD/'no_model.glb').write_bytes(struct.pack('<III', 0x46546c67, 2, 20+len(doc)) + struct.pack('<II', len(doc), 0x4e4f534a) + doc)
print('ok')
