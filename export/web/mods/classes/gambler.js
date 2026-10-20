// The Gambler's action skill, Ante Up (classes mod).
// Z opens the ante picker: put a chip, points, your health, your gun or a perk on the table and a random casino game
// (gambler-games.js) deals itself across the screen. While it plays, your kills, headshots, melee kills and multikills go
// to the game (each lands unless the ante's House Edge eats it) and Z / R make its calls. A win can ride on a coin flip,
// then pays gun power-ups (mods), cards for your hand and totems; a jackpot starts High Roller Mode. A bust costs the
// ante and the game family's penalty. Numbers live in classes.json (cls.gambler); the overlay (#gmb) follows Settings →
// Casino effects. Local only: co-op partners see the zombies die, not the table.
import * as THREE from 'three';
import { zombieHealth, makeWeapon } from '../../rules.js';
import { binds, settings } from '../../settings.js';
import { PERKS, perkUnlocked } from '../terminal-booth/desktop.js';
import { GAMES, STRIP, STOPS, WHEEL, colourOf, handTotal, newGame, familyOf, odds, rideOdds, payout, nextGame, tierUp } from './gambler-games.js';

const up=new THREE.Vector3(0,1,0);
const SYM={cherry:'🍒',bell:'🔔',bar:'BAR',melon:'🍉',seven:'7',skull:'💀'};
const DIE='⚀⚁⚂⚃⚄⚅',SUIT='♠♥♦♣';
const bjRank=c=>c===1?'A':c===11?'J':c===12?'Q':c===13?'K':String(c);
const pkRank=r=>r===14?'A':r===11?'J':r===12?'Q':r===13?'K':String(r);
const TIER={bust:['BUST','#d94a5c'],push:['PUSH','#b8b2a4'],win:['WIN','#6fcf6a'],big:['BIG WIN','#4ab0e8'],jackpot:['JACKPOT','#f2c94c']};
const FORTUNE={win:3,big:5,jackpot:10};
const TOTEM={lightning:{color:0x7fc8ff,r:450},eldritch:{color:0x9a5cff,r:320},overshield:{color:0x6fe08a,r:280}};
const svg=d=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f2c94c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`);
const WHEEL_ICON={card:svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 8l2.5 4-2.5 4-2.5-4z"/>'),shuffle:svg('<path d="M3 7h4l10 10h4M3 17h4L17 7h4M18 4l3 3-3 3M18 14l3 3-3 3"/>')};
const pickOne=a=>a[Math.floor(Math.random()*a.length)];

export function setupGambler(ctx){
  const {api,cls}=ctx,{host,session,data,scene,camera,player,enemies,world,audio}=api;
  const G=cls.gambler,JP=G.jackpot,REWARD=Object.fromEntries(G.rewards.map(r=>[r.id,r])),ANTE=Object.fromEntries(G.antes.map(a=>[a.id,a]));
  const S=k=>ctx.S()[k]??0,A=()=>ctx.A(),sk=()=>ctx.skills?.();
  const fortune=()=>Math.floor(sk()?.res?.value??0),fortuneMax=()=>sk()?.max()??20;
  const hp=()=>zombieHealth(session.round,data.rules);
  const fx=()=>window.kino.fx??{};
  const alive=z=>enemies.list.includes(z);
  const feet=()=>player.getFeetPosition();
  const chest=z=>z.root.position.clone().addScaledVector(up,45);
  const around=(at,r)=>enemies.list.filter(z=>z.root.position.distanceTo(at)<r);
  const say=(text,s=1.4)=>api.toast?.(text,s);

  // phase: idle · ante (the picker) · play (a game on the table) · ride (Let It Ride after a win). Ante Up is "up"
  // (its meter holds) from the picker until the payout.
  let phase='idle',pick=null,run=null,banner=null,marker=0,lastGame=null,hr=null,streak=null;
  let windfallT=-99,aceHits=0,aceShot=-1,cashShot=-1,reloadSlowUntil=-1,lastCard=-9;
  const hand=[],mods=new Map(),totems=[],shots=[],holes=[],queue=[],lines=[],slowed=new Map(),anims=new Map();
  const modOn=id=>mods.has(id);
  const hrOn=()=>!!hr;
  const streakOn=()=>!!streak;
  const stacks=()=>mods.get('hotHand')?.stacks??0;

  // ---- antes ---------------------------------------------------------------------------------------------------------
  const bank=()=>{const i=session.round<10?0:session.round<20?1:2;return {cost:ANTE.bankroll.cost[i],edge:ANTE.bankroll.edge[i]};};
  const edgeOf=a=>a.id==='bankroll'?bank().edge:a.edge;
  const freePick=()=>!!S('gamble.houseRules')||streakOn();
  const antes=()=>G.antes.filter(a=>a.id==='bankroll'?session.points>=bank().cost:a.id==='soul'?session.perks.size>0:a.id==='iron'?!!data.weapons[session.weapon?.id]:true);

  function deploy(){
    if(phase==='ante'){pick.i=(pick.i+1)%pick.list.length;pick.t=G.pick;audio.play('board',.25);return;}   // Z: the next ante; the pick confirms itself
    if(phase==='play'){call('z');return;}
    if(phase==='ride'){flip();return;}
    if(ctx.getCooldown()>0){if(hand.length)playCard(0);else ctx.notReady();return;}   // charging: Z plays the top card
    const st=api.getState?.();if(st&&!st.active||session.busy||session.phase==='reviving')return;
    pick={list:antes(),i:0,t:G.pick,game:nextGame(A().games,lastGame)};phase='ante';audio.play('buy',.4);draw(true);
  }
  addEventListener('keydown',e=>{
    if(e.repeat||e.code!==(binds().reload??'KeyR'))return;
    if(phase==='ante'&&freePick()){const g=A().games;pick.game=g[(g.indexOf(pick.game)+1)%g.length];pick.t=G.pick;audio.play('board',.25);}   // House Rules / Hot Streak: R picks the game
    else if(phase==='play')call('reload');
    else if(phase==='ride'&&!run.flip)settle(run.tier,run.label);   // cash out
  });

  function startRun(ante,id){
    let stake=0;if(ante.id==='bankroll'){const b=bank();if(session.spend(b.cost))stake=b.cost;else ante=ANTE.chip;}
    run={ante,id,s:newGame(id),k:Math.max(.3,1-edgeOf(ante)*A().edge),stake,rides:0,burst:[],log:[],odds:null,oddsT:0,word:null,wordN:0,start:session.time};
    lastGame=id;pick=null;phase='play';ctx.setCooldown(A().cooldown);
    if(S('gamble.runCard'))deal(S('gamble.aceDeal')?(Math.random()<.5?'ace':'wild'):randomCard());   // Wild Draw (Ace High)
    audio.play('round',.45);flash(ante.name.toUpperCase()+' ON THE TABLE');
  }
  function reshuffle(){
    if(phase!=='play')return;
    const free=S('gamble.freeShuffle')||S('gamble.houseRules')||streakOn();
    if(!free){if(fortune()<G.reshuffle)return;sk()?.spend(G.reshuffle);}
    const id=nextGame(A().games,run.id);Object.assign(run,{id,s:newGame(id),odds:null,oddsT:0,burst:[]});lastGame=id;flash('RESHUFFLE');audio.play('board',.5);
  }

  // ---- the game: the gun's events and the calls ------------------------------------------------------------------------
  function flash(w){if(run){run.word=w;run.wordN++;}}
  function call(ev){const w=GAMES[run.id].on(run.s,ev,1,Math.random);if(w){flash(w);audio.play('board',.3);}}
  function feed(ev){
    const g=GAMES[run.id];let w=g.on(run.s,ev,run.k,Math.random);
    if(w&&Math.random()<S('gamble.luck')||S('gamble.nudge')&&(ev==='multi'||ev==='melee'))w=g.on(run.s,ev,run.k,Math.random)??w;   // Loaded Dice, Nudge
    if(w){flash(w);audio.play('board',.3);}
  }
  const PLAYER=new Set(['bullet','melee']);
  host.on('kill',e=>{
    if(e.remote)return;
    const cause=e.enemy?.lastCause,mine=PLAYER.has(cause);
    if(mine&&modOn('hotHand'))mods.get('hotHand').stacks=Math.min(10,stacks()+1);
    if(mine&&modOn('cash'))session.addPoints(40);
    if(mine&&e.head&&modOn('golden'))session.addPoints(100);
    if(phase!=='play'||!(mine||cause==='ricochet'&&S('gamble.trickShot')))return;
    const t=session.time,melee=e.melee||cause==='melee';
    run.log.push({t,head:!!e.head,melee});
    feed(melee?'melee':e.head?'head':'kill');
    run.burst=run.burst.filter(x=>t-x<.35);run.burst.push(t);if(run.burst.length>=2){run.burst.length=0;feed('multi');}
  });

  // ---- the end of a game, Let It Ride, the payout ---------------------------------------------------------------------
  const markerMax=()=>Math.max(1,G.marker-S('gamble.marker'));
  function finish(){
    let {tier,label}=GAMES[run.id].result(run.s);
    if(tier==='bust'&&familyOf(run.id)==='dice'&&Math.random()<S('gamble.rerollBust')){tier='push';label='SNAKE EYES · '+label;}
    if(tier==='bust'&&marker>=markerMax()){tier='win';label='MARKER PAID';marker=0;}
    if(tier==='win'||tier==='big'){Object.assign(run,{tier,label,first:tier,rideT:G.ride.time,flip:null});phase='ride';audio.play('round_end',.4);return;}
    settle(tier,label);
  }
  const rideChance=()=>rideOdds(S('gamble.ride')+(S('gamble.allIn')?.1:0));
  function flip(){if(run.flip)return;run.flip={t:.9,win:Math.random()<rideChance()};audio.play('board',.4);}
  function ride(dt){
    if(!run.flip){if((run.rideT-=dt)<=0)settle(run.tier,run.label);return;}
    if((run.flip.t-=dt)>0)return;
    const won=run.flip.win;run.flip=null;run.rides++;
    if(!won){if(S('gamble.allIn'))settle(run.first,'ALL IN · '+run.label);else settle('bust','LOST THE RIDE');return;}
    run.tier=tierUp(run.tier);audio.play('buy',.5);
    if(run.tier==='jackpot'){settle('jackpot','HIGH ROLLER');return;}
    if(run.rides>=A().rides){settle(run.tier,run.label);return;}
    run.rideT=G.ride.time;flash('DOUBLED');
  }
  function settle(tier,label){
    const r=run;phase='idle';run=null;
    if(r.ante.id==='blood'&&(tier==='win'||tier==='big'))tier=tierUp(tier);   // Blood pays one tier up
    const lines=tier==='bust'?bust(r):tier==='push'?(r.stake?(session.points+=r.stake,['STAKE BACK']):[]):pay(r,tier,label);
    banner={tier,label,lines,t:3.2};
    audio.play(tier==='jackpot'?'packapunch':tier==='bust'?'empty':tier==='push'?'board':'buy',.6);
    if(tier==='bust'&&S('gamble.bustRefund'))window.kino.classes?.addCharge?.(A().cooldown*S('gamble.bustRefund'));   // Pair of Fives
    ctx.hud();draw(true);
  }
  function pay(r,tier,label){
    marker=0;const out=[];
    sk()?.gainF(FORTUNE[tier]);
    for(const id of payout(tier,G.rewards,{extra:Math.random()<S('gamble.payout')?1:0}))   // Double Down
      out.push(id==='jackpot'?(highRoller(label),JP.name.toUpperCase()):grant(id));
    if(S('gamble.winCard'))out.push(deal(randomCard()));   // Devil's Tines
    if(r.ante.id==='bankroll'){const n=r.stake*ANTE.bankroll.pay[tier];session.points+=n;out.push('+'+n+' POINTS');}
    if(r.ante.id==='blood'){session.health=session.maxHealth;out.push('FULL HEALTH');}
    if(r.ante.id==='iron')out.push(papHeld()?'PACK-A-PUNCHED':'REFILLED');
    if(r.ante.id==='soul'){const p=givePerk();out.push(p?p.name.toUpperCase():'+2000 POINTS');}
    if(S('gamble.diceTotem')&&familyOf(r.id)==='dice')out.push(plant(pickOne(Object.keys(TOTEM))));   // Hot Dice
    if(S('gamble.freeze')&&(tier==='big'||tier==='jackpot'))freeze(feet(),600,3);   // Freeze Frame
    return out;
  }
  function bust(r){
    marker=Math.min(markerMax(),marker+1);
    if(S('gamble.saveBust')&&hand.length)return ['ACE IN THE HOLE · '+REWARD[hand.shift()].name.toUpperCase()+' BURNED'];
    const out=[];
    if(r.ante.id==='bankroll')out.push('−'+r.stake+' POINTS');
    if(r.ante.id==='blood'){session.health=Math.max(1,Math.floor(session.health/2));out.push('HEALTH HALVED');}
    if(r.ante.id==='iron'){const id=boxGun();if(id){session.inventory[session.slot]=makeWeapon(data.weapons[id],true);session.cancelReload();api.equipView?.();out.push('NOW HOLDING '+data.weapons[id].name.toUpperCase());}}
    if(r.ante.id==='soul'){const id=pickOne([...session.perks]);if(id){session.perks.delete(id);
      if(session.inventory.length>session.weaponSlots){session.inventory.splice(session.weaponSlots);session.slot=Math.min(session.slot,session.inventory.length-1);session.cancelReload();api.equipView?.();}   // Mule Kick
      session.health=Math.min(session.health,session.maxHealth);out.push((PERKS.find(p=>p.id===id)?.name??api.perkInfo?.[id]?.name??'A PERK').toUpperCase()+' LOST');}}
    const fam=familyOf(r.id);
    if(fam==='cards')sk()?.spend(Math.ceil(fortune()/2));
    else if(fam==='dice')for(const z of around(feet(),600))speedMod(z,'bust',1.25,8);
    else reloadSlowUntil=session.time+8;
    out.push(G.busts[fam].replace(/\.$/,'').toUpperCase());
    return out;
  }
  function papHeld(){
    const w=session.weapon,d=data.weapons[w?.id];if(!d)return false;
    const fresh=!w.upgraded&&!!d.upgrade;if(fresh){w.upgraded=true;audio.play('packapunch',.5);}
    w.mag=session.def.clipSize;w.reserve=session.def.maxAmmo;api.equipView?.();return fresh;
  }
  function givePerk(){
    const p=pickOne(PERKS.filter(p=>!session.perks.has(p.id)&&perkUnlocked(p)));
    if(!p){session.addPoints(2000);return null;}
    if(api.perkInfo&&!api.perkInfo[p.id])api.perkInfo[p.id]={name:p.name,price:p.price,color:p.color,icon:p.badge};
    session.perks.add(p.id);session.health=session.maxHealth;return p;
  }
  function boxGun(){
    const own=new Set(session.inventory.map(w=>w.id));
    return pickOne(Object.keys(api.mysteryBox?.models??{}).filter(id=>id!=='teddy'&&id!=='zombie_cymbal_monkey'&&data.weapons[id]&&!own.has(id)));
  }

  // ---- rewards ----------------------------------------------------------------------------------------------------------
  const randomCard=()=>pickOne(G.rewards.filter(r=>r.kind==='card')).id;
  function grant(id){
    const r=REWARD[id];
    if(r.kind==='card')return deal(id);
    if(r.kind==='totem')return plant(id);
    const until=session.time+r.time*(1+S('gamble.modTime'));   // Pocket Change
    const m=mods.get(id);if(m)m.until=until;else mods.set(id,{until,stacks:0});
    return r.name.toUpperCase();
  }
  function deal(id){
    if(hand.length>=A().hand){play(id);return REWARD[id].name.toUpperCase()+' (HAND FULL: PLAYED)';}
    hand.push(id);return REWARD[id].name.toUpperCase();
  }
  function playCard(i){const id=hand.splice(i,1)[0];if(id)play(id);}
  function play(id){
    const k=1+S('gamble.cardDmg');   // Card Shark
    if(S('gamble.coldDeck'))freeze(feet(),260,2);
    if(id==='ace')aceHits+=8;
    if(id==='fireball')launch('fire',aim(),{speed:1500},at=>{ctx.blast(at,240,k,true);for(const z of around(at,240))if(alive(z))z.turretBurn={until:session.time+4,dps:hp()*.08,tick:.5};});
    if(id==='missile'){const ts=targets(6);for(let i=0;i<6;i++){const z=ts[i%Math.max(1,ts.length)];launch('bolt',z??aim(),{speed:1100,delay:i*.07,spread:40},(at,hit)=>{if(hit)enemies.hurt(hit,.5*hp()*k,false,false,'card');fx().burn?.(at);});}}
    if(id==='blackhole'){const at=aim();fx().gersh?.(at,4);holes.push({at,t:4,k});}
    if(id==='wild')for(let i=0;i<2;i++)deal(pickOne(G.rewards.filter(r=>r.kind==='card'&&r.id!=='wild')).id);
    if(Math.random()<S('gamble.cardsExtra')&&hand.length<A().hand){hand.push(id);say('SPLIT HAND · '+REWARD[id].name.toUpperCase()+' BACK');}
    audio.play('knife',.35);ctx.hud();
  }
  function highRoller(label){
    hr={until:session.time+JP.time,label,double:label==='MELON 777'};
    for(const z of enemies.list){speedMod(z,'slowmo',.3,1.5);animMod(z,.3,1.5);}   // the jackpot's slow motion
    api.announce?.(JP.name.toUpperCase(),label,3);
    if(label==='BLACKJACK'){deal('ace');deal('wild');}
    if(label==='BOXCARS'){const f=feet();for(let i=0;i<6;i++){const a=i/6*Math.PI*2,at=f.clone().add(new THREE.Vector3(Math.cos(a)*220,30,Math.sin(a)*220));queue.push({delay:.15+i*.12,blast:at});}}
    if(label==='GREEN 0')freeze(null,0,5);
    if(['FIVE OF A KIND','STRAIGHT FLUSH','ROYAL FLUSH'].includes(label))papHeld();
  }
  function startStreak(){streak={until:session.time+12*(1+S('gamble.streak'))};api.announce?.('HOT STREAK','WINDFALL',2);audio.play('buy',.6);}

  // ---- the gun ------------------------------------------------------------------------------------------------------------
  const rateMul=()=>(1+.04*stacks())*(fortune()>=fortuneMax()/2?1+S('gamble.rate'):1)*(streakOn()?1+.25*(1+S('gamble.streak')):1);
  const fire=session.fire.bind(session);
  session.fire=(...a)=>{
    const ok=fire(...a);if(!ok)return ok;
    const k=rateMul();if(k!==1)session.fireLeft/=k;
    if(hrOn()||modOn('bottomless'))session.weapon.mag++;
    if(hrOn()&&session.time-lastCard>=JP.cardEvery){lastCard=session.time;const z=targets(1,.8)[0];if(z)launch('card',z,{speed:2400},(at,hit)=>{if(hit)enemies.hurt(hit,JP.cardDmg*hp()*(1+S('gamble.hrDmg')),false,false,'card');});}
    return ok;
  };
  const reload=session.reload.bind(session);
  session.reload=(...a)=>{
    const r=reload(...a);if(!r)return r;
    let m=1;if(streakOn())m/=1+.25*(1+S('gamble.streak'));if(session.time<reloadSlowUntil)m*=1.4;
    if(m!==1){session.reloadLeft*=m;session.reloadDuration*=m;}
    if(Math.random()<S('gamble.sideBet')){if(Math.random()<.5){session.reloadLeft=.01;sk()?.gainF(1);say('SIDE BET · HEADS',1);}else say('SIDE BET · TAILS',1);}
    if(session.reloadEmpty&&session.time>windfallT&&Math.random()<fortune()*(.015+S('gamble.windfall'))){windfallT=session.time+20;startStreak();}   // Windfall
    return r;
  };
  host.on('beforeEnemyDamage',e=>{
    const z=e.enemy;if(!z)return;
    if(totems.some(t=>t.id==='eldritch'&&t.g.position.distanceTo(z.root.position)<t.r))e.amount*=1.3;
    if(e.cause!=='bullet')return;
    let k=(modOn('golden')?2:1)*(1+.04*stacks());
    if(S('gamble.deadHand')&&session.health<session.maxHealth*.4)k*=1+S('gamble.deadHand')*hand.length;   // Dead Man's Hand
    if(aceHits>0){k*=4;if(session.shots!==aceShot){aceShot=session.shots;aceHits--;}}   // one hit per shot, so pellets share it
    e.amount*=k;
    if(modOn('cash')&&cashShot!==session.shots){cashShot=session.shots;session.addPoints(10);}
    if(modOn('dealer'))dealer(z,e.amount);
    const p=(hrOn()?JP.ricochet:0)+(S('gamble.ricochet')&&(S('gamble.trickShot')||fortune()>=fortuneMax())?S('gamble.ricochet'):0);   // Bank Shot
    if(p&&Math.random()<p)queue.push({from:z,dmg:e.amount*.6*(1+S('gamble.hrDmg')),cause:'ricochet',color:0xffd76a});
  });
  function dealer(z,amount){
    const r=Math.random();
    if(r<.2)z.turretBurn={until:session.time+3,dps:hp()*.08,tick:.5};   // mod.js burns it
    else if(r<.4)queue.push({from:z,dmg:amount*.5,cause:'arc',color:0x9fd4ff,range:220});
    else if(r<.6)speedMod(z,'dealer',.5,3);
  }
  host.on('beforeDamage',e=>{if(totems.some(t=>t.id==='overshield'&&t.g.position.distanceTo(feet())<t.r))e.amount*=.4;});
  host.on('beforePoints',e=>{if(e.amount>0&&hr?.double)e.amount*=2;});

  // ---- zombies: speed and animation changes undone on time ---------------------------------------------------------------
  function speedMod(z,key,k,d){
    let m=slowed.get(z);if(!m)slowed.set(z,m=new Map());
    const e=m.get(key);if(e){e.until=Math.max(e.until,session.time+d);return;}
    m.set(key,{k,until:session.time+d});z.speed*=k;
  }
  function animMod(z,scale,d){const e=anims.get(z);anims.set(z,{scale:Math.min(scale,e?.scale??1),until:Math.max(session.time+d,e?.until??0)});}
  function freeze(at,r,d){for(const z of at?around(at,r):[...enemies.list]){ctx.stagger?.(z,d);animMod(z,.05,d);}}

  // ---- aiming, projectiles, tracers ----------------------------------------------------------------------------------------
  const visible=z=>world.lineClear(camera.position,chest(z));
  function targets(n,cone=-1){
    const dir=camera.getWorldDirection(new THREE.Vector3()),o=camera.position;
    return enemies.list.map(z=>{const v=chest(z).sub(o),d=v.length();return {z,d,dot:v.dot(dir)/d};})
      .filter(t=>t.d<1500&&t.dot>cone&&visible(t.z)).sort((a,b)=>cone>-1?b.dot-a.dot:a.d-b.d).slice(0,n).map(t=>t.z);
  }
  function aim(){
    const z=targets(1,.97)[0];if(z)return z.root.position.clone().addScaledVector(up,30);
    const dir=camera.getWorldDirection(new THREE.Vector3()),p=camera.position.clone();
    for(let d=60;d<=900;d+=60)if(!world.lineClear(camera.position,camera.position.clone().addScaledVector(dir,d)))break;else p.copy(camera.position).addScaledVector(dir,d);
    return p;
  }
  const glow=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
    r.addColorStop(0,'#fff');r.addColorStop(.3,'#fffa');r.addColorStop(1,'#fff0');g.fillStyle=r;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
  const cardTex=(()=>{const c=document.createElement('canvas');c.width=32;c.height=48;const g=c.getContext('2d');
    g.fillStyle='#f8f4ea';g.fillRect(2,2,28,44);g.strokeStyle='#f2c94c';g.lineWidth=3;g.strokeRect(2,2,28,44);g.fillStyle='#c4202f';g.font='bold 20px serif';g.textAlign='center';g.fillText('♦',16,31);return new THREE.CanvasTexture(c);})();
  const SPRITE={fire:{map:glow,color:0xff7a2a,size:46},bolt:{map:glow,color:0xb98cff,size:18},card:{map:cardTex,color:0xffffff,size:14}};
  for(const k in SPRITE)SPRITE[k].mat=new THREE.SpriteMaterial({map:SPRITE[k].map,color:SPRITE[k].color,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false});
  function launch(kind,goal,{speed,delay=0,spread=0},hit){
    const sp=new THREE.Sprite(SPRITE[kind].mat);sp.scale.set(SPRITE[kind].size,SPRITE[kind].size*(kind==='card'?1.5:1),1);
    const dir=camera.getWorldDirection(new THREE.Vector3()),pos=camera.position.clone().addScaledVector(dir,30).addScaledVector(up,-10);
    if(spread)pos.add(new THREE.Vector3((Math.random()-.5)*spread,(Math.random()-.5)*spread,(Math.random()-.5)*spread));
    shots.push({sp,pos,z:goal.isVector3?null:goal,to:goal.isVector3?goal.clone():chest(goal),speed,delay,hit,life:3});
  }
  function line(a,b,color){
    const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    scene.add(l);lines.push({l,t:.1});
  }

  // ---- totems ---------------------------------------------------------------------------------------------------------------
  const poleGeo=new THREE.CylinderGeometry(2.5,4,70,8).translate(0,35,0),headGeo=new THREE.OctahedronGeometry(11).translate(0,82,0);
  const poleMat=new THREE.MeshStandardMaterial({color:0x2a2018,roughness:.85});
  const PROTO={};
  for(const [id,t] of Object.entries(TOTEM)){
    const g=new THREE.Group();g.name='gambler-totem-'+id;
    g.add(new THREE.Mesh(poleGeo,poleMat),new THREE.Mesh(headGeo,new THREE.MeshBasicMaterial({color:t.color})));
    const ring=new THREE.Mesh(new THREE.RingGeometry(t.r-5,t.r,72).rotateX(-Math.PI/2).translate(0,3,0),new THREE.MeshBasicMaterial({color:t.color,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    g.add(ring);PROTO[id]=g;host.warmObjects?.push(g);
  }
  for(const k in SPRITE){const s=new THREE.Sprite(SPRITE[k].mat);host.warmObjects?.push(s);}
  function plant(id){
    const g=PROTO[id].clone(),f=feet(),a=Math.random()*Math.PI*2;g.position.copy(f);scene.add(g);
    totems.push({id,g,r:TOTEM[id].r,until:session.time+REWARD[id].time*(1+S('gamble.totemTime')),tick:0,off:new THREE.Vector3(Math.cos(a)*60,0,Math.sin(a)*60)});   // Bone Charm
    return REWARD[id].name.toUpperCase();
  }

  // ---- the frame loop -------------------------------------------------------------------------------------------------------
  host.on('update',dt=>{
    if(!dt)return;
    const t=session.time;
    if(phase==='ante'&&(pick.t-=dt)<=0)startRun(pick.list[pick.i],pick.game);
    else if(phase==='play'){
      GAMES[run.id].tick(run.s,dt,Math.random);
      if(run.s.over)finish();
      else if((run.oddsT-=dt)<=0){   // the odds bar: the rest of the game played out at your recent pace
        run.oddsT=.6;const rec=run.log.filter(l=>t-l.t<8),n=rec.length,span=Math.min(8,Math.max(2,t-run.start));
        run.odds=odds(run.s,{k:run.k,rate:n?n/span:.3,head:n?rec.filter(l=>l.head).length/n:.3,melee:n?rec.filter(l=>l.melee).length/n:.05,n:60});
      }
    }else if(phase==='ride')ride(dt);
    if(banner&&(banner.t-=dt)<=0)banner=null;
    for(const [id,m] of mods)if(t>m.until)mods.delete(id);
    if(hr&&t>hr.until){hr=null;say(JP.name+' over');}
    if(streak&&t>streak.until)streak=null;
    for(let i=queue.length-1;i>=0;i--){   // ricochets, arcs and blasts, out of the damage event
      const q=queue[i];if(q.delay>0&&(q.delay-=dt)>0)continue;queue.splice(i,1);
      if(q.blast){ctx.blast(q.blast,200,.8,true);continue;}
      if(!alive(q.from))continue;
      const from=chest(q.from),to=enemies.list.filter(z=>z!==q.from&&z.root.position.distanceTo(q.from.root.position)<(q.range??JP.radius)&&world.lineClear(from,chest(z)))
        .sort((a,b)=>a.root.position.distanceTo(q.from.root.position)-b.root.position.distanceTo(q.from.root.position))[0];
      if(to){line(from,chest(to),q.color);enemies.hurt(to,q.dmg,false,false,q.cause);}
    }
    for(let i=shots.length-1;i>=0;i--){
      const p=shots[i];if(p.delay>0){p.delay-=dt;continue;}
      if(!p.sp.parent)scene.add(p.sp);
      if(p.z&&alive(p.z))p.to=chest(p.z);else if(p.z){p.z=around(p.to,300)[0]??null;if(p.z)p.to=chest(p.z);}
      const d=p.to.clone().sub(p.pos),len=d.length(),step=p.speed*dt;p.life-=dt;
      if(len<=step+20||p.life<=0){p.sp.removeFromParent();shots.splice(i,1);p.hit(p.to,p.z&&alive(p.z)?p.z:null);continue;}
      p.pos.addScaledVector(d,step/len);p.sp.position.copy(p.pos);
    }
    for(let i=holes.length-1;i>=0;i--){   // Black Hole: pull, then implode
      const h=holes[i];h.t-=dt;
      for(const z of around(h.at,400)){const d=h.at.clone().sub(z.root.position);d.y=0;const l=d.length();if(l>30)z.root.position.addScaledVector(d,Math.min(1,160*dt/l));z.stuck=0;}
      if(h.t<=0){holes.splice(i,1);fx().implode?.(h.at);for(const z of around(h.at,400))enemies.hurt(z,.9*hp()*h.k,false,false,'card');}
    }
    for(let i=totems.length-1;i>=0;i--){
      const o=totems[i];o.g.children[1].rotation.y+=dt*2;
      if(S('gamble.totemFollow')){o.g.position.lerp(feet().add(o.off),Math.min(1,dt*3));o.g.updateMatrixWorld(true);}   // Big Medicine
      if(o.id==='lightning'&&(o.tick-=dt)<=0){o.tick=.7;const top=o.g.position.clone().addScaledVector(up,82),z=pickOne(around(o.g.position,o.r).filter(z=>world.lineClear(top,chest(z))));
        if(z){const p=chest(z);fx().strike?.([p.x,p.y,p.z],{color:0x7fc8ff});line(top,p,0x7fc8ff);enemies.hurt(z,.35*hp()*(1+S('gamble.totemDmg')),false,false,'totem');}}
      if(o.id==='eldritch')for(const z of around(o.g.position,o.r))speedMod(z,'eldritch',.65,.25);
      if(o.id==='overshield'&&o.g.position.distanceTo(feet())<o.r)session.health=Math.min(session.maxHealth,session.health+10*dt);
      if(t>o.until){o.g.removeFromParent();totems.splice(i,1);}
    }
    for(const [z,m] of slowed){const a=alive(z);for(const [key,e] of m)if(!a||t>e.until){if(a)z.speed/=e.k;m.delete(key);}if(!m.size)slowed.delete(z);}
    for(const [z,e] of anims){const m=z.rig?.mixer;if(!alive(z)||t>e.until){if(m)m.timeScale=1;anims.delete(z);}else if(m)m.timeScale=e.scale;}
    for(let i=lines.length-1;i>=0;i--){const l=lines[i];l.t-=dt;l.l.material.opacity=Math.max(0,l.t/.1);if(l.t<=0){l.l.removeFromParent();l.l.geometry.dispose();l.l.material.dispose();lines.splice(i,1);}}
    if((drawT-=dt)<=0){drawT=.08;draw();}
  });
  host.on('reset',()=>{
    phase='idle';pick=run=banner=hr=streak=null;marker=aceHits=0;hand.length=0;mods.clear();queue.length=0;holes.length=0;
    for(const o of totems)o.g.removeFromParent();totems.length=0;for(const p of shots)p.sp.removeFromParent();shots.length=0;
    slowed.clear();anims.clear();draw(true);
  });

  // ---- the command wheel: Reshuffle and the hand ------------------------------------------------------------------------------
  const wheel=()=>{
    const out=[];
    if(phase==='play'){const free=S('gamble.freeShuffle')||S('gamble.houseRules')||streakOn();
      out.push({label:'Reshuffle',sub:free?'Free':`${G.reshuffle} Fortune (${fortune()})`,color:cls.color,icon:WHEEL_ICON.shuffle,disabled:!free&&fortune()<G.reshuffle,use:reshuffle});}
    hand.forEach((id,i)=>out.push({label:REWARD[id].name,sub:'Play card',color:'#f8f4ea',icon:WHEEL_ICON.card,use:()=>playCard(i)}));
    return out;
  };
  const register=()=>{if(window.kino?.commandWheel)window.kino.commandWheel.add('gambler',wheel);else setTimeout(register,300);};
  register();

  // ---- the casino overlay -------------------------------------------------------------------------------------------------------
  const style=document.createElement('style');style.textContent=`
    #gmb{position:fixed;inset:0;pointer-events:none;z-index:40;font:700 13px/1.25 'Segoe UI',system-ui,sans-serif;color:#f6ead0;text-shadow:0 1px 2px #000;letter-spacing:.03em}
    #gmb .edge{position:absolute;inset:0;opacity:0;transition:opacity .35s}
    #gmb.on .edge{opacity:1}
    #gmb .edge i{position:absolute;background:radial-gradient(circle,#ffe7a0 0 2.5px,#f2c94c66 3.5px,transparent 5.5px) 0 0/24px 24px}
    #gmb .edge i:nth-child(1){left:0;right:0;top:0;height:14px}#gmb .edge i:nth-child(2){left:0;right:0;bottom:0;height:14px}
    #gmb .edge i:nth-child(3){top:0;bottom:0;left:0;width:14px}#gmb .edge i:nth-child(4){top:0;bottom:0;right:0;width:14px}
    #gmb.fx2 .edge i{animation:gmbChase .7s linear infinite}#gmb.fx0 .edge{display:none}
    @keyframes gmbChase{to{background-position:24px 24px}}
    #gmb.fx2.on .edge{box-shadow:inset 0 0 170px #0d6b3a55}#gmb.hr .edge{opacity:1;box-shadow:inset 0 0 200px #f2c94c70}
    #gmb .board{position:absolute;top:64px;left:50%;transform:translateX(-50%);min-width:380px;max-width:560px;padding:10px 18px 9px;text-align:center;
      background:radial-gradient(ellipse at 50% 0,#17643cf2,#0b3520f2);border:2px solid #f2c94c;border-radius:16px;box-shadow:0 0 22px #f2c94c50,inset 0 0 30px #0008;display:none}
    #gmb.fx0 .board{background:#000a;border-color:#f2c94c80;box-shadow:none;transform:translateX(-50%) scale(.85);transform-origin:top}
    #gmb .board.show{display:block}
    #gmb .ttl{font-size:11px;color:#f2c94c;letter-spacing:.18em}#gmb .ttl b{color:#fff}
    #gmb .tbl{margin:7px 0 3px;min-height:46px;white-space:nowrap}
    #gmb .row{margin:3px 0}#gmb .row small{display:inline-block;width:54px;text-align:right;margin-right:8px;color:#d8c99a;font-size:10px}
    #gmb .cd{display:inline-block;width:30px;height:42px;line-height:42px;margin:0 2px;background:#f8f4ea;color:#151515;border-radius:4px;font-size:15px;text-shadow:none;vertical-align:middle}
    #gmb .cd.r{color:#c4202f}#gmb .cd.h{background:repeating-linear-gradient(45deg,#7a1520 0 4px,#a3242f 4px 8px);color:transparent}
    #gmb .cd.w{background:#f2c94c}#gmb .cd.up{box-shadow:0 0 0 2px #6fcf6a}#gmb .cd.nx{opacity:.6;transform:scale(.8)}
    #gmb .die{display:inline-block;font-size:36px;line-height:1;margin:0 1px;vertical-align:middle}#gmb .die.held{color:#f2c94c;text-shadow:0 0 8px #f2c94c}#gmb .die.hs{color:#e88}#gmb .die.up{color:#8fe08a}
    #gmb .reel{display:inline-block;width:58px;height:58px;line-height:58px;font-size:30px;background:#f8f4ea;color:#c4202f;border-radius:7px;margin:0 3px;text-shadow:none;box-shadow:inset 0 -8px 12px #0003}
    #gmb .reel.spin{filter:blur(1.5px)}#gmb .reel.n{box-shadow:0 0 0 3px #f2c94c}
    #gmb .pk{display:inline-block;width:28px;height:34px;line-height:34px;margin:0 1px;border-radius:3px;vertical-align:middle}
    #gmb .pk.red{background:#c4202f}#gmb .pk.black{background:#1a1a1a}#gmb .pk.green{background:#1d8a4a}#gmb .pk.c{transform:scale(1.3);box-shadow:0 0 0 2px #f2c94c;position:relative;z-index:1}
    #gmb .word{position:absolute;left:0;right:0;top:30px;z-index:2;height:22px;font-size:19px;font-weight:900;color:#f2c94c;letter-spacing:.08em}#gmb .word span{display:inline-block;animation:gmbPop .9s ease-out forwards}
    @keyframes gmbPop{0%{transform:scale(1.6);opacity:0}15%{transform:scale(1);opacity:1}75%{opacity:1}100%{opacity:0}}
    #gmb .now{font-size:11px;color:#e8ddb8}
    #gmb .clock{height:3px;background:#0006;border-radius:2px;margin:6px 0 4px}#gmb .clock i{display:block;height:100%;background:#f2c94c;border-radius:2px}
    #gmb .odds{display:flex;height:7px;border-radius:3px;overflow:hidden;background:#0006}#gmb .odds i{display:block;height:100%}
    #gmb .ol{display:flex;justify-content:space-between;font-size:10px;margin-top:2px;color:#d8c99a}
    #gmb .hint{font-size:10px;color:#cfc3a0;margin-top:5px;letter-spacing:.1em}
    #gmb .mk{font-size:10px;color:#d8c99a;margin-top:3px}#gmb .mk i{display:inline-block;width:8px;height:8px;border-radius:50%;border:1px solid #f2c94c;margin:0 2px;vertical-align:middle}#gmb .mk i.f{background:#f2c94c}
    #gmb .chips{display:flex;gap:10px;justify-content:center;margin:8px 0 6px}
    #gmb .chip{width:58px;height:58px;border-radius:50%;border:5px dashed var(--c);background:#0007;display:flex;align-items:center;justify-content:center;font-size:10px;opacity:.45;transition:transform .12s}
    #gmb .chip.sel{opacity:1;transform:scale(1.18);box-shadow:0 0 16px var(--c)}
    #gmb .desc{font-size:11px;color:#e8ddb8;max-width:430px;margin:0 auto}
    #gmb .ban{position:absolute;top:36%;left:50%;transform:translate(-50%,-50%);text-align:center;display:none}#gmb .ban.show{display:block}
    #gmb .ban h1{margin:0;font-size:46px;font-weight:900;letter-spacing:.1em;text-shadow:0 0 18px currentColor,0 2px 4px #000}
    #gmb .ban h2{margin:2px 0 6px;font-size:16px;color:#fff}#gmb .ban p{margin:0;font-size:12px;color:#f2e2b0}
    #gmb .coin{display:inline-block;width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff3c0,#f2c94c 50%,#a37a12);margin:6px;animation:gmbFlip .25s linear infinite}
    @keyframes gmbFlip{50%{transform:scaleX(.08)}}
    #gmb .rack{position:absolute;left:28px;top:46%;transform:translateY(-50%);text-align:left}   /* left edge, mid-screen: the bottom right holds the guns and gobblegums, the top right the round and co-op panel */
    #gmb .rack div{margin-top:3px}#gmb .rack .hrm{font-size:18px;font-weight:900;color:#f2c94c;text-shadow:0 0 12px #f2c94c}
    #gmb .hc{display:inline-block;width:40px;height:56px;margin-right:4px;padding-top:4px;background:#f8f4ea;color:#151515;border:2px solid #f2c94c;border-radius:5px;font-size:9px;line-height:1.1;text-align:center;text-shadow:none;vertical-align:bottom;white-space:normal}
    #gmb .hc kbd{display:block;margin-top:2px;font:800 10px sans-serif;color:#a37a12}
    #gmb .tm{font-size:12px}#gmb .tm b{color:#fff}`;
  document.head.append(style);
  const el=document.createElement('div');el.id='gmb';
  el.innerHTML='<div class="edge"><i></i><i></i><i></i><i></i></div><div class="board"><div class="word"></div><div class="bd"></div></div><div class="ban"></div><div class="rack"></div>';
  document.body.append(el);
  const [board,word,bd,ban,rack]=['.board','.word','.bd','.ban','.rack'].map(s=>el.querySelector(s));
  let drawT=0,last={},wordShown=-1;
  const put=(node,key,html)=>{if(last[key]!==html){last[key]=html;node.innerHTML=html;}};
  const key=c=>(binds()[c]??'').replace(/^Key/,'');
  const sec=v=>Math.max(0,Math.ceil(v))+'s';

  function table(s){
    if(s.id==='slots')return s.reels.map((p,i)=>{const spin=s.t<STOPS[i],sym=STRIP[spin?(p+Math.floor(s.t*14+i*3))%STRIP.length:p];
      return `<span class="reel${spin?' spin':''}${s.nudged===i?' n':''}">${SYM[sym]}</span>`;}).join('');
    if(s.id==='blackjack'){const c=(v,i,hid)=>`<span class="cd${hid?' h':''}${!hid&&i%2?' r':''}">${hid?'':bjRank(v)}</span>`;
      return `<div class="row"><small>DEALER ${s.hidden?bjRank(s.dealer[0]).replace(/[JQK]/,'10'):handTotal(s.dealer)}</small>${s.dealer.map((v,i)=>c(v,i,s.hidden&&i===1)).join('')}</div>`+
        `<div class="row"><small>YOU ${handTotal(s.player)}</small>${s.player.map((v,i)=>c(v,i+1)).join('')}<span class="cd nx${s.peek?'':' h'}">${s.peek?bjRank(s.next):''}</span></div>`;}
    if(s.id==='dice'){const d=(v,cl)=>`<span class="die ${cl}">${DIE[Math.min(6,v)-1]}</span>`;const sum=a=>a.reduce((x,y)=>x+y,0);
      return `<div class="row"><small>YOU ${sum(s.mine)}</small>${s.mine.map((v,i)=>d(v,s.pips[i]?'up':'')).join('')}</div><div class="row"><small>HOUSE ${sum(s.house)}</small>${s.house.map(v=>d(v,'hs')).join('')}</div>`;}
    if(s.id==='roulette'){const at=((Math.floor(s.p)%37)+37)%37;let out='';
      for(let o=-3;o<=3;o++){const n=WHEEL[(at+o+37)%37];out+=`<span class="pk ${colourOf(n)}${o?'':' c'}">${n}</span>`;}
      return out+`<div class="now">BET ${s.colour.toUpperCase()} · LUCKY ${s.lucky}</div>`;}
    if(s.id==='poker')return s.cards.map(c=>`<span class="cd${c.w?' w':c.s===1||c.s===2?' r':''}${c.up?' up':''}">${c.w?'★':pkRank(c.r)+SUIT[c.s]}</span>`).join('')+(s.locked?'<div class="now">LOCKED</div>':'');
    if(s.id==='fistful')return s.dice.map((v,i)=>`<span class="die${s.held[i]?' held':''}">${DIE[v-1]}</span>`).join('')+`<div class="now">RE-ROLLS ${s.rerolls}</div>`;
    return '';
  }
  function oddsBar(o){
    if(!o)return '<div class="odds"></div><div class="ol"><span>READING THE TABLE…</span></div>';
    const seg=[[o.bust,'#d94a5c'],[o.push,'#8a8478'],[o.win-o.big,'#6fcf6a'],[o.big-o.jackpot,'#4ab0e8'],[o.jackpot,'#f2c94c']];
    const pct=v=>Math.round(v*100)+'%';
    return `<div class="odds">${seg.map(([v,c])=>`<i style="width:${v*100}%;background:${c}"></i>`).join('')}</div><div class="ol"><span>BUST ${pct(o.bust)}</span><span>WIN ${pct(o.win)}</span><span>JACKPOT ${pct(o.jackpot)}</span></div>`;
  }
  const markerPips=()=>`<div class="mk">MARKER ${[...Array(markerMax())].map((_,i)=>`<i class="${i<marker?'f':''}"></i>`).join('')}</div>`;
  function draw(force){
    if(force)last={};
    const lvl=Math.round(settings.casinoFx??2);
    el.className=`fx${lvl}${phase!=='idle'?' on':''}${hr&&lvl?' hr':''}`;
    // the board: the ante picker, a game or the ride
    if(phase==='ante'){const a=pick.list[pick.i];
      put(bd,'b',`<div class="ttl">ANTE UP · TABLE <b>${GAMES[pick.game].name.toUpperCase()}</b></div><div class="chips">${pick.list.map((x,i)=>`<div class="chip${i===pick.i?' sel':''}" style="--c:${x.color}">${x.name.toUpperCase()}</div>`).join('')}</div>`+
        `<div class="desc">${a.id==='bankroll'?a.desc.replace(/^Stake [\d,]+ points[^.]*\./,`Stake ${bank().cost} points.`):a.desc}${edgeOf(a)?` House Edge ${Math.round(edgeOf(a)*A().edge*100)}%.`:''}</div>`+
        `<div class="clock"><i style="width:${Math.round(pick.t/G.pick*100)}%"></i></div><div class="hint">${key('ability')} NEXT ANTE${freePick()?` · ${key('reload')} NEXT GAME`:''}</div>`);}
    else if(phase==='play'){const s=run.s,g=GAMES[s.id],now=s.id==='blackjack'||s.id==='slots'&&s.t<STOPS[2]?'':g.result(s).label;
      if(wordShown!==run.wordN){wordShown=run.wordN;word.innerHTML=run.word?`<span>${run.word}</span>`:'';}   // its own node, so redraws don't restart the pop
      put(bd,'b',`<div class="ttl">${run.ante.name.toUpperCase()} · <b>${g.name.toUpperCase()}</b></div><div class="tbl">${table(s)}</div>`+
        `<div class="now">${now?'NOW: '+now:'&nbsp;'}</div><div class="clock"><i style="width:${Math.round(Math.max(0,1-s.t/s.dur)*100)}%"></i></div>${oddsBar(run.odds)}<div class="hint">${g.hint.replace(/\bZ\b/g,key('ability')).replace(/\bR\b/g,key('reload'))}</div>${markerPips()}`);}
    else if(phase==='ride'){const [n,c]=TIER[run.tier],[n2,c2]=TIER[tierUp(run.tier)];
      put(bd,'b',`<div class="ttl">LET IT RIDE · ${run.label}</div><div class="tbl" style="font-size:22px"><span style="color:${c}">${n}</span> → <span style="color:${c2}">${n2}</span></div>`+
        (run.flip?'<div class="tbl"><span class="coin"></span></div>':`<div class="now">ODDS ${Math.round(rideChance()*100)}% · RIDE ${run.rides+1} OF ${A().rides}${S('gamble.allIn')?' · ALL IN: A LOSS STILL PAYS':''}</div><div class="clock"><i style="width:${Math.round(run.rideT/G.ride.time*100)}%"></i></div>`)+
        `<div class="hint">${key('ability')} FLIP · ${key('reload')} CASH OUT</div>`);}
    board.classList.toggle('show',phase!=='idle');if(phase!=='play'&&word.firstChild){word.innerHTML='';wordShown=-1;}
    // the result banner
    if(banner){const [n,c]=TIER[banner.tier];put(ban,'n',`<h1 style="color:${c}">${n}</h1><h2>${banner.label}</h2><p>${banner.lines.join(' · ')}</p>`);}
    ban.classList.toggle('show',!!banner);
    // the rack: High Roller Mode, Hot Streak, gun mods, totems, aces, the hand
    const t=session.time,rows=[];
    if(hr)rows.push(`<div class="hrm">${JP.name.toUpperCase()} ${sec(hr.until-t)}</div>`);
    if(streak)rows.push(`<div class="tm" style="color:#ff9a4a">HOT STREAK <b>${sec(streak.until-t)}</b></div>`);
    for(const [id,m] of mods)rows.push(`<div class="tm">${REWARD[id].name.toUpperCase()}${id==='hotHand'&&m.stacks?' ×'+m.stacks:''} <b>${sec(m.until-t)}</b></div>`);
    for(const o of totems)rows.push(`<div class="tm">${REWARD[o.id].name.toUpperCase()} <b>${sec(o.until-t)}</b></div>`);
    if(aceHits)rows.push(`<div class="tm">ACE OF SPADES <b>×${aceHits}</b></div>`);
    if(phase==='idle'&&marker)rows.push(markerPips());
    if(hand.length)rows.push(`<div>${hand.map((id,i)=>`<span class="hc">${REWARD[id].name.toUpperCase()}${i===0&&ctx.getCooldown()>0&&phase==='idle'?`<kbd>${key('ability')}</kbd>`:''}</span>`).join('')}</div>`);
    put(rack,'r',rows.join(''));
  }
  draw(true);

  return {
    deploy,up:()=>phase!=='idle',
    left:()=>phase==='ante'?'ANTE':phase==='ride'?'RIDE':run?Math.ceil(Math.max(0,run.s.dur-run.s.t)):'',
    near:()=>false,
    // debug handles: kino.classes.gamb
    get phase(){return phase;},get run(){return run;},hand,mods,totems,marker:()=>marker,
    grant,deal,play,plant,highRoller,startRun:(ante='chip',game='slots')=>{pick=null;startRun(ANTE[ante],game);},
  };
}
