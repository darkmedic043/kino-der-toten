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
  [.08,{sh:[-.118,.082,-.188,.972],el:[-.378,.026,.046,.924],wr:[-.289,-.02,-.207,.934]}],
  [.13,{sh:[-.418,.216,.221,.854],el:[-.526,-.585,.042,.616],wr:[.21,.003,.091,.973]},true],
  [.18,{sh:[-.152,.183,.292,.926],el:[-.551,-.583,-.105,.588],wr:[.27,-.364,-.117,.884],move:[2.39,-1.9,.24]},true],
  [.24,{sh:[-.306,.129,.289,.898],el:[-.411,-.591,.117,.684],wr:[.273,-.329,-.189,.884],move:[.81,-.59,.04]}],
]};
export const BACKSLASH={time:.36,keys:[
  [.07,{sh:[-.168,.181,.292,.924],el:[-.518,-.589,-.063,.618],wr:[.266,-.366,-.113,.885],move:[1.31,-1.02,.14]}],
  [.13,{sh:[-.49,.209,.234,.814],el:[-.35,-.563,.255,.703],wr:[.106,.138,.098,.98]},true],
  [.19,{sh:[-.153,.145,-.143,.967],el:[-.517,-.152,.074,.839],wr:[-.068,.099,-.086,.989]},true],
  [.26,{sh:[-.142,.096,-.121,.978],el:[-.431,-.101,.08,.893],wr:[-.184,-.063,-.2,.96]}],
]};
export const STAB={time:.72,keys:[
  [.16,{sh:[.001,.333,-.149,.931],el:[-.459,-.076,.017,.885],wr:[-.25,-.02,-.264,.931]}],
  [.22,{sh:[-.145,.26,.096,.95],el:[-.533,-.441,-.024,.722],wr:[.094,-.014,-.097,.991]},true],
  [.3,{sh:[-.263,.237,.131,.926],el:[-.409,-.598,.06,.687],wr:[.202,-.436,-.107,.871],move:[1.37,-.42,.06]},true],
  [.42,{sh:[-.241,.247,.124,.931],el:[-.399,-.604,.049,.688],wr:[.242,-.366,-.097,.893],move:[.32,-.1,.02]}],
]};
