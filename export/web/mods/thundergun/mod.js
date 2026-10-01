// Thundergun: the exported model lost its see-through materials, so the glass
// tubes and wire mesh rendered as flat solid surfaces. This
// restores them (and makes the energy chambers glow and scroll), then adds a
// visible shockwave to each shot and throws the zombies it kills.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';

export default async function setup(api){
  const {host,data,scene,camera,audio,world,mysteryBox}=api;
  const def=data.weapons.thundergun_zm;if(!def)return;

  // --- Materials -----------------------------------------------------------
  const energy=[];
  // Only the wire-mesh grille is a real cut-out. The body texture's alpha is a
  // mask for something else (the dashed ammo ring, ribbed strips), not holes.
  const CUTOUT=/thundergun_mesh$/;
  function patch(root){
    root?.traverse(n=>{for(const m of [n.material].flat()){if(!m||m.userData.thundergun)continue;m.userData.thundergun=true;
      const name=m.name.replace(/^mc\//,'');
      if(/chamber_main$/.test(name)&&m.map){
        m.map=m.map.clone();m.map.wrapS=m.map.wrapT=THREE.RepeatWrapping;m.map.needsUpdate=true;
        m.emissive=new THREE.Color(1,.62,.28);m.emissiveMap=m.map;m.emissiveIntensity=1.6;
        m.transparent=true;m.depthWrite=false;m.blending=THREE.AdditiveBlending;energy.push(m);
      }else if(/chamber_glass$|acog_lens$/.test(name)){m.transparent=true;m.depthWrite=false;m.roughness=.15;n.renderOrder=2;}
      else if(CUTOUT.test(name))m.alphaTest=.5;
      m.needsUpdate=true;}});
  }
  // Materials are shared by every copy of a loaded model, so patching one copy
  // of each file fixes the viewmodel, the box display and third-person holds.
  const files=new Set([def.model,def.worldModel,def.upgrade?.model,def.upgrade?.worldModel].filter(Boolean));
  await Promise.all([...files].map(async url=>patch(await loadModel(url))));
  patch(mysteryBox?.models?.thundergun_zm);

  // --- Shockwave -----------------------------------------------------------
  const canvasTexture=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
  // Wind streaks that fade toward the open end of the cone.
  const streaks=canvasTexture(128,256,(g,w,h)=>{
    for(let i=0;i<70;i++){const x=Math.random()*w,len=40+Math.random()*140,y=Math.random()*(h-len),a=.25+Math.random()*.6;
      const grad=g.createLinearGradient(0,y,0,y+len);grad.addColorStop(0,'rgba(255,255,255,0)');grad.addColorStop(.5,`rgba(255,255,255,${a})`);grad.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=grad;g.fillRect(x,y,1+Math.random()*2.5,len);}
    g.globalCompositeOperation='destination-in';const fade=g.createLinearGradient(0,0,0,h);fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(.35,'rgba(0,0,0,1)');fade.addColorStop(1,'rgba(0,0,0,.25)');g.fillStyle=fade;g.fillRect(0,0,w,h);
  });
  streaks.wrapS=streaks.wrapT=THREE.RepeatWrapping;
  const glow=canvasTexture(64,64,(g,w)=>{const r=g.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.3,'rgba(200,230,255,.6)');r.addColorStop(1,'rgba(160,200,255,0)');g.fillStyle=r;g.fillRect(0,0,w,w);});
  const coneGeometry=new THREE.ConeGeometry(1,1,40,1,true).translate(0,-.5,0).rotateX(-Math.PI/2);   // apex at the origin, opening along +Z
  const ringGeometry=new THREE.RingGeometry(.82,1,56);
  const additive=o=>({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,...o});
  const RANGE=600,SPREAD=.84,LIFE=.42;   // the kill cone is 600 units at ~49 degrees
  const blasts=[];
  const dustGeometry=()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(48*3),3));return g;};

  function blast(upgraded){
    const forward=camera.getWorldDirection(new THREE.Vector3()),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion),right=new THREE.Vector3().crossVectors(forward,up);
    const origin=camera.position.clone().addScaledVector(forward,34).addScaledVector(up,-9).addScaledVector(right,7),aim=origin.clone().add(forward);
    const tint=upgraded?0xffd9a0:0xcfe6ff,group=new THREE.Group();group.position.copy(origin);group.lookAt(aim);
    const coneMaterial=new THREE.MeshBasicMaterial(additive({color:tint,map:streaks.clone(),opacity:window.kino?.fx?.thunder?.35:.55}));coneMaterial.map.needsUpdate=true;
    const cone=new THREE.Mesh(coneGeometry,coneMaterial);group.add(cone);
    // BO1's smoky shockwave rings and smoke cloud come from the fx mod; flat rings are the fallback
    const fx=window.kino?.fx?.thunder;if(fx)fx(origin,forward,upgraded);
    const rings=fx?[]:[0,.06,.12].map(delay=>{const m=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial(additive({color:tint,opacity:.6})));group.add(m);return {mesh:m,delay};});
    const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:tint,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));group.add(flash);
    const dustGeo=dustGeometry(),dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xd8d0c0,size:3,map:glow,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.8}));group.add(dust);
    const motes=Array.from({length:48},()=>{const a=Math.random()*Math.PI*2,s=Math.sqrt(Math.random())*SPREAD;return {dir:new THREE.Vector3(Math.cos(a)*s,Math.sin(a)*s,1).normalize(),speed:900+Math.random()*900,d:Math.random()*20};});
    scene.add(group);blasts.push({group,cone,rings,flash,dust,motes,t:0});
    for(const m of energy)m.emissiveIntensity=6;
    screenFlash(upgraded);
    camera.rotation.x=Math.min(1.48,camera.rotation.x+.035);
  }
  function updateBlasts(dt){
    for(const b of [...blasts]){
      b.t+=dt;const u=Math.min(1,b.t/LIFE),reach=RANGE*(1-(1-u)**3);
      b.cone.scale.set(reach*SPREAD,reach*SPREAD,reach);b.cone.material.opacity=(window.kino?.fx?.thunder?.35:.55)*(1-u)**1.5;b.cone.material.map.offset.y-=dt*3.5;
      for(const r of b.rings){const v=THREE.MathUtils.clamp((b.t-r.delay)/(LIFE-r.delay),0,1),d=RANGE*(1-(1-v)**2.4);
        r.mesh.position.z=d;r.mesh.scale.setScalar(Math.max(.01,d*SPREAD*.92));r.mesh.material.opacity=v>0?.6*(1-v)**1.3:0;}
      b.flash.scale.setScalar(Math.max(0,70*(1-b.t/.14)));
      const pos=b.dust.geometry.attributes.position;b.motes.forEach((m,i)=>{m.d+=m.speed*dt;m.speed*=Math.exp(-dt*4);pos.setXYZ(i,m.dir.x*m.d,m.dir.y*m.d,m.dir.z*m.d);});pos.needsUpdate=true;b.dust.material.opacity=.8*(1-u);
      if(u>=1){b.group.removeFromParent();b.cone.material.map.dispose();b.cone.material.dispose();b.rings.forEach(r=>r.mesh.material.dispose());b.flash.material.dispose();b.dust.geometry.dispose();b.dust.material.dispose();blasts.splice(blasts.indexOf(b),1);}
    }
  }
  // A quick pale-blue pressure flash over the screen.
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;background:radial-gradient(ellipse at 55% 60%,rgba(200,230,255,.55),rgba(160,200,255,.15) 45%,rgba(0,0,0,0) 75%);mix-blend-mode:screen;';
  document.body.append(overlay);
  function screenFlash(upgraded){
    overlay.style.filter=upgraded?'hue-rotate(185deg)':'';
    overlay.style.transition='none';overlay.style.opacity='1';overlay.getBoundingClientRect();
    overlay.style.transition='opacity .35s ease-out';overlay.style.opacity='0';
  }
  // The game plays the shot sound once per trigger pull, so it marks each blast.
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,d,...rest)=>{if(kind==='shot'&&(d?.baseId??d?.id)==='thundergun_zm')blast(!!d.upgraded);return weaponSound(kind,d,...rest);};

  // --- Thrown zombies ------------------------------------------------------
  const flying=[];
  host.on('beforeEnemyDamage',e=>{if(e.cause==='thunder'&&!host.remoteDamage&&e.enemy)e.enemy.thunderFling=true;});
  host.on('kill',e=>{
    const z=e.enemy;if(!z?.thunderFling||!z.root)return;z.thunderFling=false;
    const away=z.root.position.clone().sub(camera.position);away.y=0;const distance=away.length();if(distance<1)away.set(0,0,1);away.normalize();
    const power=1-Math.min(1,distance/RANGE);z.life=Math.max(z.life??0,4.5);
    flying.push({z,v:away.clone().multiplyScalar(650+950*power).setY(320+320*power),axis:new THREE.Vector3(away.z,0,-away.x),base:z.root.quaternion.clone(),tilt:0,spin:2.4+Math.random()*2.2,t:0});
  });
  const ray=new THREE.Ray(),down=new THREE.Vector3(0,-1,0),q=new THREE.Quaternion();
  function updateFlying(dt){
    for(const f of [...flying]){
      const p=f.z.root.position;f.t+=dt;
      if(!f.z.root.parent||f.t>2.5){flying.splice(flying.indexOf(f),1);continue;}
      const step=new THREE.Vector3(f.v.x,0,f.v.z).multiplyScalar(dt),len=step.length();
      if(len>0){ray.origin.copy(p).y+=30;ray.direction.copy(step).normalize();if(world.raycast(ray,0,len+14)){f.v.x*=-.15;f.v.z*=-.15;}else p.add(step);}
      f.v.y-=1400*dt;p.y+=f.v.y*dt;
      if(f.v.y<0){ray.origin.copy(p).y+=40;ray.direction.copy(down);const ground=world.raycast(ray,0,45);
        if(ground){p.y=ground.position.y;flying.splice(flying.indexOf(f),1);window.kino?.fx?.knockback?.(p.clone());}}
      f.tilt=Math.min(1.35,f.tilt+f.spin*dt);
      f.z.root.quaternion.copy(q.setFromAxisAngle(f.axis,f.tilt)).multiply(f.base);
    }
  }

  host.on('update',dt=>{
    updateBlasts(dt);updateFlying(dt);
    const t=performance.now()/1000;
    for(const m of energy){m.map.offset.y=(t*.35)%1;m.emissiveIntensity+=(1.6+Math.sin(t*9)*.25-m.emissiveIntensity)*Math.min(1,dt*5);}
  });
  host.on('reset',()=>{for(const b of blasts)b.t=LIFE;updateBlasts(0);flying.length=0;reloadCues.length=0;});

  // --- Reload sounds -------------------------------------------------------
  // The reload animation names its lock cue "cell_lock", but the sound is
  // "cell_slide_lock"; and the canister eject and the charging beep (cell_on)
  // have no cue at all. Map the one and time the other two to the reload.
  for(const d of [def,def.upgrade].filter(Boolean)){d.notetrackSounds={...d.notetrackSounds,'sndnt#fly_thundergun_cell_lock':'fly_thundergun_cell_slide_lock'};}
  const CUE='resident/wpn/energy/thundergun/reload/plr/';
  const reloadCues=[];let lastSerial=api.session.reloadSerial;
  host.on('update',dt=>{
    const s=api.session,held=(s.def?.baseId??s.def?.id)==='thundergun_zm';
    if(s.reloadSerial!==lastSerial){lastSerial=s.reloadSerial;
      if(held&&s.reloadLeft>0){const len=s.reloadLeft;reloadCues.length=0;reloadCues.push({at:len*.06,key:'fly_thundergun_eject'},{at:len*.76,key:'fly_thundergun_cell_on'});}}
    if(!reloadCues.length)return;
    if(!held){reloadCues.length=0;return;}   // switched weapons mid-reload
    for(const c of reloadCues)c.at-=dt;
    while(reloadCues.length&&reloadCues[0].at<=0)audio.play(CUE+reloadCues.shift().key,.8);
  });
}
