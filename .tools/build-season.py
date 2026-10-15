#!/usr/bin/env python3
"""Season 1 of the Melon Pass (roadmap Phase 7, BO6/BO7-style pages). Writes:
  export/web/mods/pass/season.json   pages of 9 tier rewards + 1 major reward each
  pass-exclusive items into mods/shop/catalog.json (pass: season id; the Shop never sells them),
  their camos into mods/weapon-levels/camos.json and outfits into mods/characters/characters.json.
Every reward is unique, exists in the game and is season content: no credits, XP tokens or early unlocks (user, 2026-10-14). Gums are the pass-exclusive ones in gums.json (pass: s1). Re-running replaces this season's entries."""
import json, os
W=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','export','web')
SEASON='s1'
def J(p):return json.load(open(os.path.join(W,p)))
def S(p,d,indent=1):open(os.path.join(W,p),'w').write(json.dumps(d,indent=indent,ensure_ascii=False)+'\n')
cat=J('mods/shop/catalog.json');cat['items']=[i for i in cat['items'] if i.get('pass')!=SEASON]
camos=J('mods/weapon-levels/camos.json');camos['camos']=[c for c in camos['camos'] if c.get('pass')!=SEASON]
chars=J('mods/characters/characters.json');chars['characters']=[c for c in chars['characters'] if c.get('pass')!=SEASON]
base=next(c for c in chars['characters'] if c['id']=='mannequin_blue')
def hx(s):s=s.lstrip('#');return [int(s[i:i+2],16)/255 for i in (0,2,4)]
items=[]
def item(id,cat_,name,rarity,data,desc):
  iid=f'pass.{SEASON}.{id}';cat['items'].append({'id':iid,'cat':cat_,'name':name,'price':0,'rarity':rarity,'desc':desc,'data':data,'pass':SEASON});return {'type':'item','id':iid}
def camo(id,name,rarity,proc,extra={},desc=''):
  camos['camos'].append({'id':f'season.{id}','name':name,'shop':f'pass.{SEASON}.camo.{id}','pass':SEASON,'challenge':'pass','procedural':proc,'scale':2,'mix':.95,**extra})
  return item('camo.'+id,'camo',name,rarity,{'camo':f'season.{id}'},desc or 'Season 1 camo: works on every gun.')
def outfit(id,name,rarity,col,acc,glove):
  chars['characters'].append({**base,'id':f'outfit_s1_{id}','name':f'Test Subject ({name})','description':f'Season 1 outfit: {name}.','color':col,'accent':acc,'handsTint':{'glovesleeve':acc,'glove':glove},'shop':f'pass.{SEASON}.outfit.{id}','pass':SEASON})
  return item('outfit.'+id,'outfit',f'Test Subject: {name}',rarity,{'character':f'outfit_s1_{id}'},f'A Season 1 outfit for the Test Subject.')
card=lambda id,n,r,c1,c2,pat:item('card.'+id,'card',n,r,{'c1':c1,'c2':c2,'pattern':pat},'A Season 1 calling card.')
ret=lambda id,n,r,ch,col:item('reticle.'+id,'reticle',n,r,{'char':ch,'color':col},'Season 1 crosshair.')
hit=lambda id,n,r,ch,col:item('hit.'+id,'reticle',n,r,{'hitmarker':ch,'color':col},'Season 1 hitmarker.')
kill=lambda id,n,r,col:item('kill.'+id,'reticle',n,r,{'blood':col},'Season 1 kill colour.')
hud=lambda id,n,r,a,b,c:item('hud.'+id,'theme',n,r,{'hud':{'points':a,'round':b,'ring':c}},'Season 1 HUD colours.')
menu=lambda id,n,r,a:item('menu.'+id,'theme',n,r,{'menu':a},'Season 1 menu accent.')
frame=lambda id,n,r,a:item('frame.'+id,'theme',n,r,{'frame':a},'Season 1 portrait frame.')
sound=lambda id,n,r,p,k,c:item('sound.'+id,'sound',n,r,{'hits':{'pitch':p,'knock':k,'cut':c}},'Season 1 hit sounds.')
glow=lambda id,n,r,col:item('glow.'+id,'glow',n,r,{'box':col},'Season 1 Mystery Box glow.')
credits=lambda n:{'type':'credits','amount':n}
token=lambda kind,n:{'type':'token','kind':kind,'matches':n}   # double XP of `kind` for the next n matches
gum=lambda gid:{'type':'gum','id':gid}
# ---- the ten pages: (name, [9 rewards as (reward, premium)], major) ----
pages=[
 ('Sowing',[(camo('scarecrowburlap','Scarecrow Burlap','rare','scarecrowburlap'),0),(card('seedling','Seedling','common','#1d2a12','#7cd65a','seeds'),0),(ret('sprout','Sprout','common','✚','#7cd65a'),1),(item('glow.pumpkin','glow','Pumpkin Glow','rare',{'box':'#ff7a1a'},'Season 1 Mystery Box glow.'),0),(camo('vinepatch','Vine Patch','rare','vinepatch'),1),(kill('sap','Sap Kills','rare','#9cff6a'),1),(menu('harvest','Harvest Menu','common','#ff9a3d'),0),(frame('vine','Vine Frame','common','#7cd65a'),1),(hit('leaf','Leaf Hitmarker','common','❦','#9cff6a'),1)],
   camo('harvestgold','Harvest Gold','legendary','harvestgold',{'metal':True},'Major reward: a gilded harvest camo for every gun.')),
 ('Growth',[(card('patch','Pumpkin Patch','common','#2a1404','#ff8a1a','seeds'),0),(card('rows','Crop Rows','common','#2a1d0c','#e8b04a','stripes'),0),(ret('melon','Melon Dot','rare','●','#ff4f6a'),1),(card('harvestmoon','Harvest Moon','epic','#120804','#ff9a3d','moon'),0),(hud('sprout','Sprout HUD','rare','#9cff6a','#4fd13a','#c8ff8a'),1),(camo('cornfield','Cornfield','rare','cornfield'),1),(gum('bountiful_harvest'),0),(sound('thump','Melon Thumps','rare',.7,1.4,.8),1),(card('dew','Morning Dew','common','#06141c','#7fd8ff','rings'),1)],
   outfit('scarecrow','Scarecrow','epic','#5a4a2a','#c8892a','#3a2e18')),
 ('Ripening',[(item('reticle.vine','reticle','Vine Ring','rare',{'char':'❂','color':'#7cd65a'},'Season 1 crosshair.'),0),(card('vine','Vinework','rare','#13200c','#c8ff8a','noise'),0),(ret('seedx','Seed Cross','common','✛','#ffd65a'),1),(item('reticle.pumpkin','reticle','Jack Sight','rare',{'char':'⚇','color':'#ff8a1a'},'Season 1 crosshair.'),0),(glow('ember','Ember Glow','rare','#ff6a1a'),1),(camo('pumpkin','Pumpkin Rind','rare','pumpkin'),1),(hit('seed','Seed Hitmarker','rare','✦','#ffd65a'),0),(frame('ember','Ember Frame','rare','#ff6a1a'),1),(kill('juice','Juice Kills','rare','#ff4f6a'),1)],
   camo('witchfire','Witchfire','legendary','witchfire',{'scale':1.6,'anim':{'c1':hx('#8a3dff'),'c2':hx('#3dff8a')},'glow':{'procedural':'flame-glow'}},'Major reward: animated: witch-green flames crawl over the gun.')),
 ('Harvest',[(camo('melonrind','Melon Rind','rare','melonrind'),0),(card('scythe','Scythe','rare','#1a1410','#e8dcc0','moon'),0),(ret('harvest','Harvest Ring','rare','◎','#ff9a3d'),1),(item('kill.ember','reticle','Cinder Kills','rare',{'blood':'#ff7a3a'},'Season 1 kill colour.'),0),(menu('dusk','Dusk Menu','rare','#c45bff'),1),(camo('fog','Graveyard Fog','rare','fog'),1),(gum('root_rot'),0),(hud('dusk','Dusk HUD','rare','#ff9a3d','#c45bff','#ffc23a'),1),(card('barn','Red Barn','common','#2a0808','#ff4a3a','stripes'),1)],
   item('card.melonking','card','Melon King','legendary',{'c1':'#0d2a0a','c2':'#ff4f6a','pattern':'seeds'},'Major reward: the Melon King calling card.')),
 ('Moonrise',[(card('owl','Night Owl','rare','#080a14','#ffd65a','moon'),0),(card('nightfield','Night Field','rare','#05081a','#5a5cff','stars'),0),(ret('moon','Crescent','rare','☽','#bfe6ff'),1),(gum('second_helping'),0),(sound('crack','Rind Crack','rare',1.6,.7,1.6),1),(camo('bloodmoon','Blood Moon','epic','bloodmoon'),1),(hit('moon','Moon Hitmarker','rare','☾','#bfe6ff'),0),(frame('moon','Moon Frame','rare','#bfe6ff'),1),(kill('night','Night Kills','epic','#5a5cff'),1)],
   outfit('knight','Melon Knight','epic','#2a4a1a','#ff4f6a','#1a2e10')),
 ('Night Shift',[(item('kill.rot','reticle','Rot Kills','rare',{'blood':'#8a9a2a'},'Season 1 kill colour.'),0),(card('lantern','Lantern','rare','#1a0e04','#ffb347','rings'),0),(ret('lantern','Lantern','rare','✺','#ffb347'),1),(camo('frostharvest','Frost Harvest','epic','frostharvest'),0),(glow('moon','Moonlight Glow','epic','#bfe6ff'),1),(camo('harvest','Harvest Leaves','rare','harvest'),1),(gum('melon_smash'),0),(menu('moonlit','Moonlit Menu','rare','#5fb8ff'),1),(card('crows','Crows','common','#0a0a0a','#5a5a5a','noise'),1)],
   camo('moonlit','Moonlit','legendary','moonlit',{'scale':1.6,'anim':{'c1':hx('#bfe6ff'),'c2':hx('#5a5cff')},'glow':{'procedural':'star-glow'}},'Major reward: animated: stars glitter and drift across a night-blue gun.')),
 ('Frost',[(camo('lanternlight','Lantern Light','epic','lanternlight'),0),(card('frost','First Frost','rare','#0c1a24','#bff0ff','noise'),0),(ret('frost','Frost Star','rare','✳','#bff0ff'),1),(item('sound.gourd','sound','Hollow Gourd','rare',{'hits':{'pitch':.9,'knock':.5,'cut':.7}},'Season 1 hit sounds.'),0),(hud('frost','Frost HUD','epic','#bff0ff','#5fb8ff','#e0f8ff'),1),(hit('frost','Frost Hitmarker','rare','❄','#bff0ff'),1),(gum('vine_snare'),0),(frame('frost','Frost Frame','rare','#bff0ff'),1),(kill('frost','Frost Kills','rare','#bff0ff'),1)],
   item('sound.smash','sound','Pumpkin Smash','legendary',{'hits':{'pitch':.5,'knock':1.9,'cut':.5}},'Major reward: the heaviest, wettest hit sounds.')),
 ('Embers',[(item('sound.husk','sound','Corn Husk','rare',{'hits':{'pitch':1.3,'knock':.9,'cut':1.8}},'Season 1 hit sounds.'),0),(card('bonfire','Bonfire','rare','#1a0804','#ff6a1a','rings'),0),(ret('ember','Ember','rare','✷','#ff6a1a'),1),(gum('harvest_moon'),0),(glow('witch','Witch Glow','epic','#3dff8a'),1),(sound('crunch','Leaf Crunch','rare',1.1,1.1,1.4),1),(card('smoke','Smoke','common','#141414','#8a8a8a','stars'),0),(menu('ember','Ember Menu','rare','#ff6a1a'),1),(hit('ember','Ember Hitmarker','rare','✶','#ff6a1a'),1)],
   glow('harvestmoon','Harvest Moon Glow','legendary','#ff9a1a')),
 ('Reckoning',[(card('hayride','Hayride','rare','#2a1e08','#f0c060','stripes'),0),(card('reaper','Reaper','epic','#0a0a0a','#c8302a','moon'),0),(ret('skull','Skull Dot','epic','☠','#e8dcc0'),1),(item('glow.bonfire','glow','Bonfire Glow','epic',{'box':'#ff4a1a'},'Season 1 Mystery Box glow.'),0),(hud('blood','Blood Moon HUD','epic','#ff4a3a','#c8302a','#ff8a6a'),1),(frame('blood','Blood Frame','epic','#c8302a'),1),(gum('scarecrow'),0),(kill('ash','Ash Kills','epic','#9a9a9a'),1),(card('pyre','Pyre','rare','#1a0500','#ffb347','stripes'),1)],
   gum('cornucopia')),
 ('Last Light',[(camo('cropcircle','Crop Circle','epic','cropcircle'),0),(card('dawn','Dawn','epic','#1a0e1a','#ffd0a0','stars'),0),(ret('dawn','Dawn Ring','epic','⊕','#ffd0a0'),1),(gum('reapers_toll'),0),(glow('dawn','Dawn Glow','epic','#ffd0a0'),1),(frame('gold','Harvest Gold Frame','epic','#f0c060'),1),(gum('pumpkin_bomb'),0),(hit('dawn','Dawn Hitmarker','epic','✧','#ffd0a0'),1),(card('melonlord','Melon Lord','epic','#0a1a06','#f0c060','seeds'),1)],
   outfit('harvestlord','Harvest Lord','legendary','#3a2a0a','#f0c060','#2a1e08')),
]
season={'_note':'Melon Pass Season 1 (Phase 7, BO6/BO7-style): 10 pages of 9 tier rewards + 1 major reward. Each pass tier earned gives a token; spend tokens on any reward of an open page (or let auto-progress spend them in order). Completing every reward on a page grants its major reward and opens the next page. Premium rewards (premium: true) need the premium pass (bought with credits); without it a token still progresses the page and the reward is handed over when premium is bought. Generated by .tools/build-season.py.',
 'id':SEASON,'name':'Melon Harvest','color':'#ff9a3d','accent':'#7cd65a','start':'2026-10-14','end':'2026-12-14',
 'tierXp':1500,'premiumPrice':1000,'tokenPrice':150,
 'xp':{'kill':10,'headshot':5,'roundPerRound':20,'daily':1000,'weekly':3000},
 'pages':[]}
for pi,(name,rows,major) in enumerate(pages):
  season['pages'].append({'id':f'p{pi+1}','name':name,'items':[{'id':f'p{pi+1}.{k+1}','reward':r,'premium':bool(p)} for k,(r,p) in enumerate(rows)],'major':{'id':f'p{pi+1}.major','reward':major}})
# every reward unique
keys=[json.dumps(x['reward'],sort_keys=True) for p in season['pages'] for x in p['items']+[p['major']]]   # every reward, credits and tokens included
assert len(keys)==len(set(keys)),'duplicate rewards'
S('mods/pass/season.json',season);S('mods/shop/catalog.json',cat);S('mods/weapon-levels/camos.json',camos,2);S('mods/characters/characters.json',chars)
print(len(season['pages']),'pages',sum(len(p['items']) for p in season['pages']),'tier rewards')
