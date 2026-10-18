// Co-op: up to 4 players in one room. The host's browser runs the zombies,
// rounds, power-ups and Mystery Box location; the others mirror them and send
// their hits to the host. Downed players can be revived; bled-out players
// spectate until the next round. If the host leaves, another player takes over.
// Start with ?mp=host (create a room) or ?room=CODE (join) on a game page.
import * as THREE from 'three';
import { Net } from '../../net.js';
import { roundPopulation } from '../../rules.js';
import { loadProfile, cloudReady } from '../../profile.js';
import { cardSvg } from '../shop/card.js';
import { startSocial, onSocial, socialState, request as friendRequest, invite as friendInvite, isFriend, isPending, statusText } from '../../social.js';
import { loadCharacterRegistry, createCharacter, holdWeapon, applyStance } from '../../characters.js';

const SNAP_RATE=12,POSE_RATE=15,STATES=['chase','attack','barricade','entering','rising'];
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
    // the character's customisation picks go along, so teammates see the same skin options (Blessing, outfit, ...)
    const variants=profile.variants?.[profile.character];
    if(hosting)await net.create({page,map:api.map?.id??'kino',character:profile.character,variants});
    else await net.join(code,{character:profile.character,variants});
  }catch(error){api.toast('Co-op: '+error.message,8);panel.innerHTML=`<strong>CO-OP</strong><span class="err">${esc(error.message)}</span>`;return;}
  const url=new URL(location.href);url.searchParams.delete('mp');url.searchParams.set('room',net.code);history.replaceState(null,'',url);
  const invite=url.href;
  // The HUD label says SOLO in the base game.
  const top=document.getElementById('top');if(top)for(const n of top.childNodes)if(n.nodeType===3&&/SOLO/.test(n.textContent))n.textContent=n.textContent.replace('SOLO','CO-OP');

  // ---- Panel and pause-menu additions ----------------------------------------------------
  const remotes=new Map();net.remotes=remotes;   // other mods read teammates' avatars (the Mech class's mirrors and rear gun)
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
    const base=registry.find(e=>e.id===p.character)??registry[0],entry={...base,choice:p.variants??base.choice};
    const r={id:p.id,name:p.name,entry,pos:null,target:null,yaw:0,targetYaw:0,vel:new THREE.Vector3(),grounded:true,down:false,dead:false,weapon:'',held:null,fire:0,lastSeen:performance.now()};
    remotes.set(p.id,r);
    r.character=await createCharacter(entry,data);r.root=r.character.root;r.root.visible=false;scene.add(r.root);setTag(r);showPanel();
  }
  // an Iron Man armor on or off (mods/stark/armor.js): teammates swap your body to the armor's character and back
  async function setRemoteBody(r,next){
    const nc=await createCharacter(next,data),vis=r.root?.visible;
    r.held?.removeFromParent();r.held=null;r.character?.dispose();r.root?.removeFromParent();
    r.entry=next;r.character=nc;r.root=nc.root;r.root.visible=!!vis;scene.add(r.root);r.weapon='';setTag(r);
  }
  host.on('suitChange',({suit,on})=>net.send('all',{t:'suit',suit,on}));
  net.on('suit',(m,from)=>{const r=remotes.get(from);if(!r)return;r.ownEntry??=r.entry;
    const next=m.on?registry.find(e=>e.id==='armor_'+m.suit):r.ownEntry;if(next&&next!==r.entry)setRemoteBody(r,next).catch(e=>console.warn('[coop] suit body',e));});
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
    const [id,up,att,camo]=key.split(':'),def=data.weapons[id];if(!def||!r.character)return;
    // their attachments, not ours: rebuild the hidden parts from the list they sent
    const wl=window.kino.weaponLevels,hide=wl?wl.hideTagsFor(id,att?att.split('+'):[]):def.hideTags;
    const pivot=await holdWeapon(r.character,r.entry,up?{...def,...def.upgrade}:def,hide);
    if(r.weapon!==key){pivot?.removeFromParent();return;}r.held=pivot;
    if(camo)window.kino.camo?.apply(pivot,camo);   // their camo
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
    host.remoteDamage=true;host.remoteBy=from;try{enemies.hurt(z,m.amount,m.head,m.melee,m.cause,false);}finally{host.remoteDamage=false;host.remoteBy=null;}
    net.send(from,{t:'res',killed:!enemies.list.includes(z),head:!!m.head,melee:!!m.melee,kind:z.kind});
  });
  net.on('world',m=>{if(net.isHost)applyWorld(m);});
  net.on('box',m=>{if(net.isHost)setBox(m.id);});
  host.on('roundEnd',()=>{if(net.isHost)queueMicrotask(scale);respawnIfDead();});
  host.on('reset',()=>{if(net.isHost){gid++;scale();}});

  // ---- Client role (mirror) -------------------------------------------------------------------
  const byNet=new Map(),dying=[];let snapGid=null,lastBox=null;
  // A zombie the host has climbing out of the ground plays the same riser clip here (enemies.js picks it by speed).
  function riseClip(z){
    const a=enemies.anims,clip=a[z.speed>=110?'ai_zombie_traverse_ground_climbout_fast':'ai_zombie_traverse_ground_v1_run']??a.ai_zombie_traverse_ground_climbout_fast;
    if(!clip)return false;if(!z.rig.actions?.rise)z.rig.add('rise',clip,true);z.rig.play('rise',false,(clip.duration??3)/3,0);return true;
  }
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
      if(state!==z.state){z.state=state;if(state!=='rising'||!riseClip(z))z.rig.play(state==='chase'||state==='entering'||state==='rising'?'walk':'attack',state!=='attack');}
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
  window.kino.coopDown=me;   // read by perks (Tombstone: bled out or revived)
  const overlay=document.createElement('div');overlay.id='coop-down';overlay.innerHTML='<strong></strong><span></span>';document.body.append(overlay);
  const revive=document.createElement('div');revive.id='coop-revive';revive.innerHTML='<span></span><i><b></b></i>';document.body.append(revive);
  let forcingGameOver=false;
  const hurtSession=session.damage;
  session.damage=n=>{
    if(forcingGameOver||!coop()||['reviving','gameover'].includes(session.phase)||session.effects.invulnerable>session.time)return hurtSession(n);
    // In co-op a lethal hit downs you instead (Quick Revive no longer self-revives: Cold War / BO6 rules, rules.js).
    if(n<session.health)return hurtSession(n);
    hurtSession(Math.max(0,session.health-1));goDown();return true;
  };
  function goDown(){
    // coopBleedMul: Downer's Delight (perks-plus reaper-perks.js), read before the perks are cleared
    me.down=true;me.bleed=BLEED_OUT*(window.kino?.coopBleedMul?.()??1);session.phase='reviving';session.reviveLeft=Infinity;session.health=0;session.perks.clear();session.cancelReload();
    queueMicrotask(()=>api.announce('You are down','HOLD ON · A TEAMMATE CAN REVIVE YOU',5));showPanel();
  }
  function getUp(){
    me.down=me.dead=false;camera.rotation.z=0;session.phase='fighting';session.reviveLeft=0;session.health=session.maxHealth;session.effects.invulnerable=session.time+2;
    host.camera=null;host.hideViewmodel=false;showPanel();
  }
  net.on('revive',()=>{if(me.down&&!me.dead){getUp();api.announce('Revived','BACK IN THE FIGHT',3);}});
  // Back at the next round, next to a teammate who is still standing (walkable ground beside them), or at the map's
  // spawn if nobody is. The spawn alone could be cut off behind doors, or under Cheese Cube's rising cheese.
  function respawnIfDead(){
    if(!(me.dead||me.down))return;
    getUp();
    const mate=[...remotes.values()].find(r=>!r.down&&!r.dead&&r.pos);
    let spot=null;
    if(mate)for(const a of [0,1.6,3.1,4.7]){const p=mate.pos.clone().add(new THREE.Vector3(Math.cos(a)*45,0,Math.sin(a)*45));const c=world.closest?.(p,{x:40,y:50,z:40});if(c&&Math.abs(c.y-mate.pos.y)<40){spot=c;break;}}
    if(!spot&&mate)spot=mate.pos.clone();
    if(spot)player.setPosition(spot);else player.respawn?.();
    api.announce('Respawned','NEW ROUND',3);
  }
  function checkGameOver(){
    if(!coop())return;
    const everyone=[me,...remotes.values()];
    if(everyone.every(p=>p.down||p.dead)){net.send('all',{t:'gameover'});forceGameOver();}
  }
  function forceGameOver(){
    if(session.phase==='gameover')return;
    forcingGameOver=true;me.down=me.dead=false;host.camera=null;host.hideViewmodel=false;
    session.phase='fighting';session.clearPerks?session.clearPerks():session.perks.clear();session.effects.invulnerable=0;session.health=1;api.damage(99999);forcingGameOver=false;
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
      // id, :u if upgraded, and the equipped attachments (weapon-levels) so teammates see them
      const w=session.weaponUnavailable?'':session.weapon.id+':'+(session.weapon.upgraded?'u':'')+':'+(data.weapons[session.weapon.id]?.attachments??'')+':'+(data.weapons[session.weapon.id]?.camo??'');
      net.send('all',{t:'pose',p:[r1(f.x),r1(f.y),r1(f.z)],y:Math.round((camera.rotation.y+Math.PI)*1000)/1000,v:(player.state?.velocity?.toArray()??[0,0,0]).map(r1),
        g:player.state?.grounded??true,k:window.kino.movement?.state?.diving?'dive':window.kino.movement?.state?.prone?'prone':window.kino.movement?.state?.sliding?'slide':window.kino.movement?.state?.mantling?'mantle':'',d:me.down,x:me.dead||session.phase==='gameover',w,f:fireCount});
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

  // ---- Lobby: a full-screen menu; nobody starts until everyone has fully loaded -----------
  // Left: the map, the room code, START GAME (host) / status, invite and main menu. Right: the squad, one card per
  // player with their operator, class and level, and their loading progress (Loading N% → Ready → In game).
  // Each player reports {t:'linfo'} to the host (loading percent while loading, then ready + operator/class); the host
  // keeps lobby.info and broadcasts it with the ready list. START GAME starts everyone: guests enter on the host's
  // 'lobby' started flag (the game starts at once; the mouse is captured on their first click, which browsers require).
  // Someone joining a game in progress goes straight in.
  const lobby={ready:new Set(),started:false,go:false,info:{}};
  const lob=document.createElement('div');lob.id='coop-lobby';
  const st=document.createElement('style');st.textContent=`
    #coop-lobby{position:fixed;inset:0;z-index:50;display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,440px);gap:4vw;padding:6vh 6vw;box-sizing:border-box;
      background:linear-gradient(90deg,#070a0a 0%,#0a0c0b 55%,#080a09);font-family:Arial,Helvetica,sans-serif;color:#eee8dc;overflow:auto}
    #coop-lobby[hidden]{display:none}
    #coop-lobby .pl.carded{position:relative;overflow:hidden}#coop-lobby .pl .cc{position:absolute;inset:0;opacity:.5;pointer-events:none;z-index:0}#coop-lobby .pl .cc svg{width:100%;height:100%;display:block}#coop-lobby .pl.carded>*:not(.cc){position:relative;z-index:1}
    #coop-lobby::before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,#ffffff02 0px,#ffffff02 1px,transparent 1px,transparent 3px)}
    #coop-lobby .l-left{align-self:center;position:relative}
    #coop-lobby .kicker{font-size:17px;font-weight:900;letter-spacing:1px}#coop-lobby .kicker span{font-size:11px;font-weight:400;letter-spacing:3px;margin-left:11px;color:#b82f27}
    #coop-lobby .chapter{font-size:10px;letter-spacing:4px;color:#aeb0a1;margin:38px 0 14px}
    #coop-lobby h1{font-family:Impact,'Arial Narrow',Arial,sans-serif;font-weight:900;font-size:clamp(54px,6.5vw,96px);letter-spacing:-2px;line-height:.88;margin:0;color:#e5e0d3;text-transform:uppercase;overflow-wrap:anywhere}
    #coop-lobby .room{margin:26px 0 30px;display:flex;align-items:baseline;gap:16px}
    #coop-lobby .room small{font-size:10px;letter-spacing:4px;color:#9d947e}
    #coop-lobby .room b{font:400 38px/1 Georgia,serif;letter-spacing:.3em;color:#d9c3a0}
    #coop-lobby .btns{display:grid;gap:10px;width:320px;max-width:100%}
    #coop-lobby button{font:inherit;cursor:pointer}
    #coop-lobby .go{border:1px solid #b03f31;background:#932e25;color:#eee8d9;display:flex;justify-content:space-between;padding:18px 20px;font-weight:700;font-size:11px;letter-spacing:2px;text-align:left;transition:background .2s}
    #coop-lobby .go:hover:not(:disabled){background:#b5372c}#coop-lobby .go:disabled{opacity:.45;cursor:default}
    #coop-lobby .sec{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    #coop-lobby .sec button{border:1px solid #776b5266;background:#05050550;padding:12px 10px;color:#ccc3ae;font-size:11px;letter-spacing:2px}
    #coop-lobby .sec button:hover{border-color:#b5372c;color:#eee8dc}
    #coop-lobby .status{margin-top:14px;font-size:10px;color:#9d947e;letter-spacing:1px;min-height:12px}
    #coop-lobby .wait{border:1px solid #776b5266;padding:16px 20px;font-size:11px;letter-spacing:2px;color:#c7bca4;background:#05050550}
    #coop-lobby .l-right{align-self:center;position:relative;border:1px solid #776b5240;background:#0b0c0bd9;padding:20px 20px 10px}
    #coop-lobby .squad{display:flex;justify-content:space-between;align-items:baseline;font-size:10px;letter-spacing:4px;color:#c2b5a0;padding-bottom:12px;border-bottom:1px solid #776b5240}
    #coop-lobby .squad b{font-weight:400;color:#9d947e;letter-spacing:2px}
    #coop-lobby .pl{display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid #776b5226}
    #coop-lobby .av{width:42px;height:42px;display:grid;place-items:center;background:#1a1714;border:1px solid #776b5266;font:700 18px Georgia,serif;color:#d9c3a0}
    #coop-lobby .pl.me .av{border-color:#b5372c}
    #coop-lobby .av{overflow:hidden;border-radius:50%}#coop-lobby .av img{width:100%;height:100%;object-fit:cover;display:block}
    #coop-lobby .nm{font-size:14px;color:#eee8dc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #coop-lobby .nm em{font-style:normal;font-size:9px;letter-spacing:2px;color:#b82f27;margin-left:8px}
    #coop-lobby .sub{font-size:10px;letter-spacing:1px;color:#8c8272;margin-top:3px}
    #coop-lobby .bar{height:2px;background:#514b4060;margin-top:7px}#coop-lobby .bar i{display:block;height:100%;background:#be4b39;transition:width .4s}
    #coop-lobby .tag{font-size:9px;letter-spacing:2px;color:#9d947e;text-align:right}
    #coop-lobby .tag.ok{color:#7fd36a}#coop-lobby .tag.in{color:#d9c3a0}
    #coop-lobby .empty{padding:14px 0;font-size:10px;letter-spacing:2px;color:#575c56;border-bottom:1px dashed #776b5226}
    @media(max-width:820px){#coop-lobby{grid-template-columns:1fr;padding:30px 20px}#coop-lobby .l-left,#coop-lobby .l-right{align-self:start}}
    #coop-lobby .add{margin-top:7px;border:1px solid #776b5266;background:#05050580;color:#ccc3ae;font:700 9px Arial;letter-spacing:2px;padding:5px 8px}
    #coop-lobby .add:hover{border-color:#b5372c;color:#fff}#coop-lobby .fr-tag{display:inline-block;margin-top:7px;font-size:9px;letter-spacing:2px;color:#7fd36a}
    #coop-lobby .invs{max-height:240px;overflow:auto}
    #coop-lobby .inv{display:grid;grid-template-columns:10px 1fr auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #776b5226}
    #coop-lobby .inv>i{width:9px;height:9px;border-radius:50%;background:#5a5650}#coop-lobby .inv.online>i{background:#5fd068}#coop-lobby .inv.game>i{background:#e0a83a}
    #coop-lobby .inv b{display:block;font-size:13px;font-weight:400}#coop-lobby .inv small{display:block;font-size:10px;color:#8c8272;margin-top:2px}
    #coop-lobby .inv.offline{opacity:.55}
    #coop-lobby .invf{border:1px solid #b03f31;background:#932e25;color:#fff;font:700 9px Arial;letter-spacing:2px;padding:7px 10px}#coop-lobby .invf:disabled{opacity:.5;background:#2a1f16}
    #coop-lobby .inv-empty{font-size:10px;letter-spacing:1px;color:#575c56;padding:10px 0;line-height:1.6}
    #coop-click{position:fixed;left:50%;top:60%;transform:translateX(-50%);z-index:20;padding:12px 18px;border:1px solid #b03f31;background:#0b0c0be6;color:#eee8dc;font:700 11px Arial;letter-spacing:3px;pointer-events:none}`;
  document.head.append(st);document.body.append(lob);
  const isReady=id=>lobby.ready.has(id);
  const MAX=4,invited=new Set();
  startSocial().then(()=>onSocial(()=>{if(!lobby.go)renderLobby();}));
  // what this player shows on their card
  function myInfo(){
    const c=window.kino.classes,st=window.kino.debug.getState();
    const pct=st.ready?100:Math.round(parseFloat(document.getElementById('load-progress')?.style.width)||0);
    return {p:pct,op:window.kino.characterEntry?.name??registry.find(e=>e.id===profile.character)?.name??null,cls:c?.cls?.name??null,lvl:c?.state?.level??null,in:!!st.started,cd:(({c1,c2,pattern})=>c1?{c1,c2,pattern}:null)(window.kino.cosmetics?.equipped?.card??{})};   // cd: the calling card (shop)
  }
  function renderLobby(){
    if(lobby.go){lob.hidden=true;return;}
    const all=[...net.players.values()],allReady=all.length>0&&all.every(p=>isReady(p.id));
    lob.hidden=false;
    const title=document.getElementById('map-title')?.textContent||'ZOMBIES';
    const card=p=>{const i=lobby.info[p.id]??{},ready=isReady(p.id),pct=ready?100:i.p??0;
      const sub=[i.op,i.cls&&(i.cls+(i.lvl?' · LV '+i.lvl:''))].filter(Boolean).join(' · ')||'Joining…';
      const tag=i.in?'<span class="tag in">IN GAME</span>':ready?'<span class="tag ok">READY</span>':`<span class="tag">LOADING ${pct}%</span>`;
      // ADD FRIEND: signed-in players who aren't friends yet (and only when I'm signed in)
      const soc=socialState(),add=p.id!==net.id&&p.uid&&soc.signedIn&&p.uid!==soc.me?.id?(isFriend(p.uid)?'<span class="fr-tag">FRIEND</span>':isPending(p.uid)?'<span class="fr-tag">REQUESTED</span>':`<button type="button" class="add" data-uid="${esc(p.uid)}">+ ADD FRIEND</button>`):'';
      return `<div class="pl${p.id===net.id?' me':''}${i.cd?' carded':''}">${i.cd?`<div class="cc">${cardSvg(i.cd,'','')}</div>`:''}<div class="av">${p.picture?`<img src="${esc(p.picture)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${esc((p.name||'?')[0].toUpperCase())}'))">`:esc((p.name||'?')[0].toUpperCase())}</div>
        <div><div class="nm">${esc(p.name)}${p.id===net.hostId?'<em>HOST</em>':''}${p.id===net.id?'<em>YOU</em>':''}</div><div class="sub">${esc(sub)}</div>${ready?'':`<div class="bar"><i style="width:${pct}%"></i></div>`}${add}</div>${tag}</div>`;};
    // friends to invite: online ones not already here
    const soc=socialState(),here=new Set(all.map(p=>p.uid).filter(Boolean));
    const inv=soc.signedIn?soc.friends.filter(f=>!here.has(f.id)).sort((a,b)=>(a.status==='offline')-(b.status==='offline')):[];
    const invHtml=!soc.signedIn?'<div class="inv-empty">Sign in on the main menu to invite friends.</div>':inv.length?inv.map(f=>`<div class="inv ${f.status}"><i></i><div><b>${esc(f.name)}</b><small>${esc(statusText(f))}</small></div>${f.status==='offline'?'':`<button type="button" class="invf" data-fid="${esc(f.id)}"${invited.has(f.id)?' disabled':''}>${invited.has(f.id)?'SENT':'INVITE'}</button>`}</div>`).join(''):'<div class="inv-empty">No friends to invite yet: add them from the SOCIAL tab, or with + ADD FRIEND here.</div>';
    const waiting=all.filter(p=>!isReady(p.id)).length;
    lob.innerHTML=`<div class="l-left"><div class="kicker">ZOMBIES <span>CO-OP</span></div><p class="chapter">CO-OP LOBBY</p><h1>${esc(title)}</h1>
        <div class="room"><small>ROOM</small><b>${esc(net.code)}</b></div>
        <div class="btns">${net.isHost?`<button type="button" class="go" ${allReady?'':'disabled'}>START GAME <span>→</span></button>`:
          lobby.started?`<button type="button" class="go">JOIN THE GAME <span>→</span></button>`:`<div class="wait">WAITING FOR THE HOST TO START</div>`}
          <div class="sec"><button type="button" class="invite">COPY INVITE</button><button type="button" class="leave">MAIN MENU</button></div></div>
        <p class="status">${net.isHost?(allReady?'Everyone is loaded in. Start the game for everyone.':`Waiting for ${waiting} player${waiting===1?'':'s'} to finish loading…`):lobby.started?'The game is under way.':'The host starts the game for everyone once all players are loaded in.'}</p></div>
      <div class="l-right"><div class="squad">SQUAD <b>${all.length} / ${MAX}</b></div>${all.map(card).join('')}${Array.from({length:Math.max(0,MAX-all.length)},()=>'<div class="empty">OPEN SLOT · INVITE A FRIEND BELOW</div>').join('')}
        <div class="squad" style="margin-top:22px">INVITE FRIENDS <b>${inv.filter(f=>f.status!=='offline').length} ONLINE</b></div><div class="invs">${invHtml}</div></div>`;
    for(const b of lob.querySelectorAll('.add'))b.onclick=async e=>{e.stopPropagation();b.disabled=true;try{await friendRequest({id:b.dataset.uid});api.toast('Friend request sent',2);}catch(err){api.toast(err.message,3);}renderLobby();};
    for(const b of lob.querySelectorAll('.invf'))b.onclick=async e=>{e.stopPropagation();b.disabled=true;try{await friendInvite(b.dataset.fid,net.code,document.getElementById('map-title')?.textContent);invited.add(b.dataset.fid);}catch(err){api.toast(err.message,3);}renderLobby();};
    lob.querySelector('.invite').onclick=async e=>{e.stopPropagation();try{await navigator.clipboard.writeText(invite);e.target.textContent='LINK COPIED';}catch{prompt('Invite link',invite);}};
    lob.querySelector('.leave').onclick=e=>{e.stopPropagation();location.href='/';};
    const go=lob.querySelector('.go');if(go)go.onclick=e=>{e.stopPropagation();if(net.isHost)startAll();else enter();};
  }
  // enter the game. From a click (host, or a guest's JOIN): capture the mouse now. From the host's start: run the game at
  // once and capture the mouse on the first click (pointer lock needs a user gesture).
  let clickHint=null;
  function enter(fromGesture=true){
    lobby.go=true;lob.hidden=true;
    if(fromGesture){document.getElementById('start')?.click();return;}
    window.kino.debug.resume();
    if(!document.pointerLockElement&&!clickHint){clickHint=document.createElement('div');clickHint.id='coop-click';clickHint.textContent='THE GAME HAS STARTED · CLICK TO PLAY';document.body.append(clickHint);
      const once=()=>{clickHint?.remove();clickHint=null;removeEventListener('pointerdown',once,true);document.getElementById('start')?.click();};addEventListener('pointerdown',once,true);}
    sendInfo();
  }
  function startAll(){lobby.started=true;broadcastLobby();enter();}
  function broadcastLobby(){if(net.isHost)net.send('all',{t:'lobby',ready:[...lobby.ready],started:lobby.started,info:lobby.info});renderLobby();}
  function sendInfo(){const i=myInfo();if(net.isHost){lobby.info[net.id]=i;broadcastLobby();}else net.send('host',{t:'linfo',...i});}
  // The start button stays locked until the lobby lets you in.
  document.getElementById('start')?.addEventListener('click',e=>{if(!lobby.go){e.stopImmediatePropagation();e.preventDefault();renderLobby();}},true);
  net.on('ready',(m,from)=>{if(net.isHost){lobby.ready.add(from);broadcastLobby();}});
  net.on('linfo',(m,from)=>{if(net.isHost){const {t,...i}=m;lobby.info[from]=i;broadcastLobby();}});
  net.on('lobby',m=>{lobby.ready=new Set(m.ready);lobby.info=m.info??lobby.info;
    if(m.started&&!lobby.started){lobby.started=true;if(isReady(net.id)&&!lobby.go){enter(false);return;}}   // the host started: everyone goes in
    renderLobby();});
  net.on('joined',()=>{if(net.isHost)broadcastLobby();else renderLobby();});
  net.on('left',id=>{lobby.ready.delete(id);delete lobby.info[id];if(net.isHost)broadcastLobby();else renderLobby();});
  net.on('host',()=>{if(net.isHost){lobby.ready.add(net.id);broadcastLobby();}});
  // Loading progress to the host each second, then ready (with operator and class) once this game has finished loading.
  (async()=>{
    while(!window.kino.debug.getState().ready){sendInfo();await new Promise(r=>setTimeout(r,1000));}
    sendInfo();
    if(net.isHost){lobby.ready.add(net.id);broadcastLobby();}else net.send('host',{t:'ready'});
    if(lobby.started&&!lobby.go)enter(false);   // the host started while this one was still loading
  })();
  host.on('start',()=>sendInfo());   // "IN GAME" on the cards
  renderLobby();
  showPanel();
  api.toast(net.isHost?`Co-op room ${net.code} · invite friends from the pause menu`:`Joined ${net.players.get(net.hostId)?.name??'the host'}'s game`,5);
}
