// Weighty movement: the base game jumps with low gravity (long hang time),
// steers freely in the air and starts/stops instantly. This makes jumps
// quicker, gives starting and stopping some momentum, and adds a first-person
// head bob in step with your feet plus a landing dip that scales with the fall.
import { settings } from '../../settings.js';

export default function setup(api){
  const {player,camera,host,data,session}=api,m=data.rules.movement??{};
  const set=(key,value)=>{if(value!==undefined)player[key]=value;};
  set('gravity',m.gravity);set('groundAcceleration',m.groundAcceleration);set('airAcceleration',m.airAcceleration);
  if(m.gravity&&m.jumpHeight)player.jumpSpeed=Math.sqrt(2*player.gravity*m.jumpHeight);

  window.kino.movement={player,settings:m};
  let phase=0,dip=0,dipV=0,roll=0,wasGrounded=true,lastVy=0,lastY=null,bobBlend=0;
  host.on('update',dt=>{
    if(!dt||['reviving','gameover'].includes(session.phase))return;
    const st=player.state,v=st.velocity,speed=Math.hypot(v.x,v.z),grounded=st.grounded;
    // Landing: a spring pushed down by the impact speed (critically damped-ish, slight overshoot).
    if(grounded&&!wasGrounded&&lastVy<-150)dipV-=Math.min(260,-lastVy*.32)*(m.landingDip??1);
    wasGrounded=grounded;lastVy=v.y;
    dipV+=(-dip*170-dipV*17)*dt;dip+=dipV*dt;
    // Head bob follows the stride: a heavy drop at each footfall, a little sway.
    const bob=settings.headBob===false?0:(m.headBob??1);
    bobBlend+=((grounded?Math.min(1,speed/190):0)-bobBlend)*Math.min(1,dt*6);
    if(speed>10&&grounded)phase+=dt*(4.2+speed/32);
    const step=Math.abs(Math.sin(phase));
    const y=(-((1-step)**2)*1.7+.6)*bob*bobBlend;
    const side=Math.cos(phase)*.9*bob*bobBlend;
    // Lean into strafes slightly.
    const right=v.x*Math.cos(camera.rotation.y)-v.z*Math.sin(camera.rotation.y);
    roll+=((-right/190)*.018*bob-roll)*Math.min(1,dt*6);
    camera.position.y+=y+dip;
    camera.position.x+=Math.cos(camera.rotation.y)*side;camera.position.z-=Math.sin(camera.rotation.y)*side;
    camera.rotation.z=roll+Math.cos(phase)*.004*bob*bobBlend;
  });
}
