// BO1 event sounds (not part of upstream), extracted by .tools/build_event_sounds.py into
// audio/ + sounds.json (git-ignored). Replaces the engine's synthetic "explosion" and
// "teleport" cues (grenades, explosives, the Gersh device, QED) with the real recordings and
// adds the teleporter (link, warm-up, teleport) and hellhound spawn sounds.
const R='resident/';

export default async function setup(api){
  const {audio,host,player}=api,session=api.session;
  const res=await fetch(new URL('sounds.json',import.meta.url)).catch(()=>null);
  if(!res?.ok){console.info('[event-sounds] not built: run .tools/build_event_sounds.py');return;}
  Object.assign(audio.manifest,await res.json());
  const keys=Object.keys(audio.manifest);
  const pick=prefix=>{const m=keys.filter(k=>k.startsWith(R+prefix));return m.length?m[Math.floor(Math.random()*m.length)]:null;};
  const play=audio.play.bind(audio);
  const log=[];   // recent cues (debugging: kino.eventSounds.log)
  const say=(prefix,vol=1)=>{const k=pick(prefix);if(k){play(k,vol);log.push(k.split('/').slice(-2).join('/'));if(log.length>20)log.shift();}};
  const near=(at,range=2200)=>{const p=player.getFeetPosition?.();return p&&at?Math.max(.12,Math.min(1,1-p.distanceTo(at)/range)):1;};
  // The engine's noise-burst stand-ins become the real thing.
  audio.play=(kind,vol=1)=>{
    if(kind==='explosion'){say('wpn/grenade/explosion/explode/',vol);say('exp/generic/explosion/',vol*.55);setTimeout(()=>say('wpn/grenade/explosion/debris/dirt/',vol*.45),120);return;}
    if(kind==='teleport'){say('evt/zombie_global/teleporter/beam_fx',vol*.9);say('evt/zombie_global/lightning/flux/',vol*.7);return;}
    return play(kind,vol);
  };
  // Teleporter: lever + warm-up when linking starts, beam + sparks when the link completes,
  // sparks and the warm-up hum while it charges ("Teleporting…"), the whoosh on arrival.
  let link=session?.teleporter,last=null;
  // the engine (Kino's map) shows "Teleporting…" on its own toast when the pad charges (2 s before the jump)
  const toastEl=document.getElementById('toast');let charging=false;
  if(toastEl)new MutationObserver(()=>{const on=/^Teleporting/.test(toastEl.textContent);if(on&&!charging){say('evt/zombie_global/teleporter/warmup/warmup',.9);say('evt/zombie_global/teleporter/warmup/top_spark',.8);}charging=on;}).observe(toastEl,{childList:true,characterData:true,subtree:true});
  const seen=new WeakSet();
  host.on('update',()=>{
    const s=api.session??session;
    if(s&&s.teleporter!==link){
      if(s.teleporter==='linking'){say('evt/zombie_global/teleporter/lever_pull',.9);say('evt/zombie_global/teleporter/warmup/warmup',.6);}
      if(s.teleporter==='linked'){say('evt/zombie_global/teleporter/beam_fx',.9);say('evt/zombie_global/teleporter/warmup/top_spark',.8);}
      link=s.teleporter;
    }
    const feet=player.getFeetPosition?.();
    if(feet){if(last&&feet.distanceTo(last)>300){say('evt/zombie_global/teleporter/teleport_2d_fnt',.9);say('evt/zombie_global/teleporter/teleport_2d_rear',.7);}last=feet.clone();}
    // Hellhounds: the pre-spawn rumble, then the strike and spawn crack.
    for(const z of api.enemies?.list??[])if(!seen.has(z)){seen.add(z);if(z.kind==='dog'){const v=near(z.root.position);
      say('evt/zombie_global/hellhounds/spawn/pre_spawn',.7*v);say('evt/zombie_global/hellhounds/spawn/strikes_00',v);say('evt/zombie_global/hellhounds/spawn/spawn_01',.9*v);say('evt/zombie_global/hellhounds/spawn/spn_flux_',.5*v);}}
  });
  host.on('reset',()=>{last=null;link=(api.session??session)?.teleporter;});
  // Other mods: frag grenade bounces, Pack-a-Punch knuckle cracks.
  (window.kino??={}).eventSounds={
    bounce:(at,surface='earth')=>say('wpn/grenade/bounce/frag/'+surface+'/',.7*near(at,1500)),
    knuckle:()=>say('evt/zombie_global/perksacola/packa/knuckle_',.9),
    play:(prefix,vol)=>say(prefix,vol),log,
  };
}
