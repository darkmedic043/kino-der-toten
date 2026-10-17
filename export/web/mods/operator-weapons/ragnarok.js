// The Ragnarok DG-4 (BO3, Der Eisendrache's "gravityspikes" craftable), as an operator weapon. Stand-in visuals (two
// procedural spikes) until its model and animations are exported from BO3; the behaviour follows BO3's:
//   - left mouse: slam both spikes into the ground. Zombies within 200 die, those out to twice that are thrown back
//     and stagger; slamming on the way down from a jump reaches 300. Costs 12% power.
//   - right mouse: plant the spikes where you stand. A gravity field (radius 220) lifts every zombie that walks in and
//     holds it in the air; picking the spikes up again (either button) or running out of power slams them all down
//     dead. Planted, it drains 10% a second.
//   - held, the power drains 2.5% a second (40 s).
// The Panzersoldat isn't lifted: a slam does it 1500 damage. Kills are the player's (points as usual), cause 'operator'.
export function setupRagnarok(api,operator){
  const {scene,viewScene,enemies,player,camera,audio,session}=api;
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
    let t=0,slam=null,planted=null;
    audio.play('buy',.5);

    // ---- slam
    function fire(down){
      if(!down)return;
      if(planted){pickUp();return;}
      if(slam)return;
      slam={t:0,hit:false,air:!player.grounded};
    }
    function aim(down){
      if(!down||slam)return;
      if(planted){pickUp();return;}
      plant();
    }
    function impact(air){
      const at=player.getFeetPosition(),r=air?KILL_AIR:KILL;
      shock(at,r*1.4);ctx.drain(.12);audio.play('explosion',.8);
      for(const z of [...enemies.list]){
        const p=z.root.position,d=Math.hypot(p.x-at.x,p.z-at.z);if(Math.abs(p.y-at.y)>140||d>r*2)continue;
        if(z.kind==='panzer'){if(d<r)enemies.hurt(z,1500,false,false,'operator');continue;}
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
      const s1=spike(),s2=spike();for(const [s,x] of [[s1,-16],[s2,16]]){s.rotation.x=-Math.PI/2;s.position.set(x,22,0);s.scale.setScalar(1.3);g.add(s);}   // driven point-first into the floor, grips up
      // the field: a ring on the floor and a low wall of light streaks that fades upward (a solid cylinder washed the
      // whole view blue from inside)
      const fieldMat=new THREE.MeshBasicMaterial({color:0x5fb8ff,map:fieldTex(),transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
      const col=new THREE.Mesh(new THREE.CylinderGeometry(FIELD,FIELD,110,48,1,true),fieldMat);col.position.y=55;g.add(col);
      const ring=new THREE.Mesh(new THREE.RingGeometry(FIELD-6,FIELD,64),new THREE.MeshBasicMaterial({color:0x5fb8ff,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=2;g.add(ring);
      const light=glowAt(at.clone().add(up.clone().multiplyScalar(60)),0x5fb8ff,3,FIELD*2.2);
      scene.add(g);held.visible=false;audio.play('buy',.6);
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
      unglow(p.light);p.g.removeFromParent();p.g.traverse(o=>{o.geometry?.dispose();if(o.material&&o.material!==metal&&o.material!==glow){o.material.map?.dispose();o.material.dispose();}});
      held.visible=true;held.position.copy(REST).add(new THREE.Vector3(0,-20,0));
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
      if(slam){
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
        for(const z of enemies.list){if(p.lifted.has(z)||z.kind==='panzer'||z.state==='rising')continue;const q=z.root.position;if(Math.hypot(q.x-p.at.x,q.z-p.at.z)<FIELD&&Math.abs(q.y-p.at.y)<120)lift(z);}
        for(const z of [...p.lifted.keys()])if(!enemies.list.includes(z)){z.ai=p.lifted.get(z).prev;p.lifted.delete(z);}
      }
      for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.t+=dt;const k=f.t/.45;f.m.scale.setScalar(Math.max(1,f.r*Math.min(1,k*1.3)));f.m.material.opacity=Math.max(0,.9*(1-k));if(f.l)f.l.weight=Math.max(0,1-k*2);
        if(k>=1){f.m.removeFromParent();f.m.geometry.dispose();f.m.material.dispose();unglow(f.l);fx.splice(i,1);}}
    }
    function end(){
      if(planted)pickUp();
      held.removeFromParent();held.traverse(o=>o.geometry?.dispose());
      // the shockwaves finish on their own
      const left=fx.splice(0);if(left.length){let k=0;const tick=()=>{k+=1/60;for(const f of left){f.m.material.opacity=Math.max(0,f.m.material.opacity-.05);if(f.l)f.l.weight*=.8;}if(k<.5)requestAnimationFrame(tick);else for(const f of left){f.m.removeFromParent();f.m.geometry.dispose();f.m.material.dispose();unglow(f.l);}};tick();}
      metal.dispose();glow.dispose();
    }
    return {update,fire,aim,end,
      get planted(){return !!planted;},get lifted(){return planted?planted.lifted.size:0;}};
  }
}
