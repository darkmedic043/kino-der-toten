// Pack-a-Punched guns fire with an extra laser "pew" layer, as in Black Ops
// zombies. The original layer isn't in this export's audio, so it's
// synthesized: a fast falling pitch sweep (two slightly detuned oscillators
// through a resonant band-pass) on top of the gun's normal shot. If a real
// clip is added as pap-layer.ogg next to this file, it's used instead.
export default async function setup(api){
  const {audio,session}=api;
  const WONDER=/ray_gun|thundergun|microwavegun|minigun|crossbow/;
  let clip=null;
  fetch(new URL('pap-layer.ogg',import.meta.url)).then(r=>r.ok?r.arrayBuffer():null).then(async b=>{if(b&&audio.ctx)clip=await audio.ctx.decodeAudioData(b);}).catch(()=>{});
  let last=0;
  function pew(def){
    const ctx=audio.ctx,out=audio.master;if(!ctx||!out)return;
    const t=ctx.currentTime,rapid=t-last<.12;last=t;
    const g=ctx.createGain();g.connect(out);
    if(clip){const s=ctx.createBufferSource();s.buffer=clip;s.playbackRate.value=.97+Math.random()*.06;g.gain.value=rapid?.35:.5;s.connect(g);s.start();return;}
    const peak=(rapid?.16:.24)*(def.pellets>1?1.2:1);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+.004);g.gain.exponentialRampToValueAtTime(.001,t+.16);
    const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.Q.value=3.5;bp.frequency.setValueAtTime(2600,t);bp.frequency.exponentialRampToValueAtTime(700,t+.14);bp.connect(g);
    const f0=1900+Math.random()*250;
    for(const [type,det] of [['sawtooth',0],['square',9]]){
      const o=ctx.createOscillator();o.type=type;o.detune.value=det;
      o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(260,t+.13);
      o.connect(bp);o.start(t);o.stop(t+.17);
    }
  }
  const weapon=audio.weapon.bind(audio);
  audio.weapon=(kind,def,...rest)=>{
    const r=weapon(kind,def,...rest);
    if(kind==='shot'&&def&&(def.upgraded||session.weapon?.upgraded)&&!def.attachmentActive&&!WONDER.test(def.baseId??def.id))pew(def);
    return r;
  };
}
