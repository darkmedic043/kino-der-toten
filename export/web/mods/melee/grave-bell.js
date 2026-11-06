// The Grave Bell (2026-11-05, a Melon Pass melee, `soon` until its season): a funeral hand-bell held in the melee slot (melee.json
// grave_bell; the melee mod hangs the model from the knife's attach tag and calls the hooks below). A tap rings it: every zombie
// within ~300 stops dead for ~1.2 s, turned to face you, and zombies on a downed teammate are shoved off them. Ring again inside
// the resonance window to stack tolls; the third (fifth with the Cracked Crown) is a Death Knell: a bigger wave that deals real
// damage. A heavy (right mouse / aim + V) is a bash that also rings. Ten attachments (tag_gb_* parts of the model, gb_* in
// attachments.json) change the ring; two transform the bell (the Chained Bell's flail spin, the Sexton's Lantern's ghost-light).
// Numbers in melee.json `bell`. Debug: window.kino.graveBell. Notes: docs/fork/melon-weapons.md (The Grave Bell).
import * as THREE from 'three';

const UP=new THREE.Vector3(0,1,0);
const yawTo=(a,b)=>Math.atan2(-(b.z-a.z),b.x-a.x);   // (enemies.js's own: the zombie's facing)
const wrap=a=>a-Math.PI*2*Math.round(a/(Math.PI*2));
// The arm's moves, as pivot poses about the knife arm's shoulder (motion.js keys: pos [right, up, back], swing [pitch, yaw, roll])
const RING=[[0,{}],[.07,{pos:[-.2,1.4,.8],swing:[.2,.04,.1]}],[.15,{pos:[.4,-.6,-1.8],swing:[-.3,-.06,-.14],fast:true}],[.23,{pos:[.3,-.4,-1.4],swing:[-.22,-.05,-.1]}],[.48,{}]];
const HEAVY=[[0,{}],[.2,{pos:[.4,.8,1.2],swing:[.12,.1,.08]}],[.32,{pos:[-.6,-.4,-2.6],swing:[-.18,-.12,-.1],fast:true}],[.5,{pos:[-.5,-.3,-2.2],swing:[-.14,-.1,-.08]}],[.85,{}]];
const SPIN=[[0,{}],[.14,{pos:[2.2,.8,1],swing:[.14,.45,.3]}],[.36,{pos:[-2.4,-1.4,-1.6],swing:[-.12,-.72,-.5],fast:true}],[.5,{pos:[-2.6,-1.6,-1.4],swing:[-.14,-.78,-.55]}],[.85,{}]];
// A struck bell's partials (hum, prime, minor-third tierce, quint, nominal and the upper ring), [ratio, level, decay share]
const PARTIALS=[[.5,.32,1],[.502,.18,1],[1,.5,.8],[1.183,.3,.62],[1.506,.2,.5],[2,.28,.45],[2.514,.13,.3],[2.662,.11,.28],[3.011,.09,.22],[4.166,.05,.15],[5.433,.035,.1]];
const CYAN=0x62dcff,GHOST=0x8affd0;

export default function graveBell({api,E,D,id,isOn,damage,power,play,has}){
  const {host,session,scene,camera,enemies,world,player,audio,view}=api;
  const B=E.bell;
  const T={wolf:'tag_gb_wolftone',iron:'tag_gb_irontongue',veil:'tag_gb_veil',crown:'tag_gb_crown',chain:'tag_gb_chain',lantern:'tag_gb_lantern',
    choir:'tag_gb_choir',requiem:'tag_gb_requiem',ossuary:'tag_gb_ossuary',belfry:'tag_gb_belfry'};
  const fit=k=>has(T[k]);
  let t=0,tolls=0,lastToll=-99,pending=[];
  const alive=z=>enemies.list.includes(z)&&z.state!=='dead'&&z.health>0;
  const feet=()=>player.getFeetPosition();
  const remotes=()=>[...(window.kino?.coop?.remotes?.values?.()??[])];

  // ---- effects: pooled, compiled while loading (host.warmObjects), joined to the scene on first use ----------------------------
  const discMat=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(CYAN)},uOpacity:{value:1},uBand:{value:.95},uWidth:{value:.05},uFill:{value:0},uTime:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 uColor;uniform float uOpacity,uBand,uWidth,uFill,uTime;varying vec2 vUv;void main(){float r=length(vUv);if(r>1.)discard;'+
      'float b=exp(-pow((r-uBand)/uWidth,2.))+.35*exp(-pow((r-uBand*.82)/(uWidth*.6),2.));float f=uFill*smoothstep(1.,.5,r)*(.3+.22*sin(r*28.-uTime*5.));float a=(b+f)*uOpacity;gl_FragColor=vec4(uColor*a,a);}',
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const plane=new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2);
  const glowMat=c=>new THREE.MeshBasicMaterial({color:c,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const ringGeo=new THREE.TorusGeometry(1,.012,6,96).rotateX(Math.PI/2),haloGeo=new THREE.TorusGeometry(9,.7,6,28).rotateX(Math.PI/2);
  const bellGeo=new THREE.LatheGeometry([[0,0],[13,0],[12.4,2],[10,6],[8.6,12],[8,19],[7,24],[4,26.5],[0,27]].map(([x,y])=>new THREE.Vector2(x,y)),28);
  const pools={ripple:[],ring:[],halo:[],wisp:[],zone:[],ghost:[]};
  const make={
    ripple:()=>new THREE.Mesh(plane,discMat.clone()),
    ring:()=>new THREE.Mesh(ringGeo,glowMat(CYAN)),
    halo:()=>new THREE.Mesh(haloGeo,glowMat(CYAN)),
    wisp:()=>{const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(2.4,10,8),glowMat(0xd8fbff)),new THREE.Mesh(new THREE.SphereGeometry(7,10,8),glowMat(CYAN)));g.children[1].material.opacity=.25;return g;},
    zone:()=>{const m=new THREE.Mesh(plane,discMat.clone());m.material.uniforms.uColor.value.set(GHOST);m.material.uniforms.uFill.value=1;m.material.uniforms.uBand.value=.97;m.material.uniforms.uWidth.value=.03;return m;},
    ghost:()=>{const m=new THREE.Mesh(bellGeo,glowMat(GHOST));m.material.side=THREE.DoubleSide;m.material.opacity=.35;return m;},
  };
  const SIZES={ripple:8,ring:8,halo:20,wisp:8,zone:3,ghost:2};
  for(const [k,n] of Object.entries(SIZES))for(let i=0;i<n;i++){const o=make[k]();o.visible=false;o.matrixAutoUpdate=true;o.frustumCulled=false;o.userData.free=true;pools[k].push(o);host.warmObjects?.push(o);}
  const take=k=>{const o=pools[k].find(o=>o.userData.free)??pools[k][0];o.userData.free=false;if(o.parent!==scene)scene.add(o);o.visible=true;return o;};
  const give=o=>{if(!o)return;o.visible=false;o.userData.free=true;};
  const place=(o,p,s)=>{o.position.copy(p);if(s!=null)o.scale.setScalar(s);o.updateMatrixWorld(true);};
  const fx=[];   // {o, kind, age, life, at, r}
  function wave(at,radius,knell,ghost){
    const life=knell?.75:.5,col=ghost?GHOST:CYAN;
    const r=take('ripple');r.material.uniforms.uColor.value.set(knell?0xa8f0ff:col);r.material.uniforms.uFill.value=0;
    fx.push({o:r,kind:'ripple',age:0,life,at:at.clone().setY(at.y+2),r:radius});
    const s=take('ring');s.material.color.set(col);fx.push({o:s,kind:'ring',age:0,life:life*.8,at:at.clone().setY(at.y+40),r:radius});
    if(knell){const s2=take('ring');s2.material.color.set(0xd8fbff);fx.push({o:s2,kind:'ring',age:-.12,life:life,at:at.clone().setY(at.y+62),r:radius*.8});}
  }
  function fxUpdate(dt){
    for(let i=fx.length;i--;){const f=fx[i];f.age+=dt;const u=Math.max(0,f.age)/f.life;
      if(u>=1){give(f.o);fx.splice(i,1);continue;}
      const e=1-(1-u)**3;
      if(f.kind==='ripple'){place(f.o,f.at,Math.max(1,f.r*e));const m=f.o.material.uniforms;m.uOpacity.value=(1-u)*1.6;m.uWidth.value=.04+.05*u;}
      else{place(f.o,f.at,Math.max(1,f.r*Math.min(1,e*1.1)));f.o.material.opacity=(f.age<0?0:(1-u)*.9);}
    }
  }

  // ---- the toll: synthesised (no recorded audio) --------------------------------------------------------------------------------
  let noise=null;
  function toll(f,dur,gain,muffle=false,at=null){
    const c=audio?.ctx,out=audio?.master;if(!c||!out)return;
    if(at){gain*=Math.max(0,1-camera.position.distanceTo(at)/2400);if(gain<.01)return;}
    const t0=c.currentTime,bus=c.createGain();bus.gain.value=gain;
    if(muffle){const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1100;bus.connect(lp).connect(out);}else bus.connect(out);
    for(const [r,a,d] of PARTIALS){const o=c.createOscillator(),g=c.createGain(),end=t0+dur*d;o.type='sine';o.frequency.value=f*r*(1+(Math.random()-.5)*.003);
      g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(a,t0+.004);g.gain.exponentialRampToValueAtTime(.0001,end);o.connect(g).connect(bus);o.start(t0);o.stop(end+.05);}
    if(!noise){noise=c.createBuffer(1,c.sampleRate*.1,c.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
    const n=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();n.buffer=noise;bp.type='bandpass';bp.frequency.value=muffle?1400:3200;bp.Q.value=2;
    g.gain.setValueAtTime(.5,t0);g.gain.exponentialRampToValueAtTime(.001,t0+.06);n.connect(bp).connect(g).connect(bus);n.start(t0);
  }

  // ---- stuns: the zombie holds where it stands, slowed to a sway, turned to the bell; it can't attack (the lure) -------------------
  const held=new Map();   // z -> {until, at, look, scale, halo}
  const lure=enemies.lureTarget?.bind(enemies);
  enemies.lureTarget=z=>{const h=held.get(z);if(h&&h.until>t)return z.root.position;return lure?lure(z):null;};
  function stun(z,secs,look){
    if(!alive(z)||z.thrall||z.state==='rising'||z.state==='entering')return;
    const until=t+secs*(z.hit?.5:1);let h=held.get(z);
    if(h){h.until=Math.max(h.until,until);if(look)h.look=look;return;}
    h={until,at:z.root.position.clone(),look:look??null,scale:z.rig?.mixer?.timeScale??1,halo:take('halo')};held.set(z,h);
    if(z.rig?.mixer)z.rig.mixer.timeScale=.12;z.vel=0;
  }
  function release(z,h){if(z.rig?.mixer)z.rig.mixer.timeScale=h.scale;give(h.halo);held.delete(z);z.repath=0;}
  function holdAll(dt){
    for(const [z,h] of held){
      if(!alive(z)||h.until<=t){release(z,h);continue;}
      const p=z.root.position;p.x=h.at.x;p.z=h.at.z;z.vel=0;
      const to=h.look??feet(),yaw=yawTo(p,to);z.root.rotation.y+=wrap(yaw-z.root.rotation.y)*Math.min(1,dt*10);z.moveYaw=z.root.rotation.y;
      if(z.state==='attack'){z.attackDealt=true;}
      const o=h.halo;o.position.set(p.x,p.y+(z.kind==='dog'?42:80)+Math.sin(t*6+z.id)*1.5,p.z);o.rotation.y+=dt*3;o.material.opacity=Math.min(.8,(h.until-t)*2);o.updateMatrixWorld(true);
    }
  }
  const eu=enemies.update.bind(enemies);
  enemies.update=function(dt,...a){const r=eu(dt,...a);holdAll(dt||0);return r;};   // after the zombies' own step, so nothing walks or turns them in between
  function shove(z,from,dist){
    const p=z.root.position,d=p.clone().sub(from).setY(0),L=d.length()||1;if(L>=dist)return;
    if(L<1)d.set(1,0,0);d.setLength(dist).add(from);d.y=p.y;
    const a=p.clone(),b=d.clone();a.y+=40;b.y+=40;if(!world.lineClear(a,b))return;
    p.copy(d);const h=held.get(z);if(h)h.at.copy(d);z.repath=0;
  }

  // ---- the ring ----------------------------------------------------------------------------------------------------------------
  const zones=[],wisps=[],ghosts=[],shields=[];
  let reqUntil=0,reqAt=null;
  const prevRate=window.kino.reviveRate;
  window.kino.reviveRate=c=>Math.max(prevRate?.(c)??1,reqUntil>t&&c?.pos&&reqAt&&c.pos.distanceTo(reqAt)<B.radius*1.5?B.requiem.revive:1);
  function ring(heavy,at=feet(),ghost=null){
    const tier=power(),s=1+(tier-1)*.1;
    let radius=B.radius*(1+(tier-1)*.04),secs=B.stun*s;
    if(fit('veil')){radius*=B.veil.radius;secs*=B.veil.stun;}
    if(fit('iron')){radius*=B.ironTongue.radius;secs*=B.ironTongue.stun;}
    if(heavy){radius*=1.15;secs*=1.2;}
    let knell=false;
    if(ghost){radius=B.belfry.radius;}
    else{
      const crown=fit('crown'),max=crown?B.crown.tolls:B.tolls,win=B.window*(crown?B.crown.window:1)*(fit('ossuary')?B.ossuary.window:1);
      tolls=t-lastToll<=win?tolls+1:1;lastToll=t;
      if(tolls>=max){knell=true;tolls=0;lastToll=-99;
        radius=B.knellRadius*(crown?B.crown.knellRadius:1)*(fit('veil')?B.veil.radius:1)*(fit('iron')?B.ironTongue.radius:1);secs=B.knellStun*s;}
    }
    // sound: deeper with each toll, the Knell an octave down; the Iron Tongue lower, the Veil muffled
    const f=(knell?98:[196,220,247,262,294][Math.max(0,tolls-1)]??196)*(fit('iron')?.84:1)*(ghost?1.12:1);
    toll(f,knell?5:2.4,knell?.34:.24,fit('veil'),ghost?at:null);
    wave(at,radius,knell,!!ghost);
    // zombies in reach: the Knell (and the Wolf Tone's every ring) hurts, falling off to half at the edge; whoever lives is held
    const mul=knell?B.knellMul*(fit('crown')?B.crown.knellMul:1):fit('wolf')?B.wolfMul:0,base=mul?damage()*mul:0;
    for(const z of [...enemies.list]){
      if(z.thrall||z.state==='dead')continue;const p=z.root.position,d=Math.hypot(p.x-at.x,p.z-at.z);
      if(d>radius||Math.abs(p.y-at.y)>220)continue;
      if(base){const head=enemies.headPosition?.(z);enemies.hurt(z,base*(1-.5*d/radius),false,false,'bell');if(!enemies.list.includes(z)){if(knell&&fit('choir'))wisp(head??p.clone().setY(p.y+60));continue;}}
      stun(z,secs,ghost?ghost.pos:null);
    }
    // a downed teammate inside the wave: the zombies on them are shoved off (the Requiem keeps them off and speeds the revive)
    if(!ghost)for(const r of remotes()){
      if(!r.down||r.dead||!r.pos||r.pos.distanceTo(at)>radius)continue;
      for(const z of enemies.list)if(z.root.position.distanceTo(r.pos)<150){shove(z,r.pos,180);stun(z,secs);}
      if(fit('requiem')){shields.push({r,until:t+B.requiem.time});reqUntil=t+B.requiem.time;reqAt=r.pos.clone();}
    }
    if(knell&&fit('requiem')&&!remotes().length){session.health=session.maxHealth;session.effects.invulnerable=Math.max(session.effects.invulnerable??0,(session.time??0)+2);}
    if(fit('lantern')&&!ghost)zone(at);
    if(knell&&fit('belfry'))plant();
    if(!ghost){clapV+=knell?16:heavy?13:10;glowKick=knell?3:1+tolls*.5;}
    host.emit?.('graveBell',{knell,tolls,radius,heavy});
    return {knell,radius,secs};
  }

  // Sexton's Lantern: each ring leaves a pool of ghost-light that holds whatever stands in it
  function zone(at){
    if(zones.length>=SIZES.zone){const z=zones.shift();give(z.o);}
    const o=take('zone');place(o,at.clone().setY(at.y+1.5),B.lantern.radius);zones.push({o,at:at.clone(),until:t+B.lantern.time});
  }
  // Choir of the Dead: a Knell kill lets go a wisp that seeks the nearest zombie and holds it
  function wisp(p){
    if(wisps.length>=Math.min(SIZES.wisp,B.choir.max))return;
    const o=take('wisp');place(o,p,1);wisps.push({o,pos:p.clone(),target:null,life:6});
  }
  // Belfry Spike: the Knell plants a spectral bell that tolls on its own
  function plant(){
    if(ghosts.length>=SIZES.ghost){const g=ghosts.shift();give(g.o);}
    const dir=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(),pos=feet().addScaledVector(dir,80);
    const o=take('ghost');o.material.opacity=.35;place(o,pos.clone().setY(pos.y+55),1);ghosts.push({o,pos,next:t+.6,left:B.belfry.tolls});
  }
  function worldUpdate(dt){
    for(let i=zones.length;i--;){const z=zones[i];const left=z.until-t;z.o.material.uniforms.uTime.value=t;z.o.material.uniforms.uOpacity.value=Math.min(1,left*1.5)*.9;
      if(left<=0){give(z.o);zones.splice(i,1);continue;}
      for(const e of enemies.list){const p=e.root.position;if(Math.hypot(p.x-z.at.x,p.z-z.at.z)<B.lantern.radius&&Math.abs(p.y-z.at.y)<120)stun(e,.35,z.at);}}
    for(let i=wisps.length;i--;){const w=wisps[i];w.life-=dt;
      if(!w.target||!alive(w.target)){let best=null,bd=1500;for(const z of enemies.list){if(z.thrall||wisps.some(o=>o.target===z))continue;const d=z.root.position.distanceTo(w.pos);if(d<bd){bd=d;best=z;}}w.target=best;}
      const goal=w.target?(enemies.headPosition?.(w.target)??w.target.root.position.clone().setY(w.target.root.position.y+60)):null;
      if(goal){const v=goal.clone().sub(w.pos),d=v.length();if(d<16){stun(w.target,B.choir.stun);wave(w.target.root.position,60,false,true);w.life=0;}else w.pos.addScaledVector(v,Math.min(1,B.choir.speed*dt/d));}
      else w.pos.y+=dt*30;
      place(w.o,w.pos,1+.15*Math.sin(t*20+i));
      if(w.life<=0){give(w.o);wisps.splice(i,1);}}
    for(let i=ghosts.length;i--;){const g=ghosts[i];g.o.rotation.z=Math.sin(t*5)*.25*Math.min(1,(g.next-t+1));place(g.o,g.pos.clone().setY(g.pos.y+55+Math.sin(t*2)*3));
      if(g.left<=0){g.o.material.opacity-=dt*.5;if(g.o.material.opacity<=0){give(g.o);ghosts.splice(i,1);}continue;}
      if(t>=g.next){g.left--;g.next=t+B.belfry.every;ring(false,g.pos,g);}}
    for(let i=shields.length;i--;){const s=shields[i];if(s.until<=t||!s.r.down||!s.r.pos){shields.splice(i,1);continue;}
      for(const z of enemies.list)if(z.root.position.distanceTo(s.r.pos)<B.requiem.shield){shove(z,s.r.pos,B.requiem.shield);stun(z,.4,s.r.pos);}}
  }

  // ---- the bell in hand: the clapper swings, the crack glows with the tolls, the Chained Bell hangs the bell lower --------------
  let clapA=0,clapV=0,glowKick=0,bound=null;
  const AXIS=new THREE.Vector3(0,.6,.8).normalize(),qa=new THREE.Quaternion();
  function bind(gun){
    if(bound?.gun===gun)return bound;
    const b={gun,clapper:gun.getObjectByName('j_clapper'),bell:gun.getObjectByName('j_bell'),glow:[]};
    b.clapRest=b.clapper?.quaternion.clone();b.bellRest=b.bell?.position.clone();
    gun.traverse(o=>{for(const m of [o.material].flat())if(m?.name==='gb_glow'&&!b.glow.includes(m)){m.userData.gbBase??=m.emissiveIntensity;b.glow.push(m);}});
    return bound=b;
  }
  function viewUpdate(dt){
    clapV+=(-160*clapA-7*clapV)*dt;clapA+=clapV*dt;glowKick=Math.max(0,glowKick-dt*1.6);
    const gun=isOn()&&view.def?.id===id?view.gun:null;if(!gun)return;
    const b=bind(gun);
    if(b.clapper){b.clapper.quaternion.copy(b.clapRest).multiply(qa.setFromAxisAngle(AXIS,Math.max(-.6,Math.min(.6,clapA))));}
    if(b.bell){b.bell.position.copy(b.bellRest);if(fit('chain'))b.bell.position.x+=7;}
    const stack=tolls&&t-lastToll<window_()?tolls:0;
    for(const m of b.glow)m.emissiveIntensity=m.userData.gbBase*(1+stack*.6+glowKick+.15*Math.sin(t*3));
  }
  const window_=()=>B.window*(fit('crown')?B.crown.window:1)*(fit('ossuary')?B.ossuary.window:1);

  // ---- toll pips under the crosshair (no blur: plain borders and fills) ------------------------------------------------------
  const hud=document.createElement('div');hud.id='gb-tolls';
  hud.style.cssText='position:fixed;left:50%;top:calc(50% + 44px);transform:translateX(-50%);display:none;gap:6px;pointer-events:none;z-index:5;transition:opacity .2s';
  document.body.append(hud);
  let hudKey='';
  function hudDraw(force){
    const show=force??isOn();const max=fit('crown')?B.crown.tolls:B.tolls,lit=tolls&&t-lastToll<window_()?tolls:0,key=show+':'+max+':'+lit;if(key===hudKey)return;hudKey=key;
    hud.style.display=show?'flex':'none';hud.style.opacity=lit||force?1:.35;
    hud.innerHTML=Array.from({length:max},(_,i)=>`<i style="display:block;width:${i===max-1?10:7}px;height:${i===max-1?10:7}px;border:1px solid #9fe8ff;transform:rotate(45deg);background:${i<lit?'#62dcff':'rgba(10,30,40,.5)'}"></i>`).join('');
  }
  host.on('warmHud',on=>{if(on){hudKey='';const l=tolls;tolls=1;lastToll=t;hudDraw(true);tolls=l;}else{hudKey='';hudDraw();}});

  window.kino.graveBell={ring:(heavy=false)=>ring(heavy),state:()=>({tolls,held:held.size,zones:zones.length,wisps:wisps.length,ghosts:ghosts.length,shields:shields.length,fitted:Object.keys(T).filter(fit)}),held};

  return {
    tune(m){if(fit('chain')){m.meleeReach=B.chain.reach;}if(fit('ossuary')){m.meleeTime*=B.ossuary.swing;m.meleeChargeTime*=B.ossuary.swing;m.meleeDelay*=B.ossuary.swing;m.meleeChargeDelay*=B.ossuary.swing;}},
    swing(heavy){
      const sp=fit('ossuary')?B.ossuary.swing:1;const at=(heavy?E.heavyDelay:E.swingDelay)*sp;
      if(heavy&&fit('chain')){pending.push({at:t+.3*sp,spin:true},{at:t+.36*sp,heavy:true});return {keys:SPIN.map(([k,p])=>[k*sp,p]),lunge:false};}
      pending.push({at:t+at,heavy});
      return heavy?{keys:HEAVY.map(([k,p])=>[k*sp,p])}:{keys:RING.map(([k,p])=>[k*sp,p]),lunge:false};
    },
    clip(heavy){return heavy&&fit('chain')?'meleeAnim':null;},   // the flail spin: the arm swings the chain round, no stab
    update(dt){
      t+=dt;
      for(let i=pending.length;i--;){const p=pending[i];if(t<p.at)continue;pending.splice(i,1);
        if(p.spin){const c=feet(),r=B.chain.spin;for(const z of [...enemies.list]){if(z.thrall)continue;const q=z.root.position;if(Math.hypot(q.x-c.x,q.z-c.z)<r&&Math.abs(q.y-c.y)<120)enemies.hurt(z,damage()*E.heavyMul*.8,false,true);}}
        else ring(p.heavy);}
      fxUpdate(dt);worldUpdate(dt);viewUpdate(dt);hudDraw();
    },
    reset(){for(const [z,h] of held)release(z,h);for(const a of [zones,wisps,ghosts])for(const x of a.splice(0))give(x.o);for(const f of fx.splice(0))give(f.o);shields.length=0;pending.length=0;tolls=0;lastToll=-99;t=0;reqUntil=0;},
  };
}
