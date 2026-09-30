// Co-op: up to 4 players in one room. The host's browser runs the zombies,
// rounds, power-ups and Mystery Box location; the others mirror them and send
// their hits to the host. Downed players can be revived; bled-out players
// spectate until the next round. If the host leaves, another player takes over.
// Start with ?mp=host (create a room) or ?room=CODE (join) on a game page.
import * as THREE from 'three';
import { Net } from '../../net.js';
import { roundPopulation } from '../../rules.js';
import { loadProfile, cloudReady } from '../../profile.js';
import { loadCharacterRegistry, createCharacter, holdWeapon, applyStance } from '../../characters.js';

const SNAP_RATE=12,POSE_RATE=15,STATES=['chase','attack','barricade','entering'];
const BLEED_OUT=30,REVIVE_TIME=3,REVIVE_RANGE=90;
const v3=a=>new THREE.Vector3(a[0],a[1],a[2]),r1=n=>Math.round(n*10)/10;
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

export default async function setup(api){
  const params=new URLSearchParams(location.search),hosting=params.get('mp')==='host',code=params.get('room');
  if(!hosting&&!code)return;
  const {host,session,enemies,world,player,camera,scene,data,audio,powerups,mysteryBox,mod}=api;
  await cloudReady;
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('coop.css',mod.url).href;document.head.append(css);
  const registry=await loadCharacterRegistry(),profile=loadProfile();
  const net=new Net();window.kino.coop=net;
  const collect=type=>window.kino.debug.collectPowerup(type);

  // ---- Joining ---------------------------------------------------------------------
  const page=location.pathname+(api.map?`?map=${encodeURIComponent(api.map.id)}`:'');
  const panel=document.createElement('div');panel.id='coop-panel';document.body.append(panel);
  try{
    if(hosting)await net.create({page,map:api.map?.id??'kino',character:profile.character});
    else await net.join(code,{character:profile.character});
  }catch(error){api.toast('Co-op: '+error.message,8);panel.innerHTML=`<strong>CO-OP</strong><span class="err">${esc(error.message)}</span>`;return;}
  const url=new URL(location.href);url.searchParams.delete('mp');url.searchParams.set('room',net.code);history.replaceState(null,'',url);
  const invite=url.href;
  // The HUD label says SOLO in the base game.
  const top=document.getElementById('top');if(top)for(const n of top.childNodes)if(n.nodeType===3&&/SOLO/.test(n.textContent))n.textContent=n.textContent.replace('SOLO','CO-OP');

  // ---- Panel and pause-menu additions ----------------------------------------------------
  const remotes=new Map();
  function showPanel(error){
    if(error){panel.innerHTML=`<strong>CO-OP</strong><span class="err">${esc(error)}</span>`;return;}
    const status=id=>{if(id===net.id)return me.dead?' <em class="down">DEAD</em>':me.down?' <em class="down">DOWN</em>':'';const r=remotes.get(id);return r?.dead?' <em class="down">DEAD</em>':r?.down?' <em class="down">DOWN</em>':'';};
    const rows=[...net.players.values()].map(p=>`<li class="${p.id===net.id?'me':''}">${esc(p.name)}${p.id===net.hostId?' <em>HOST</em>':''}${status(p.id)}</li>`).join('');
    panel.innerHTML=`<strong>CO-OP · ${net.code}</strong><span>${net.players.size} / 4</span><ul>${rows}</ul>`;
  }
  const row=document.querySelector('.game-menu-row');
  if(row){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='COPY INVITE';
    b.onclick=async e=>{e.stopPropagation();try{await navigator.clipboard.writeText(invite);b.textContent='LINK COPIED';}catch{prompt('Invite link',invite);}setTimeout(()=>b.textContent='COPY INVITE',1800);};row.append(b);}
  const note=document.createElement('p');note.id='coop-note';document.getElementById('menu-status')?.after(note);
  const setNote=()=>{note.textContent=`Co-op room ${net.code} · ${net.isHost?'you are hosting':'hosted by '+(net.players.get(net.hostId)?.name??'host')}`;};

  // ---- Remote players ------------------------------------------------------------------------
  function nameTag(text,down){
    const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');
    g.font='bold 30px Arial';g.textAlign='center';g.lineWidth=6;g.strokeStyle='#000c';g.strokeText(text,128,42);g.fillStyle=down?'#ff5a44':'#f0e8d8';g.fillText(text,128,42);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,transparent:true}));s.scale.set(48,12,1);s.renderOrder=10;return s;
  }
  function setTag(r){r.tag?.removeFromParent();r.tag=nameTag(r.dead?r.name+' · DEAD':r.down?r.name+' · DOWN':r.name,r.down||r.dead);r.tag.position.set(0,r.down?40:86,0);r.root?.add(r.tag);}
  async function addRemote(p){
    if(p.id===net.id||remotes.has(p.id))return;
    const entry=registry.find(e=>e.id===p.character)??registry[0];
    const r={id:p.id,name:p.name,entry,pos:null,target:null,yaw:0,targetYaw:0,vel:new THREE.Vector3(),grounded:true,down:false,dead:false,weapon:'',held:null,fire:0,lastSeen:performance.now()};
    remotes.set(p.id,r);
    r.character=await createCharacter(entry,data);r.root=r.character.root;r.root.visible=false;scene.add(r.root);setTag(r);showPanel();
  }
  function removeRemote(id){const r=remotes.get(id);if(!r)return;r.character?.dispose();r.root?.removeFromParent();remotes.delete(id);showPanel();}
  for(const p of net.players.values())addRemote(p);
  net.on('joined',p=>{addRemote(p);api.toast(`${p.name} joined`,3);});
  net.on('left',(id,p)=>{removeRemote(id);if(p)api.toast(`${p.name} left`,3);});
  net.on('closed',reason=>{api.toast(reason,8);showPanel(reason);});

  let fireCount=0,lastShots=session.shots;
  net.on('pose',(m,from)=>{
    const r=remotes.get(from);if(!r)return;
    r.target=v3(m.p);r.targetYaw=m.y;r.stance=m.k??'';r.vel.fromArray(m.v);r.grounded=m.g;r.lastSeen=performance.now();
    if(!!m.d!==r.down||!!m.x!==r.dead){r.down=!!m.d;r.dead=!!m.x;setTag(r);showPanel();}
    if(!r.pos){r.pos=r.target.clone();r.yaw=m.y;}
    if(m.w!==r.weapon){r.weapon=m.w;setRemoteWeapon(r);}
    if(m.f>r.fire&&r.fire)remoteShot(r);r.fire=m.f;
  });
  async function setRemoteWeapon(r){
    const key=r.weapon;r.held?.removeFromParent();r.held=null;r.character?.hold?.(false);
    const [id,up]=key.split(':'),def=data.weapons[id];if(!def||!r.character)return;
    const pivot=await holdWeapon(r.character,r.entry,up?{...def,...def.upgrade}:def,def.hideTags);
    if(r.weapon!==key){pivot?.removeFromParent();return;}r.held=pivot;
  }
  const flash=new THREE.PointLight(0xffc276,0,260,1.2);scene.add(flash);
  function remoteShot(r){
    if(!r.pos)return;flash.position.copy(r.pos).add(new THREE.Vector3(0,55,0));flash.intensity=220;
    const def=data.weapons[r.weapon.split(':')[0]];if(def&&r.pos.distanceTo(camera.position)<1400)audio.weapon('shot',def);
  }
  const alive=()=>[...remotes.values()].filter(r=>r.pos&&!r.down&&!r.dead&&performance.now()-r.lastSeen<5000);
  const coop=()=>remotes.size>0;

  // ---- Host role -----------------------------------------------------------------------
  // Everything below is installed or removed as the host role moves between players.
  const original={update:enemies.update.bind(enemies),hurt:enemies.hurt,nuke:enemies.nuke,onDamage:enemies.onDamage,
    powerUpdate:powerups.update.bind(powerups),powerSpawn:powerups.spawn.bind(powerups),onCollect:powerups.onCollect,tryDrop:session.drops.tryDrop.bind(session.drops)};
  let gid=1,snapTimer=0,puSerial=0;
  function targetFor(z,local){
    const all=[...(me.down||me.dead?[]:[{position:local}]),...alive().map(r=>({id:r.id,position:r.pos.clone()}))];
    if(!all.length)return {position:local};
    let best=all[0],bd=Infinity;for(const t of all){const d=t.position.distanceTo(z.root.position);if(d<bd){bd=d;best=t;}}
    const cur=all.find(t=>(t.id??null)===(z.victimId??null));
    if(cur&&cur!==best&&cur.position.distanceTo(z.root.position)<bd*1.3)best=cur;
    z.victimId=best.id??null;return best;
  }
  const scale=()=>{if(!session.dogRound)session.total=roundPopulation(session.round,data.rules,1+alive().length+[...remotes.values()].filter(r=>r.down).length);};
  function becomeHost(migrated){
    enemies.update=original.update;enemies.hurt=original.hurt;enemies.nuke=original.nuke;enemies.autoSpawn=true;enemies.autoRounds=true;
    session.drops.tryDrop=original.tryDrop;
    for(const z of enemies.list){z.netTarget=null;if(z.state!=='chase'&&z.state!=='attack'){z.state='chase';z.rig.play('walk');}z.path=[];z.repath=0;}
    enemies.targetFor=targetFor;
    enemies.onDamage=(amount,z,victim)=>{if(victim?.id)net.send(victim.id,{t:'hit',amount,z:z.id});else original.onDamage(amount,z,victim);};
    powerups.spawn=(type,position)=>{const item=original.powerSpawn(type,position);if(item)item.nid=++puSerial+(migrated?10000:0);return item;};
    powerups.onCollect=(type,position)=>{original.onCollect(type,position);net.send('all',{t:'pu',type,at:position?.toArray?.()});};
    powerups.update=(dt,feet,canCollect=true,lineClear)=>{
      original.powerUpdate(dt,feet,canCollect&&!me.down&&!me.dead,lineClear);
      // Teammates collect too.
      for(const p of [...powerups.items])for(const r of alive())if(r.pos.distanceTo(p.root.position)<70){
        const at=p.root.position.clone();powerups.remove(p);powerups.burst(at);powerups.onCollect(p.type,at);break;
      }
    };
    setNote();showPanel();
    if(migrated)api.toast('The host left · you are now hosting',6);
  }
  function hostTick(dt){
    snapTimer-=dt;if(snapTimer>0)return;snapTimer=1/SNAP_RATE;
    if(session.phase==='preparing'&&session.round===1)scale();
    checkGameOver();
    net.send('all',{t:'snap',gid,round:session.round,phase:session.phase==='reviving'?'fighting':session.phase,countdown:r1(session.countdown),total:session.total,killed:session.killed,spawned:session.spawned,dogRound:session.dogRound,
      power:session.power,doors:[...session.openDoors],boards:world.barriers.map(b=>b.count),box:world.activeBox?.id??null,
      pu:powerups.items.map(p=>[p.nid??0,p.type,r1(p.root.position.x),r1(p.root.position.y-40),r1(p.root.position.z),r1(p.age)]),
      z:enemies.list.map(z=>[z.id,z.kind,r1(z.root.position.x),r1(z.root.position.y),r1(z.root.position.z),Math.round(z.root.rotation.y*100)/100,STATES.indexOf(z.state),Math.round(z.health),z.speed])});
  }
  net.on('dmg',(m,from)=>{
    if(!net.isHost)return;
    const z=enemies.list.find(z=>z.id===m.id);if(!z)return;
    host.remoteDamage=true;try{enemies.hurt(z,m.amount,m.head,m.melee,m.cause,false);}finally{host.remoteDamage=false;}
    net.send(from,{t:'res',killed:!enemies.list.includes(z),head:!!m.head,melee:!!m.melee,kind:z.kind});
  });
  net.on('world',m=>{if(net.isHost)applyWorld(m);});
  net.on('box',m=>{if(net.isHost)setBox(m.id);});
  host.on('roundEnd',()=>{if(net.isHost)queueMicrotask(scale);respawnIfDead();});
  host.on('reset',()=>{if(net.isHost){gid++;scale();}});

  // ---- Client role (mirror) -------------------------------------------------------------------
  const byNet=new Map(),dying=[];let snapGid=null,lastBox=null;
  function becomeClient(){
    enemies.autoSpawn=false;enemies.autoRounds=false;enemies.reset();
    session.drops.tryDrop=()=>null;
    enemies.update=dt=>{
      for(const z of enemies.list){
        z.rig.update(dt);
        if(z.netTarget){z.root.position.lerp(z.netTarget,Math.min(1,dt*10));let d=z.netYaw-z.root.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));z.root.rotation.y+=d*Math.min(1,dt*10);}
      }
      for(const d of [...dying]){d.life-=dt;d.rig.update(dt);if(d.life<1.2)d.root.position.y-=dt*24;if(d.life<=0){d.root.removeFromParent();dying.splice(dying.indexOf(d),1);}}
    };
    enemies.hurt=(z,amount,head=false,melee=false,cause='bullet')=>{
      if(!enemies.list.includes(z))return;
      const e={enemy:z,amount,head,melee,cause};host.emit('beforeEnemyDamage',e);
      enemies.onHit?.(z,head);z.health-=e.amount;
      net.send('host',{t:'dmg',id:z.id,amount:e.amount,head,melee,cause});
    };
    enemies.nuke=()=>{};
    powerups.update=(dt,feet,canCollect,lineClear)=>original.powerUpdate(dt,feet,false,lineClear);
    setNote();
  }
  net.on('res',m=>{session.scoreHit(m.killed,m.head,m.melee);if(m.killed)host.emit('kill',{enemy:null,kind:m.kind,head:m.head,melee:m.melee});});
  net.on('hit',m=>{
    if(me.down||me.dead)return;
    const z=enemies.list.find(z=>z.id===m.z);if(z){z.state='attack';z.attackDealt=true;}
    api.damage(m.amount);
  });
  net.on('pu',m=>{if(!net.isHost){const p=powerups.items.find(p=>p.type===m.type&&m.at&&p.root.position.distanceTo(v3(m.at))<5);if(p){powerups.remove(p);powerups.burst(p.root.position);}}collect(m.type);});
  net.on('snap',m=>{
    if(net.isHost)return;
    if(snapGid!==null&&m.gid!==snapGid){api.reset();byNet.clear();me.down=me.dead=false;}
    snapGid=m.gid;
    if(m.round>session.round&&session.round>0){host.emit('roundEnd',{round:session.round});}
    Object.assign(session,{round:m.round,countdown:m.countdown,total:m.total,killed:m.killed,spawned:m.spawned,dogRound:m.dogRound});
    if(!['gameover','reviving'].includes(session.phase)&&m.phase!=='reviving')session.phase=m.phase;
    applyWorld(m);
    m.boards?.forEach((n,i)=>{const b=world.barriers[i];if(b&&b.count!==n)world.setBoards(b,n);});
    if(m.box!==null&&m.box!==world.activeBox?.id)setBox(m.box);lastBox=world.activeBox?.id;
    // Power-ups: the host's list is the truth.
    const want=new Map(m.pu.map(p=>[p[0],p]));
    for(const p of [...powerups.items])if(!want.has(p.nid))powerups.remove(p);
    for(const [nid,type,x,y,z,age] of m.pu)if(!powerups.items.some(p=>p.nid===nid)){const item=original.powerSpawn(type,new THREE.Vector3(x,y,z));if(item){item.nid=nid;item.age=age;}}
    // Zombies.
    const seen=new Set();
    for(const [id,kind,x,y,zz,yaw,st,hp,speed] of m.z){
      seen.add(id);let z=byNet.get(id);
      if(!z){z=enemies.spawn(new THREE.Vector3(x,y,zz),null,kind);z.id=id;enemies.serial=Math.max(enemies.serial,id);z.state='chase';z.speed=speed;byNet.set(id,z);}
      z.netTarget=new THREE.Vector3(x,y,zz);z.netYaw=yaw;z.health=hp;
      const state=STATES[st]??'chase';
      if(state!==z.state){z.state=state;z.rig.play(state==='chase'||state==='entering'?'walk':'attack',state!=='attack');}
    }
    for(const [id,z] of byNet)if(!seen.has(id)){
      byNet.delete(id);const i=enemies.list.indexOf(z);if(i>=0)enemies.list.splice(i,1);
      z.state='dead';z.rig.play('death',false);z.life=3;dying.push(z);
    }
  });
  net.on('host',id=>{if(id===net.id){byNet.clear();becomeHost(true);}else setNote();showPanel();});

  // ---- Shared world: doors, power, Mystery Box, trap visuals ----------------------------------
  function applyWorld(m){
    let changed=false;
    for(const name of m.doors??[])if(!session.openDoors.has(name)){session.openDoors.add(name);const d=world.doors.get(name);if(d?.flag)session.flags.add(d.flag);changed=true;}
    if(m.power&&!session.power){session.power=true;session.flags.add('power_on');world.setPower?.(true);if(world.powerHandle)world.powerHandle.rotation.x=-1.2;changed=true;api.toast('The power is on',3);}
    if(changed)world.setDoors(session);
  }
  function setBox(id){const e=world.boxLocations?.find(e=>e.id===id);if(e&&e!==world.activeBox){world.activeBox=e;world.updateBox();}}
  const trapState=new Map();
  net.on('trap',m=>{const t=world.traps?.get(m.name);if(t&&t.activeUntil<=session.time){t.activeUntil=session.time+t.duration;t.readyAt=session.time+Math.max(t.duration,t.cooldown);}});

  // ---- Downs, revives, bleed-out and spectating ------------------------------------------------
  const me={down:false,dead:false,bleed:0,reviving:null,progress:0,spectate:0};
  const overlay=document.createElement('div');overlay.id='coop-down';overlay.innerHTML='<strong></strong><span></span>';document.body.append(overlay);
  const revive=document.createElement('div');revive.id='coop-revive';revive.innerHTML='<span></span><i><b></b></i>';document.body.append(revive);
  let forcingGameOver=false;
  const hurtSession=session.damage;
  session.damage=n=>{
    if(forcingGameOver||!coop()||['reviving','gameover'].includes(session.phase)||session.effects.invulnerable>session.time)return hurtSession(n);
    // In co-op a lethal hit (without Quick Revive) downs you instead.
    if(n<session.health||session.perks.has('specialty_quickrevive'))return hurtSession(n);
    hurtSession(Math.max(0,session.health-1));goDown();return true;
  };
  function goDown(){
    me.down=true;me.bleed=BLEED_OUT;session.phase='reviving';session.reviveLeft=Infinity;session.health=0;session.perks.clear();session.cancelReload();
    queueMicrotask(()=>api.announce('You are down','HOLD ON · A TEAMMATE CAN REVIVE YOU',5));showPanel();
  }
  function getUp(){
    me.down=me.dead=false;camera.rotation.z=0;session.phase='fighting';session.reviveLeft=0;session.health=session.maxHealth;session.effects.invulnerable=session.time+2;
    host.camera=null;host.hideViewmodel=false;showPanel();
  }
  net.on('revive',()=>{if(me.down&&!me.dead){getUp();api.announce('Revived','BACK IN THE FIGHT',3);}});
  function respawnIfDead(){if(me.dead||me.down){getUp();player.respawn?.();api.announce('Respawned','NEW ROUND',3);}}
  function checkGameOver(){
    if(!coop())return;
    const everyone=[me,...remotes.values()];
    if(everyone.every(p=>p.down||p.dead)){net.send('all',{t:'gameover'});forceGameOver();}
  }
  function forceGameOver(){
    if(session.phase==='gameover')return;
    forcingGameOver=true;me.down=me.dead=false;host.camera=null;host.hideViewmodel=false;
    session.phase='fighting';session.perks.clear();session.effects.invulnerable=0;session.health=1;api.damage(99999);forcingGameOver=false;
    api.announce('Everyone is down','GAME OVER',6);
  }
  net.on('gameover',()=>forceGameOver());
  // Spectating a teammate while dead.
  const spectateCam=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,1,30000);
  let useHeld=false;
  addEventListener('keydown',e=>{if(e.code==='KeyF'||e.code==='KeyE')useHeld=true;if(e.code==='Space'&&me.dead){me.spectate++;}});
  addEventListener('keyup',e=>{if(e.code==='KeyF'||e.code==='KeyE')useHeld=false;});
  addEventListener('blur',()=>{useHeld=false;});

  function downedTick(dt){
    overlay.classList.toggle('show',me.down||me.dead);
    if(me.down&&!me.dead){
      me.bleed-=dt;camera.position.y-=34;camera.rotation.z=.18;
      overlay.querySelector('strong').textContent='DOWN';overlay.querySelector('span').textContent=`Bleeding out in ${Math.max(0,Math.ceil(me.bleed))}s · a teammate can hold F to revive you`;
      if(me.bleed<=0){me.dead=true;api.announce('You bled out','SPECTATING UNTIL THE NEXT ROUND',5);showPanel();}
    }
    if(me.dead){
      const list=alive();overlay.querySelector('strong').textContent='DEAD';
      const r=list.length?list[me.spectate%list.length]:null;
      overlay.querySelector('span').textContent=r?`Spectating ${r.name} · Space to switch · you respawn next round`:'Waiting for the next round';
      if(r){const back=new THREE.Vector3(-Math.sin(r.yaw),0,-Math.cos(r.yaw));spectateCam.position.copy(r.pos).addScaledVector(back,110).add(new THREE.Vector3(0,80,0));spectateCam.lookAt(r.pos.clone().add(new THREE.Vector3(0,50,0)));
        spectateCam.aspect=innerWidth/innerHeight;spectateCam.updateProjectionMatrix();host.camera=spectateCam;host.hideViewmodel=true;}
    }
    // Reviving a teammate: hold F near them.
    const candidate=me.down||me.dead?null:[...remotes.values()].filter(r=>r.down&&!r.dead&&r.pos&&r.pos.distanceTo(player.getFeetPosition())<REVIVE_RANGE)[0];
    if(candidate!==me.reviving){me.reviving=candidate;me.progress=0;}
    revive.classList.toggle('show',!!candidate);
    if(candidate){
      const need=session.perks.has('specialty_quickrevive')?REVIVE_TIME/2:REVIVE_TIME;
      me.progress=useHeld?me.progress+dt:0;
      revive.querySelector('span').textContent=useHeld?`Reviving ${candidate.name}…`:`Hold F to revive ${candidate.name}`;
      revive.querySelector('b').style.width=Math.min(100,100*me.progress/need)+'%';
      if(me.progress>=need){net.send(candidate.id,{t:'revive'});session.addPoints(50);me.progress=0;candidate.down=false;setTag(candidate);api.toast(`Revived ${candidate.name}`,3);}
    }
  }

  // ---- Every frame (and in the background while the host is paused) --------------------------------
  let poseTimer=0,worldKey='';
  function peerTick(dt){
    if(session.shots!==lastShots){fireCount+=session.shots-lastShots;lastShots=session.shots;}
    // Box moves (teddy) and trap activations made here are shared.
    if(world.activeBox&&lastBox!==null&&world.activeBox.id!==lastBox){if(!net.isHost)net.send('host',{t:'box',id:world.activeBox.id});}
    lastBox=world.activeBox?.id??null;
    for(const [name,t] of world.traps??[]){const was=trapState.get(name)??0;if(t.activeUntil>was+.5&&t.activeUntil>session.time)net.send('all',{t:'trap',name});trapState.set(name,t.activeUntil);}
    poseTimer-=dt;
    if(poseTimer<=0){
      poseTimer=1/POSE_RATE;const f=player.getFeetPosition();
      const w=session.weaponUnavailable?'':session.weapon.id+(session.weapon.upgraded?':u':'');
      net.send('all',{t:'pose',p:[r1(f.x),r1(f.y),r1(f.z)],y:Math.round((camera.rotation.y+Math.PI)*1000)/1000,v:(player.state?.velocity?.toArray()??[0,0,0]).map(r1),
        g:player.state?.grounded??true,k:window.kino.movement?.state?.prone?'prone':window.kino.movement?.state?.sliding?'slide':window.kino.movement?.state?.mantling?'mantle':'',d:me.down,x:me.dead||session.phase==='gameover',w,f:fireCount});
      const key=[...session.openDoors].sort().join()+'|'+session.power;
      if(key!==worldKey){worldKey=key;if(!net.isHost)net.send('host',{t:'world',doors:[...session.openDoors],power:session.power});}
    }
  }
  host.on('update',dt=>{
    peerTick(dt);if(net.isHost)hostTick(dt);downedTick(dt);
    flash.intensity=Math.max(0,flash.intensity-dt*2400);
    for(const r of remotes.values()){
      if(!r.character||!r.pos)continue;
      r.root.visible=performance.now()-r.lastSeen<5000&&!r.dead;
      r.pos.lerp(r.target,Math.min(1,dt*12));let d=r.targetYaw-r.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));r.yaw+=d*Math.min(1,dt*12);
      r.root.position.copy(r.pos);r.root.rotation.y=r.yaw;
      const speed=r.down?0:Math.hypot(r.vel.x,r.vel.z),forward=r.vel.x*Math.sin(r.yaw)+r.vel.z*Math.cos(r.yaw),side=r.vel.x*Math.cos(r.yaw)-r.vel.z*Math.sin(r.yaw);
      r.character.update(dt,speed,{forward,side,vy:r.vel.y,grounded:r.grounded,turn:d/Math.max(dt,1e-3)*.1});
      r.root.rotation.z=r.down?Math.PI/2*.9:0;if(!r.down)applyStance(r.character,r.stance,dt);
    }
  });
  // The game only updates while the host is playing; if the host pauses or
  // switches tabs, keep the shared world running from a worker-driven timer.
  const ticker=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),50)'],{type:'text/javascript'})));
  let lastBg=performance.now();
  ticker.onmessage=()=>{
    const now=performance.now(),dt=Math.min(.25,(now-lastBg)/1000);lastBg=now;
    if(!net.isHost)return;
    const st=window.kino.debug.getState();if(st.active||!st.started||session.phase==='gameover')return;
    session.update(dt);enemies.update(dt,player.getFeetPosition());powerups.update(dt,player.getFeetPosition(),false,()=>true);
    peerTick(dt);hostTick(dt);
  };

  if(net.isHost)becomeHost(false);else becomeClient();
  addEventListener('pagehide',()=>net.close());

  // ---- Lobby: nobody starts until everyone has fully loaded -------------------------
  // Each player reports 'ready' once their game has finished loading; the host
  // keeps the list and broadcasts it. The host's START GAME unlocks when all are
  // ready and starts everyone; someone joining a game in progress goes straight in.
  const lobby={ready:new Set(),started:false,go:false};
  const lob=document.createElement('div');lob.id='coop-lobby';
  const st=document.createElement('style');st.textContent=`
    #coop-lobby{position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:rgba(6,6,8,.72);backdrop-filter:blur(3px);font:14px/1.5 system-ui,sans-serif;color:#e8e2d6}
    #coop-lobby[hidden]{display:none}
    #coop-lobby .card{width:min(420px,calc(100vw - 32px));background:#15130f;border:1px solid #4a3a2c;border-radius:10px;padding:22px 22px 18px;box-shadow:0 20px 60px #000a}
    #coop-lobby h2{margin:0 0 2px;font:600 13px/1.4 system-ui;letter-spacing:.2em;color:#c9a46a}
    #coop-lobby .code{font:600 30px/1.2 ui-monospace,monospace;letter-spacing:.25em;color:#fff;margin-bottom:12px}
    #coop-lobby ul{list-style:none;margin:0 0 16px;padding:0;border-top:1px solid #2c261f}
    #coop-lobby li{display:flex;justify-content:space-between;padding:9px 2px;border-bottom:1px solid #2c261f}
    #coop-lobby li em{font-style:normal;color:#8c8272}#coop-lobby li .ok{color:#7fd36a}
    #coop-lobby .row{display:flex;gap:10px}
    #coop-lobby button{flex:1;padding:11px;border-radius:6px;border:1px solid #6b4a2e;background:#2a1f16;color:#f0e6d6;font:600 12px system-ui;letter-spacing:.14em;cursor:pointer}
    #coop-lobby button.go{background:#8a2f22;border-color:#c0453a}
    #coop-lobby button:disabled{opacity:.45;cursor:default}
    #coop-lobby .hint{margin:12px 0 0;color:#8c8272;font-size:12px;text-align:center}`;
  document.head.append(st);document.body.append(lob);
  const isReady=id=>lobby.ready.has(id);
  function renderLobby(){
    if(lobby.go){lob.hidden=true;return;}
    const all=[...net.players.values()],allReady=all.length>0&&all.every(p=>isReady(p.id));
    lob.hidden=false;
    lob.innerHTML=`<div class="card"><h2>CO-OP LOBBY</h2><div class="code">${esc(net.code)}</div>
      <ul>${all.map(p=>`<li><span>${esc(p.name)}${p.id===net.hostId?' <em>· host</em>':''}${p.id===net.id?' <em>· you</em>':''}</span>${isReady(p.id)?'<span class="ok">Ready</span>':'<em>Loading…</em>'}</li>`).join('')}</ul>
      <div class="row"><button type="button" class="invite">COPY INVITE</button>${net.isHost?`<button type="button" class="go" ${allReady?'':'disabled'}>START GAME</button>`:''}</div>
      <p class="hint">${net.isHost?(allReady?'Everyone is in. Start when ready.':'Waiting for everyone to finish loading…'):lobby.started?'The game has started: click to join in.':'Waiting for the host to start…'}</p></div>`;
    lob.querySelector('.invite').onclick=async e=>{e.stopPropagation();try{await navigator.clipboard.writeText(invite);e.target.textContent='LINK COPIED';}catch{prompt('Invite link',invite);}};
    const go=lob.querySelector('.go');if(go)go.onclick=e=>{e.stopPropagation();startAll();};
    if(!net.isHost&&lobby.started){lob.querySelector('.card').style.cursor='pointer';lob.onclick=()=>{enter();};}
  }
  function enter(){lobby.go=true;lob.hidden=true;document.getElementById('start')?.click();}
  function startAll(){lobby.started=true;broadcastLobby();enter();}
  function broadcastLobby(){if(net.isHost)net.send('all',{t:'lobby',ready:[...lobby.ready],started:lobby.started});renderLobby();}
  // The start button stays locked until the lobby lets you in.
  document.getElementById('start')?.addEventListener('click',e=>{if(!lobby.go){e.stopImmediatePropagation();e.preventDefault();renderLobby();}},true);
  net.on('ready',(m,from)=>{if(net.isHost){lobby.ready.add(from);broadcastLobby();}});
  net.on('lobby',m=>{lobby.ready=new Set(m.ready);if(m.started&&!lobby.started){lobby.started=true;api.toast('The host started the game: click to join',6);}renderLobby();});
  net.on('joined',()=>{if(net.isHost)broadcastLobby();else renderLobby();});
  net.on('left',id=>{lobby.ready.delete(id);if(net.isHost)broadcastLobby();else renderLobby();});
  net.on('host',()=>{if(net.isHost){lobby.ready.add(net.id);broadcastLobby();}});
  // Report ready once this game has finished loading (and is past the loading screen).
  (async()=>{while(!window.kino.debug.getState().ready)await new Promise(r=>setTimeout(r,250));
    if(net.isHost){lobby.ready.add(net.id);broadcastLobby();}else net.send('host',{t:'ready'});})();
  renderLobby();
  showPanel();
  api.toast(net.isHost?`Co-op room ${net.code} · invite friends from the pause menu`:`Joined ${net.players.get(net.hostId)?.name??'the host'}'s game`,5);
}
