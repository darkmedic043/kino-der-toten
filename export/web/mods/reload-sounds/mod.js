// Reload notetracks name BO1 sound aliases, and the game finds the file by name.
// Many aliases don't match their file (wpn_mp5_mag_out is fly_mp5_mag_out.wav,
// l96a1 bolt_up is fly_l96a1_bu.wav), and a few guns (Ithaca, Python, Commando,
// AK-74u) have no resident reload audio at all, so those reloads were silent.
// When the game's lookup misses, resolve the alias here: rename, then fall back
// to the same action on a similar gun.
const RENAME={rottweil72:'rott',ex41:'china_lake',bolt_up:'bu',bolt_back:'bb',bolt_forward:'bf',bolt_down:'bd',battery_in:'battery',cell_lock:'cell_slide_lock',place_bolt:'lay_bolt'};
const SIBLINGS={ithaca:['spas','rott'],spas:['rott'],hs10:['spas','rott'],china_lake:['rott'],python:['m1911','cz75'],commando:['m16','famas'],ak74u:['ak47','galil'],
  hk21:['rpk','m60','stoner63'],rpk:['hk21','m60'],dragunov:['l96a1','m14'],rpg:['m72_law','law'],mpl:['mp5','spectre'],pm63:['mp5','mpl']};
const ACTIONS={shell_in:['shell_in','gren_load','load'],pull:['pull','back','pull_charge','charge'],push:['push','forward','release'],charge:['charge','pull_charge'],charge_up:['charge','pull_charge','pull'],
  button:['button','tap'],open:['open','mag_out'],close:['close','mag_in'],empty:['empty','mag_out'],load:['load','mag_in','shell_in'],single:['single','futz'],futz:['futz'],slide:['slide'],lock:['latch','lock']};

export default function setup({audio,data}){
  const cache=new Map();
  function resolve(name){
    const keys=Object.keys(audio.manifest),find=c=>keys.find(k=>k.endsWith('/'+c)||k.endsWith('/'+c+'_00'));
    name=name.replace(/^sndnt#/,'');let r=find(name)||find(name=name.replace(/_plr$/,''));if(r)return r;
    let n=name.replace(/^wpn_(?!ray)/,'fly_');for(const [a,b] of Object.entries(RENAME))n=n.replace(a,b);
    if(r=find(n)||find(n.replace(/^fly_/,'')))return r;
    const m=/^(?:fly|wpn)_([a-z0-9]+(?:_lake)?)_(.+)$/.exec(n);if(!m)return;const [,gun,act]=m;
    for(const g of [gun,...(SIBLINGS[gun]??[])])for(const a of [act,...(ACTIONS[act]??ACTIONS[act.split('_').pop()]??[])]){
      if(r=find('fly_'+g+'_'+a)??keys.find(k=>k.includes('/'+g+'/')&&(k.endsWith('_'+a)||k.endsWith('_'+a+'_00'))))return r;}
  }
  const base=audio.notifyKey.bind(audio);
  audio.notifyKey=(name,def)=>{
    const key=base(name,def);if(key||name.startsWith('rmbnt#')||/bowie_(swing|stab)/.test(name))return key;
    const alias=def?.notetrackSounds?.[name]??name;
    if(!cache.has(alias))cache.set(alias,resolve(alias));return cache.get(alias);
  };
  (window.kino??={}).reloadSounds={key:(name,id)=>audio.notifyKey(name,data.weapons[id]??{})};
}
