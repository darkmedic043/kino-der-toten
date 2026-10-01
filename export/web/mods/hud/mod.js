// Combat feedback: synthesized hitmarker / hurt sounds (the game ships no
// flesh-impact or pain cues) and a red arc around the crosshair pointing at
// whoever hit you. Works on Kino and custom maps.
import * as THREE from 'three';
import { setupEquipmentHud } from './equipment.js';

export default function setup(api){
  const {host,audio,camera,enemies,player,session,mod}=api;
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('hud.css',mod.url).href;document.head.append(css);
  setupEquipmentHud(api);

  // ---- Sounds (through the game's master gain, so volume settings apply) ----
  const out=()=>audio.enabled&&audio.ctx?.state==='running'&&audio.master?audio.ctx:null;
  function noise(c,seconds){const b=c.createBuffer(1,Math.ceil(c.sampleRate*seconds),c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const s=c.createBufferSource();s.buffer=b;return s;}
  // A compressor on our own bus lets the thumps be loud without clipping.
  let bus=null;
  const output=c=>{if(!bus||bus.context!==c){const comp=c.createDynamicsCompressor();comp.threshold.value=-10;comp.knee.value=6;comp.ratio.value=8;comp.attack.value=.001;comp.release.value=.12;
    bus=c.createGain();bus.gain.value=2.4;bus.connect(comp).connect(audio.master);}return bus;};
  function env(c,t,peak,attack,decay){const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+attack+decay);g.connect(output(c));return g;}
  // A thump: a sine punch dropping fast in pitch, plus a muffled noise knock.
  function thump(c,t,{from,to,length,body,knock,knockCut}){
    const o=c.createOscillator();o.type='sine';o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+length*.6);
    o.connect(env(c,t,body,.003,length));o.start(t);o.stop(t+length+.05);
    const n=noise(c,.08),lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=knockCut;
    n.connect(lp).connect(env(c,t,knock,.001,.05));n.start(t);n.stop(t+.08);
  }
  let lastHit=0;
  function hitmarker(head,kill){
    const c=out();if(!c||c.currentTime-lastHit<.04)return;lastHit=c.currentTime;const t=c.currentTime;
    thump(c,t,head?{from:230,to:90,length:.12,body:1,knock:.7,knockCut:2600}:{from:170,to:65,length:.13,body:.95,knock:.55,knockCut:1500});
    // Kills land with a second, deeper thud.
    if(kill)thump(c,t+.05,{from:120,to:42,length:.22,body:1,knock:.35,knockCut:700});
  }
  function hurt(amount){
    const c=out();if(!c)return;const t=c.currentTime,v=Math.min(1,.6+amount/100);
    thump(c,t,{from:110,to:36,length:.3,body:1.1*v,knock:.9*v,knockCut:800});
    thump(c,t+.07,{from:70,to:30,length:.25,body:.7*v,knock:.2*v,knockCut:400});
  }
  host.on('beforeEnemyDamage',e=>{if(!host.remoteDamage&&['bullet','explosion','melee','thunder'].includes(e.cause)&&e.enemy?.health>0)hitmarker(e.head,e.amount>=e.enemy.health||session.effects.insta_kill>session.time);});

  // ---- Directional damage indicator --------------------------------------------
  const ring=document.createElement('div');ring.id='damage-ring';document.body.append(ring);
  const marks=[];
  host.on('beforeDamage',e=>{
    if(session.effects.invulnerable>session.time||['reviving','gameover'].includes(session.phase))return;
    hurt(e.amount);
    // The enemy that just landed its attack (the game doesn't pass the attacker).
    const feet=player.getFeetPosition();
    const z=enemies.list.filter(z=>z.state==='attack'&&z.attackDealt).sort((a,b)=>a.root.position.distanceTo(feet)-b.root.position.distanceTo(feet))[0];
    if(!z||z.root.position.distanceTo(feet)>140)return;
    let m=marks.find(m=>m.enemy===z);
    if(!m){const el=document.createElement('i');ring.append(el);m={enemy:z,el};marks.push(m);}
    m.from=z.root.position.clone();m.life=1.6;m.strength=Math.min(1,.55+e.amount/60);
  });
  const fwd=new THREE.Vector3(),right=new THREE.Vector3();
  host.on('update',dt=>{
    camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();right.set(-fwd.z,0,fwd.x);
    for(const m of [...marks]){
      m.life-=dt;if(m.enemy&&enemies.list.includes(m.enemy))m.from.copy(m.enemy.root.position);
      if(m.life<=0){m.el.remove();marks.splice(marks.indexOf(m),1);continue;}
      const d=m.from.clone().sub(camera.position);d.y=0;
      const angle=Math.atan2(d.dot(right),d.dot(fwd));
      m.el.style.transform=`rotate(${angle}rad)`;m.el.style.opacity=Math.min(1,m.life/.6)*m.strength;
    }
  });
  host.on('reset',()=>{for(const m of marks)m.el.remove();marks.length=0;});
}
