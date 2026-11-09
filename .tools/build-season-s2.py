#!/usr/bin/env python3
"""Season 1 of the Melon Pass (internal id s2, number 1), "Storm & Toll", released 2026-11-08. Writes:
  export/web/mods/pass/season-s2.json   10 pages of 9 tier rewards + 1 major reward each (plan: Helm note e2fff99099)
  the pass items this script owns into mods/shop/catalog.json: the gameplay unlocks (perks, class, operators,
  melon weapons, Grave Bell, Trip Mine, Smoke Grenade) and the 15 cosmetics that were placeholders,
  and the two procedural camos (Counterfeit, Wax) into mods/weapon-levels/camos.json.
The season's other items (camos, cards, charms, stickers, screens, sounds, kill effects, titles, emblems) were added
by hand and are left alone: re-running only replaces the ids in OWN. Unlike Season 0, double XP tokens repeat."""
import json, os
W=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','export','web')
SEASON='s2'
def J(p):return json.load(open(os.path.join(W,p)))
def S(p,d,indent=1):open(os.path.join(W,p),'w').write(json.dumps(d,indent=indent,ensure_ascii=False)+'\n')
cat=J('mods/shop/catalog.json')
OWN=[];NEW_CAMOS=[]
def item(id,cat_,name,rarity,data,desc):
  iid=f'pass.{SEASON}.{id}';OWN.append({'id':iid,'cat':cat_,'name':name,'price':0,'rarity':rarity,'desc':desc,'data':data,'pass':SEASON});return {'type':'item','id':iid}
def ref(id):
  iid=f'pass.{SEASON}.{id}';assert any(i['id']==iid for i in cat['items']),iid;return {'type':'item','id':iid}
def camo(id,name,rarity,extra,desc):
  NEW_CAMOS.append({'id':f's2.{id}','name':name,'shop':f'pass.{SEASON}.camo.{id}','pass':SEASON,'challenge':'pass','procedural':id,'scale':2,'mix':.95,**extra})
  return item('camo.'+id,'camo',name,rarity,{'camo':f's2.{id}'},desc)
gum=lambda id:{'type':'gum','id':id}
pxp={'type':'token','kind':'playerXp','hours':1};wxp={'type':'token','kind':'weaponXp','hours':1}
def perk(id,key,name,color,desc):
  return item('perk.'+id,'perk',name,'legendary',{'perk':key,'label':'PERK UNLOCK','icon':f'reaper/icons/{id}.webp','color':color},desc)
# ---- gameplay unlocks (each was "coming soon" until this season) ----
stronghold=perk('stronghold','specialty_stronghold','Stone Cold Stronghold','#8a9aa8','Unlocks Stone Cold Stronghold (a Reaper Collection perk, with research augments) at the terminal\'s PERKS app.')
victorious=perk('victorious','specialty_victorious','Victorious Tortoise','#3a8a3a','Unlocks Victorious Tortoise (a Reaper Collection perk, with research augments) at the terminal\'s PERKS app.')
zombshell=perk('zombshell','specialty_zombshell','Zombshell','#7ab83a','Unlocks Zombshell (a Reaper Collection perk, with research augments) at the terminal\'s PERKS app.')
tactiquilla=perk('tactiquilla','specialty_tactiquilla','Tactiquilla Sangria','#c03a5a','Unlocks Tactiquilla Sangria (a Reaper Collection perk, with research augments) at the terminal\'s PERKS app.')
gardener=item('class.gardener','class','The Gardener','legendary',{'class':'gardener','label':'CLASS','color':'#7fa84a','icon':'classes/garden/icons/melon_3.webp'},'Unlocks the Gardener class: plant seeds at the Potting Bench, grow them through the match and breed hybrids.')
seven=item('operator.deadlock_seven','outfit','Seven','legendary',{'character':'deadlock_seven','label':'OPERATOR','skin':False},'Seven, the Prisoner. Operator.')
venator=item('operator.deadlock_venator','outfit','Venator','legendary',{'character':'deadlock_venator','label':'OPERATOR','skin':False},'Venator, the Priest. Operator.')
debt=item('weapon.debtcollector','weapon','The Debt Collector','legendary',{'weapon':'debt_collector_zm','label':'WEAPON'},'A revolver that banks the damage of every hit; reloading collects the debt in one blast. Unlocks it for your loadout and your Mystery Box.')
hive=item('weapon.hivelauncher','weapon','Hive Launcher','legendary',{'weapon':'hive_launcher_zm','label':'WEAPON'},'Fires nests that stick and hatch drones to hunt the horde. Unlocks it for your Mystery Box.')
bell=item('melee.gravebell','weapon','The Grave Bell','legendary',{'weapon':'melee_grave_bell','melee':'grave_bell','label':'MELEE WEAPON'},'A melee weapon: ring it to stun every zombie around you; three tolls in time ring a Death Knell.')
trip=item('equip.tripmine','equipment','Trip Mines','epic',{'equipment':'tripmine_zm','label':'LETHAL'},'BO3 Trip Mines: plant two and the laser between them blows on the first zombie through. Joins your Mystery Box (one lethal slot with frags and Claymores).')
smoke=item('equip.smoke','equipment','Smoke Grenades','epic',{'equipment':'smoke_zm','label':'TACTICAL'},'Smoke Grenades: zombies lose sight of anyone inside the cloud. Joins your Mystery Box.')
# ---- the 15 cosmetics that were placeholders ----
hexr=item('reticle.hex','reticle','Hex','epic',{'char':'⬡','color':'#ffc23a'},'Season 1 reticle: a honey-gold hexagon.')
greenhouse=item('menu.greenhouse','theme','Greenhouse','epic',{'menu':'#5ad17c'},'Season 1 menu theme: greenhouse green.')
bloom=item('glow.bloom','glow','Bloom','epic',{'box':'#ff7ad1'},'Season 1 Mystery Box glow: blossom pink.')
clapper=item('reticle.clapper','reticle','Clapper','rare',{'char':'⚲','color':'#d8dde0'},'Season 1 reticle: a bell clapper.')
candle=item('glow.candlelight','glow','Candlelight','epic',{'box':'#ffd28a'},'Season 1 Mystery Box glow: warm candlelight.')
headstone=item('frame.headstone','theme','Headstone','rare',{'frame':'#9aa3a8'},'Season 1 portrait frame: weathered headstone grey.')
ding=item('hitmarker.ding','reticle','Ding','epic',{'hitmarker':'✧','color':'#fff0b0'},'Season 1 hitmarker: a pale gold sparkle.')
goldleaf=item('frame.goldleaf','theme','Gold Leaf','epic',{'frame':'#e8c25a'},'Season 1 portrait frame: gold leaf.')
kaching=item('hitmarker.kaching','reticle','Ka-Ching','rare',{'hitmarker':'$','color':'#ffd23a'},'Season 1 hitmarker: every hit pays.')
vault=item('menu.vault','theme','Vault','epic',{'menu':'#d4a838'},'Season 1 menu theme: vault gold.')
counterfeit=camo('counterfeit','Counterfeit','epic',{},'Season 1 camo: banknote green with gold engraving. Works on every gun.')
hiveheart=item('glow.hiveheart','glow','Hive Heart','rare',{'box':'#ff9500'},'Season 1 Mystery Box glow: hive amber.')
wax=camo('wax','Wax','rare',{},'Season 1 camo: amber honeycomb wax with drips. Works on every gun.')
halo=item('reticle.halo','reticle','Halo','epic',{'char':'◎','color':'#fff6d8'},'Season 1 reticle: a halo.')
bells=item('sound.funeralbells','sound','Funeral Bells','legendary',{'hits':{'samples':['bell1.wav','bell2.wav','bell3.wav'],'volume':.5}},'Season 1 hit sounds: every hit tolls a funeral bell.')
P=lambda r,p=False:(r,p)
pages=[
 ('Overdue',[P(gum('anywhere_but_here')),P(trip),P(ref('card.lathieves')),P(ref('charm.pricetag'),1),P(ref('camo.centurion'),1),P(ref('emblem.blindrage'),1),P(ref('screen.tally')),P(ref('sticker.pastdue'),1),P(wxp,1)],debt),
 ('Static',[P(stronghold),P(gum('tactical_diffusion')),P(ref('card.airsuperiority')),P(ref('sticker.highvoltage'),1),P(ref('camo.coralmesh'),1),P(pxp),P(ref('screen.field-readout'),1),P(ref('sound.zap'),1),P(ref('emblem.renegadeshock'))],seven),
 ('Swarm',[P(smoke),P(gum('profit_sharing')),P(ref('camo.crimsonhex')),P(ref('card.corruption')),P(hexr,1),P(ref('emblem.warriorwasp'),1),P(pxp),P(ref('sticker.beeseal'),1),P(ref('charm.honeydipper'),1)],hive),
 ('Sprout',[P(victorious),P(wxp),P(ref('camo.ameerga'),1),P(ref('screen.melon-buddy')),P(greenhouse,1),P(ref('emblem.evidence'),1),P(ref('sticker.sproutedskull')),P(bloom,1),P(ref('charm.seedling'))],gardener),
 ('Hunt',[P(zombshell),P(gum('phoenix_up')),P(ref('card.hulkingmonster')),P(ref('camo.blooddip'),1),P(pxp,1),P(ref('emblem.bulldawg')),P(ref('sound.classic'),1),P(ref('emblem.marrowed')),P(ref('charm.runefang'),1)],venator),
 ('Toll',[P(tactiquilla),P(ref('card.everlastingfear')),P(ref('camo.skulls'),1),P(clapper),P(candle,1),P(headstone),P(wxp,1),P(ding,1),P(ref('charm.kurb'))],bell),
 ('Stormcell',[P(ref('card.unleashedpotential')),P(ref('camo.murderedout')),P(pxp,1),P(ref('emblem.noreception')),P(ref('screen.field-tally'),1),P(ref('killfx.grounded'),1),P(ref('sticker.rainmeter')),P(ref('charm.bottledlightning'),1),P(ref('sound.modern'),1)],ref('camo.directorscut')),
 ('Interest',[P(ref('killfx.payout')),P(ref('title.debtcollector'),1),P(ref('screen.melon-loop')),P(wxp,1),P(ref('card.inmateatlarge')),P(goldleaf,1),P(kaching),P(vault,1),P(counterfeit,1)],gum('time_out')),
 ('Queen',[P(ref('killfx.swarm')),P(ref('title.beekeeper'),1),P(pxp),P(ref('emblem.mine'),1),P(ref('title.apex'),1),P(hiveheart),P(ref('charm.amberqueen'),1),P(wax),P(ref('screen.field-buddy'),1)],gum('wonderbar')),
 ('Last Toll',[P(ref('killfx.tolled')),P(ref('camo.paranoia'),1),P(halo,1),P(wxp),P(bells,1),P(ref('card.firefighter'),1),P(ref('sticker.tollcrest'),1),P(ref('title.lasttoll')),P(ref('emblem.deathwave'),1)],ref('camo.neonflame')),
]
season={'_note':'Melon Pass Season 1 (internal id s2), generated by .tools/build-season-s2.py. 10 pages of 9 tier rewards + 1 major reward; tokens are shared with Season 0 (pass.md).',
 'id':SEASON,'number':1,'name':'Storm & Toll','color':'#6fd3ff','accent':'#ffc23a','start':'2026-11-08','end':'2027-01-08',
 'tierXp':4000,'premiumPrice':1000,'tokenPrice':150,
 'xp':{'kill':10,'headshot':5,'roundPerRound':20,'daily':1000,'weekly':3000},
 'pages':[]}
for pi,(name,rows,major) in enumerate(pages):
  assert len(rows)==9,name
  season['pages'].append({'id':f'p{pi+1}','name':name,'items':[{'id':f'p{pi+1}.{k+1}','reward':r,'premium':bool(p)} for k,(r,p) in enumerate(rows)],'major':{'id':f'p{pi+1}.major','reward':major}})
# every reward unique, except the double XP tokens
keys=[json.dumps(x['reward'],sort_keys=True) for p in season['pages'] for x in p['items']+[p['major']] if x['reward']['type']!='token']
assert len(keys)==len(set(keys)),'duplicate rewards'
# every season item in the catalogue is on a page
used={x['reward']['id'] for p in season['pages'] for x in p['items']+[p['major']] if x['reward']['type']=='item'}
ids={i['id'] for i in OWN}
cat['items']=[i for i in cat['items'] if i['id'] not in ids]+OWN
left=[i['id'] for i in cat['items'] if i.get('pass')==SEASON and i['id'] not in used]
assert not left,f'season items not on any page: {left}'
# camos.json keeps its hand-made one-line s2 entries: drop and re-add only ours, as text, before the closing bracket
cp=os.path.join(W,'mods/weapon-levels/camos.json');lines=open(cp).read().split('\n')
lines=[l for l in lines if not any(f'"id": "{c["id"]}"' in l for c in NEW_CAMOS)]
end=max(i for i,l in enumerate(lines) if l.strip().startswith('{"id": "s2.'))
lines[end]=lines[end].rstrip(',')+','
lines[end+1:end+1]=['    '+json.dumps(c,ensure_ascii=False)+(',' if k<len(NEW_CAMOS)-1 else '') for k,c in enumerate(NEW_CAMOS)]
txt='\n'.join(lines);json.loads(txt);open(cp,'w').write(txt)
S('mods/pass/season-s2.json',season);S('mods/shop/catalog.json',cat)
print(f'{len(OWN)} items, {len(NEW_CAMOS)} camos, {sum(len(p["items"]) for p in season["pages"])} tiers')
