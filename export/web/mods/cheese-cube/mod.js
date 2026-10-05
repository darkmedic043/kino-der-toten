// Cheese Cube Unlimited (a ported World at War map, see docs/fork/waw-ports.md): the map's own quests, written against
// the custom-map hooks `world.addInteraction` / `world.addShootTarget` / `world.slideMover` and the build's `entities.json`
// (positions and bounds of every named entity) and `ENT_<targetname>` meshes. Does nothing on other maps.
//   power switch: carry the panel, handle and wire to the switch (the perks need the power)
//   Cheese Brothers: five targets, shot with the Cheese Gun (an MP40 clone sold at the two wall buys)
//   trivia: shoot the answer to each question on the screen; a wrong answer locks it for two minutes
//   puzzle: set three dials to the combination; it opens the door to the ending
//   ending: 25000 at the top, once the puzzle is solved
//   Iron Man suits: six parts to build, then buyable armors (suits.js)
import * as THREE from 'three';

export default async function setup(api){
  if(api.map?.id!=='cheese-cube')return;
  const {world,session,host,toast,announce,audio,equipView}=api;
  const ents=await fetch(api.map.dir.replace(/\/?$/,'/')+'entities.json').then(r=>r.json()).catch(()=>[]);
  const named=n=>ents.filter(e=>e.name===n);
  const center=e=>e.bounds?new THREE.Vector3(...[0,1,2].map(i=>(e.bounds[0][i]+e.bounds[1][i])/2)):new THREE.Vector3(...e.origin);
  const boxOf=e=>new THREE.Box3(new THREE.Vector3(...e.bounds[0]),new THREE.Vector3(...e.bounds[1]));
  // top-level scene objects of a named mesh (a multi-part mesh is a group whose first child shares the name)
  const nodes=n=>{const out=[];world.root.traverse(o=>{if(o.name===n&&o.parent?.name!==n)out.push(o);});return out;};
  const show=(n,on)=>{for(const o of nodes(n))o.visible=on;};
  const beep=()=>audio?.play?.('buy');
  const now=()=>session.time;
  // The map's own sounds (map folder `sounds/`, git-ignored); a failed load is silent.
  const soundBase=api.map.dir.replace(/\/?$/,'/')+'sounds/',playing=new Set();
  // Played through the game's Web Audio mixer (a gain per sound into its master): an <audio> element's own volume is
  // ignored on iPhone/iPad (always full), so positional sounds like the perk jingles were heard map-wide there, and the
  // game's volume setting did not apply. `a.volume` on the returned element drives that gain (x2.4 makes up the
  // master's .42, so loudness matches the old direct playback).
  const LEVEL=1/.42;
  const sound=(name,{volume=.7,loop=false}={})=>{
    try{
      const a=new Audio(soundBase+name+'.ogg');a.loop=loop;
      const ctx=audio?.ctx,master=audio?.master;
      if(ctx&&master){
        const g=ctx.createGain();g.gain.value=volume*LEVEL;ctx.createMediaElementSource(a).connect(g).connect(master);
        Object.defineProperty(a,'volume',{configurable:true,get:()=>g.gain.value/LEVEL,set:v=>{g.gain.value=Math.max(0,v)*LEVEL;}});
        if(ctx.state==='suspended')ctx.resume().catch(()=>{});
      }else a.volume=volume;
      a.play().catch(()=>{});playing.add(a);a.addEventListener('ended',()=>playing.delete(a));return a;
    }catch{return null;}
  };
  host.on('reset',()=>{for(const a of playing)a.pause();playing.clear();});
  const board=window.kino.scoreboard;

  // ---- The Cheese Gun: in the map it is an MP40 that hits for 250 (the weapon file reuses the MP40 viewmodel). The two
  // wall buys are built as MP40 spots; they sell this weapon. Sounds and animations come from the MP40 (baseId).
  const mp40=api.data?.weapons?.mp40_zm;
  if(mp40){
    api.data.weapons.cheese_gun={...mp40,id:'cheese_gun',baseId:'mp40_zm',name:'Cheese Gun',price:1000,damage:250,minDamage:250,clipSize:30,startAmmo:210,maxAmmo:210};
    for(const e of world.interactions)if(e.kind==='wallbuy'&&e.weapon==='mp40_zm')e.weapon='cheese_gun';
    // Its own camo: Swiss Cheese (weapon-levels camos.json, a reward camo), always on this gun. Buying the ending unlocks it
    // for every gun (see theEnding).
    Object.defineProperty(api.data.weapons.cheese_gun,'camo',{get:()=>'cheese',set(){},configurable:true,enumerable:true});
  }

  // ---- tweens for the small moving pieces (the static-scene optimizer froze their transforms, so update the matrices)
  const tweens=[];
  const bases=new Map();
  const baseOf=o=>{if(!bases.has(o))bases.set(o,o.position.clone());return bases.get(o);};
  function tween(name,axis,to,seconds,from){
    const objs=nodes(name);if(!objs.length)return;
    const current=objs[0].position[axis]-baseOf(objs[0])[axis];
    tweens.push({objs,axis,from:from??current,to,t0:now(),dur:Math.max(.001,seconds)});
  }
  host.on('update',()=>{
    // in start order, so a later tween on the same axis wins; one that has not started yet does nothing
    const done=new Set();
    for(const t of tweens){
      if(now()<t.t0)continue;
      const k=Math.min(1,(now()-t.t0)/t.dur),v=t.from+(t.to-t.from)*k;
      for(const o of t.objs){o.position[t.axis]=baseOf(o)[t.axis]+v;o.updateMatrix();o.updateMatrixWorld(true);}
      if(k>=1)done.add(t);
    }
    for(let i=tweens.length-1;i>=0;i--)if(done.has(tweens[i])||tweens.some((u,j)=>j>i&&now()>=u.t0&&u.axis===tweens[i].axis&&u.objs[0]===tweens[i].objs[0]))tweens.splice(i,1);
  });

  // ---- Cheese Brothers: shoot the five targets with the cheese gun: 2000 each, 4000 for all five
  let captured=0;
  for(let n=1;n<=5;n++){
    const trigger=named('cheese_target'+n)[0];if(!trigger)continue;
    let hintAt=-99;
    world.addShootTarget({position:center(trigger),radius:26,weapons:['cheese_gun'],
      wrong(){if(now()-hintAt>6){hintAt=now();toast('Only the Cheese Gun can capture a Cheese Brother',3);}},hit(){
      show('ENT_target'+n,false);session.addPoints(2000);beep();captured++;
      toast(`Cheese Brother captured · ${captured} / 5 · +2000`,3);
      if(captured===5){session.addPoints(4000);announce('You captured all the Cheese Brothers!',"WE'LL KEEP THEM BEHIND BARS",5);}
    }});
  }

  // ---- Co-op: quest progress is shared. Each event is sent to everyone else, who apply it silently (late joiners miss earlier events).
  const syncHandlers=new Map();let syncSub=false;
  const sync={on:(k,fn)=>syncHandlers.set(k,fn),emit:(k,d)=>{const net=window.kino.coop;if(net?.id)net.send('all',{t:'cc',k,d});}};
  host.on('update',()=>{const net=window.kino.coop;if(net&&!syncSub){syncSub=true;net.on('cc',m=>syncHandlers.get(m?.k)?.(m.d));}});

  // ---- The power switch: carry the panel, the handle and the wire to the switch and add them; then the switch works
  const PARTS=['panel','handle','wire'];
  const carrying=new Set(),placed=new Set();
  for(const id of PARTS)show(`ENT_${id}_build`,false);
  const takePart=(id,remote)=>{
    if(carrying.has(id)||placed.has(id))return;
    carrying.add(id);show(`ENT_${id}_pick`,false);
    if(!remote){beep();toast(`You took the ${id}`,3);sync.emit('pw-take',id);}else toast(`A teammate took the ${id}`,3);
  };
  const placePart=(id,remote)=>{
    if(placed.has(id))return;
    placed.add(id);carrying.delete(id);show(`ENT_${id}_pick`,false);show(`ENT_${id}_build`,true);
    if(!remote){beep();sync.emit('pw-place',id);}
    toast(`${placed.size} / 3 parts added`,3);
    if(placed.size===3)announce('The switch is ready','TURN ON THE CHEESE POWER',4);
  };
  sync.on('pw-take',id=>takePart(id,true));sync.on('pw-place',id=>placePart(id,true));
  for(const id of PARTS){
    const pick=named(id+'_pick_trig')[0]??named(id+'_pick')[0],place=named(id+'_build_trig')[0]??named(id+'_build')[0];
    if(pick)world.addInteraction({position:center(pick),text:()=>`Take the ${id}`,hidden:()=>carrying.has(id)||placed.has(id),use(){takePart(id);return true;}});
    if(place)world.addInteraction({position:center(place),text:()=>`Add the ${id}`,hidden:()=>!carrying.has(id)||placed.has(id),use(){placePart(id);return true;}});
  }
  const powerSwitch=world.interactions.find(e=>e.kind==='power');
  if(powerSwitch){powerSwitch.locked=()=>placed.size<3;powerSwitch.lockedText='The power switch needs a panel, a handle and a wire';}
  host.on('update',()=>{if(session.power&&nodes('ENT_spawn_part_cage').some(o=>o.visible))show('ENT_spawn_part_cage',false);});

  // ---- Trivia: shoot the answer plate (A to D) under the question. Seven questions, one screen peels away per answer.
  const STEPS=[
    {want:2,hide:['trivia1']},{want:2,hide:['trivia2']},{want:3,hide:['trivia3']},{want:4,hide:['trivia4']},
    {want:2,hide:['trivia5','trivia6'],onlyD:true},                       // then only D is live
    {want:4,hide:['trivia7'],silent:true,reopenAfter:4},                  // D again, then A to C come back
    {want:1,hide:['trivia8'],final:true},
  ];
  const plates=['a','b','c','d'].map((letter,i)=>({letter,n:i+1,ent:named('answer_'+letter)[0],on:true,target:null}));
  let step=0,retryAt=0,reopenAt=0,triviaDone=false,lastAnswer=0;
  // The plates are thin slits stacked A (top) to D (bottom): give each one a hit band that runs to halfway between it and its
  // neighbour, so a shot anywhere across the stack lands on exactly one plate.
  const bands=(()=>{
    const live=plates.filter(p=>p.ent).sort((a,b)=>center(b.ent).y-center(a.ent).y),map=new Map();
    live.forEach((p,i)=>{
      const c=center(p.ent).y,above=live[i-1]?(c+center(live[i-1].ent).y)/2:c+1,below=live[i+1]?(c+center(live[i+1].ent).y)/2:c-1;
      const b=boxOf(p.ent);b.min.y=below;b.max.y=above;b.min.x-=.4;b.max.x+=.4;b.min.z-=1.2;b.max.z+=1.2;map.set(p,b);
    });
    return map;
  })();
  function armPlates(){
    if(triviaDone||now()<retryAt)return;
    for(const p of plates){
      if(!p.ent||p.target||!p.on)continue;
      p.target=world.addShootTarget({position:center(p.ent),box:bands.get(p),radius:4,hit(_t,ray,point){p.target=null;answer(p.n,point);}});
    }
  }
  function disarmPlates(){
    for(const p of plates){if(p.target){const list=world.shootTargets??[],i=list.indexOf(p.target);if(i>=0)list.splice(i,1);p.target=null;}}
  }
  function answer(n,point){
    const s=STEPS[step];if(!s||triviaDone)return;lastAnswer=n;(window.kino.cheeseCube.log??=[]).push(`t${now().toFixed(2)} plate${n} step${step} want${s.want} hitY=${point?.y?.toFixed(2)}`);
    if(n===s.want){
      if(!s.silent)toast('You are correct!',2);
      for(const h of s.hide)show('ENT_'+h,false);
      if(s.onlyD)for(const p of plates)p.on=p.letter==='d';
      if(s.reopenAfter)reopenAt=now()+s.reopenAfter;
      step++;
      if(s.final){
        triviaDone=true;disarmPlates();
        const gun=api.data?.weapons?.bo3_rpg_dragon?'bo3_rpg_dragon':'m72_law_zm';
        if(api.data?.weapons?.[gun]){session.giveWeapon(gun);equipView?.();}
        announce('WAR MACHINE UNLOCKED','TRIVIA COMPLETE',6);beep();
      }
    }else{
      toast('Incorrect. You are a failure',3);disarmPlates();retryAt=now()+120;
    }
    armPlates();
  }
  host.on('update',()=>{
    if(reopenAt&&now()>=reopenAt){reopenAt=0;for(const p of plates)if(p.letter!=='d')p.on=true;}
    if(retryAt&&now()>=retryAt){retryAt=0;if(!triviaDone)toast('Trivia game is ready',3);}
    armPlates();
  });
  armPlates();

  // ---- Puzzle: three dials, each press steps a digit down (5 4 3 2 1 0 9 8 7 6, wrapping). Right 8, middle 1, left 2.
  const DIALS=['right','middle','left'].map(k=>({k,want:{right:8,middle:1,left:2}[k],digit:5,busyUntil:0,trig:named(`${k}_trig_ric`)[0]}));
  const offsetOf=d=>d===0?5:d-5;    // the digit strip: 0 sits a full turn above the 5
  let solved=false,solvedAt=0,doorOpen=false,endingReady=false;
  for(const d of DIALS){
    if(!d.trig)continue;
    world.addInteraction({position:center(d.trig),text:()=>`Press the ${d.k} button · ${d.digit}`,hidden:()=>solved,
      use(){
        if(now()<d.busyUntil)return false;
        const from=d.digit;d.digit=(d.digit+9)%10;
        const seconds=from===1?3:.5;d.busyUntil=now()+(from===1?3:1);
        tween(`ENT_piece_${d.k}_ric`,'y',offsetOf(d.digit),seconds,offsetOf(from));
        tween(`ENT_${d.k}_button_ric`,'z',-1,.2,0);
        tweens.push({objs:nodes(`ENT_${d.k}_button_ric`),axis:'z',from:-1,to:0,t0:now()+.3,dur:.2});
        beep();toast(`${d.k[0].toUpperCase()+d.k.slice(1)} dial: ${d.digit}`,2);
        return true;
      }});
  }
  const unlockEnding=()=>{endingReady=true;};
  host.on('update',()=>{
    if(solved){
      const t=now()-solvedAt;
      if(!doorOpen&&t>=2){doorOpen=true;for(const n of ['ENT_piece_right_ric','ENT_piece_middle_ric','ENT_piece_left_ric','ENT_right_button_ric','ENT_middle_button_ric','ENT_left_button_ric','ENT_ric_answer_block'])show(n,false);
        world.slideMover('thor_ending_door',1,2,now());}
      if(doorOpen&&!endingReady&&t>=4){world.enableMover('thor_ending_door',false);unlockEnding();announce('The way is open','THE HAMMER AWAITS',4);}
      return;
    }
    if(DIALS.every(d=>d.digit===d.want&&now()>=d.busyUntil)){solved=true;solvedAt=now();toast('Puzzle solved',4);beep();}
  });

  // ---- The ending: pay 25000 at the top ("if thou art worthy") once the puzzle is solved, then the map is won
  const ending=named('cheese_ending')[0];
  // The hammer rises with thunder, the screen goes black, then the map's closing cards (as the original: about 45 s).
  // As hammer_end(): it rises 100 in 4 s while rolling 160 degrees over 10 s, keeps rising, and at 11 s flies off to the
  // hammer_ending spot; thunder (the map's thor_ending fx, every 0.2 s at thor_fx) plays until then. Everyone is
  // invulnerable from the purchase on, and suits come off.
  async function unlockCheeseCamo(){
    try{
      const {loadProfile,saveProfile}=await import('../../profile.js');
      const fresh=loadProfile();fresh.rewards={...fresh.rewards,cheese:true};saveProfile(fresh);
      const wl=window.kino.weaponLevels;if(wl?.profile){wl.profile.rewards={...wl.profile.rewards,cheese:true};wl.apply?.();}
      setTimeout(()=>toast('Swiss Cheese camo unlocked for every gun',5),3000);
    }catch(e){console.warn('cheese camo reward failed',e);}
  }
  // Thunder at the hammer: a few jagged bolts redrawn every 0.1 s (each segment a bright core in a soft glow; WebGL
  // lines are one pixel wide), and a flickering blue light.
  function thunder(at,seconds){
    if(!at||!api.scene)return;
    const c=new THREE.Vector3(...at.origin),group=new THREE.Group(),light=new THREE.PointLight(0x9fc8ff,0,900,1.6);
    light.position.copy(c).y+=40;group.add(light);api.scene.add(group);
    const unit=new THREE.CylinderGeometry(1,1,1,6,1,true).translate(0,.5,0);
    const core=new THREE.MeshBasicMaterial({color:0xeef6ff,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false});
    const glow=new THREE.MeshBasicMaterial({color:0x6aa8ff,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false});
    const up=new THREE.Vector3(0,1,0),bolts=new THREE.Group();group.add(bolts);
    const segment=(a,b,r,mat)=>{const m=new THREE.Mesh(unit,mat),d=b.clone().sub(a);m.position.copy(a);m.scale.set(r,d.length(),r);
      m.quaternion.setFromUnitVectors(up,d.normalize());bolts.add(m);};
    const bolt=()=>{let p=c.clone().add(new THREE.Vector3(0,20,0));
      const dir=new THREE.Vector3((Math.random()-.5)*1.2,1,(Math.random()-.5)*1.2).normalize(),len=180+Math.random()*320;
      for(let i=1;i<=10;i++){const q=p.clone().addScaledVector(dir,len/10).add(new THREE.Vector3((Math.random()-.5)*36,(Math.random()-.5)*20,(Math.random()-.5)*36));
        segment(p,q,1.2,core);segment(p,q,5,glow);p=q;}};
    const t0=now();let next=0;
    const step=()=>{
      const t=now()-t0;if(t>seconds||won===null){group.removeFromParent();unit.dispose();core.dispose();glow.dispose();return;}
      if(t>=next){next=t+.1;bolts.clear();
        const n=Math.random()<.6?1+Math.floor(Math.random()*3):0;for(let i=0;i<n;i++)bolt();
        light.intensity=n?6+Math.random()*10:Math.random()*1.5;}   // the thunder itself is in thor_end
      requestAnimationFrame(step);};
    step();
  }
  function theEnding(){
    window.kino.cheeseCube.suitsOff?.();
    unlockCheeseCamo();
    sound('thor_end',{volume:.85});
    session.effects.invulnerable=1e9;
    const hammer=nodes('ENT_thor_hammer'),to=named('hammer_ending')[0],from=named('thor_hammer')[0];
    tween('ENT_thor_hammer','y',100,4,0);
    tweens.push({objs:hammer,axis:'y',from:100,to:150,t0:now()+4,dur:7});
    if(to&&from){const d=[0,1,2].map(i=>to.origin[i]-from.origin[i]);
      for(const [i,axis] of ['x','y','z'].entries())tweens.push({objs:hammer,axis,from:axis==='y'?150:0,to:d[i],t0:now()+11,dur:2.05});}
    // the roll, about the hammer's own forward axis
    const t0=now(),q0=new Map(hammer.map(o=>[o,o.quaternion.clone()])),xAxis=new THREE.Vector3(1,0,0),qr=new THREE.Quaternion();
    const roll=()=>{const k=Math.min(1,Math.max(0,(now()-t0-.5)/10));
      for(const o of hammer){o.quaternion.copy(q0.get(o)).multiply(qr.setFromAxisAngle(xAxis,THREE.MathUtils.degToRad(160*k)));o.updateMatrix();o.updateMatrixWorld(true);}
      if(k<1&&won!==null)requestAnimationFrame(roll);};
    roll();
    thunder(named('thor_fx')[0],11.5);
    const veil=document.createElement('div');
    veil.style.cssText='position:fixed;inset:0;z-index:60;background:#000;opacity:0;transition:opacity 2s;display:grid;place-items:center;pointer-events:none';
    const line=document.createElement('div');line.style.cssText='color:#fff;font:600 28px/1.3 Georgia,serif;letter-spacing:.06em;text-align:center;max-width:80vw;opacity:0;transition:opacity 3s';
    veil.append(line);document.body.append(veil);
    const cards=[[0,'Have you ever wanted to be a superhero in the zombie apocalypse?',5],[8,'Malibu Drive',6],[16,'Avengers: Age of Apocalypse',6],[26,'Coming Soon',5]];
    setTimeout(()=>{veil.style.opacity=1;sound('ending_music',{volume:.55});},12000);
    for(const [t,text,hold] of cards){
      setTimeout(()=>{line.textContent=text;line.style.opacity=1;setTimeout(()=>{line.style.opacity=0;},hold*1000);},(14+t)*1000);
    }
    setTimeout(()=>veil.remove(),46000);
    host.on('reset',()=>veil.remove());
  }
  let won=null;
  if(ending){
    const e=world.addInteraction({position:center(ending),text:()=>'Press F if thou art worthy · Tis expensive: 25000',hidden:()=>!!won,
      use(){
        if(session.phase==='reviving'||window.kino.coop?.anyDown?.()){toast('All players must be alive to be worthy',2);return false;}
        if(session.points<25000){toast('Thou art not worthy',4);setTimeout(()=>toast('Get some more money you idiot',3),4000);return false;}
        session.spend(25000);beep();show('ENT_cheese_ending_clip',false);won=now()+46;
        announce('THOU ART WORTHY','THE HAMMER IS YOURS',6);theEnding();return true;
      }});
    e.locked=()=>!endingReady;e.lockedText='The hammer is sealed away. Solve the puzzle.';
    host.on('update',()=>{
      if(won!==null&&now()>=won&&session.phase!=='gameover'){won=null;session.phase='gameover';session.lastEvent='You conquered the Cheese Cube';host.emit('gameOver',{round:session.round,kills:session.kills});}
    });
  }

  window.kino.cheeseCube={log:[],state:()=>({captured,placed:[...placed],lastAnswer,step,triviaDone,retryAt,dials:DIALS.map(d=>d.digit),solved,doorOpen,endingReady,won})};   // for tests

  // ---- Iron Man suits (own file)
  const {setupSuits}=await import('./suits.js');
  window.kino.cheeseCube.suits=setupSuits({api,world,session,host,toast,announce,named,center,nodes,show,beep,now,board,player:api.player,triviaDone:()=>triviaDone,sync,sound}).state;

  // ---- Scoreboard collectibles
  board?.addCollectible({id:'cc-brothers',label:'Cheese Brothers',value:()=>`${captured} / 5`,done:()=>captured>=5});
  board?.addCollectible({id:'cc-parts',label:'Power switch',value:()=>`${placed.size} / 3 built`,done:()=>placed.size>=3,
    parts:()=>PARTS.map(id=>({label:id,short:id.slice(0,2).toUpperCase(),state:placed.has(id)?'placed':carrying.has(id)?'carried':'none'}))});
  board?.addCollectible({id:'cc-trivia',label:'Trivia',value:()=>triviaDone?'Complete':`${step} / ${STEPS.length}`,done:()=>triviaDone});
  board?.addCollectible({id:'cc-puzzle',label:'Puzzle',value:()=>solved?'Solved':'Unsolved',done:()=>solved});

  host.on('reset',()=>{
    captured=0;carrying.clear();placed.clear();won=null;
    for(const id of PARTS){show(`ENT_${id}_build`,false);show(`ENT_${id}_pick`,true);}
    for(let n=1;n<=5;n++)show('ENT_target'+n,true);show('ENT_cheese_ending_clip',true);show('ENT_spawn_part_cage',true);
    // trivia
    step=0;retryAt=0;reopenAt=0;triviaDone=false;disarmPlates();for(const p of plates)p.on=true;for(let i=1;i<=9;i++)show('ENT_trivia'+i,true);armPlates();
    // puzzle
    tweens.length=0;solved=false;doorOpen=false;endingReady=false;
    for(const d of DIALS){d.digit=5;d.busyUntil=0;for(const o of nodes(`ENT_piece_${d.k}_ric`)){o.position.copy(baseOf(o));o.updateMatrix();o.updateMatrixWorld(true);}}
    for(const n of ['ENT_piece_right_ric','ENT_piece_middle_ric','ENT_piece_left_ric','ENT_right_button_ric','ENT_middle_button_ric','ENT_left_button_ric','ENT_ric_answer_block'])show(n,true);
  });


  // ---- Credits: four seconds after any game over, "Special Thanks to" and the map makers' names, one card at a time
  const CREDITS=['Special Thanks to','offthewall','Redspace200','Stuffed Oatmeal','HexZombies','MrTomBone8'];
  let creditsRan=false,creditTimers=[];
  const creditEl=document.createElement('div');
  creditEl.style.cssText='position:fixed;inset:0;z-index:70;display:grid;place-items:center;pointer-events:none;color:#fff;font:600 30px/1.2 Georgia,serif;letter-spacing:.08em;text-shadow:0 0 12px #000;opacity:0;transition:opacity 1s';
  document.body.append(creditEl);
  host.on('gameOver',()=>{
    if(creditsRan)return;creditsRan=true;
    CREDITS.forEach((name,i)=>{
      creditTimers.push(setTimeout(()=>{creditEl.textContent=name;creditEl.style.opacity=1;},(4+i*4.25)*1000));
      creditTimers.push(setTimeout(()=>{creditEl.style.opacity=0;},(4+i*4.25+3.25)*1000));
    });
  });
  host.on('reset',()=>{creditsRan=false;for(const t of creditTimers)clearTimeout(t);creditTimers=[];creditEl.style.opacity=0;});

  // ---- The smaller eggs (own file; after the reset handler above so their resets run last)
  const {setupEggs}=await import('./eggs.js');
  setupEggs({world,session,host,toast,named,center,boxOf,tween,tweens,nodes,now,sound,player:api.player});
  const {setupPerks}=await import('./perks.js');
  await setupPerks({api,world,session,host,toast,named,center,beep,sound});
}
