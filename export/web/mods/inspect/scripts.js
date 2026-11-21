// Inspect scripts: what each gun without an authored inspect clip does when you hold reload.
// A script is a list of steps, run one after another by mods/inspect/mod.js:
//   ['<pose>', hold]              move the gun to a pose (POSES) and keep it there for `hold` seconds
//   ['flourish', {pose}]          the gun's own first-raise flourish (slide rack, cylinder spin, bolt pull), from the
//                                 moment the gun is up; skipped where the first raise is just the pullout
//   ['mag', {pose, hold}]         magazine check: the reload clip up to the magazine in the hand, held, then run back
//   ['port', {pose, hold}]        shell-by-shell guns: open up as for a reload, look, close with the reload's end clip
//   ['rack', {pose}]              the rechamber clip (bolt actions, the China Lake's pump)
//   ['spin', {bone, axis, turns, dur, delay}] / ['swing', {bone, axis, swing, beats, dur, delay}]   a part turns on its own
//   ['snd', name, delay]          a sound by its notetrack name
// A step the gun has no clip for is left out. SCRIPTS holds the guns written by hand; every other gun gets its class's
// theme (THEMES), one of its variants picked and its angles and timing shifted by the gun's id, so two guns of a class
// still differ, and each plays its own clips.
import { weaponClass } from '../weapon-levels/camo.js';

// poses: `r` = Euler [pitch (muzzle up), yaw (muzzle left), roll (top to the left)] in rad; `at` = where the middle of
// the gun goes on screen, in half-screens from the centre [right, up]; `fill` = how much of the screen its outline may
// span (the director works out the distance from the gun's size, so a pistol and a launcher frame alike), no
// further than `far` times its usual distance (the arm models are open at the elbow: keep them leaving the bottom edge)
export const POSES={
  rest:{r:[0,0,0],at:[0,0],fill:.5,w:0},
  left:{r:[.1,.48,.42],at:[-.12,-.5],fill:.46},       // up and turned, one flank to the eye
  right:{r:[-.04,-.3,-.3],at:[.1,-.52],fill:.46},    // rolled over to the other flank
  cant:{r:[.06,.22,.8],at:[-.1,-.5],fill:.46},       // canted well over
  flat:{r:[.06,.34,1.0],at:[-.1,-.42],fill:.5},        // on its side
  under:{r:[.28,.36,1.12],at:[-.1,-.4],fill:.52},    // rolled and tipped: the magazine well
  up:{r:[.9,.16,.22],at:[-.08,-.3],fill:.95,far:1.3},        // muzzle to the ceiling
  top:{r:[-.13,.2,.05],at:[0,-.5],fill:.46},         // tipped down, looking along the top
  sight:{r:[.02,.07,.1],at:[0,-.4],fill:.42},        // brought up level, as if checking the sights
  low:{r:[-.24,.3,.14],at:[.15,-.7],fill:.46},        // let down, at ease
  broad:{r:[.05,1.1,.16],at:[-.04,-.3],fill:.7,far:2.8},     // broadside across the view
  broadR:{r:[.04,-.95,-.1],at:[.06,-.3],fill:.7,far:2.8},    // broadside the other way
  // pairs
  dwOut:{r:[.1,0,0],at:[0,-.45],fill:.5},
  dwLeft:{r:[.12,.5,.2],at:[.06,-.45],fill:.6},
  dwRight:{r:[.12,-.5,-.2],at:[-.06,-.45],fill:.6},
  dwUp:{r:[.75,0,0],at:[0,-.3],fill:.7,far:1.4},
  dwRoll:{r:[.1,0,.5],at:[0,-.42],fill:.55},
  dwRollR:{r:[.1,0,-.5],at:[0,-.42],fill:.55},
};

// ---- guns written by hand ('+' = its Pack-a-Punched form, where that is a different gun) ----
export const SCRIPTS={
  // pistols
  m1911_zm:[['cant',.2],['flourish',{pose:'left'}],['flat',.45],['mag',{pose:'under',hold:.5}],['right',.35]],
  python_zm:[['up',.25],['flourish',{pose:'up'}],['broad',.55],['cant',.15,.22],['right',.3,.22]],
  cz75_zm:[['right',.35],['mag',{pose:'up',hold:.6}],['flourish',{pose:'cant'}],['broad',.45]],
  // rifles
  m14_zm:[['sight',.5],['flourish',{pose:'left'}],['mag',{pose:'under',hold:.45}],['broad',.5]],
  m16_zm:[['sight',.55],['flourish',{pose:'cant'}],['left',.35],['mag',{pose:'under',hold:.5}],['right',.3]],
  galil_zm:[['broad',.6],['flourish',{pose:'left'}],['top',.4],['mag',{pose:'cant',hold:.5}]],
  commando_zm:[['cant',.35],['mag',{pose:'under',hold:.6}],['sight',.4],['flourish',{pose:'left'}],['right',.3]],
  famas_zm:[['up',.4],['flourish',{pose:'cant'}],['broad',.5],['mag',{pose:'under',hold:.45}]],
  aug_acog_zm:[['sight',.7],['right',.4],['mag',{pose:'flat',hold:.5}],['flourish',{pose:'left'}]],
  fnfal_zm:[['left',.45],['flourish',{pose:'left'}],['mag',{pose:'under',hold:.5}],['sight',.5]],
  g11_lps_zm:[['broad',.7],['top',.4],['flourish',{pose:'cant'}],['mag',{pose:'top',hold:.4}]],
  // submachine guns
  mp40_zm:[['left',.35],['flourish',{pose:'left'}],['mag',{pose:'flat',hold:.5}],['sight',.45]],
  mp5k_zm:[['cant',.3],['flourish',{pose:'cant'}],['right',.4],['mag',{pose:'under',hold:.45}]],
  mpl_zm:[['broad',.5],['mag',{pose:'left',hold:.5}],['flourish',{pose:'cant'}],['low',.3]],
  pm63_zm:[['up',.35],['flourish',{pose:'up'}],['flat',.4],['mag',{pose:'under',hold:.4}]],
  ak74u_zm:[['flat',.45],['mag',{pose:'flat',hold:.6}],['flourish',{pose:'left'}],['sight',.4]],
  spectre_zm:[['flat',.35],['flourish',{pose:'flat'}],['right',.4],['mag',{pose:'up',hold:.5}]],
  // shotguns
  rottweil72_zm:[['up',.4],['flourish',{pose:'cant'}],['broad',.55],['mag',{pose:'top',hold:.6}]],
  ithaca_zm:[['under',.4],['port',{pose:'under',hold:.5}],['broad',.5],['flourish',{pose:'cant'}]],
  spas_zm:[['flat',.4],['flourish',{pose:'left'}],['top',.4],['port',{pose:'under',hold:.45}],['right',.3]],
  hs10_zm:[['broad',.55],['port',{pose:'cant',hold:.5}],['low',.3],['flourish',{pose:'left'}]],
  // machine guns
  hk21_zm:[['broad',.6],['flourish',{pose:'cant'}],['flat',.4],['mag',{pose:'under',hold:.7}]],
  rpk_zm:[['left',.5],['mag',{pose:'flat',hold:.7}],['flourish',{pose:'left'}],['broad',.6]],
  // sniper rifles
  dragunov_zm:[['sight',.8],['broad',.6],['flourish',{pose:'cant'}],['mag',{pose:'under',hold:.5}]],
  l96a1_zm:[['sight',.8],['flourish',{pose:'left'}],['broad',.7],['mag',{pose:'under',hold:.5}]],
  // launchers and specials
  // fork guns on BO1 skeletons: their own order, the donor's hands
  grimhawk_zm:[['broad',.6],['mag',{pose:'flat',hold:.6}],['up',.4],['flourish',{}]],
  siren_zm:[['up',.5],['broad',.7,.5],['broadR',.6],['flourish',{}],['cant',.4]],
  roc_zm:[['broad',.8],['flourish',{}],['mag',{pose:'under',hold:.8}],['up',.5]],
  havoc_zm:[['up',.5],['rack',{}],['broad',.7],['flourish',{}],['cant',.4]],
  xm325_zm:[['flat',.5],['mag',{pose:'under',hold:.8}],['broad',.7],['flourish',{}]],
  debt_collector_zm:[['broad',.5],['flourish',{}],['up',.4],['cant',.5],['flat',.4]],
  hive_launcher_zm:[['broad',.7],['up',.5],['flourish',{}],['under',.5]],
  m72_law_zm:[['up',.5],['broad',.7],['flourish',{pose:'left'}],['broadR',.5]],
  china_lake_zm:[['broad',.6],['rack',{}],['flourish',{}],['cant',.5],['broadR',.5]],
  crossbow_explosive_zm:[['flat',.6],['flourish',{pose:'left'}],['broad',.7],['up',.5],['under',.4]],
  knife_ballistic_zm:[['up',.5],['flourish',{pose:'cant'}],['broad',.5],['flat',.35,.25],['right',.3,.25]],
  // wonder weapons
  ray_gun_zm:[['broad',.5],['spin',{bone:'j_gear',turns:3,dur:1.6,delay:.2}],['flourish',{pose:'cant'}],['swing',{bone:'j_arrow',swing:.9,beats:3,dur:1.4}],['up',.6],['under',.5]],
  thundergun_zm:[['left',.5],['broad',.8,.5],['broadR',.7,.6],['up',.7,.5]],
  freezegun_zm:[['broad',.6],['flourish',{pose:'cant'}],['up',.5],['flat',.5]],
  tesla_gun_zm:[['up',.5],['flourish',{pose:'cant'}],['broad',.7],['left',.5]],
  microwavegun_zm:[['broad',.6],['flourish',{pose:'cant'}],['up',.5],['broadR',.5]],
  minigun_zm:[['flat',.5,.6],['flourish',{pose:'left'}],['broad',.7,.6],['up',.5,.6]],
  bo3_raygun_mk3:[['dwOut',.3],['flourish',{pose:'dwUp'}],['dwLeft',.5],['dwRight',.5],['dwRoll',.3]],
  // pairs
  'm1911_zm+':[['dwOut',.35],['dwLeft',.45],['dwRight',.45],['dwUp',.5],['dwRoll',.25,.25],['dwRollR',.25,.3]],
  cz75dw_zm:[['dwUp',.45],['dwRoll',.35],['dwRollR',.35],['dwLeft',.4],['dwRight',.4]],
  'pm63_zm+':[['dwRoll',.4],['dwOut',.3],['dwRight',.45],['dwLeft',.45],['dwUp',.4]],
  'hs10_zm+':[['dwLeft',.5],['dwUp',.5],['dwRight',.5],['dwOut',.3]],
  microwavegundw_zm:[['dwOut',.4],['dwRoll',.4],['dwUp',.5],['dwRollR',.4]],
};

// ---- class themes for every other gun: variants, one picked by the gun's id ----
const THEMES={
  'Pistol':[
    [['left',.4],['flourish',{pose:'cant'}],['right',.4],['mag',{hold:.45}]],
    [['up',.4],['mag',{hold:.5}],['flourish',{pose:'left'}],['right',.4]],
    [['flat',.45],['flourish',{pose:'flat'}],['mag',{hold:.5}],['broad',.45]]],
  'Submachine gun':[
    [['cant',.4],['flourish',{pose:'cant'}],['mag',{hold:.5}],['right',.4]],
    [['sight',.45],['mag',{hold:.5}],['left',.3],['flourish',{pose:'left'}]],
    [['broad',.5],['flourish',{pose:'left'}],['up',.3],['mag',{hold:.5}]]],
  'Rifle':[
    [['sight',.5],['left',.35],['flourish',{pose:'cant'}],['mag',{hold:.5}],['right',.35]],
    [['broad',.6],['mag',{hold:.55}],['flourish',{pose:'left'}],['sight',.4]],
    [['cant',.4],['flourish',{pose:'left'}],['top',.4],['mag',{hold:.5}]],
    [['up',.45],['flourish',{pose:'cant'}],['broad',.5],['mag',{hold:.5}]]],
  'Shotgun':[
    [['under',.45],['port',{pose:'under',hold:.5}],['mag',{hold:.5}],['broad',.5],['flourish',{pose:'cant'}]],
    [['broad',.55],['flourish',{pose:'left'}],['top',.4],['port',{pose:'cant',hold:.45}],['mag',{hold:.5}]],
    [['up',.4],['flourish',{pose:'cant'}],['flat',.4],['port',{pose:'under',hold:.5}],['mag',{hold:.5}]]],
  'Sniper rifle':[
    [['sight',.8],['rack',{pose:'left'}],['flourish',{pose:'left'}],['broad',.65],['mag',{hold:.5}]],
    [['broad',.7],['sight',.6],['mag',{hold:.55}],['flourish',{pose:'cant'}],['rack',{pose:'cant'}]]],
  'Light machine gun':[
    [['broad',.7],['flourish',{pose:'cant'}],['flat',.4],['mag',{hold:.7}]],
    [['left',.5],['mag',{hold:.7}],['flourish',{pose:'left'}],['broad',.6]]],
  'Launcher':[
    [['up',.5],['broad',.7],['flourish',{pose:'left'}],['mag',{hold:.5}],['broadR',.5]],
    [['left',.55],['flourish',{pose:'cant'}],['rack',{pose:'cant'}],['broad',.65],['up',.4]]],
  'Wonder weapon':[
    [['broad',.6],['flourish',{pose:'cant'}],['up',.5],['broadR',.5]],
    [['up',.5],['flourish',{pose:'left'}],['broad',.7],['flat',.45]]],
  'Bow':[
    [['flat',.5],['flourish',{pose:'cant'}],['up',.5],['broad',.5]]],
  pair:[
    [['dwOut',.35],['dwLeft',.45],['dwRight',.45],['dwUp',.45]],
    [['dwUp',.45],['dwRoll',.35],['dwRollR',.35],['dwOut',.35]],
    [['dwRoll',.4],['dwRight',.45],['dwLeft',.45],['dwOut',.3]]],
};
THEMES['Death Machine']=THEMES['Light machine gun'];THEMES['Special']=THEMES['Rifle'];THEMES['Melee']=THEMES['Bow'];

const MOVE=.4;
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
const rng=seed=>()=>{seed=Math.imul(seed^(seed>>>15),2246822507);seed=Math.imul(seed^(seed>>>13),3266489909);return ((seed^=seed>>>16)>>>0)/4294967296;};

// when the gun is up in a raise clip: its tag_weapon track is within 30 % of where it ends
const arrivals=new WeakMap();
function arrive(d){
  if(arrivals.has(d))return arrivals.get(d);
  let at=0;const tr=d.bones?.find(b=>b.name==='tag_weapon')?.pos;
  if(tr&&tr.frames.length>2){
    const n=tr.frames.length,v=tr.values,dist=i=>Math.hypot(v[i*3]-v[n*3-3],v[i*3+1]-v[n*3-2],v[i*3+2]-v[n*3-1]),d0=dist(0);
    if(d0>2)for(let i=0;i<n;i++)if(dist(i)<d0*.3){at=tr.frames[i]/(d.fps||30);break;}
  }
  arrivals.set(d,at);return at;
}
const sound=n=>/^sndnt#|^wpn_|^fly_/.test(n.name)&&!/gear|foley|cloth|raise_plr|_start$|_end$/.test(n.name);

// what this gun's clips allow
function abilities(rig){
  const D=k=>{const c=rig.actions[k]&&rig.data[k];return c&&{...c,notifies:[...(c.notifies??[])].sort((x,y)=>x.time-y.time)};},can={};
  const fr=D('firstRaiseAnim');
  if(fr&&fr.name!==D('raiseAnim')?.name){const s0=fr.notifies?.find(sound)?.time??9,from=Math.max(.1,Math.min(arrive(fr)-.05,s0-.25));if(fr.duration-from>.45)can.flourish={key:'firstRaiseAnim',from,to:fr.duration};}
  const rl=D('reloadAnim'),rs=D('reloadStartAnim'),re=D('reloadEndAnim');
  if(rl&&!rs){
    const o=(rl.notifies??[]).find(n=>/clip_?out|mag_?out|magout/.test(n.name))??(rl.notifies??[]).find(n=>/open|eject|belt_?off|lid|unlatch|break/.test(n.name)&&n.time<rl.duration*.5);   // no magazine: hold it at the open breech, cylinder or bolt
    if(o){const nx=(rl.notifies??[]).find(n=>n.time>o.time+.12&&sound(n));can.mag={key:'reloadAnim',to:Math.min(o.time+.34,nx?nx.time-.06:9,rl.duration*.6)};}
  }
  if(rs&&re){
    const ns=(rs.notifies??[]).filter(sound),open=ns.find(n=>/open/.test(n.name)),next=open?ns.find(n=>n.time>open.time+.05):ns.find(n=>/shell|single|_in/.test(n.name));
    const to=Math.min(next?next.time-.07:rs.duration*.55,rs.duration*.75);
    if(to>.2)can.port={key:'reloadStartAnim',to,end:'reloadEndAnim',endDur:re.duration};
  }
  const rc=D('rechamberAnim');if(rc&&rc.duration>.3)can.rack={key:'rechamberAnim',to:rc.duration};
  return can;
}

export function scriptFor(def,can){
  const id=def.baseId??def.id,pair=!!def.dualWield;
  const own=SCRIPTS[def.upgraded&&SCRIPTS[id+'+']?id+'+':id];
  if(own&&(pair===own.some(s=>s[0].startsWith('dw'))))return {steps:own,name:id,seed:0};
  const set=THEMES[pair?'pair':weaponClass(def)]??THEMES.Rifle,h=hash(id);
  let steps=set[h%set.length];
  // a theme whose clip steps this gun lacks would be a bare turn of the gun: give it more to show
  if(!pair&&!steps.some(s=>can[s[0]]))steps=[['left',.45],['up',.4],['broad',.6],['top',.4],['right',.4]].sort((a,b)=>hash(id+a[0])-hash(id+b[0]));
  return {steps,name:id+' ('+(pair?'pair':weaponClass(def))+')',seed:h};
}

export function buildInspect(view,def){
  const rig=view.rig;if(!rig)return null;
  const can=abilities(rig),{steps,name,seed}=scriptFor(def,can);
  const rnd=seed?rng(seed):null,vary=(x,amt)=>rnd?x*(1+(rnd()*2-1)*amt):x;
  const P=n=>{const b=typeof n==='string'?POSES[n]:n;return rnd?{...b,r:b.r.map(x=>vary(x,.14)),at:b.at.map(x=>vary(x,.15))}:b;};
  const notes=new Set();for(const k in rig.data)for(const n of rig.data[k].notifies??[])notes.add(n.name);
  const pose=[{t:0,...POSES.rest}],beats=[],fx=[];let t=0,cur=POSES.rest;
  const to=(pz,move)=>{cur=P(pz);pose.push({t:t+move,...cur});};
  const keep=()=>pose.push({t,...cur});
  for(const s of steps){
    const [kind,a,b]=s;
    if(POSES[kind]){const move=b??MOVE;to(kind,move);t+=move+vary(a??.4,.15);keep();continue;}
    if(kind==='spin'||kind==='swing'){fx.push({...a,at:t+(a.delay??0),swing:kind==='swing'?a.swing:0});continue;}
    if(kind==='snd'){fx.push({sound:a,at:t+(b??0)});continue;}
    const c=can[kind];if(!c)continue;
    const o=a??{},start=t;to(kind==='mag'&&o.pose?o.pose:'rest',MOVE);   // the gun's own clips are framed for the eye already: only the magazine check is turned
    if(kind==='flourish'){const d=c.to-c.from;beats.push({key:c.key,at:t+.08,end:t+.08+d,segs:[{dur:d,from:c.from,to:c.to}]});t+=.08+d;}
    else if(kind==='rack'){beats.push({key:c.key,at:t+.15,end:t+.15+c.to,segs:[{dur:c.to,from:0,to:c.to}]});t+=.15+c.to;}
    else if(kind==='mag'){const h=o.hold??.5,back=c.to/1.15;beats.push({key:c.key,at:t+.1,end:t+.1+c.to+h+back,segs:[{dur:c.to,from:0,to:c.to},{dur:h,from:c.to,to:c.to},{dur:back,from:c.to,to:0}]});t+=.1+c.to+h+back;}
    else if(kind==='port'){const h=o.hold??.5,e=t+.1+c.to+h;beats.push({key:c.key,at:t+.1,end:e,segs:[{dur:c.to,from:0,to:c.to},{dur:h,from:c.to,to:c.to}]},{key:c.end,at:e,end:e+c.endDur,fade:.18,segs:[{dur:c.endDur,from:0,to:c.endDur}]});t=e+c.endDur;}
    t=Math.max(t,start+MOVE);keep();
  }
  pose.push({t:t+.45,...POSES.rest});
  return {name,dur:t+.47,pose,beats,fx,notes};
}
