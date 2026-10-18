// Native DualSense output over WebHID (not part of upstream): adaptive triggers, light bar, player
// LEDs and rumble, which the Gamepad API cannot reach. Input still comes from the Gamepad API.
// Report layout as in the Linux hid-playstation driver (dualsense_output_report_common, 47 bytes):
// USB sends it as report 0x02, Bluetooth wraps it in report 0x31 with a sequence tag and a CRC-32
// seeded with 0xA2. Trigger effects use the encodings worked out by Nielk1 (TriggerEffectGenerator).
// The builders below are pure so they can be tested under Node; only DualSenseLink touches navigator.hid.
export const VENDOR_SONY=0x054c;
export const PRODUCTS={0x0ce6:'dualsense',0x0df2:'dualsense-edge'};
export const FILTERS=Object.keys(PRODUCTS).map(p=>({vendorId:VENDOR_SONY,productId:+p}));
export const isDualSenseDevice=d=>d?.vendorId===VENDOR_SONY&&!!PRODUCTS[d.productId];

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v)));
const le32=v=>[v&0xff,(v>>>8)&0xff,(v>>>16)&0xff,(v>>>24)&0xff];

// Trigger effects: 11 bytes each (mode + 10 parameters). Positions are 0 (top of the pull) to 9
// (bottom), forces 1 (lightest) to 8 (hardest).
export const trigger={
  off:()=>[0x05,0,0,0,0,0,0,0,0,0,0],
  // Constant resistance from `position` down to the end of the pull.
  feedback(position,strength){position=clamp(position,0,9);strength=clamp(strength,0,8);if(!strength)return trigger.off();
    const force=(strength-1)&7;let zones=0,active=0;for(let i=position;i<10;i++){zones|=force<<(3*i);active|=1<<i;}
    return [0x21,active&0xff,(active>>8)&0xff,...le32(zones>>>0),0,0,0,0];},
  // Resistance between `start` and `end` that gives way with a click, like a gun's trigger.
  weapon(start,end,strength){start=clamp(start,2,7);end=clamp(end,start+1,8);strength=clamp(strength,1,8);
    const zones=(1<<start)|(1<<end);return [0x25,zones&0xff,(zones>>8)&0xff,(strength-1)&7,0,0,0,0,0,0,0];},
  // The trigger buzzes once pulled past `position` (automatic weapons): amplitude 1-8, frequency in Hz.
  vibration(position,amplitude,frequency){position=clamp(position,0,9);amplitude=clamp(amplitude,0,8);frequency=clamp(frequency,0,255);if(!amplitude)return trigger.off();
    const a=(amplitude-1)&7;let zones=0,active=0;for(let i=position;i<10;i++){zones|=a<<(3*i);active|=1<<i;}
    return [0x26,active&0xff,(active>>8)&0xff,...le32(zones>>>0),0,0,frequency,0];},
  // Rising resistance from `start` to `end`, then a snap (a bow string).
  bow(start,end,strength,snap){start=clamp(start,0,8);end=clamp(end,start+1,8);strength=clamp(strength,1,8);snap=clamp(snap,1,8);
    const zones=(1<<start)|(1<<end),pair=((strength-1)&7)|(((snap-1)&7)<<3);return [0x22,zones&0xff,(zones>>8)&0xff,pair&0xff,(pair>>8)&0xff,0,0,0,0,0,0];},
  // Alternating buzz between two amplitudes (machinery).
  machine(start,end,ampA,ampB,frequency,period){start=clamp(start,0,8);end=clamp(end,start+1,9);
    const zones=(1<<start)|(1<<end),pair=(clamp(ampA,0,7)&7)|((clamp(ampB,0,7)&7)<<3);return [0x27,zones&0xff,(zones>>8)&0xff,pair,clamp(frequency,0,255),clamp(period,0,255),0,0,0,0,0];},
};

// Player indicator LEDs as the PS5 shows players 1-5 (centre out).
export const PLAYER_LEDS=[0,0x04,0x0a,0x15,0x1b,0x1f];

// The 47-byte common report. `setup` sends the one-off light-bar reset instead of a colour (the
// controller ignores the first colour otherwise; Linux does the same).
export function buildCommon({rumble=[0,0],lightbar=[0,0,0],leds=0,micLed=0,left=trigger.off(),right=trigger.off()}={},setup=false){
  const c=new Uint8Array(47);
  c[0]=0x0f;                               // compatible vibration, haptics select, right and left trigger motors
  c[1]=0x01|0x10|(setup?0:0x04);           // mic LED, player LEDs, light bar colour
  c[2]=clamp(rumble[1]*255,0,255);         // right (weak)
  c[3]=clamp(rumble[0]*255,0,255);         // left (strong)
  c[8]=micLed&3;
  c.set(right.slice(0,11),10);c.set(left.slice(0,11),21);
  if(setup){c[38]=0x02;c[41]=0x02;}        // valid_flag2 light-bar setup: light out
  c[43]=leds&0x1f;
  c[44]=clamp(lightbar[0]*255,0,255);c[45]=clamp(lightbar[1]*255,0,255);c[46]=clamp(lightbar[2]*255,0,255);
  return c;
}

let table=null;
export function crc32(bytes,crc=0xffffffff){
  if(!table){table=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[i]=c>>>0;}}
  for(const b of bytes)crc=table[(crc^b)&0xff]^(crc>>>8);
  return crc>>>0;
}
// The report to send: {id, data} for USB (0x02, 47 bytes) or Bluetooth (0x31, 77 bytes with the CRC).
export function buildReport(state,{bluetooth=false,seq=0,setup=false}={}){
  const common=buildCommon(state,setup);
  if(!bluetooth)return {id:0x02,data:common};
  const data=new Uint8Array(77);data[0]=(seq&0x0f)<<4;data[1]=0x10;data.set(common,2);
  const crc=crc32([0x31,...data.subarray(0,73)],crc32([0xa2]));
  data.set(le32(crc),73);return {id:0x31,data};
}

// One opened DualSense. Keeps the wanted state, sends a report only when it changed (at most every
// `interval` ms), and layers timed rumble pulses on top of the base state.
export class DualSenseLink{
  constructor({interval=16}={}){this.device=null;this.bluetooth=false;this.seq=0;this.interval=interval;this.lastSent=0;this.last=null;this.sending=false;this.setupDone=false;
    this.state={rumble:[0,0],lightbar:[0,0,0],leds:0,micLed:0,left:trigger.off(),right:trigger.off()};this.pulses=[];this.onchange=null;}
  static supported(){return typeof navigator!=='undefined'&&!!navigator.hid;}
  // Already-granted DualSenses (no gesture needed). Grants persist per site in Chrome.
  static async granted(){try{return (await navigator.hid.getDevices()).filter(isDualSenseDevice);}catch{return [];}}
  get connected(){return !!this.device?.opened;}
  // Opens a granted DualSense, or asks for one when `interactive` (needs a click).
  async connect({interactive=false}={}){
    if(!DualSenseLink.supported())return false;
    let devices=await DualSenseLink.granted();
    if(!devices.length&&interactive){try{devices=(await navigator.hid.requestDevice({filters:FILTERS})).filter(isDualSenseDevice);}catch{devices=[];}}
    const d=devices[0];if(!d)return false;
    try{if(!d.opened)await d.open();}catch(e){console.warn('[controller] DualSense open failed',e);return false;}
    this.device=d;this.bluetooth=d.collections.some(c=>(c.outputReports??[]).some(r=>r.reportId===0x31));
    if(this.bluetooth){try{await d.receiveFeatureReport(0x05);}catch{}}   // calibration read switches BT to the full report set
    this.setupDone=false;this.last=null;await this.flush(true);await this.flush(true);
    this.onchange?.(true);return true;
  }
  set(partial){Object.assign(this.state,partial);}
  // A rumble that ends by itself; several add up to the strongest of them.
  pulse(strong,weak,ms,now=performance.now()){this.pulses.push({strong,weak,until:now+ms});}
  update(now=performance.now()){this.pulses=this.pulses.filter(p=>p.until>now);let s=0,w=0;for(const p of this.pulses){s=Math.max(s,p.strong);w=Math.max(w,p.weak);}this.state.rumble=[s,w];}
  async flush(force=false,now=performance.now()){
    const d=this.device;if(!d?.opened||this.sending)return false;
    if(!force&&now-this.lastSent<this.interval)return false;
    const setup=!this.setupDone;const r=buildReport(this.state,{bluetooth:this.bluetooth,seq:this.seq,setup});
    const key=setup?'setup':Array.from(r.data.subarray(this.bluetooth?2:0,(this.bluetooth?2:0)+47)).join();
    if(!force&&key===this.last)return false;
    this.sending=true;try{await d.sendReport(r.id,r.data);this.seq=(this.seq+1)&0x0f;this.last=key;this.lastSent=now;this.setupDone=true;return true;}
    catch(e){console.warn('[controller] DualSense report failed',e?.message??e);if(!d.opened)this.drop();return false;}finally{this.sending=false;}
  }
  // Puts the controller back the way it was and lets go of it.
  async close(){const d=this.device;if(!d)return;try{this.state={rumble:[0,0],lightbar:[0,0,.35],leds:0,micLed:0,left:trigger.off(),right:trigger.off()};await this.flush(true);await d.close();}catch{}this.drop();}
  drop(){if(!this.device)return;this.device=null;this.last=null;this.onchange?.(false);}
}
