// Zombie voices: plays clips from this folder when zombies growl, attack and
// die (the game ships only a synthesized growl). sounds.json lists the files
// per category; .tools/split-sounds.py makes both from one compilation.
// Volume falls off with distance. Works on Kino, custom maps and co-op.
export default async function setup(api){
  const {host,audio,enemies,camera,mod}=api;
  let sounds;try{sounds=await fetch(new URL('sounds.json',mod.url)).then(r=>{if(!r.ok)throw 0;return r.json();});}catch{console.info('[zombie-sounds] no sounds.json yet; using the built-in growl');return;}
  const buffers=new Map();
  const load=async file=>{
    if(!buffers.has(file))buffers.set(file,fetch(new URL(file,mod.url)).then(r=>r.arrayBuffer()).then(b=>audio.ctx.decodeAudioData(b)).catch(()=>null));
    return buffers.get(file);
  };
  let last=0;
  async function play(kind,position,volume=1){
    const list=sounds[kind];if(!list?.length||!audio.ctx||!audio.enabled||!audio.master)return;
    const now=audio.ctx.currentTime;if(kind==='growl'&&now-last<.35)return;if(kind==='growl')last=now;   // don't stack a crowd of growls
    const d=position?position.distanceTo(camera.position):0,gain=volume*Math.max(0,1-d/1400)**1.4;if(gain<.02)return;
    const buffer=await load(list[Math.floor(Math.random()*list.length)]);if(!buffer)return;
    const src=audio.ctx.createBufferSource(),g=audio.ctx.createGain();src.buffer=buffer;src.playbackRate.value=.92+Math.random()*.16;
    g.gain.value=gain*(kind==='growl'?.8:1.1);src.connect(g).connect(audio.master);src.start();
  }
  // Replace the synthesized growl; the game passes a distance-based volume.
  const baseSound=enemies.onSound;
  enemies.onSound=(kind,position)=>{if(kind==='growl')play('growl',position);else baseSound?.(kind,position);};
  // Attacks: the moment a zombie starts its swing.
  const attacking=new WeakSet();
  host.on('update',()=>{for(const z of enemies.list){if(z.state==='attack'){if(!attacking.has(z)){attacking.add(z);play('attack',z.root.position);}}else attacking.delete(z);}});
  host.on('kill',e=>{if(e.enemy?.root)play('death',e.enemy.root.position,.9);});
  // Warm the cache once audio exists.
  const warm=setInterval(()=>{if(audio.ctx){clearInterval(warm);for(const k of Object.keys(sounds))sounds[k].slice(0,4).forEach(load);}},1000);
}
