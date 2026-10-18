// Prestige (roadmap Phase 4, Black Ops 7 style), shared by the main menu and the game.
//   Weapon prestige, per gun: at the gun's max level you can prestige. Prestige I and II reset the gun's level and
//   attachments (camo challenge progress stays) and each earns that gun's prestige camo. A third prestige enters
//   Prestige Master: nothing resets, XP past the max level fills Master levels (up to masterMax), and Master level
//   masterCamoAt earns the gun's animated Master camo. Earned prestige camos go on one global list: every gun can
//   wear them (camo.js camoUnlocked / camoById).
//   Player prestige: from playerLevel on you can prestige the account: level back to 1, a badge, a token. Nothing
//   re-locks: unlocks follow the highest level ever reached (unlockLvl in profile.js reads `peak`).
// Store: kino.mods.prestige = {player:{prestige, peak, tokens}, weapons:{[id]:{tier, mlevel, mxp}}, camos:[ids]},
// cloud-synced (cloud.js TRACKED). Tiers: 0 none, 1 Prestige I, 2 Prestige II, 3 Master. Numbers: prestige.json.
// The account prestiges I..playerMax (X), then once more into Prestige Master (player.prestige = playerMax + 1, BO7's
// top rank; it opens the Bank: mods/bank). Nothing past Master.
export const PRESTIGE_KEY='kino.mods.prestige';
export const RULES={playerLevel:55,playerMax:10,masterXp:500,masterMax:250,masterCamoAt:50};
export const TIER_NAMES=['','PRESTIGE I','PRESTIGE II','PRESTIGE MASTER'];

export async function loadPrestigeRules(base=import.meta.url){
  try{const r=await fetch(new URL('prestige.json',base));if(r.ok)Object.assign(RULES,await r.json());}catch{}
  return RULES;
}
export function loadPrestige(){
  let p;try{p=JSON.parse(localStorage.getItem(PRESTIGE_KEY));}catch{}
  p=p&&typeof p==='object'?p:{};
  p.player={prestige:0,peak:0,tokens:0,...p.player};p.weapons??={};p.camos=Array.isArray(p.camos)?p.camos:[];
  return p;
}
export function savePrestige(p){try{localStorage.setItem(PRESTIGE_KEY,JSON.stringify(p));}catch{}}
export const weaponTier=(p,id)=>p.weapons?.[id]?.tier??0;
export const prestigeCamoId=(tier,id)=>`pr${tier}:${id}`;

// ---- weapon prestige ---------------------------------------------------------------------------------------
// Can this gun prestige now? `max` is its max level (weapon-levels maxLevel), `level` its current level.
// Guns without attachments (max 1: wonder weapons) never level, so they can't prestige.
export function canPrestigeWeapon(p,id,level,max){return max>1&&level>=max&&weaponTier(p,id)<3;}
// Prestige it: returns {tier, camo (id or null), reset (true when level and attachments go back)}.
// The caller resets profile.weaponXp[id] and profile.attachments[id] when reset is true.
export function prestigeWeapon(p,id){
  const w=p.weapons[id]??={tier:0,mlevel:0,mxp:0};w.tier=Math.min(3,w.tier+1);
  let camo=null;
  if(w.tier<=2){camo=prestigeCamoId(w.tier,id);if(!p.camos.includes(camo))p.camos.push(camo);}
  else{w.mlevel=1;w.mxp=0;}
  return {tier:w.tier,camo,reset:w.tier<=2};
}
// XP past the max level in Prestige Master. Returns the Master camo id when this XP earned it.
export function grantMasterXp(p,id,amount){
  const w=p.weapons[id];if(!w||w.tier<3||w.mlevel>=RULES.masterMax)return null;
  w.mxp+=amount;const before=w.mlevel;
  while(w.mlevel<RULES.masterMax&&w.mxp>=RULES.masterXp){w.mxp-=RULES.masterXp;w.mlevel++;}
  if(w.mlevel>=RULES.masterMax)w.mxp=0;
  const camo=prestigeCamoId(3,id);
  if(before<RULES.masterCamoAt&&w.mlevel>=RULES.masterCamoAt&&!p.camos.includes(camo)){p.camos.push(camo);return camo;}
  return null;
}

// ---- player prestige ---------------------------------------------------------------------------------------------
export const canPrestigePlayer=(p,level)=>level>=RULES.playerLevel&&p.player.prestige<=RULES.playerMax;   // X -> Master is the last one
// account Prestige Master: one prestige past playerMax
export const isPrestigeMaster=n=>n>RULES.playerMax;
export const hasPrestigeMaster=(p=loadPrestige())=>isPrestigeMaster(p.player.prestige);
// 'PRESTIGE IV' / 'PRESTIGE MASTER', and the short HUD form 'PIV' / 'MASTER'
export const prestigeName=n=>isPrestigeMaster(n)?'PRESTIGE MASTER':'PRESTIGE '+roman(n);
export const prestigeShort=n=>isPrestigeMaster(n)?'MASTER':'P'+roman(n);
export const prestigeColor=n=>isPrestigeMaster(n)?MASTER_COLOR:PRESTIGE_COLORS[Math.min(n,PRESTIGE_COLORS.length-1)];
// Prestige the account: the caller sets profile.level=1, profile.xp=0. Unlocks keep the peak level.
export function prestigePlayer(p,level){p.player.peak=Math.max(p.player.peak,level);p.player.prestige++;p.player.tokens++;}
// A token unlocks one Prestige I or II camo of any gun for the global list.
export function spendToken(p,camoId){
  if(p.player.tokens<=0||p.camos.includes(camoId)||!/^pr[12]:/.test(camoId))return false;
  p.player.tokens--;p.camos.push(camoId);return true;
}
// the badge: a roman numeral on a coloured chevron, colour by prestige
export const PRESTIGE_COLORS=['#8a8577','#4aa3ff','#3fcf6a','#c9d24a','#f0a030','#ff6a3d','#ff3d6e','#c45bff','#7a6bff','#e8e8e8','#ffd65a'];
const ROMAN=['','I','II','III','IV','V','VI','VII','VIII','IX','X'];
export const MASTER_COLOR='#ff4b3a';
export function prestigeBadge(n,size=22){
  if(!n)return '';const c=prestigeColor(n);
  if(isPrestigeMaster(n))return `<svg class="prestige-badge master" viewBox="0 0 24 24" width="${size}" height="${size}" aria-label="Prestige Master"><path d="M12 2l9 5v10l-9 5-9-5V7z" fill="${c}33" stroke="${c}" stroke-width="1.6"/><path d="M12 6.2l1.7 3.6 3.9.4-2.9 2.6.8 3.9L12 14.7l-3.5 2 .8-3.9-2.9-2.6 3.9-.4z" fill="#ffd65a" stroke="${c}" stroke-width=".8" stroke-linejoin="round"/></svg>`;
  return `<svg class="prestige-badge" viewBox="0 0 24 24" width="${size}" height="${size}" aria-label="Prestige ${n}"><path d="M12 2l9 5v10l-9 5-9-5V7z" fill="${c}22" stroke="${c}" stroke-width="1.6"/><path d="M7 9l5 3 5-3M7 13l5 3 5-3" fill="none" stroke="${c}" stroke-width="1.6"/></svg>`;
}
export const roman=n=>ROMAN[n]??String(n);
