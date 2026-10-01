// BO1 gunshots are layered: the shot, an LFE thump under it, and a ring-off
// tail when you let go of the trigger. Kino ships only the shot layer; the rest
// (plus suppressed shots and the RPG shot) come from the user's own BO1 install
// (.tools/build_gun_sounds.py, git-ignored). Guns without their own layer use
// the one BO1 shares across their family. The Commando has no shot of its own
// in BO1's zombies files (it uses the M16's); the LAW uses the RPG's.
const W='resident/wpn/';
const RING={m1911:'pistol/m1911/plr/ringoff/',python:'pistol/357/plr/ringoff/',cz75:'pistol/cz75/plr/ringoff/',cz75dw:'pistol/cz75/plr/ringoff/',
  m16:'assault/m16/plr/ringoff/',commando:'assault/m16/plr/ringoff/',m14:'assault/m16/plr/ringoff/',galil:'assault/famas/plr/ringoff/',famas:'assault/famas/plr/ringoff/',
  fnfal:'assault/m16/plr/ringoff/',aug_acog:'assault/aug/plr/ringoff/',g11_lps:'smg/g11/plr/ringoff/',
  mp40:'smg/skorpion/plr/ringoff/',mp5k:'smg/mac11/plr/ringoff/',mpl:'smg/skorpion/plr/ringoff/',pm63:'smg/skorpion/plr/ringoff/',ak74u:'smg/mac11/plr/ringoff/',spectre:'smg/mac11/plr/ringoff/',
  hk21:'assault/m16/plr/ringoff/',rpk:'assault/m16/plr/ringoff/',
  spas:'shotgun/spas/plr/ringoff/ringoff',rottweil72:'shotgun/spas/plr/ringoff/ringoff',ithaca:'shotgun/spas/plr/ringoff/ringoff',hs10:'shotgun/spas/plr/ringoff/ringoff',
  l96a1:'sniper/l96a1/plr/ringoff/',dragunov:'sniper/ringoff/1/'};
const LFE={m14:'assault/m14/lfe/',fnfal:'assault/fnfal/lfe/',famas:'assault/famas/lfe/',galil:'assault/famas/lfe/',aug_acog:'assault/aug/lfe/',m16:'assault/fnfal/lfe/',commando:'assault/fnfal/lfe/',
  g11_lps:'smg/g11/lfe/',mpl:'smg/mpl/lfe/',cz75:'pistol/cz75/lfe/',cz75dw:'pistol/cz75/lfe/',python:'pistol/cz75/lfe/',
  hk21:'lmg/hk21/lfe/',rpk:'lmg/hk21/lfe/',spas:'shotgun/lfe/',rottweil72:'shotgun/lfe/',ithaca:'shotgun/lfe/',hs10:'shotgun/lfe/',
  dragunov:'sniper/dragunov/lfe/',l96a1:'sniper/l96a1/lfe/',china_lake:'gren_launcher/china_lake/lfe/',m72_law:'rocket/exp_rocket/lfe/'};
const SILENCED={m16:'assault/m16/plr/shot/silenced/silenced_',commando:'assault/m16/plr/shot/silenced/silenced_',m14:'assault/m16/plr/shot/silenced/silenced_',
  famas:'assault/m16/plr/shot/silenced/silenced_',galil:'assault/m16/plr/shot/silenced/silenced_',fnfal:'assault/m16/plr/shot/silenced/silenced_',
  aug_acog:'assault/aug/plr/shot/silenced/silenced_',spas:'shotgun/spas/plr/shot/silenced/silenced_',dragunov:'sniper/wa2000/plr/shot/silenced/',l96a1:'sniper/wa2000/plr/shot/silenced/'};
const SHOT={commando:'assault/m16/plr/shot/shot_',m72_law:'rocket/rpg/plr/shot/'};

export default async function setup({audio,host}){
  const r=await fetch(new URL('sounds.json',import.meta.url)).catch(()=>null);
  const extra=r?.ok?await r.json():{};
  if(!r?.ok)console.info('[gun-sounds] layers not built: run .tools/build_gun_sounds.py (Commando/LAW shots still mapped where shipped)');
  Object.assign(audio.manifest,extra);
  const has=p=>Object.keys(audio.manifest).some(k=>k.startsWith(W+p));
  const pick=p=>p&&has(p)?audio.select(W+p):null;
  const play=audio.play.bind(audio);       // unpatched: weapon-levels quietens suppressed shots by patching play
  const base=id=>(id??'').replace(/_upgraded/,'').replace(/_zm$/,'');

  let ringTimer=null,lastLfe=0;
  const weapon=audio.weapon.bind(audio);
  audio.weapon=(kind,def,...rest)=>{
    const id=base(def?.baseId??def?.id);
    if(kind!=='shot'||!def||def.attachmentActive||def.flamethrower||!(id in RING||id in LFE||id in SHOT))return weapon(kind,def,...rest);
    // the shot itself: real suppressed shot when there is one, else the gun's own (or its family's)
    const silenced=def.suppressed&&pick(SILENCED[id]);
    if(silenced)play(silenced,.8);
    else if(SHOT[id]&&has(SHOT[id]))audio.play(audio.select(W+SHOT[id]),.75);
    else weapon(kind,def,...rest);
    if(def.suppressed)return;               // no thump or ring through a suppressor
    const now=audio.ctx?.currentTime??0;
    const lfe=pick(LFE[id]);if(lfe&&now-lastLfe>.09){lastLfe=now;play(lfe,.5);}
    // ring-off: the tail once the trigger is let go
    const ring=RING[id];if(ring&&has(ring)){clearTimeout(ringTimer);ringTimer=setTimeout(()=>{const k=pick(ring);if(k)play(k,.42);},Math.max(90,(def.fireTime??.1)*1000*1.6));}
  };
  host.on('reset',()=>clearTimeout(ringTimer));
  (window.kino??={}).gunSounds={layers:id=>({ring:RING[id],lfe:LFE[id],silenced:SILENCED[id],shot:SHOT[id],ringOk:has(RING[id]??'~'),lfeOk:has(LFE[id]??'~')})};
}
