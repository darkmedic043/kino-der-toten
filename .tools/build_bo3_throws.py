"""Build BO3's first-person throw rigs (Dempsey's arms with the frag, tactical and spider-mine clips) into
export/web/mods/bo3-equipment/models/ (git-ignored: from the user's own BO3 install, never published).

    python3 .tools/build_bo3_throws.py [export_dir]   (default export_game/bo3)

The throwables mod (mods/throwables) holds the Trip Mine and the Monkey Bomb on these rigs (the Gersch went back to
its own BO1 animation the same day; the tactical rig is built but unused)
(user 2026-11-17: "make it so the tripmine, gersch, and monkey bomb uses the proper throwing animation"): pull
the pin (or twist), hold, throw, with the item leaving the hand in view. The frag and tactical rigs carry the
item's own model on tag_weapon in place of BO3's grenade; the spider mine (BO3's own trip mine) is its own model.
Writes models/throws.json: {rigs: {<rig>: weapon-like view def}}; bo3-equipment's prepare puts it on data.throwRigs.

The model and clip conversion is build_bo3_weapons.py's (its helper section, run here with this mod's output dir).
"""
import json, pathlib, sys, math
TOOLS = pathlib.Path(__file__).resolve().parent
ROOT = TOOLS.parent
src = (TOOLS/'build_bo3_weapons.py').read_text()
head = src[:src.index('# ---- Wunderwaffe DG-2')]   # imports, model(), animation(), RENAME, read_seanim (no weapon is built)
ns = {'__file__': str(TOOLS/'build_bo3_weapons.py'), '__name__': 'bo3_helpers'}
exec(compile(head, 'build_bo3_weapons.py (helpers)', 'exec'), ns)
SRC = ns['SRC']
MOD = ROOT/'export/web/mods/bo3-equipment'
WEB = 'mods/bo3-equipment/models/'
for sub in ['models', 'models/anims', 'animations']: (MOD/sub).mkdir(parents=True, exist_ok=True)
ns['MOD'] = MOD   # model() writes MOD/models, animation() MOD/animations: point both into the ignored models/ folder
ns['WEB'] = 'mods/bo3-equipment/'
OUT_ANIM = MOD/'models'/'anims'

def clip(name, loop=False):
    url, dur = ns['animation'](name, {}, loop)
    p = MOD/'animations'/(name+'.json'); dst = OUT_ANIM/(name+'.json'); p.replace(dst)
    return WEB+'anims/'+name+'.json'+ns['ver'](dst), dur

def release_time(name):
    # when the item leaves the hand: the hand tag's fastest frame (BO3 spawns the grenade mid-swing; no notetrack)
    a = ns['read_seanim'](SRC/'xanims'/(name+'.seanim')); loc = (a['bones'].get('tag_weapon_right') or {}).get('loc') or []
    fps = a['framerate'] or 30; best, at = -1, .2
    for (f0, p0), (f1, p1) in zip(loc, loc[1:]):
        v = math.dist(p0, p1)/max(f1-f0, 1)
        if v > best: best, at = v, (f0+f1)/2/fps
    return round(at, 3)

# Dempsey's arms: the BO3 guns' own copy (one file in the cache), else built here
built = ROOT/'export/web/mods/bo3-weapons/weapons.json'
hands_url = next((w['handsModel'] for w in json.loads(built.read_text())['weapons'].values() if 'dempsey' in (w.get('handsModel') or '')), None) if built.exists() else None
if not hands_url: hands_url = ns['model']('c_zom_der_dempsey_viewhands', 'bo3_viewhands_dempsey', ns['RENAME'])[0]
RIGS = {   # rig: (viewmodel, hold clip, throw clip, idle clip, own model)
    'frag': ('wpn_t7_grenade_frag_view', 'vm_frag_pullpin', 'vm_frag_throw', 'vm_frag_idle', False),
    'tactical': ('wpn_t7_grenade_frag_view', 'vm_tactical_pullpin', 'vm_tactical_throw', 'vm_tactical_idle', False),
    'spider': ('wpn_t7_spider_mine_view', 'vm_spider_mine_idle', 'vm_spider_mine_throw', 'vm_spider_mine_idle', True),
}
rigs, views = {}, {}
for rig, (vm, hold, throw, idle, own) in RIGS.items():
    if vm not in views: views[vm] = ns['model'](vm)[0]
    A, T = {}, {}
    for key, name, loop in [('idleAnim', idle, True), ('holdFireAnim', hold, False), ('fireAnim', throw, False)]: A[key], T[key] = clip(name, loop)
    A.update(emptyIdleAnim=A['idleAnim'], raiseAnim=A['idleAnim'], dropAnim=A['idleAnim'], lastShotAnim=A['fireAnim'])
    rigs[rig] = {'id': 'bo3_throw_'+rig, 'name': rig, 'model': views[vm], 'handsModel': hands_url, 'animations': A, 'bo3': True,
                 'ownModel': own, 'release': release_time(throw), 'throwTime': T['fireAnim'], 'raiseTime': .2, 'dropTime': .2, 'adsInTime': .2, 'adsOutTime': .2,
                 'fireTime': T['fireAnim'], 'clipSize': 1, 'startAmmo': 1, 'maxAmmo': 1, 'damage': 0, 'hideTags': [], 'sounds': {}, 'notetrackSounds': {},
                 'sprintInTime': .2, 'sprintLoopTime': 1, 'sprintOutTime': .2, 'sprintOffset': [0, 0, 0], 'sprintRotation': [0, 0, 0], 'viewOffset': [0, 0, 0]}
    print('rig', rig, 'release', rigs[rig]['release'], 's of', T['fireAnim'])
(MOD/'models'/'throws.json').write_text(json.dumps({'rigs': rigs}, indent=1))
try: (MOD/'animations').rmdir()
except OSError: pass
