// Controller button glyphs (not part of upstream). Inline SVG per controller brand, drawn in the
// controller's own iconography: PlayStation's four shapes, Xbox's coloured letters, Nintendo's
// swapped letters, and a neutral set for anything else. Buttons are named by their position in the
// Gamepad API's standard mapping, so `south` is Xbox A, PlayStation Cross, Nintendo B.
// Safe to import under Node (no DOM): the mod turns these into CSS backgrounds and HTML.
export const BRANDS=['xbox','ps','nintendo','generic'];
export const BUTTONS=['south','east','west','north','lb','rb','lt','rt','back','start','l3','r3','dup','ddown','dleft','dright','touchpad'];
// Gamepad API button index -> name (standard mapping; 17 is the DualSense touchpad / Xbox Share).
export const INDEX={0:'south',1:'east',2:'west',3:'north',4:'lb',5:'rb',6:'lt',7:'rt',8:'back',9:'start',10:'l3',11:'r3',12:'dup',13:'ddown',14:'dleft',15:'dright',17:'touchpad'};

// Short names, as the controller prints them.
const LABELS={
  xbox:{south:'A',east:'B',west:'X',north:'Y',lb:'LB',rb:'RB',lt:'LT',rt:'RT',back:'View',start:'Menu',l3:'LS',r3:'RS',dup:'D-pad up',ddown:'D-pad down',dleft:'D-pad left',dright:'D-pad right',touchpad:'Share'},
  ps:{south:'Cross',east:'Circle',west:'Square',north:'Triangle',lb:'L1',rb:'R1',lt:'L2',rt:'R2',back:'Create',start:'Options',l3:'L3',r3:'R3',dup:'D-pad up',ddown:'D-pad down',dleft:'D-pad left',dright:'D-pad right',touchpad:'Touchpad'},
  nintendo:{south:'B',east:'A',west:'Y',north:'X',lb:'L',rb:'R',lt:'ZL',rt:'ZR',back:'−',start:'+',l3:'LS',r3:'RS',dup:'D-pad up',ddown:'D-pad down',dleft:'D-pad left',dright:'D-pad right',touchpad:'Capture'},
  generic:{south:'1',east:'2',west:'3',north:'4',lb:'L1',rb:'R1',lt:'L2',rt:'R2',back:'Select',start:'Start',l3:'L3',r3:'R3',dup:'D-pad up',ddown:'D-pad down',dleft:'D-pad left',dright:'D-pad right',touchpad:'Touchpad'},
};
export const label=(brand,button)=>(LABELS[brand]??LABELS.generic)[button]??button;

// Colours: PlayStation's shape colours and Xbox's letter colours (lightened a little for a dark HUD).
const PS={south:'#8fa8ea',east:'#ef6b6b',west:'#e9a0d5',north:'#63d19a'};
const XBOX={south:'#6ec54e',east:'#ea4b4e',west:'#4f98e8',north:'#f3c53a'};
const INK='#f2efe6',DISK='#15171a',RIM='#8d897d';

const disk=inner=>`<circle cx="12" cy="12" r="10.5" fill="${DISK}" stroke="${RIM}" stroke-width="1.2"/>${inner}`;
const text=(t,fill=INK,size=11,y=16)=>`<text x="12" y="${y}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${size}" fill="${fill}">${t}</text>`;
// Shoulder buttons and triggers: a rounded tab (triggers taller, curved at the top) with the label in it.
const tab=(t,trigger)=>trigger
  ?`<path d="M4 20V10a8 8 0 0 1 16 0v10z" fill="${DISK}" stroke="${RIM}" stroke-width="1.2"/>${text(t,INK,8,16)}`
  :`<rect x="2.5" y="6.5" width="19" height="11" rx="4" fill="${DISK}" stroke="${RIM}" stroke-width="1.2"/>${text(t,INK,8,15.5)}`;
// D-pad: a cross with one arm lit.
const dpad=dir=>{const arm={dup:'M9 3h6v8H9z',ddown:'M9 13h6v8H9z',dleft:'M3 9h8v6H3z',dright:'M13 9h8v6h-8z'}[dir];
  return `<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="${DISK}" stroke="${RIM}" stroke-width="1.2" stroke-linejoin="round"/><path d="${arm}" fill="${INK}"/>`;};
const stick=t=>disk(`<circle cx="12" cy="12" r="6" fill="none" stroke="${INK}" stroke-width="1.4"/>${text(t,INK,6,14)}`);
const lines=disk(`<path d="M7.5 9h9M7.5 12h9M7.5 15h9" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`);

const SHAPES={
  xbox:{
    south:disk(text('A',XBOX.south)),east:disk(text('B',XBOX.east)),west:disk(text('X',XBOX.west)),north:disk(text('Y',XBOX.north)),
    lb:tab('LB'),rb:tab('RB'),lt:tab('LT',true),rt:tab('RT',true),
    start:lines,back:disk(`<rect x="6.5" y="8" width="8" height="6" fill="none" stroke="${INK}" stroke-width="1.4"/><rect x="9.5" y="11" width="8" height="6" fill="${DISK}" stroke="${INK}" stroke-width="1.4"/>`),
    l3:stick('LS'),r3:stick('RS'),
    touchpad:disk(`<path d="M12 8v8M8 12h8" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="${INK}" stroke-width="1.2"/>`),
  },
  ps:{
    south:disk(`<path d="M8 8l8 8M16 8l-8 8" stroke="${PS.south}" stroke-width="2.2" stroke-linecap="round"/>`),
    east:disk(`<circle cx="12" cy="12" r="5" fill="none" stroke="${PS.east}" stroke-width="2.2"/>`),
    west:disk(`<rect x="7.3" y="7.3" width="9.4" height="9.4" fill="none" stroke="${PS.west}" stroke-width="2.2" stroke-linejoin="round"/>`),
    north:disk(`<path d="M12 6.6l6 10H6z" fill="none" stroke="${PS.north}" stroke-width="2.2" stroke-linejoin="round"/>`),
    lb:tab('L1'),rb:tab('R1'),lt:tab('L2',true),rt:tab('R2',true),
    start:lines,back:disk(`<path d="M8 8.5h8v7H8z" fill="none" stroke="${INK}" stroke-width="1.4" transform="rotate(-12 12 12)"/><path d="M10.5 11.5h3M12 10v3" stroke="${INK}" stroke-width="1.2" transform="rotate(-12 12 12)"/>`),
    l3:stick('L3'),r3:stick('R3'),
    touchpad:`<rect x="2.5" y="6" width="19" height="12" rx="3" fill="${DISK}" stroke="${RIM}" stroke-width="1.2"/><path d="M12 7v10" stroke="${RIM}" stroke-width="1" stroke-dasharray="1.5 1.5"/>`,
  },
  nintendo:{
    south:disk(text('B')),east:disk(text('A')),west:disk(text('Y')),north:disk(text('X')),
    lb:tab('L'),rb:tab('R'),lt:tab('ZL',true),rt:tab('ZR',true),
    start:disk(`<path d="M12 7.5v9M7.5 12h9" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`),back:disk(`<path d="M7.5 12h9" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`),
    l3:stick('L'),r3:stick('R'),
    touchpad:disk(`<circle cx="12" cy="12" r="4" fill="none" stroke="${INK}" stroke-width="1.4"/><rect x="5.5" y="6.5" width="13" height="11" rx="2" fill="none" stroke="${INK}" stroke-width="1.2"/>`),
  },
  generic:{
    south:disk(text('1')),east:disk(text('2')),west:disk(text('3')),north:disk(text('4')),
    lb:tab('L1'),rb:tab('R1'),lt:tab('L2',true),rt:tab('R2',true),
    start:lines,back:disk(text('SEL',INK,6.5,14.5)),l3:stick('L3'),r3:stick('R3'),
    touchpad:`<rect x="2.5" y="6" width="19" height="12" rx="3" fill="${DISK}" stroke="${RIM}" stroke-width="1.2"/>`,
  },
};

// The SVG markup for one button (24×24 viewBox).
export function glyph(brand,button,size=24){
  const set=SHAPES[brand]??SHAPES.generic;
  const body=/^d(up|down|left|right)$/.test(button)?dpad(button):set[button]??SHAPES.generic[button]??disk(text('?'));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="${label(brand,button)}">${body}</svg>`;
}
// The same as a CSS url() value.
export const glyphUrl=(brand,button)=>`url('data:image/svg+xml,${encodeURIComponent(glyph(brand,button))}')`;   // single quotes: safe inside a style="" attribute

// Which brand a Gamepad API id belongs to, and the exact model where it matters. Chrome ids look like
// "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)", Firefox's like
// "054c-0ce6-DualSense Wireless Controller"; some browsers give only a name.
export function identify(id=''){
  const s=String(id);
  const m=/vendor:\s*([0-9a-f]{4}).*?product:\s*([0-9a-f]{4})/i.exec(s)??/^([0-9a-f]{4})-([0-9a-f]{4})-/i.exec(s);
  const vendor=m?parseInt(m[1],16):0,product=m?parseInt(m[2],16):0;
  const name=s.replace(/\s*\(.*$/,'').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i,'').trim();
  let brand='generic',kind='generic';
  const n=s.toLowerCase();
  if(vendor===0x054c||(!vendor&&(/dualsense|dualshock|playstation/.test(n)||/^wireless controller\b/.test(n)))){
    brand='ps';
    kind=product===0x0df2||/edge/i.test(s)?'dualsense-edge':product===0x0ce6||/dualsense/i.test(s)?'dualsense':product===0x05c4||product===0x09cc||/dualshock\s*4/i.test(s)?'dualshock4':product===0x0268||/dualshock\s*3|sixaxis/i.test(s)?'dualshock3':'playstation';
  }else if(vendor===0x045e||(!vendor&&/xbox|x-box|xinput/.test(n))){
    brand='xbox';kind=/elite/i.test(s)?'xbox-elite':product===0x0b12||product===0x0b13||product===0x0b20||/series/i.test(s)?'xbox-series':/360/.test(s)?'xbox-360':'xbox-one';
  }else if(vendor===0x057e||(!vendor&&/nintendo|switch|joy-con|pro controller/.test(n))){
    brand='nintendo';kind=/joy-con/i.test(s)?'joycon':'switch-pro';
  }else if(/steam/.test(n)){brand='xbox';kind='steam';}   // Steam Controller / Deck: Xbox letters
  return {brand,kind,vendor,product,name:name||'Controller'};
}
export const isDualSense=info=>info.kind==='dualsense'||info.kind==='dualsense-edge';
