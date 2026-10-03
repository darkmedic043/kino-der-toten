// Explosions, blood mist and impact puffs drawn with BO1's own effect textures
// (textures/fxt_*: fireball atlas, glow, embers, smoke puffs, the blood-burst
// flipbook, blood cloud and gush), in place of the game's little cubes.
// engine.js's effect() emits 'effect' first; this claims the ones it
// recognises by colour (orange = explosion, the default red = a blood hit,
// green = Ray Gun, tan = a wall hit) and leaves the rest to the cubes.
// Sprites are pooled; no lights are added (that would recompile every shader).
import * as THREE from 'three';

const TEX='textures/';
const up=new THREE.Vector3(0,1,0);

export default function setup(api){
  const {host,scene,camera}=api;
  const loader=new THREE.TextureLoader(),tex={};
  const load=(k,file)=>{const t=loader.load(new URL(TEX+file,document.baseURI).href);t.colorSpace=THREE.SRGBColorSpace;tex[k]=t;};
  load('fire','fxt_exp_fire.png');load('glow','fxt_exp_glow.png');load('ember','fxt_exp_ember_omni.png');
  load('smoke','fxt_smk_def_1.png');load('smoke2','fxt_smk_gen.png');load('burst','fxt_bio_bloodburst.png');
  load('cloud','fxt_bio_blood_cloud.png');load('gush','fxt_bio_bloodgush.png');load('drops','fxt_bio_blooddrops.png');
  load('swirl','fxt_smk_swirl.png');load('spiral','fxt_smk_whisp_spiral.png');load('sparks','fxt_fx_spark_field.png');load('rring','fxt_fx_raygun_ring.png');
  // the Thundergun's smoky shockwave ring is BO1's, built from the user's install (git-ignored); the Ray Gun ring stands in
  tex.tgring=loader.load(new URL('textures/fxt_fx_thundergun_ring.png',import.meta.url).href,undefined,undefined,()=>{tex.tgring.image=tex.rring.image;tex.tgring.needsUpdate=true;});tex.tgring.colorSpace=THREE.SRGBColorSpace;

  // atlases: [columns, rows]
  const GRID={swirl:[2,1],spiral:[1,1],sparks:[1,1],rring:[1,1],tgring:[1,1],fire:[2,2],ember:[2,2],smoke:[2,1],smoke2:[2,1],burst:[4,4],gush:[2,1],drops:[2,2],glow:[1,1],cloud:[1,1]};

  // ---- pool ---------------------------------------------------------------------------------
  const live=[],free=[];
  function sprite(key,{additive=false,color=0xffffff,opacity=1}={}){
    let s=free.pop();
    if(!s){s=new THREE.Sprite(new THREE.SpriteMaterial({depthWrite:false,transparent:true,fog:true}));s.frustumCulled=false;s.renderOrder=5;}
    const m=s.material;
    if(m.userData.key!==key){m.map?.dispose?.();m.map=tex[key].clone();m.userData.key=key;}
    const [c,r]=GRID[key];m.map.repeat.set(1/c,1/r);
    m.blending=additive?THREE.AdditiveBlending:THREE.NormalBlending;m.color.set(color);m.opacity=opacity;m.rotation=Math.random()*Math.PI*2;
    s.visible=true;scene.add(s);return s;
  }
  const cell=(s,i)=>{const [c,r]=GRID[s.material.userData.key],x=i%c,y=Math.floor(i/c)%r;s.material.map.offset.set(x/c,1-(y+1)/r);};
  // p: {key, at, vel, size:[from,to], life, fade:[in,out], opacity, additive, color, gravity, spin, frames(flipbook fps), cellIndex}
  function emit(p){
    if(live.length>220)return;
    const s=sprite(p.key,p);s.position.copy(p.at);
    const n=GRID[p.key][0]*GRID[p.key][1];cell(s,p.cellIndex??Math.floor(Math.random()*n));
    live.push({s,t:0,...p,vel:p.vel?.clone()??new THREE.Vector3(),n,base:p.opacity??1});
  }
  host.on('update',dt=>{
    if(!dt)return;
    for(let i=live.length-1;i>=0;i--){
      const p=live[i];p.t+=dt;const k=p.t/p.life;
      if(k>=1){p.s.visible=false;p.s.removeFromParent();free.push(p.s);live.splice(i,1);continue;}
      p.vel.y-=(p.gravity??0)*dt;p.vel.multiplyScalar(Math.max(0,1-(p.drag??0)*dt));p.s.position.addScaledVector(p.vel,dt);
      const ease=1-Math.pow(1-k,p.grow??2.2);p.s.scale.setScalar(p.size[0]+(p.size[1]-p.size[0])*ease);
      const [fi,fo]=p.fade??[.05,.6],a=k<fi?k/fi:k>1-fo?(1-k)/fo:1;p.s.material.opacity=p.base*a;
      p.s.material.rotation+=(p.spin??0)*dt;
      if(p.frames)cell(p.s,Math.min(p.n-1,Math.floor(p.t*p.frames)));
    }
  });
  host.on('reset',()=>{for(const p of live){p.s.visible=false;p.s.removeFromParent();free.push(p.s);}live.length=0;});

  const rnd=(a,b)=>a+Math.random()*(b-a);
  const jitter=(r)=>new THREE.Vector3(rnd(-r,r),rnd(-r*.4,r),rnd(-r,r));

  // ---- effects --------------------------------------------------------------------------------
  function explosion(at,scale=1,tint=null){
    const S=scale,c=at.clone().addScaledVector(up,10*S);
    emit({key:'glow',at:c,size:[60*S,260*S],life:.22,fade:[.05,.8],additive:true,color:tint??0xffd59a,opacity:1});
    for(let i=0;i<3;i++)emit({key:'fire',at:c.clone().add(jitter(18*S)),vel:jitter(60*S).addScaledVector(up,40*S),size:[40*S,rnd(150,210)*S],life:rnd(.45,.7),fade:[.04,.55],additive:true,color:tint??0xffffff,spin:rnd(-1,1)});
    for(let i=0;i<2;i++)emit({key:'ember',at:c.clone(),cellIndex:2+(i%2),size:[60*S,240*S],life:rnd(.5,.8),fade:[.02,.7],additive:true,color:tint??0xffffff,grow:3});
    for(let i=0;i<2;i++)emit({key:'ember',at:c.clone().addScaledVector(up,20*S),cellIndex:i%2,vel:up.clone().multiplyScalar(80*S),size:[90*S,200*S],life:rnd(1,1.6),fade:[.1,.7],additive:true,color:tint??0xffffff});
    // smoke rises and lingers after the fire
    for(let i=0;i<7;i++)emit({key:i%2?'smoke':'smoke2',at:c.clone().add(jitter(30*S)),vel:jitter(50*S).addScaledVector(up,rnd(35,70)*S),size:[60*S,rnd(220,320)*S],life:rnd(3.2,4.6),fade:[.12,.55],opacity:rnd(.7,.85),color:tint?0x6a7a66:0x4e4943,spin:rnd(-.3,.3),drag:.6,grow:1.6});
    // dust kicked off the floor
    for(let i=0;i<4;i++)emit({key:'smoke',at:at.clone().add(new THREE.Vector3(rnd(-40,40)*S,4,rnd(-40,40)*S)),vel:new THREE.Vector3(rnd(-160,160)*S,rnd(10,30),rnd(-160,160)*S),size:[30*S,150*S],life:rnd(1.4,2.2),fade:[.1,.7],opacity:.4,color:0x6b6152,drag:1.8});
  }
  // blood is capped per moment: a Thundergun or explosion kill hits many zombies (and limbs) at once
  let bloodBudget=0;
  // Thundergun hits fling zombies whole: no blood for the hits it makes
  let thunderAt=-1;host.on('beforeEnemyDamage',e=>{if(e.cause==='thunder')thunderAt=performance.now();});
  function bloodHit(at,amount=1){
    if(performance.now()-thunderAt<60)return;
    if(bloodBudget>6)return;bloodBudget+=1;amount=Math.min(amount,1.5);
    emit({key:'burst',at:at.clone(),frames:16/.32,cellIndex:0,size:[16*amount,36*amount],life:.34,fade:[.01,.3],color:0x8c0d08,opacity:.9,grow:1.4});
    emit({key:'cloud',at:at.clone().add(jitter(4)),vel:jitter(14),size:[10*amount,rnd(26,36)*amount],life:rnd(.7,1.1),fade:[.04,.7],color:0x7a0c08,opacity:rnd(.7,.85),gravity:-8,drag:2,spin:rnd(-.5,.5)});
    if(amount>1.2)emit({key:'gush',at:at.clone().addScaledVector(up,6),vel:new THREE.Vector3(0,-30,0),size:[20*amount,40*amount],life:.6,fade:[.05,.6],color:0x7a0a06,opacity:.85});
  }
  host.on('update',dt=>{bloodBudget=Math.max(0,bloodBudget-dt*12);});
  function dust(at){emit({key:'smoke',at:at.clone(),vel:jitter(20).addScaledVector(up,15),size:[6,28],life:.7,fade:[.05,.7],opacity:.45,color:0x8a7c66,drag:2});}
  function energy(at,color){
    emit({key:'glow',at:at.clone(),size:[30,120],life:.25,fade:[.05,.8],additive:true,color});
    emit({key:'ember',at:at.clone(),cellIndex:3,size:[40,140],life:.45,fade:[.02,.7],additive:true,color,grow:3});
  }

  // compare the raw sRGB hex (THREE.Color would convert it to linear and nothing would match)
  // Thundergun: BO1's smoky shockwave rings rolling out along the cone with the smoke cloud
  // (fx_thundergun_smoke_cloud); knocked-down zombies kick up ground dust (fx_thundergun_knockback_ground).
  function thunder(origin,dir,upgraded){
    const tint=upgraded?0xffe0b0:0xe8f2ff;
    for(let i=0;i<4;i++){const d=40+i*70;emit({key:'tgring',at:origin.clone().addScaledVector(dir,d),vel:dir.clone().multiplyScalar(700-i*90),size:[20+i*14,170+i*40],life:.42+i*.05,fade:[.02,.75],additive:true,color:tint,opacity:.95,drag:2.2,grow:2.6,spin:rnd(-.6,.6)});}
    for(let i=0;i<9;i++){const d=rnd(30,260);emit({key:i%2?'smoke':'smoke2',at:origin.clone().addScaledVector(dir,d).add(jitter(10+d*.15)),vel:dir.clone().multiplyScalar(rnd(250,600)).add(jitter(60)),size:[25,rnd(140,220)],life:rnd(.9,1.5),fade:[.06,.75],opacity:rnd(.22,.34),color:0xd9dde2,drag:2.6,spin:rnd(-.4,.4)});}
  }
  function knockback(at){
    for(let i=0;i<6;i++){const a=i/6*Math.PI*2+rnd(-.3,.3);emit({key:'smoke',at:at.clone().add(new THREE.Vector3(0,6,0)),vel:new THREE.Vector3(Math.cos(a),0,Math.sin(a)).multiplyScalar(rnd(120,200)).setY(rnd(10,40)),size:[18,rnd(70,100)],life:rnd(.9,1.4),fade:[.05,.7],opacity:.5,color:0x7d7262,drag:2.5});}
  }
  // Gersh Device: a purple vortex. Swirling wisps, rings contracting into the hole, sparks and
  // debris spiralling in. Runs for `life` seconds from an emitter (the Moon's own Gersh effect is
  // DLC, not in the base game install).
  const emitters=[];
  function gersh(at,life=10){
    const c=at.clone();emit({key:'glow',at:c,size:[40,220],life:.35,fade:[.05,.8],additive:true,color:0xb48cff});
    emitters.push({t:0,life,c,next:{ring:0,wisp:0,spark:0}});
  }
  function gershTick(e,dt){
    e.t+=dt;const k=Math.min(1,e.t/.6)*Math.min(1,(e.life-e.t)/.6);if(k<=0)return;
    if((e.next.ring-=dt)<=0){e.next.ring=.45;emit({key:'rring',at:e.c.clone(),size:[150*k,6],life:.6,fade:[.15,.4],additive:true,color:0xa070ff,opacity:.8*k,grow:1.6});}
    if((e.next.wisp-=dt)<=0){e.next.wisp=.12;emit({key:Math.random()<.5?'swirl':'spiral',at:e.c.clone().add(jitter(6)),size:[rnd(60,110)*k,rnd(20,40)],life:.7,fade:[.2,.5],additive:true,color:Math.random()<.5?0x8a4dff:0x5a7cff,opacity:.55*k,spin:rnd(5,8)*(Math.random()<.5?-1:1),grow:1});}
    if((e.next.spark-=dt)<=0){e.next.spark=.05;const a=Math.random()*Math.PI*2,r=rnd(120,220),from=e.c.clone().add(new THREE.Vector3(Math.cos(a)*r,rnd(-40,60),Math.sin(a)*r)),life=rnd(.5,.8);
      emit({key:Math.random()<.7?'ember':'sparks',cellIndex:3,at:from,vel:e.c.clone().sub(from).divideScalar(life),size:[rnd(10,22),3],life,fade:[.2,.2],additive:true,color:0xc8a8ff,opacity:k});}
  }
  function implode(at){emit({key:'glow',at:at.clone(),size:[260,10],life:.3,fade:[.02,.6],additive:true,color:0xc0a0ff});emit({key:'rring',at:at.clone(),size:[10,260],life:.45,fade:[.02,.8],additive:true,color:0xb090ff});}
  function qed(at){
    emit({key:'glow',at:at.clone(),size:[40,240],life:.4,fade:[.03,.8],additive:true,color:0x9fd6ff});
    for(let i=0;i<3;i++)emit({key:'rring',at:at.clone(),size:[10,180+i*60],life:.5+i*.12,fade:[.02,.8],additive:true,color:0x8fc8ff,opacity:.9});
    for(let i=0;i<10;i++)emit({key:'sparks',at:at.clone().add(jitter(10)),vel:jitter(260),size:[30,90],life:rnd(.4,.8),fade:[.02,.7],additive:true,color:0xa8dcff});
  }
  function muzzle(at){emit({key:'glow',at:at.clone(),size:[10,26],life:.06,fade:[.01,.7],additive:true,color:0xffd28a});}
  function burn(at){emit({key:'fire',at:at.clone().add(jitter(8)),vel:up.clone().multiplyScalar(40),size:[10,30],life:.4,fade:[.1,.6],additive:true,opacity:.8});}
  host.on('update',dt=>{if(!dt)return;for(let i=emitters.length-1;i>=0;i--){gershTick(emitters[i],dt);if(emitters[i].t>=emitters[i].life)emitters.splice(i,1);}});
  host.on('reset',()=>{emitters.length=0;});

  const near=(c,r,g,b)=>{const h=typeof c==='number'?c:new THREE.Color(c).getHex(THREE.SRGBColorSpace);return Math.abs((h>>16&255)/255-r)+Math.abs((h>>8&255)/255-g)+Math.abs((h&255)/255-b)<.25;};
  host.on('effect',e=>{
    const {position:at,color,count}=e;if(!at)return;
    if(near(color,1,.7,.3)&&count>=12){explosion(at,Math.min(1.4,.55+count/40));e.handled=true;}     // grenades, launchers, Gersh-less blasts
    else if(near(color,.58,.93,.38)||near(color,.55,.96,.4)){count>=12?explosion(at,.7,0x7dff6a):energy(at,0x8dff6a);e.handled=true;}   // Ray Gun
    else if(color===0x9e3023||near(color,.62,.19,.14)||near(color,.43,.04,.03)){bloodHit(at,count>8?1.8:1);e.handled=true;}
    else if(near(color,.72,.64,.53)&&count<=4){dust(at);e.handled=true;}
  });
  // ---- lightning (BO1 fxt_env_* textures): teleports and hellhound spawns ---------------------
  // Bolts are tall billboards that only turn about the vertical axis, flickering through the
  // atlas cells; a lighting-pool source flashes with them (adding THREE lights recompiles shaders).
  const boltTex={ground:[ 'fxt_env_lighting_bolt_ground.png',4,2],arc:['fxt_env_electric_arc1.png',4,1],trail:['fxt_env_lightning_trail.png',1,1]};
  for(const [k,[f]] of Object.entries(boltTex))load('b_'+k,f);
  const bolts=[],boltFree=[],flashes=[],boltGeo=new THREE.PlaneGeometry(1,1).translate(0,.5,0);
  function bolt(kind,at,{height=300,width=90,life=.45,color=0x9fc4ff,yaw=null,tilt=0}={}){
    const [,c,r]=boltTex[kind];let m=boltFree.pop();
    if(!m){m=new THREE.Mesh(boltGeo,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));m.frustumCulled=false;m.renderOrder=6;}
    const mat=m.material;if(mat.userData.kind!==kind){mat.map=tex['b_'+kind].clone();mat.map.repeat.set(1/c,1/r);mat.userData.kind=kind;}
    mat.color.set(color);m.position.copy(at);m.scale.set(width,height,1);m.rotation.set(0,0,tilt);m.visible=true;scene.add(m);
    bolts.push({m,t:0,life,c,r,yaw,next:0});
  }
  function flash(at,{color=0x8fb4ff,intensity=6,radius=600,life=.5}={}){
    const src={position:at.clone(),color:new THREE.Color(color),intensity,radius,kind:'solid',dynamic:true,cap:2000,weight:1};
    const pool=window.kino.lighting?.sources;if(!pool)return;pool.push(src);flashes.push({src,t:0,life});
  }
  host.on('update',dt=>{
    if(!dt)return;
    for(let i=bolts.length-1;i>=0;i--){const b=bolts[i];b.t+=dt;
      if(b.t>=b.life){b.m.visible=false;b.m.removeFromParent();boltFree.push(b.m);bolts.splice(i,1);continue;}
      if(b.t>=b.next){b.next=b.t+rnd(.03,.07);const cell=Math.floor(Math.random()*b.c*b.r);b.m.material.map.offset.set((cell%b.c)/b.c,1-(Math.floor(cell/b.c)+1)/b.r);
        b.m.material.opacity=rnd(.55,1)*(1-b.t/b.life)**.5;b.m.scale.x=Math.abs(b.m.scale.x)*(Math.random()<.5?-1:1);}
      b.m.rotation.y=b.yaw??Math.atan2(camera.position.x-b.m.position.x,camera.position.z-b.m.position.z);
    }
    for(let i=flashes.length-1;i>=0;i--){const f=flashes[i];f.t+=dt;const k=f.t/f.life;
      f.src.weight=k>=1?0:(1-k)*(Math.random()*.5+.5);
      if(k>=1){const pool=window.kino.lighting?.sources,j=pool?.indexOf(f.src)??-1;if(j>=0)pool.splice(j,1);flashes.splice(i,1);}}
  });
  // A lightning strike from above onto a point (hellhound spawn).
  function strike(at,{scale=1,color=0xa9c8ff}={}){
    const S=scale,g=at.clone();
    bolt('ground',g,{height:420*S,width:150*S,life:.5,color});bolt('ground',g,{height:380*S,width:120*S,life:.35,color:0xffffff});
    emit({key:'glow',at:g.clone().addScaledVector(up,12),size:[40*S,220*S],life:.4,fade:[.02,.8],additive:true,color});
    for(let i=0;i<3;i++)emit({key:'sparks',at:g.clone().addScaledVector(up,8),size:[30*S,110*S],life:rnd(.25,.4),fade:[.02,.7],additive:true,color:0xcfe0ff,spin:rnd(-3,3)});
    for(let i=0;i<5;i++)emit({key:'smoke',at:g.clone().add(new THREE.Vector3(rnd(-25,25),4,rnd(-25,25))),vel:new THREE.Vector3(rnd(-90,90),rnd(20,50),rnd(-90,90)),size:[30*S,130*S],life:rnd(1.2,1.8),fade:[.1,.7],opacity:.45,color:0x5a5a66,drag:1.5});
    flash(g.clone().addScaledVector(up,60),{color,intensity:7,radius:700,life:.55});
  }
  // Teleport: arcs crawl over the pad you leave, bolts flicker where you land, and the screen
  // fills with BO1's electric-shock overlay.
  function teleportFx(from,to){
    for(const [p,n] of [[from,3],[to,2]])for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,off=new THREE.Vector3(Math.cos(a)*rnd(10,35),0,Math.sin(a)*rnd(10,35));
      bolt('ground',p.clone().add(off),{height:rnd(140,200),width:rnd(50,80),life:rnd(.35,.6)});bolt('arc',p.clone().add(off).addScaledVector(up,rnd(10,60)),{height:rnd(40,70),width:rnd(90,140),life:rnd(.3,.5),color:0xb8c8ff});}
    for(const p of [from,to])flash(p.clone().addScaledVector(up,50),{intensity:2.5,radius:450,life:.6});
    shock();
  }
  const overlay=document.createElement('div');overlay.id='fx-shock';document.body.append(overlay);
  const oStyle=document.createElement('style');oStyle.textContent=`#fx-shock{position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;mix-blend-mode:screen;background:url(${new URL('textures/fullscreen_electric_shock.png',document.baseURI).href}) 0 0/400% 400%}`;document.head.append(oStyle);
  let shockT=0,shockOn=false;
  function shock(){shockT=0;shockOn=true;}
  host.on('update',dt=>{if(!shockOn)return;shockT+=dt;const k=shockT/.9;if(k>=1){shockOn=false;overlay.style.opacity=0;return;}
    const f=Math.floor(shockT*20)%16;overlay.style.backgroundPosition=`${(f%4)*33.333}% ${Math.floor(f/4)*33.333}%`;overlay.style.opacity=((1-k)*.85).toFixed(3);});
  // Hooks: a sudden jump in the player's position is a teleport (the theater, custom-map
  // teleporters); a hellhound that wasn't there last frame has just spawned.
  {let last=null;const seen=new WeakSet();
    host.on('update',()=>{
      const feet=api.player?.getFeetPosition?.();if(feet){if(last&&feet.distanceTo(last)>300)teleportFx(last.clone(),feet.clone());last=feet.clone();}
      for(const z of api.enemies?.list??[])if(!seen.has(z)){seen.add(z);if(z.kind==='dog')strike(z.root.position.clone());}
    });
    host.on('reset',()=>{last=null;});}

  (window.kino??={}).fx={strike:(p,o)=>strike(new THREE.Vector3(...p),o),teleport:(a,b)=>teleportFx(new THREE.Vector3(...a),new THREE.Vector3(...b)),muzzle,burn,thunder,knockback,gersh,implode,qed,explosion:(p,s)=>explosion(new THREE.Vector3(...p),s),blood:(p,a)=>bloodHit(new THREE.Vector3(...p),a),live:()=>live.length};
}
