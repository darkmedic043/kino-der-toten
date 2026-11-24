// Black Ops 7 guns from the user's own rips (.tools/build_bo7_rips.py; docs/fork/bo7-rips.md). The build writes
// weapons.json (defs + sound lists); everything it points at is git-ignored. This adds the guns to the Mystery Box
// and plays their own sounds: a layered shot per trigger pull, reload foley on the clips' AudioOneShot@ markers.
const BASE=new URL('./',import.meta.url).href;
let built=null;

export async function prepare(data){
  const r=await fetch(BASE+'weapons.json').catch(()=>null);
  if(!r?.ok){console.info('[bo7-rips] not built: run .tools/build_bo7_rips.py');return;}
  built=await r.json();
  Object.assign(data.weapons,built.weapons);
  data.boxPool=[...new Set([...(data.boxPool??[]),...Object.keys(built.weapons)])];
}

export default async function setup(api){
  if(!built)return;
  const {session,audio,view}=api;
  const S=built.sounds??{},buffers=new Map();
  const own=def=>S[def?.baseId??def?.id];
  const buffer=url=>{const ctx=audio.ctx;if(!ctx)return null;
    if(!buffers.has(url))buffers.set(url,fetch(new URL(url,document.baseURI)).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).catch(()=>null));return buffers.get(url);};
  async function play(url,gain=1,rate=1){
    const ctx=audio.ctx,out=audio.master;if(!ctx||!out)return null;const b=await buffer(url);if(!b)return null;
    const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=b;src.playbackRate.value=rate;g.gain.value=gain;src.connect(g).connect(out);src.start();return {src,g};
  }
  const pick=list=>list[Math.floor(Math.random()*list.length)];
  // decode while loading, not at the first shot
  for(const s of Object.values(S))for(const u of [...s.shots,...s.last])buffer(u);

  let prev=null,token=0;
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,def,...rest)=>{
    const s=own(def);
    if(kind==='shot'&&s?.shots?.length){
      const last=(session.weapon?.mag??1)<=0&&s.last.length,ctx=audio.ctx;
      // full auto: fade the previous shot's tail so the layers don't stack up loud
      if(prev&&ctx){const g=prev.g.gain;g.cancelScheduledValues(ctx.currentTime);g.setValueAtTime(g.value,ctx.currentTime);g.linearRampToValueAtTime(0,ctx.currentTime+.1);prev.src.stop(ctx.currentTime+.11);prev=null;}
      const t=++token;play(pick(last?s.last:s.shots),.8*(.9+Math.random()*.15),.97+Math.random()*.06).then(h=>{if(h&&!last&&t===token)prev=h;});
      return;}
    return weaponSound(kind,def,...rest);
  };
  const onSound=view.onSound?.bind(view);
  view.onSound=(name,def,...rest)=>{
    const s=own(def);
    if(s){const l=s.notes?.[name];if(l?.length)play(pick(l),.8);return;}   // our markers only: 'end' etc. must not reach the engine's lookup
    return onSound?.(name,def,...rest);};
}
