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
// top rank; it opens the Bank: mods/bank). Nothing past Master. In Master the account level carries on from
// accountMasterStart (56) to accountMasterCap (1000) at a flat accountMasterXp per level, with BO7-style milestones:
// level colours, titles, a badge that changes every 100 levels, and credits (MASTER_MILESTONES, claimMasterRewards).
export const PRESTIGE_KEY='kino.mods.prestige';
export const RULES={playerLevel:55,playerMax:10,masterXp:500,masterMax:250,masterCamoAt:50,accountMasterStart:56,accountMasterCap:1000,accountMasterXp:10000};
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
// `level`: the account level, for the Master badge's tier (a pip every 100 levels, a crown at the cap)
export function prestigeBadge(n,size=22,level=RULES.accountMasterStart){
  if(!n)return '';const c=prestigeColor(n);
  if(isPrestigeMaster(n))return masterBadge(level,size);
  return `<svg class="prestige-badge" viewBox="0 0 24 24" width="${size}" height="${size}" aria-label="Prestige ${n}"><path d="M12 2l9 5v10l-9 5-9-5V7z" fill="${c}22" stroke="${c}" stroke-width="1.6"/><path d="M7 9l5 3 5-3M7 13l5 3 5-3" fill="none" stroke="${c}" stroke-width="1.6"/></svg>`;
}
export const roman=n=>ROMAN[n]??String(n);

// ---- account Prestige Master levels (BO7: levels 56 to 1,000 after Prestige X) ----------------------------------
// Milestones in level order. A milestone can set a level colour (`color`, `colorName`), a title, a new badge (`icon`:
// the badge grows a pip every 100 levels and a crown at 1,000) and pay credits. 60-90 pay credits like BO7's early items.
export const MASTER_MILESTONES=[
  {level:56,title:'Prestige Master',color:'#ff8a1f',colorName:'Orange',icon:true},
  {level:60,credits:150},{level:65,credits:150},{level:70,credits:200},{level:80,credits:250},{level:90,credits:300},
  ...[['Centurion','#ff4b3a','Crimson'],['Undying','#ff4fa3','Rose'],['Nightwalker','#a66bff','Violet'],['Element 115','#5279ff','Cobalt'],
    ['Aether-Touched','#2fd0ff','Cyan'],['Keeper of the Fog','#2fe08a','Jade'],['Doctor of the Dead','#c8f03c','Lime'],['Apothicon','#ffd65a','Gold'],
    ['Eternal','#dbe7f0','Platinum']].map(([title,color,colorName],i)=>({level:(i+1)*100,title,color,colorName,icon:true,credits:i===4?1000:500})),
  {level:1000,title:'Legend',color:'#ffe9a8',colorName:'Legend',legend:true,icon:true,credits:2500},
];
const reached=level=>MASTER_MILESTONES.filter(m=>m.level<=level);
// what a Master account at `level` shows: its title, level colour and badge tier (0 = the plain Master star)
export function masterLook(level){
  const r=reached(level),last=k=>[...r].reverse().find(m=>m[k]);
  return {title:last('title')?.title??'Prestige Master',color:last('color')?.color??MASTER_COLOR,colorName:last('color')?.colorName??'',
    tier:Math.min(10,Math.floor(Math.max(0,level)/100)),legend:level>=RULES.accountMasterCap};
}
export const nextMasterMilestone=level=>MASTER_MILESTONES.find(m=>m.level>level)??null;
export function milestoneText(m){
  return [m.title&&`"${m.title}" title`,m.colorName&&`${m.colorName} level colour`,m.icon&&m.level>56&&'Master badge',m.credits&&`${m.credits.toLocaleString()} credits`].filter(Boolean).join(' · ');
}
// XP for the next level in Master: flat, none past the cap
export const masterLevelXp=level=>level>=RULES.accountMasterCap?Infinity:RULES.accountMasterXp;
// Marks the milestones up to `level` not yet claimed as claimed (p.player.mclaim = the last one's level) and returns
// them. The caller saves p FIRST and only then pays (payMasterRewards): paying credits fires 'kino-credits', which
// redraws the menu's rank card, which claims again; claimed-and-saved first, that finds nothing.
export function claimMasterRewards(p,level){
  if(!isPrestigeMaster(p.player.prestige))return [];
  const from=p.player.mclaim??0,now=MASTER_MILESTONES.filter(m=>m.level>from&&m.level<=level);
  if(now.length)p.player.mclaim=now.at(-1).level;
  return now;
}
// claim, save, pay: `grant(n, why)` is credits.js grantCredits (passed in to keep this module free of the credits store)
export function awardMasterRewards(level,grant){
  const p=loadPrestige(),got=claimMasterRewards(p,level);if(!got.length)return got;
  savePrestige(p);for(const m of got)if(m.credits)grant?.(m.credits,`Prestige Master level ${m.level}`);
  return got;
}
// The Master badge: the hexagon in the level colour with the gold star, a pip round it for every 100 levels, and at the
// cap a gold double rim and a crown.
export function masterBadge(level=RULES.accountMasterStart,size=22){
  const {color:c,tier,legend}=masterLook(level),pips=Math.min(9,tier);
  const dots=Array.from({length:pips},(_,i)=>{const a=(-90+(i+.5)*(360/9))*Math.PI/180;return `<circle cx="${(12+12.6*Math.cos(a)).toFixed(2)}" cy="${(12+12.6*Math.sin(a)).toFixed(2)}" r="1.15" fill="${c}"/>`;}).join('');
  const crown=legend?`<path d="M6.5 1.2l2.2 2.2L12-.6l3.3 4 2.2-2.2-.9 4.1H7.4z" fill="#ffd65a" stroke="#7a5200" stroke-width=".5"/>`:'';
  return `<svg class="prestige-badge master" viewBox="-2 -2 28 28" width="${size}" height="${size}" aria-label="Prestige Master level ${level}">`+
    `<path d="M12 2l9 5v10l-9 5-9-5V7z" fill="${c}33" stroke="${legend?'#ffd65a':c}" stroke-width="1.6"/>`+(legend?`<path d="M12 4.3l7 3.9v7.6l-7 3.9-7-3.9V8.2z" fill="none" stroke="${c}" stroke-width=".7"/>`:'')+
    `<path d="M12 6.2l1.7 3.6 3.9.4-2.9 2.6.8 3.9L12 14.7l-3.5 2 .8-3.9-2.9-2.6 3.9-.4z" fill="#ffd65a" stroke="${c}" stroke-width=".8" stroke-linejoin="round"/>${dots}${crown}</svg>`;
}
