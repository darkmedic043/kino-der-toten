// Cheese Cube Unlimited (a ported World at War map, see docs/fork/waw-ports.md): the map's own quests, written against
// the custom-map hooks `world.addInteraction` / `world.addShootTarget` and the build's `entities.json` (positions of every
// named entity) and `ENT_<targetname>` meshes. Does nothing on other maps.
import * as THREE from 'three';

export default async function setup(api){
  if(api.map?.id!=='cheese-cube')return;
  const {world,session,host,toast,announce,audio}=api;
  const ents=await fetch(api.map.dir.replace(/\/?$/,'/')+'entities.json').then(r=>r.json()).catch(()=>[]);
  const named=n=>ents.filter(e=>e.name===n);
  const center=e=>e.bounds?new THREE.Vector3(...[0,1,2].map(i=>(e.bounds[0][i]+e.bounds[1][i])/2)):new THREE.Vector3(...e.origin);
  const nodes=n=>{const out=[];world.root.traverse(o=>{if(o.name===n||o.name.startsWith(n+'_'))out.push(o);});return out;};
  const show=(n,on)=>{for(const o of nodes(n))o.visible=on;};
  const beep=()=>audio?.play?.('buy');

  // ---- Cheese Brothers: shoot the five targets with the cheese gun (the Ray Gun stands in for it): 2000 each, 4000 for all five
  let captured=0;
  const CHEESE_GUN=['ray_gun_zm'];
  for(let n=1;n<=5;n++){
    const trigger=named('cheese_target'+n)[0];if(!trigger)continue;
    world.addShootTarget({position:center(trigger),radius:26,weapons:CHEESE_GUN,hit(){
      show('ENT_target'+n,false);session.addPoints(2000);beep();captured++;
      toast(`Cheese Brother captured · ${captured} / 5 · +2000`,3);
      if(captured===5){session.addPoints(4000);announce('You captured all the Cheese Brothers!',"WE'LL KEEP THEM BEHIND BARS",5);}
    }});
  }

  // ---- The power switch: carry the panel, the handle and the wire to the switch and add them; then the switch works
  const PARTS=[['panel','panel'],['handle','handle'],['wire','wire']];
  const carrying=new Set(),placed=new Set();
  for(const [id] of PARTS){show(`ENT_${id}_build`,false);}
  for(const [id,label] of PARTS){
    const pick=named(id+'_pick_trig')[0]??named(id+'_pick')[0],place=named(id+'_build_trig')[0]??named(id+'_build')[0];
    if(pick)world.addInteraction({position:center(pick),text:()=>`Take the ${label}`,hidden:()=>carrying.has(id)||placed.has(id),
      use(){carrying.add(id);show(`ENT_${id}_pick`,false);beep();toast(`You took the ${label}`,3);return true;}});
    if(place)world.addInteraction({position:center(place),text:()=>`Add the ${label}`,hidden:()=>!carrying.has(id)||placed.has(id),
      use(){placed.add(id);carrying.delete(id);show(`ENT_${id}_build`,true);beep();toast(`${placed.size} / 3 parts added`,3);
        if(placed.size===3)announce('The switch is ready','TURN ON THE CHEESE POWER',4);return true;}});
  }
  const powerSwitch=world.interactions.find(e=>e.kind==='power');
  if(powerSwitch){powerSwitch.locked=()=>placed.size<3;powerSwitch.lockedText='The power switch needs a panel, a handle and a wire';}
  host.on('update',()=>{if(session.power&&nodes('ENT_spawn_part_cage').some(o=>o.visible))show('ENT_spawn_part_cage',false);});

  const board=window.kino.scoreboard;
  board?.addCollectible({id:'cc-brothers',label:'Cheese Brothers',value:()=>`${captured} / 5`,done:()=>captured>=5});
  board?.addCollectible({id:'cc-parts',label:'Power switch parts',value:()=>`${placed.size} / 3${carrying.size?` · carrying ${[...carrying].join(', ')}`:''}`,done:()=>placed.size>=3});

  // ---- The ending: pay 25000 at the top ("if thou art worthy"), then the map is won
  const ending=named('cheese_ending')[0];
  let won=null;
  if(ending){
    world.addInteraction({position:center(ending),text:()=>'Press F if thou art worthy · Tis expensive: 25000',hidden:()=>!!won,
      use(){
        if(session.points<25000){toast('Thou art not worthy. Get some more money.',4);return false;}
        session.spend(25000);beep();show('ENT_cheese_ending_clip',false);won=session.time+7;
        announce('THOU ART WORTHY','THE HAMMER IS YOURS',6);return true;
      }});
    host.on('update',()=>{
      if(won!==null&&session.time>=won&&session.phase!=='gameover'){won=null;session.phase='gameover';session.lastEvent='You conquered the Cheese Cube';host.emit('gameOver',{round:session.round,kills:session.kills});}
    });
  }
  host.on('reset',()=>{captured=0;carrying.clear();placed.clear();won=null;for(const [id] of PARTS){show(`ENT_${id}_build`,false);show(`ENT_${id}_pick`,true);}for(let n=1;n<=5;n++)show('ENT_target'+n,true);show('ENT_cheese_ending_clip',true);show('ENT_spawn_part_cage',true);});
}
