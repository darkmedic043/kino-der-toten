// Co-op (stages 1-2): up to 4 players in one room. The host's browser runs the
// zombies and rounds; the others mirror them and send their hits to the host.
// Start with ?mp=host (create a room) or ?room=CODE (join) on a game page.
import * as THREE from 'three';
import { Net } from '../../net.js';
import { roundPopulation } from '../../rules.js';
import { loadProfile, cloudReady } from '../../profile.js';
import { loadCharacterRegistry, createCharacter, holdWeapon } from '../../characters.js';

const SNAP_RATE=12,POSE_RATE=15,STATES=['chase','attack','barricade','entering'];
const v3=a=>new THREE.Vector3(a[0],a[1],a[2]),r1=n=>Math.round(n*10)/10;

export default async function setup(api){
  const params=new URLSearchParams(location.search),hosting=params.get('mp')==='host',code=params.get('room');
  if(!hosting&&!code)return;
  const {host,session,enemies,world,player,camera,scene,data,audio,mod}=api;
  await cloudReady;
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('coop.css',mod.url).href;document.head.append(css);
  const registry=await loadCharacterRegistry(),profile=loadProfile();
  const net=new Net();window.kino.coop=net;

  // ---- Joining -------------------------------------------------------------------
  const page=location.pathname+(api.map?`?map=${encodeURIComponent(api.map.id)}`:'');
  try{
    if(hosting)await net.create({page,map:api.map?.id??'kino',character:profile.character});
    else await net.join(code,{character:profile.character});
  }catch(error){api.toast('Co-op: '+error.message,8);showPanel(error.message);return;}
  const isHost=net.isHost;
  // Keep the address shareable: ?room=CODE (without mp=host).
  const url=new URL(location.href);url.searchParams.delete('mp');url.searchParams.set('room',net.code);history.replaceState(null,'',url);
  const invite=url.href;

  // ---- Panel ----------------------------------------------------------------------
  const panel=document.createElement('div');panel.id='coop-panel';document.body.append(panel);
  function showPanel(error){
    if(error){panel.innerHTML=`<strong>CO-OP</strong><span class="err">${error}</span>`;return;}
    const rows=[...net.players.values()].map(p=>`<li class="${p.id===net.id?'me':''}">${esc(p.name)}${p.id===net.hostId?' <em>HOST</em>':''}${remotes.get(p.id)?.down?' <em class="down">DOWN</em>':''}</li>`).join('');
    panel.innerHTML=`<strong>CO-OP · ${net.code}</strong><span>${net.players.size} / 4</span><ul>${rows}</ul>`;
  }
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  // Invite button in the pause menu.
  const row=document.querySelector('.game-menu-row');
  if(row){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='COPY INVITE';
    b.onclick=async e=>{e.stopPropagation();try{await navigator.clipboard.writeText(invite);b.textContent='LINK COPIED';}catch{prompt('Invite link',invite);}setTimeout(()=>b.textContent='COPY INVITE',1800);};
    row.append(b);}
  const note=document.createElement('p');note.id='coop-note';note.textContent=`Co-op room ${net.code} · ${isHost?'you are hosting':'hosted by '+(net.players.get(net.hostId)?.name??'host')}`;
  document.getElementById('menu-status')?.after(note);

  // ---- Remote players ----------------------------------------------------------------
  const remotes=new Map();
  function nameTag(text){
    const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');
    g.font='bold 30px Arial';g.textAlign='center';g.lineWidth=6;g.strokeStyle='#000c';g.strokeText(text,128,42);g.fillStyle='#f0e8d8';g.fillText(text,128,42);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,transparent:true}));s.scale.set(48,12,1);s.renderOrder=10;return s;
  }
  async function addRemote(p){
    if(p.id===net.id||remotes.has(p.id))return;
    const entry=registry.find(e=>e.id===p.character)??registry[0];
    const r={id:p.id,name:p.name,entry,pos:null,target:null,yaw:0,targetYaw:0,vel:new THREE.Vector3(),grounded:true,down:false,weapon:'',held:null,fire:0,lastSeen:performance.now()};
    remotes.set(p.id,r);
    r.character=await createCharacter(entry,data);r.root=r.character.root;r.root.visible=false;scene.add(r.root);
    r.tag=nameTag(p.name);r.tag.position.set(0,86,0);r.root.add(r.tag);
    showPanel();
  }
  function removeRemote(id){const r=remotes.get(id);if(!r)return;r.character?.dispose();r.root?.removeFromParent();remotes.delete(id);showPanel();}
  for(const p of net.players.values())addRemote(p);
  net.on('joined',p=>{addRemote(p);api.toast(`${p.name} joined`,3);});
  net.on('left',(id,p)=>{removeRemote(id);if(p)api.toast(`${p.name} left`,3);});
  net.on('closed',reason=>{api.toast(reason,8);showPanel(reason);});

  // Poses: every peer sends its own position, look direction and weapon.
  let fireCount=0,lastShots=session.shots;
  net.on('pose',(m,from)=>{
    const r=remotes.get(from);if(!r)return;
    r.target=v3(m.p);r.targetYaw=m.y;r.vel.fromArray(m.v);r.grounded=m.g;r.down=!!m.d;r.lastSeen=performance.now();
    if(!r.pos){r.pos=r.target.clone();r.yaw=m.y;}
    if(m.w!==r.weapon){r.weapon=m.w;setRemoteWeapon(r);}
    if(m.f>r.fire&&r.fire){remoteShot(r);}r.fire=m.f;
  });
  async function setRemoteWeapon(r){
    const key=r.weapon;r.held?.removeFromParent();r.held=null;r.character?.hold?.(false);
    const [id,up]=key.split(':'),def=data.weapons[id];if(!def||!r.character)return;
    const d=up?{...def,...def.upgrade}:def,pivot=await holdWeapon(r.character,r.entry,d,def.hideTags);
    if(r.weapon!==key){pivot?.removeFromParent();return;}r.held=pivot;
  }
  const flash=new THREE.PointLight(0xffc276,0,260,1.2);scene.add(flash);
  function remoteShot(r){
    if(!r.pos)return;flash.position.copy(r.pos).add(new THREE.Vector3(0,55,0));flash.intensity=220;
    const def=data.weapons[r.weapon.split(':')[0]];if(def&&r.pos.distanceTo(camera.position)<1400)audio.weapon('shot',def);
  }

  // ---- Host: shared zombies ----------------------------------------------------------
  const targets=()=>{
    const list=[];for(const r of remotes.values())if(r.pos&&!r.down&&performance.now()-r.lastSeen<5000)list.push({id:r.id,position:r.pos.clone(),down:false});return list;
  };
  if(isHost){
    // Each zombie chases the nearest player (sticking with its current victim unless someone is much closer).
    enemies.targetFor=(z,local)=>{
      const all=[{position:local},...targets()];
      let best=all[0],bd=Infinity;for(const t of all){const d=t.position.distanceTo(z.root.position);if(d<bd){bd=d;best=t;}}
      const cur=all.find(t=>(t.id??null)===(z.victimId??null));
      if(cur&&cur!==best&&cur.position.distanceTo(z.root.position)<bd*1.3)best=cur;
      z.victimId=best.id??null;return best;
    };
    const localDamage=enemies.onDamage;
    enemies.onDamage=(amount,z,victim)=>{
      if(victim?.id)net.send(victim.id,{t:'hit',amount,z:z.id});
      else localDamage(amount,z,victim);
    };
    // Remote players' shots.
    net.on('dmg',(m,from)=>{
      const z=enemies.list.find(z=>z.id===m.id);if(!z)return;
      host.remoteDamage=true;
      try{enemies.hurt(z,m.amount,m.head,m.melee,m.cause,false);}finally{host.remoteDamage=false;}
      net.send(from,{t:'res',killed:!enemies.list.includes(z),head:!!m.head,melee:!!m.melee,kind:z.kind});
    });
    // Doors and power opened by other players.
    net.on('world',m=>applyWorld(m));
    // More zombies with more players (rules.js already scales by player count).
    const players=()=>1+targets().length;
    const scale=()=>{if(!session.dogRound)session.total=roundPopulation(session.round,data.rules,players());};
    host.on('roundEnd',()=>queueMicrotask(scale));
    let gid=1;host.on('reset',()=>{gid++;scale();});
    let snapTimer=0;
    host.on('update',dt=>{
      snapTimer-=dt;if(snapTimer>0)return;snapTimer=1/SNAP_RATE;
      if(session.phase==='preparing'&&session.round===1)scale();
      net.send('all',{t:'snap',gid,round:session.round,phase:session.phase,countdown:r1(session.countdown),total:session.total,killed:session.killed,spawned:session.spawned,dogRound:session.dogRound,
        power:session.power,doors:[...session.openDoors],boards:world.barriers.map(b=>b.count),
        z:enemies.list.map(z=>[z.id,z.kind,r1(z.root.position.x),r1(z.root.position.y),r1(z.root.position.z),Math.round(z.root.rotation.y*100)/100,STATES.indexOf(z.state),Math.round(z.health),z.speed])});
    });
    // The game stops simulating while the host is down; tell the others.
    host.on('gameOver',()=>net.send('all',{t:'ended',reason:'The host went down. Game over.'}));
  }

  // ---- Clients: mirror the host's game -----------------------------------------------
  if(!isHost){
    enemies.autoSpawn=false;enemies.autoRounds=false;enemies.reset();
    const byNet=new Map(),dying=[];
    enemies.update=dt=>{
      for(const z of enemies.list){
        z.rig.update(dt);
        if(z.netTarget){z.root.position.lerp(z.netTarget,Math.min(1,dt*10));let d=z.netYaw-z.root.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));z.root.rotation.y+=d*Math.min(1,dt*10);}
      }
      for(const d of [...dying]){d.life-=dt;d.rig.update(dt);if(d.life<1.2)d.root.position.y-=dt*24;if(d.life<=0){d.root.removeFromParent();dying.splice(dying.indexOf(d),1);}}
    };
    // Shots on mirrored zombies go to the host; the reply brings points and XP.
    enemies.hurt=(z,amount,head=false,melee=false,cause='bullet')=>{
      if(!enemies.list.includes(z))return;
      const e={enemy:z,amount,head,melee,cause};host.emit('beforeEnemyDamage',e);
      enemies.onHit?.(z,head);z.health-=e.amount;
      net.send('host',{t:'dmg',id:z.netId,amount:e.amount,head,melee,cause});
    };
    enemies.nuke=()=>{};
    net.on('res',m=>{session.scoreHit(m.killed,m.head,m.melee);if(m.killed)host.emit('kill',{enemy:null,kind:m.kind,head:m.head,melee:m.melee});});
    net.on('hit',m=>{
      const z=byNet.get(m.z);if(z){z.state='attack';z.attackDealt=true;}
      api.damage(m.amount);
    });
    net.on('ended',m=>{api.toast(m.reason,8);});
    let gid=null;
    net.on('snap',m=>{
      if(gid!==null&&m.gid!==gid){api.reset();byNet.clear();}
      gid=m.gid;
      if(m.round>session.round&&session.round>0)host.emit('roundEnd',{round:session.round});
      Object.assign(session,{round:m.round,countdown:m.countdown,total:m.total,killed:m.killed,spawned:m.spawned,dogRound:m.dogRound});
      if(session.phase!=='gameover'&&session.phase!=='reviving')session.phase=m.phase;
      applyWorld(m);
      m.boards?.forEach((n,i)=>{const b=world.barriers[i];if(b&&b.count!==n)world.setBoards(b,n);});
      const seen=new Set();
      for(const [id,kind,x,y,zz,yaw,st,hp,speed] of m.z){
        seen.add(id);let z=byNet.get(id);
        if(!z){z=enemies.spawn(new THREE.Vector3(x,y,zz),null,kind);z.netId=id;z.state='chase';byNet.set(id,z);}
        z.netTarget=new THREE.Vector3(x,y,zz);z.netYaw=yaw;z.health=hp;
        const state=STATES[st]??'chase';
        if(state!==z.state){z.state=state;z.rig.play(state==='attack'?'attack':state==='barricade'?'attack':'walk',state!=='attack');}
      }
      for(const [id,z] of byNet)if(!seen.has(id)){
        byNet.delete(id);const i=enemies.list.indexOf(z);if(i>=0)enemies.list.splice(i,1);
        z.state='dead';z.rig.play('death',false);z.life=3;dying.push(z);
      }
    });
  }

  // ---- Doors and power (both directions) ------------------------------------------
  function applyWorld(m){
    let changed=false;
    for(const name of m.doors??[])if(!session.openDoors.has(name)){session.openDoors.add(name);const d=world.doors.get(name);if(d?.flag)session.flags.add(d.flag);changed=true;}
    if(m.power&&!session.power){session.power=true;session.flags.add('power_on');world.setPower?.(true);if(world.powerHandle)world.powerHandle.rotation.x=-1.2;changed=true;api.toast('The power is on',3);}
    if(changed)world.setDoors(session);
  }
  let worldKey='';

  // ---- Every frame: send pose, animate remote players ------------------------------------
  let poseTimer=0;const fwd=new THREE.Vector3();
  host.on('update',dt=>{
    if(session.shots!==lastShots){fireCount+=session.shots-lastShots;lastShots=session.shots;}
    poseTimer-=dt;
    if(poseTimer<=0){
      poseTimer=1/POSE_RATE;const f=player.getFeetPosition();
      const w=session.weaponUnavailable?'':session.weapon.id+(session.weapon.upgraded?':u':'');
      net.send('all',{t:'pose',p:[r1(f.x),r1(f.y),r1(f.z)],y:Math.round((camera.rotation.y+Math.PI)*1000)/1000,v:(player.state?.velocity?.toArray()??[0,0,0]).map(r1),
        g:player.state?.grounded??true,d:['reviving','gameover'].includes(session.phase),w,f:fireCount});
      const key=[...session.openDoors].sort().join()+'|'+session.power;
      if(key!==worldKey){worldKey=key;if(!isHost)net.send('host',{t:'world',doors:[...session.openDoors],power:session.power});}
    }
    flash.intensity=Math.max(0,flash.intensity-dt*2400);
    for(const r of remotes.values()){
      if(!r.character||!r.pos)continue;
      r.root.visible=performance.now()-r.lastSeen<5000;
      r.pos.lerp(r.target,Math.min(1,dt*12));let d=r.targetYaw-r.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));r.yaw+=d*Math.min(1,dt*12);
      r.root.position.copy(r.pos);r.root.rotation.y=r.yaw;
      const speed=Math.hypot(r.vel.x,r.vel.z),forward=r.vel.x*Math.sin(r.yaw)+r.vel.z*Math.cos(r.yaw),side=r.vel.x*Math.cos(r.yaw)-r.vel.z*Math.sin(r.yaw);
      r.character.update(dt,r.down?0:speed,{forward,side,vy:r.vel.y,grounded:r.grounded,turn:d/Math.max(dt,1e-3)*.1});
      r.root.rotation.z=r.down?Math.PI/2*.9:0;
    }
  });
  addEventListener('pagehide',()=>net.close());
  showPanel();
  api.toast(isHost?`Co-op room ${net.code} · invite friends from the pause menu`:`Joined ${net.players.get(net.hostId)?.name??'the host'}'s game`,5);
}
