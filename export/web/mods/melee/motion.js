// First-person motion of the melee slot. Two kinds:
// - The swings are real clips of the arm's joints (swingClip): the hand travels on the arm, the elbow bends and straightens, the shoulder
//   stays out of the frame, and the wrist turns the blade. Any operator's arms follow, as they follow every other clip. Moving the whole
//   view pivot instead dragged the upper arm across the screen as soon as it turned by much.
// - Getting the knife out and away, and the gun bash, move the view pivot: a pose over the resting one (kino.fpMotion.strike), since there
//   the whole arm or gun moves together. pos [right, up, back] in BO1 view units (a BO3 rig's are 2.2x), swing [pitch, yaw, roll] radians
//   about a point behind the hand. Keys: [seconds, pose]; each span eases in and out, or keeps its speed through the strike with `fast`.
import * as THREE from 'three';

const NONE=[0,0,0];
const blend=(a=NONE,b=NONE,u)=>a.map((x,i)=>x+(b[i]-x)*u);
const smooth=u=>u*u*(3-2*u);
export function sample(keys,t){
  let i=keys.findLastIndex(k=>k[0]<=t);if(i<0)i=0;const a=keys[i],b=keys[Math.min(i+1,keys.length-1)];
  const r=b[0]>a[0]?Math.min(1,(t-a[0])/(b[0]-a[0])):1,u=b[1].fast?r:smooth(r);
  return {pos:blend(a[1].pos,b[1].pos,u),swing:blend(a[1].swing,b[1].swing,u)};
}

const qT=new THREE.Quaternion(),qR=new THREE.Quaternion(),eT=new THREE.Euler(),v=new THREE.Vector3(),w=new THREE.Vector3();
// Turns the pivot about a point of its own space, as the sprint pose does about the grip: that point stays where it is on the screen
export function apply(P,R,pose,point,rig=1){
  if(pose.swing.some(x=>x)){
    qT.setFromEuler(eT.set(...pose.swing));qR.setFromEuler(R);v.set(...point);w.copy(v).applyQuaternion(qT);
    P.add(v.sub(w).applyQuaternion(qR));R.setFromQuaternion(qR.multiply(qT));
  }
  P.x+=pose.pos[0]*rig;P.y+=pose.pos[1]*rig;P.z+=pose.pos[2]*rig;
}

// The knife arm's shoulder, measured at rest on the BO1 rig (off the screen, low on the right)
export const SHOULDER=[12.3,-7.1,-1.5];
// Coming up from under the frame and going back down: the arm as it is, so nothing but the hand and the knife shows
export const DRAW=[[0,{pos:[2.5,-15,3],swing:[-.12,-.15,-.1]}],[.2,{pos:[0,.5,0],swing:[.03,0,0]}],[.3,{}]];
export const PUTAWAY=[[0,{}],[.16,{pos:[2.5,-15,3],swing:[-.12,-.15,-.1]}]];
// The gun leaving for the knife, about a point behind the grip
export const LOWER=[[0,{}],[.16,{pos:[.8,-7,1.5],swing:[-.25,.05,-.1]}]];
// A tap of the melee key with a gun in hand: the gun itself is the weapon. Long guns shove the stock forward across the body, pistols whip the barrel down.
const BASH_LONG=[
  [0,{}],
  [.06,{pos:[.3,-.3,.6],swing:[-.08,-.08,-.1]}],
  [.14,{pos:[-1,0,-1.5],swing:[.25,.3,.45],fast:true}],
  [.24,{pos:[-1.1,0,-1.6],swing:[.26,.31,.47]}],
];
const BASH_PISTOL=[
  [0,{}],
  [.06,{pos:[.3,-.3,.6],swing:[-.06,-.06,-.08]}],
  [.14,{pos:[-1,-.5,-2.5],swing:[.1,.2,.3],fast:true}],
  [.24,{pos:[-1.1,-.5,-2.7],swing:[.11,.21,.31]}],
];
// Gun poses turn about the camera, not the gun: a gun rig's arms run back past the lens, so turning about anything forward of it, or a push over about 3 units, swings the sleeve across the screen
export const CAMERA=[0,0,3];
export const bashKeys=(short,end)=>[...(short?BASH_PISTOL:BASH_LONG),[end,{}]];

// The joints a swing moves, on the knife's arm (the rig is mirrored, so these show as the right arm)
const JOINTS={j_shoulder_le:'sh',j_elbow_le:'el',j_wrist_le:'wr'},FPS=60;
const SAME=[0,0,0,1];
// A swing as a clip over the resting pose `rest` (still() in mod.js). keys: [seconds, {sh, el, wr: quaternions over the rest, move: the
// shoulder's offset}, fast], solved from where the hand and the blade should be on the screen; it starts and ends at rest.
export function swingClip(rest,{time,keys}){
  const all=[[0,{}],...keys,[time,{}]],n=Math.round(time*FPS),frames=Array.from({length:n+1},(_,i)=>i);
  const at=(f,pick)=>{const t=f/FPS,i=Math.max(0,all.findLastIndex(k=>k[0]<=t)),a=all[i],b=all[Math.min(i+1,all.length-1)];
    const r=b[0]>a[0]?Math.min(1,(t-a[0])/(b[0]-a[0])):1;return pick(a[1],b[1],b[2]?r:smooth(r));};
  const qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),q=new THREE.Quaternion();
  const bones=rest.bones.map(b=>{const j=JOINTS[b.name];if(!j)return b;
    const base=new THREE.Quaternion().fromArray(b.rot.values),o={...b};
    o.rot={frames,values:frames.flatMap(f=>at(f,(a,z,u)=>{qa.fromArray(a[j]??SAME);qb.fromArray(z[j]??SAME);return q.copy(base).multiply(qa.slerp(qb,u)).toArray();}))};
    if(j==='sh')o.pos={frames,values:frames.flatMap(f=>at(f,(a,z,u)=>blend(a.move,z.move,u).map((x,i)=>x+b.pos.values[i])))};
    return o;});
  return {...rest,name:rest.name+'-swing',fps:FPS,duration:time,bones};
}
// SWINGS (solved on the rig from the hand and blade positions wanted on the screen)
export const SLASH={time:.36,keys:[
  [.07,{sh:[.035,.366,-.447,.815],el:[-.746,.492,-.138,.428],wr:[.355,-.287,.361,.813]}],
  [.1,{sh:[.203,.332,-.284,.877],el:[-.552,.624,.08,.548],wr:[.427,-.363,.583,.588]},true],
  [.14,{sh:[.253,.34,-.141,.895],el:[-.522,.644,.141,.541],wr:[.423,-.35,.672,.497],move:[4.18,-1.65,2.23]},true],
  [.18,{sh:[.25,.341,.004,.906],el:[-.535,.677,.151,.483],wr:[.439,-.368,.746,.339],move:[5.25,-4.12,2.87]},true],
  [.24,{sh:[.339,.343,.029,.876],el:[-.579,.646,.199,.456],wr:[.492,-.318,.752,.302],move:[4.37,-4.44,2.47]}],
  [.3,{sh:[.175,.386,-.181,.887],el:[-.624,.619,.036,.476],wr:[.415,-.363,.731,.403]}],
]};
export const BACKSLASH={time:.36,keys:[
  [.035,{sh:[-.003,.238,-.048,.97],el:[-.335,.551,-.097,.758],wr:[.252,-.107,.422,.864]}],
  [.07,{sh:[.031,.244,.117,.962],el:[-.435,.716,-.004,.546],wr:[.25,-.248,.835,.422],move:[3.84,-3.8,1.78]}],
  [.13,{sh:[.028,.317,-.028,.948],el:[-.399,.733,-.029,.55],wr:[.26,-.228,.852,.394],move:[3.99,-1.92,1.7]},true],
  [.19,{sh:[-.065,.435,-.172,.881],el:[-.38,.776,-.104,.494],wr:[.304,-.131,.782,.527]},true],
  [.26,{sh:[-.223,.497,-.27,.794],el:[-.526,.734,-.295,.312],wr:[.403,-.045,.633,.659]}],
  [.31,{sh:[-.151,.513,-.27,.801],el:[-.571,.639,-.398,.328],wr:[.376,.095,.267,.882]}],
]};
export const STAB={time:.72,keys:[
  [.16,{sh:[-.37,.32,.316,.813],el:[-.129,.539,-.03,.832],wr:[.206,.183,-.153,.949]}],
  [.22,{sh:[-.343,.211,.144,.904],el:[-.146,.607,-.05,.779],wr:[-.094,.112,.19,.971],move:[2.33,-.65,1.15]},true],
  [.3,{sh:[-.226,.162,.007,.961],el:[-.132,.602,-.171,.768],wr:[-.027,.084,.448,.89],move:[4.18,-1.35,1.17]},true],
  [.42,{sh:[-.127,.158,0,.979],el:[-.264,.6,.014,.755],wr:[.01,-.002,.351,.936],move:[3.2,-1.01,.93]}],
]};
