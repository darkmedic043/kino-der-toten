// The Ragnarok DG-4 (BO3, Der Eisendrache's "gravityspikes" craftable), as an operator weapon. In first person it's
// BO3's own talon spikes on Dempsey's arms with their vm_talon_spike_* clips (raise, idle, sprint, slam in/out, plant),
// in a ViewWeapon of its own; planted, the wpn_zmb_dlc1_talon_spikes_prop model (both built by
// .tools/build_bo3_weapons.py into mods/bo3-weapons, git-ignored). Without those files: procedural stand-in spikes.
// Behaviour after BO3's:
//   - left mouse: slam both spikes into the ground. Zombies within 200 die, those out to twice that are thrown back
//     and stagger; slamming on the way down from a jump reaches 300. Costs 12% power.
//   - right mouse: plant the spikes where you stand. A gravity field (radius 220) lifts every zombie that walks in and
//     holds it in the air; picking the spikes up again (either button) or running out of power slams them all down
//     dead. Planted, it drains 10% a second.
//   - held, the power drains 2.5% a second (40 s).
// The Panzersoldat isn't lifted, but a slam kills it like any zombie (user, 2026-10-24: operator weapons deal infinite damage). Kills are the player's (points as usual), cause 'operator'.
import { ViewWeapon, loadModel } from '../../animation.js';
import { disposeSkeletons } from '../../runtime-assets.js';

export function setupRagnarok(api,operator){
  const {scene,viewScene,enemies,player,camera,audio,session,data}=api;
  // the BO3 model's def (mods/bo3-weapons/weapons.json `operator.ragnarok`), its models warmed into the loader cache
  let REAL=null;
  fetch(new URL('../bo3-weapons/weapons.json',import.meta.url)).then(r=>r.ok?r.json():null).then(j=>{
    REAL=j?.operator?.ragnarok??null;if(REAL)for(const u of [REAL.model,REAL.prop,REAL.handsModel])loadModel(u).catch(()=>{});
  }).catch(()=>{});
  // the canisters: BO3 draws their 115 fill (blob_115_bubbles, a blank white colour slot) with an effect shader and the
  // glass over it see-through; here the fill glows 115 blue and the glass is tinted and translucent
  const styled=new WeakSet();
  function style115(root){root.traverse(o=>{for(const m of [o.material].flat()){if(!m||styled.has(m))continue;
    if(/blob_115/.test(m.name)){m.color?.set(0x0a2a3a);m.emissive?.set(0x3fc8ff);m.emissiveIntensity=2.2;m.transparent=true;m.opacity=.9;styled.add(m);}
    else if(/talon_spikes_glass/.test(m.name)){m.transparent=true;m.opacity=.35;m.depthWrite=false;m.color?.multiplyScalar(.8);styled.add(m);}}});}
  const KILL=200,KILL_AIR=300,FIELD=220;
  operator.register({id:'ragnarok',name:'Ragnarok DG-4',short:'RAGNAROK',color:'#5fb8ff',kills:60,drain:.025,
    icon:'M6 2l3 13M18 2l-3 13M6 15h6M12 15h6M9 15v6M15 15v6',activate});

  function activate(ctx){
    const THREE=ctx.THREE,up=new THREE.Vector3(0,1,0);
    const metal=new THREE.MeshStandardMaterial({color:0x3b4048,metalness:.85,roughness:.35});
    const glow=new THREE.MeshBasicMaterial({color:0x7fd0ff});
    function spike(){
      const g=new THREE.Group();
      const blade=new THREE.Mesh(new THREE.ConeGeometry(2.4,30,4),metal);blade.rotation.x=-Math.PI/2;blade.position.z=-17;g.add(blade);
      const rune=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,20),glow);rune.position.set(0,1.1,-14);g.add(rune);
      const guard=new THREE.Mesh(new THREE.BoxGeometry(9,1.6,2.2),metal);guard.position.z=-1.5;g.add(guard);
      const grip=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,8,8),metal);grip.rotation.x=Math.PI/2;grip.position.z=3;g.add(grip);
      return g;
    }
    // ---- first person: one spike in each fist
    const held=new THREE.Group(),L=spike(),Rt=spike();L.position.set(-9,0,0);Rt.position.set(9,0,0);L.rotation.set(.32,.1,.25);Rt.rotation.set(.32,-.1,-.25);held.add(L,Rt);   // blades forward and up, fists low at the sides
    const REST=new THREE.Vector3(0,-11,-14);held.position.copy(REST).add(new THREE.Vector3(0,-30,0));viewScene?.add(held);
    // the real one: its own ViewWeapon (the engine's stays hidden while an operator weapon is out)
    const def=REAL;let vw=null,ended=false;
    if(def&&viewScene){
      held.visible=false;vw=new ViewWeapon(viewScene,data,()=>{});
      vw.equip(def).then(()=>{if(ended){dropView();return;}style115(vw.root);if(planted)vw.pivot.visible=false;}).catch(e=>{console.warn('[ragnarok] model',e);dropView();held.visible=!planted;});
    }
    function dropView(){if(!vw)return;vw.pivot.removeFromParent();if(vw.root)disposeSkeletons(vw.root);vw=null;}
    const real=()=>vw?.ready;
    const play=(key,mode='fire')=>{if(!real()||!vw.rig.actions[key])return false;vw.mode=mode;vw.rig.play(key,false,1,.04);return true;};
    const lastCam=camera.position.clone();
    let t=0,slam=null,planted=null,planting=0;
    audio.play('buy',.5);

    // ---- slam
    function fire(down){
      if(!down)return;
      if(planted){pickUp();return;}
      if(slam||planting)return;
      // BO3's slam: slam_in drives the spikes down (the hit lands as it ends), slam_out pulls them back up
      const d=def?.durations??{};slam={t:0,hit:false,air:!player.grounded,real:play('slamInAnim'),hitAt:Math.min(.55,(d.slamInAnim??.6)*.9),inEnd:d.slamInAnim??.6,outEnd:(d.slamInAnim??.6)+(d.slamOutAnim??.7)};
    }
    function aim(down){
      if(!down||slam||planting)return;
      if(planted){pickUp();return;}
      if(play('plantAnim'))planting=Math.min(.6,(def.durations?.plantAnim??.67)*.85);else plant();   // the spikes leave the hands near the clip's end
    }
    function impact(air){
      const at=player.getFeetPosition(),r=air?KILL_AIR:KILL;
      shock(at,r*1.4);ctx.drain(.12);audio.play('explosion',.8);
      for(const z of [...enemies.list]){
        const p=z.root.position,d=Math.hypot(p.x-at.x,p.z-at.z);if(Math.abs(p.y-at.y)>140||d>r*2)continue;
        if(z.kind==='panzer'){if(d<r)enemies.hurt(z,1e9,false,false,'operator');continue;}
        if(d<r){enemies.hurt(z,1e9,false,false,'operator');continue;}
        const away=new THREE.Vector3(p.x-at.x,0,p.z-at.z).normalize().multiplyScalar(60*(1-d/(r*2)));thrown.push({z,v:away,t:.35});   // thrown back, out of their stride
      }
    }
    const thrown=[];

    // ---- plant: the gravity field
    function plant(){
      const f=camera.getWorldDirection(new THREE.Vector3());f.y=0;f.normalize();
      const at=player.getFeetPosition().addScaledVector(f,60);
      const g=new THREE.Group();g.position.copy(at);
      if(def?.prop){   // BO3's planted pair: sized to its 30 in (the GLB is in BO3's centimetres) and driven a little into the floor
        g.rotation.y=Math.atan2(f.x,f.z);
        loadModel(def.prop).then(m=>{if(!m||planted?.g!==g){if(m)disposeSkeletons(m);return;}
          const b=new THREE.Box3().setFromObject(m),h=b.max.y-b.min.y;if(h>50)m.scale.setScalar(1/2.54);
          const b2=new THREE.Box3().setFromObject(m);m.position.y=-b2.min.y-6;m.traverse(o=>{o.frustumCulled=false;});style115(m);g.add(m);planted.prop=m;}).catch(()=>{});
      }else{
        const s1=spike(),s2=spike();for(const [s,x] of [[s1,-16],[s2,16]]){s.rotation.x=-Math.PI/2;s.position.set(x,22,0);s.scale.setScalar(1.3);g.add(s);}   // driven point-first into the floor, grips up
      }
      // the field: a ring on the floor and a low wall of light streaks that fades upward (a solid cylinder washed the
      // whole view blue from inside)
      const fieldMat=new THREE.MeshBasicMaterial({color:0x5fb8ff,map:fieldTex(),transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
      const col=new THREE.Mesh(new THREE.CylinderGeometry(FIELD,FIELD,110,48,1,true),fieldMat);col.position.y=55;g.add(col);
      const ring=new THREE.Mesh(new THREE.RingGeometry(FIELD-6,FIELD,64),new THREE.MeshBasicMaterial({color:0x5fb8ff,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=2;g.add(ring);
      const light=glowAt(at.clone().add(up.clone().multiplyScalar(60)),0x5fb8ff,3,FIELD*2.2);
      scene.add(g);held.visible=false;if(vw)vw.pivot.visible=false;audio.play('buy',.6);
      planted={g,col,ring,at,light,lifted:new Map(),t:0};
    }
    function lift(z){
      const prev=z.ai,base=z.root.position.clone(),spin=(Math.random()-.5)*2;let k=0;
      z.ai=dt=>{k+=dt;z.root.position.set(base.x,base.y+Math.min(1,k/.6)*55+Math.sin(k*3)*4,base.z);z.root.rotation.y+=spin*dt;};
      planted.lifted.set(z,{prev,base});
    }
    function pickUp(){
      const p=planted;if(!p)return;planted=null;
      shock(p.at,FIELD);audio.play('explosion',.7);
      for(const [z,{prev,base}] of p.lifted){
        z.ai=prev;if(!enemies.list.includes(z))continue;
        z.root.position.copy(base);enemies.hurt(z,1e9,false,false,'operator');
      }
      if(p.prop){p.prop.removeFromParent();disposeSkeletons(p.prop);}   // the loader's shared materials stay
      unglow(p.light);p.g.removeFromParent();p.g.traverse(o=>{o.geometry?.dispose();if(o.material&&o.material!==metal&&o.material!==glow){o.material.map?.dispose();o.material.dispose();}});
      if(vw){vw.pivot.visible=true;play('raiseAnim','raise');}else{held.visible=true;held.position.copy(REST).add(new THREE.Vector3(0,-20,0));}
    }

    // streaks for the field's wall: vertical lines rising (offset scrolls), fading toward the top
    function fieldTex(){
      const c=document.createElement('canvas');c.width=128;c.height=64;const x=c.getContext('2d');
      for(let i=0;i<40;i++){const px=Math.random()*128,h=10+Math.random()*30,py=Math.random()*64;x.fillStyle=`rgba(255,255,255,${.3+Math.random()*.5})`;x.fillRect(px,py,1+Math.random()*1.5,h);x.fillRect(px,py-64,1+Math.random()*1.5,h);}
      const fade=x.createLinearGradient(0,0,0,64);fade.addColorStop(0,'rgba(0,0,0,1)');fade.addColorStop(1,'rgba(0,0,0,0)');x.globalCompositeOperation='destination-out';x.fillStyle=fade;x.fillRect(0,0,128,64);
      const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(6,1);return t;
    }
    // ---- effects: a blue shockwave across the floor. Light comes from the lighting mod's pool of sources (adding a
    // THREE light recompiles every shader), as the fx mod's flashes do.
    function glowAt(position,color,intensity,radius){const pool=window.kino.lighting?.sources;if(!pool)return null;const src={position,color:new THREE.Color(color),intensity,radius,kind:'solid',dynamic:true,cap:2000,weight:1};pool.push(src);return src;}
    function unglow(src){const pool=window.kino.lighting?.sources,j=src?pool?.indexOf(src)??-1:-1;if(j>=0)pool.splice(j,1);}
    const fx=[];
    function shock(at,r){
      const m=new THREE.Mesh(new THREE.RingGeometry(.8,1,64),new THREE.MeshBasicMaterial({color:0x8fd6ff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
      m.rotation.x=-Math.PI/2;m.position.copy(at).add(new THREE.Vector3(0,3,0));scene.add(m);
      const l=glowAt(at.clone().add(new THREE.Vector3(0,50,0)),0x7fc8ff,3.5,r*2);
      fx.push({m,l,r,t:0});
    }

    function update(dt){
      t+=dt;
      // held spikes: raise in, idle sway, the slam's wind-up and strike
      const rest=REST.clone().add(new THREE.Vector3(0,Math.sin(t*2)*.4,0));
      held.position.lerp(rest,Math.min(1,dt*10));
      if(vw?.ready){
        const moved=camera.position.distanceTo(lastCam)/Math.max(dt,1e-3);lastCam.copy(camera.position);
        const sprint=!!api.view?.input?.sprint&&!slam&&!planting;
        vw.update(dt,{moving:moved>20,sprint,ads:false,time:session.time});
        if(slam?.real&&slam.t>=slam.inEnd&&vw.rig.current==='slamInAnim')play('slamOutAnim');
      }
      if(planting){planting=Math.max(0,planting-dt);if(!planting)plant();}
      if(slam?.real){
        slam.t+=dt;if(slam.t>=slam.hitAt&&!slam.hit){slam.hit=true;impact(slam.air||!player.grounded);}
        if(slam.t>=slam.outEnd)slam=null;
      }else if(slam){
        slam.t+=dt;const s=slam.t;
        if(s<.16){held.position.y=REST.y+s/.16*9;held.rotation.x=s/.16*.7;}
        else if(s<.3){const k=(s-.16)/.14;held.position.y=REST.y+9-k*19;held.rotation.x=.7-k*1.6;}
        else held.rotation.x+=(0-held.rotation.x)*Math.min(1,dt*8);
        if(s>=.3&&!slam.hit){slam.hit=true;impact(slam.air||!player.grounded);}
        if(s>.6)slam=null;
      }else held.rotation.x*=Math.max(0,1-dt*8);
      for(let i=thrown.length-1;i>=0;i--){const o=thrown[i];o.t-=dt;if(!enemies.list.includes(o.z)||o.t<=0){thrown.splice(i,1);continue;}o.z.root.position.addScaledVector(o.v,dt/.35);o.z.stuck=0;}
      if(planted){
        const p=planted;p.t+=dt;ctx.drain(.1*dt);
        p.col.rotation.y+=dt*.8;p.col.material.map.offset.y=(p.t*.6)%1;p.col.material.opacity=.3+Math.sin(p.t*5)*.06;
        for(const z of enemies.list){if(p.lifted.has(z)||z.kind==='panzer'||z.boss||z.state==='rising')continue;const q=z.root.position;if(Math.hypot(q.x-p.at.x,q.z-p.at.z)<FIELD&&Math.abs(q.y-p.at.y)<120)lift(z);}
        for(const z of [...p.lifted.keys()])if(!enemies.list.includes(z)){z.ai=p.lifted.get(z).prev;p.lifted.delete(z);}
      }
      for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.t+=dt;const k=f.t/.45;f.m.scale.setScalar(Math.max(1,f.r*Math.min(1,k*1.3)));f.m.material.opacity=Math.max(0,.9*(1-k));if(f.l)f.l.weight=Math.max(0,1-k*2);
        if(k>=1){f.m.removeFromParent();f.m.geometry.dispose();f.m.material.dispose();unglow(f.l);fx.splice(i,1);}}
    }
    function end(){
      ended=true;dropView();
      if(planted)pickUp();
      held.removeFromParent();held.traverse(o=>o.geometry?.dispose());
      // the shockwaves finish on their own
      const left=fx.splice(0);if(left.length){let k=0;const tick=()=>{k+=1/60;for(const f of left){f.m.material.opacity=Math.max(0,f.m.material.opacity-.05);if(f.l)f.l.weight*=.8;}if(k<.5)requestAnimationFrame(tick);else for(const f of left){f.m.removeFromParent();f.m.geometry.dispose();f.m.material.dispose();unglow(f.l);}};tick();}
      metal.dispose();glow.dispose();
    }
    return {update,fire,aim,end,
      get planted(){return !!planted;},get plantedAt(){return planted?.at?.clone()??null;},get lifted(){return planted?planted.lifted.size:0;}};
  }
}
