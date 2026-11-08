// Kill effects (shop slot `killfx`, Season 1 Melon Pass rewards, 2026-11-08): what plays on a zombie you kill, on top of
// the kill colour. Drawn with the fx mod's pooled sprites, bolts and light flashes (window.kino.fx); the coin and bee
// sprites are small canvas atlases made once at load and uploaded before the warm-up (nothing new compiles or uploads
// mid-game). Only your own kills (co-op: `remote` kills are other players'), at most a few a second in a crowd.
//   payout   coins burst out, flip and bounce, with a soft clink
//   swarm    bees break out and buzz away upward, with an amber puff
//   grounded a lightning bolt strikes the body and leaves ash and blue embers
//   tolled   a bell tolls once, a pale ring and a grey puff
import * as THREE from 'three';

function atlas(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'));
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
// coin: face, three-quarter, edge-on, three-quarter (a flip at 4 cells)
const coinTex=()=>atlas(256,64,g=>{
  for(let i=0;i<4;i++){const sx=[1,.55,.12,.55][i],cx=i*64+32;g.save();g.translate(cx,32);g.scale(sx,1);
    const gr=g.createRadialGradient(-8,-8,2,0,0,28);gr.addColorStop(0,'#fff3b0');gr.addColorStop(.45,'#f2c14a');gr.addColorStop(1,'#a8701a');
    g.fillStyle=gr;g.beginPath();g.arc(0,0,27,0,Math.PI*2);g.fill();g.lineWidth=4;g.strokeStyle='#7a4e10';g.stroke();
    g.lineWidth=2;g.strokeStyle='#ffe08a';g.beginPath();g.arc(0,0,19,0,Math.PI*2);g.stroke();
    if(sx>.3){g.fillStyle='#8a5a12';g.font='bold 26px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('$',0,1);}
    g.restore();}
});
// bee: wings up, wings down
const beeTex=()=>atlas(128,64,g=>{
  for(let i=0;i<2;i++){const cx=i*64+32;g.save();g.translate(cx,36);
    g.fillStyle='rgba(225,240,255,.75)';const wy=i?-4:-16;
    g.beginPath();g.ellipse(-7,wy,9,13,-.5,0,Math.PI*2);g.fill();g.beginPath();g.ellipse(7,wy,9,13,.5,0,Math.PI*2);g.fill();
    g.fillStyle='#f2b51f';g.beginPath();g.ellipse(0,4,13,17,0,0,Math.PI*2);g.fill();
    g.fillStyle='#1a1408';for(const y of [-2,7,15])g.fillRect(-13,y,26,4.5);
    g.beginPath();g.arc(0,-13,8,0,Math.PI*2);g.fill();g.restore();}
});

export function installKillFx(api,getEquipped){
  const {host}=api,fx=window.kino.fx;if(!fx)return;
  fx.addTexture('kfx_coin',coinTex(),[4,1]);fx.addTexture('kfx_bee',beeTex(),[2,1]);
  const v=(x,y,z)=>new THREE.Vector3(x,y,z),rnd=(a,b)=>a+Math.random()*(b-a);
  const out=(sp,upMin,upMax)=>{const a=Math.random()*Math.PI*2,r=rnd(.4,1)*sp;return v(Math.cos(a)*r,rnd(upMin,upMax),Math.sin(a)*r);};

  // ---- sound: tiny synths ---------------------------------------------------------------------------------------------
  // through the game's master gain (volume settings apply), only while its audio runs
  const ctx=()=>{const a=api.audio;return a?.enabled&&a.ctx?.state==='running'&&a.master?a.ctx:null;},dest=()=>api.audio.master,vol=()=>1;
  function tone(freq,{t0=0,dur=.3,gain=.08,type='sine',decay=dur}={}){const a=ctx();if(!a)return;const t=a.currentTime+t0,o=a.createOscillator(),g=a.createGain();
    o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain*vol(),t+.005);g.gain.exponentialRampToValueAtTime(.0001,t+decay);
    o.connect(g).connect(dest());o.start(t);o.stop(t+dur+.05);}
  function noise({dur=.15,gain=.05,freq=3000}={}){const a=ctx();if(!a)return;const n=Math.floor(a.sampleRate*dur),b=a.createBuffer(1,n,a.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,3);const s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();
    s.buffer=b;f.type='bandpass';f.frequency.value=freq;g.gain.value=gain*vol();s.connect(f).connect(g).connect(dest());s.start();}
  let lastSound=0;const soundOk=gap=>{const n=performance.now();if(n-lastSound<gap)return false;lastSound=n;return true;};
  const SOUND={
    payout:()=>{if(!soundOk(120))return;for(let i=0;i<3;i++)tone(rnd(2400,3400),{t0:i*.06+rnd(0,.02),dur:.18,gain:.05,type:'triangle'});},
    swarm:()=>{if(!soundOk(250))return;tone(rnd(180,230),{dur:.7,gain:.035,type:'sawtooth',decay:.7});},
    grounded:()=>{if(!soundOk(150))return;noise({dur:.22,gain:.12,freq:2500});tone(70,{dur:.3,gain:.06,type:'square',decay:.25});},
    tolled:()=>{if(!soundOk(380))return;const f=rnd(196,233);for(const [m,g] of [[1,.07],[2.01,.035],[2.74,.025],[4.07,.015],[.5,.04]])tone(f*m,{dur:2.2,gain:g,decay:m<1?2.2:1.6/m+.3});},
  };

  // ---- the effects ---------------------------------------------------------------------------------------------------
  const FX={
    payout(at){
      fx.emit({key:'glow',at:at.clone(),size:[10,60],life:.25,fade:[.02,.7],additive:true,color:0xffc94a,opacity:.8});
      for(let i=0;i<14;i++)fx.emit({key:'kfx_coin',at:at.clone().add(fx.jitter(6)),vel:out(rnd(60,150),120,230),size:[5.5,5.5],life:rnd(.8,1.15),fade:[.02,.25],gravity:520,frames:rnd(10,18),cellIndex:i%4});
    },
    swarm(at){
      fx.emit({key:'smoke',at:at.clone(),vel:v(0,20,0),size:[10,46],life:.7,fade:[.05,.7],opacity:.35,color:0xd9a031,drag:2});
      for(let i=0;i<11;i++)fx.emit({key:'kfx_bee',at:at.clone().add(fx.jitter(10)),vel:out(rnd(40,90),20,70),size:[4.2,4.2],life:rnd(1.3,1.9),fade:[.05,.3],gravity:-30,drag:.8,wobble:900,frames:24});
    },
    grounded(at,feet){
      fx.bolt('ground',feet.clone(),{height:240,width:60,life:.3,color:0xa9c8ff});
      fx.flash(at,{color:0x8fb4ff,intensity:4,radius:350,life:.3});
      fx.emit({key:'sparks',at:at.clone(),size:[8,40],life:.2,fade:[.02,.7],additive:true,color:0xbfe0ff});
      for(let i=0;i<4;i++)fx.emit({key:'smoke',at:at.clone().add(fx.jitter(10)),vel:v(rnd(-10,10),rnd(25,45),rnd(-10,10)),size:[8,34],life:rnd(1,1.4),fade:[.05,.7],opacity:.55,color:0x2a2a2c,drag:1.5});
      for(let i=0;i<8;i++)fx.emit({key:'ember',at:at.clone().add(fx.jitter(8)),vel:out(rnd(30,80),20,90),size:[2.5,.5],life:rnd(.5,.9),fade:[.02,.5],additive:true,color:0x7fb8ff,gravity:120});
    },
    tolled(at){
      fx.emit({key:'rring',at:at.clone(),size:[10,120],life:.6,fade:[.02,.8],additive:true,color:0xd8ccb0,opacity:.7});
      fx.emit({key:'rring',at:at.clone(),size:[10,80],life:.9,fade:[.3,.7],additive:true,color:0xa89a7c,opacity:.4});
      for(let i=0;i<4;i++)fx.emit({key:'smoke2',at:at.clone().add(fx.jitter(12)),vel:v(rnd(-12,12),rnd(10,25),rnd(-12,12)),size:[14,60],life:rnd(1.1,1.5),fade:[.05,.7],opacity:.4,color:0x8c8c8c,drag:1.2});
    },
  };

  // a crowd (the Thundergun, a trap) plays at most ~4 a second
  let budget=0;host.on('update',dt=>{budget=Math.max(0,budget-dt*4);});
  function play(id,pos,kind='zombie'){const f=FX[id];if(!f||budget>4)return false;budget++;
    const feet=pos.clone(),at=pos.clone();at.y+=kind==='dog'?18:44;f(at,feet);SOUND[id]?.();return true;}
  host.on('kill',e=>{
    const id=getEquipped()?.killfx;if(!id||e.remote)return;
    const pos=e.enemy?.root?.position??e.at;if(!pos)return;
    play(id,pos,e.kind);
  });
  window.kino.killFx={play:(id,pos)=>play(id,pos??api.player?.position??new THREE.Vector3()),ids:Object.keys(FX)};
}
