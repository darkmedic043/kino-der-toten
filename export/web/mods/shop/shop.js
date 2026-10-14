// The Shop (roadmap Phase 6): cosmetics bought with credits, never power. Shared by the Shop page, the main menu and the game.
// Store: kino.mods.shop = {owned:[itemId], equip:{reticle, hitmarker, kill, hud, menu, frame, sound, glow, card}, seen:[itemId]},
// cloud-synced (cloud.js TRACKED). Camos are equipped per gun in the Gunsmith (profile.camo) and outfits are characters
// (Operator pane), so those two categories have no slot here. Catalogue: catalog.json.
// Rotation: 3 daily slots and a weekly bundle (3 items, 30% off) drawn from the not-yet-owned items with the date as the
// seed; items marked rotating only appear there. Owned items never leave.
// Reward registry: grantReward(type, id) is the one path every reward source uses (shop purchases, prestige, the pass).
import { loadCredits, saveCredits, change, dayKey, weekKey, nextReset } from '../credits/credits.js';

export const SHOP_KEY='kino.mods.shop';
export async function loadCatalog(base=import.meta.url){const r=await fetch(new URL('catalog.json',base));if(!r.ok)throw new Error('catalog.json HTTP '+r.status);return r.json();}
export function loadShop(){
  let p;try{p=JSON.parse(localStorage.getItem(SHOP_KEY));}catch{}p=p&&typeof p==='object'?p:{};
  return {owned:Array.isArray(p.owned)?p.owned:[],equip:{...p.equip},seen:Array.isArray(p.seen)?p.seen:[]};
}
export function saveShop(s){try{localStorage.setItem(SHOP_KEY,JSON.stringify(s));}catch{}}
export const itemById=cat=>Object.fromEntries(cat.items.map(i=>[i.id,i]));

// which equip slot an item fills (null: camos and outfits are equipped elsewhere)
export function slotOf(item){
  const d=item.data??{};
  if(item.cat==='reticle')return d.char?'reticle':d.hitmarker?'hitmarker':d.blood?'kill':null;
  if(item.cat==='theme')return d.hud?'hud':d.menu?'menu':d.frame?'frame':null;
  if(item.cat==='sound')return 'sound';if(item.cat==='glow')return 'glow';if(item.cat==='card')return 'card';
  return null;
}
// the equipped items' data, by slot (what the game and menu apply)
export function cosmetics(cat,s=loadShop()){
  const by=itemById(cat),out={};
  for(const [slot,id] of Object.entries(s.equip))if(id&&s.owned.includes(id)&&by[id])out[slot]={...by[id].data,id,name:by[id].name};
  return out;
}

// ---- rotation ------------------------------------------------------------------------------------------------------
function seeded(str){let h=2166136261;for(const ch of str){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return ()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return (h>>>0)/4294967296;};}
export function rotation(cat,s=loadShop(),now=new Date()){
  const pick=(seed,pool,n)=>{const r=seeded(seed),p=[...pool],out=[];while(out.length<n&&p.length)out.push(p.splice(Math.floor(r()*p.length),1)[0]);return out;};
  const all=cat.items.filter(i=>!i.pass);   // pass rewards are never sold
  const daily=pick('d'+dayKey(now),all.filter(i=>i.cat!=='bundle'),cat.daily??3);
  const bundle=pick('w'+weekKey(now),all.filter(i=>!daily.includes(i)),cat.bundle?.size??3);
  const bundlePrice=Math.round(bundle.reduce((a,i)=>a+i.price,0)*(1-(cat.bundle?.discount??.3))/10)*10;
  return {daily,bundle,bundlePrice,dailyEnds:nextReset('daily',now),weeklyEnds:nextReset('weekly',now)};
}
// Items shown in the always-available catalogue: everything not marked rotating, plus anything owned.
export const listed=(cat,s=loadShop())=>cat.items.filter(i=>(!i.rotating&&!i.pass)||s.owned.includes(i.id));   // pass items: only once owned (equip them here)
// Is this item purchasable now (in the catalogue or today's rotation)?
export function forSale(cat,id,s=loadShop()){const r=rotation(cat,s);const i=itemById(cat)[id];return !!i&&!i.pass&&(!i.rotating||r.daily.includes(i)||r.bundle.includes(i));}

// ---- buying and the reward registry --------------------------------------------------------------------------------
// Buy one item (or the weekly bundle with id 'bundle'). Returns null on success, else the reason.
export function buy(cat,id){
  const s=loadShop(),r=rotation(cat,s);
  let items,price;
  if(id==='bundle'){items=r.bundle.filter(i=>!s.owned.includes(i.id));price=r.bundlePrice;if(!items.length)return 'You own the whole bundle';}
  else{const i=itemById(cat)[id];if(!i)return 'Unknown item';if(s.owned.includes(id))return 'Already owned';if(!forSale(cat,id,s))return 'Not in the shop right now';items=[i];price=i.price;}
  const c=loadCredits();if(!change(c,-price,'shop: '+(id==='bundle'?'weekly bundle':items[0].name)))return `Not enough credits (${price.toLocaleString()} needed)`;
  saveCredits(c);for(const i of items)grantReward('item',i.id,{quiet:true});
  // a bought cosmetic goes straight on when its slot is empty
  const s2=loadShop();for(const i of items){const slot=slotOf(i);if(slot&&!s2.equip[slot])s2.equip[slot]=i.id;}saveShop(s2);
  return null;
}
export function toggleEquip(cat,id){
  const s=loadShop(),i=itemById(cat)[id],slot=i&&slotOf(i);if(!slot)return 'Equip it in the Gunsmith or the Operator pane';if(!s.owned.includes(id))return 'Buy it first';
  s.equip[slot]=s.equip[slot]===id?null:id;saveShop(s);return null;
}
// type: 'item' (a shop item id), 'credits' (amount), 'camo' (a camo id the prestige/pass systems own). Returns true when granted.
export function grantReward(type,id,opts={}){
  if(type==='credits'){const c=loadCredits();change(c,+id,opts.why??'reward');saveCredits(c);return true;}
  if(type==='item'){const s=loadShop();if(s.owned.includes(id))return false;s.owned.push(id);saveShop(s);return true;}
  return false;
}
export function installRewards(){(globalThis.window??globalThis).kino??={};(globalThis.window??globalThis).kino.rewards={grant:grantReward};}
