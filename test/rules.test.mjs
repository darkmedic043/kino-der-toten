import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Session,zombieHealth,roundPopulation,perkPrice} from '../export/web/rules.js';
const data=JSON.parse(fs.readFileSync(new URL('../export/web/game-data.json',import.meta.url)));
test('weapon reserve extraction respects absolute versus clip-relative counts',()=>{
 assert.equal(data.weapons.m1911_zm.startAmmo,32);assert.equal(data.weapons.mp40_zm.maxAmmo,192);
 assert.equal(data.weapons.ray_gun_zm.maxAmmo,160);assert.equal(data.weapons.ray_gun_zm.upgrade.maxAmmo,200);
 assert.equal(data.weapons.thundergun_zm.maxAmmo,12);assert.equal(data.weapons.thundergun_zm.upgrade.maxAmmo,24);
 assert(data.weapons.m1911_zm.hideTags.includes('tag_suppressor'));
});
test('T5 health changes to multiplication at round 10, with truncation each round',()=>{
 assert.equal(zombieHealth(1),150);assert.equal(zombieHealth(9),950);assert.equal(zombieHealth(10),1045);assert.equal(zombieHealth(11),1149);
});
test('solo round population uses GSC early-round modifiers',()=>{
 assert.deepEqual([1,2,3,4,5,6,10].map(r=>roundPopulation(r)),[6,8,13,18,24,27,33]);
});
test('weapon cadence, reload transfer, and inventory switching preserve ammunition',()=>{
 const s=new Session(data,()=>0);assert.equal(s.points,500);assert.equal(s.weapon.mag,8);assert.equal(s.weapon.reserve,32);
 assert(s.fire());assert(!s.fire());s.update(.2);assert(s.fire());assert(s.reload());assert(!s.fire());s.update(2);
 assert.equal(s.weapon.mag,8);assert.equal(s.weapon.reserve,30);s.giveWeapon('mp40_zm');assert.equal(s.inventory.length,2);s.switchWeapon(0);assert.equal(s.weapon.reserve,30);
});
test('purchases cannot overdraft and damage cannot revive a dead session',()=>{
 const s=new Session(data);assert(!s.spend(750));assert.equal(s.points,500);assert(s.spend(500));assert.equal(s.points,0);
 s.damage(50);assert.equal(s.health,50);s.update(2);assert.equal(s.health,50);s.damage(50);assert.equal(s.phase,'gameover');s.update(20);assert.equal(s.health,0);
});
// Fork: Quick Revive follows Cold War / Black Ops 6 (no solo self-revive; health regen starts after 2 s instead of 4).
test('Quick Revive halves the regen delay and no longer self-revives',()=>{
 const s=new Session(data);s.perks.add('specialty_quickrevive');s.damage(50);s.update(1.5);assert.equal(s.health,50);s.update(.6);assert(s.health>50);
 const t=new Session(data);t.damage(50);t.update(2.1);assert.equal(t.health,50);
 s.damage(500);assert.equal(s.phase,'gameover');
});
test('headshots, knife kills, and timed Double Points award distinct scores',()=>{
 const s=new Session(data);s.scoreHit(false);assert.equal(s.points,510);s.scoreHit(true,true);assert.equal(s.points,610);s.powerup('double_points');s.scoreHit(true,false,true);assert.equal(s.points,870);s.update(31);s.scoreHit(false);assert.equal(s.points,880);
});
test('dog rounds use original population and produce later scheduled rounds',()=>{
 const s=new Session(data,()=>0);while(s.round<5)s.nextRound();assert(s.dogRound);assert.equal(s.total,6);assert.equal(s.nextDogRound,9);
 while(s.round<13)s.nextRound();assert(s.dogRound);assert.equal(s.dogRounds,3);assert.equal(s.total,8);
});

test('a knife swing blocks firing, reload, and switching until recovery',()=>{
 const s=new Session(data);s.giveWeapon('mp40_zm');s.weapon.mag--;const slot=s.slot,mag=s.weapon.mag;
 s.meleeLeft=.7;assert(!s.fire());assert(!s.reload());s.switchWeapon(0);assert.equal(s.slot,slot);assert.equal(s.weapon.mag,mag);
 s.update(.71);assert(s.fire());
});

test('shotguns load individual shells and preserve loaded ammo when interrupted',()=>{
 const s=new Session(data);s.giveWeapon('ithaca_zm');s.weapon.mag=0;const total=s.weapon.reserve;
 assert(s.reload());assert.equal(s.reloadStage,'start');s.update(s.reloadDuration+.001);
 assert.equal(s.weapon.mag,data.weapons.ithaca_zm.reloadStartAdd);assert.equal(s.reloadStage,'shell');
 s.update(s.reloadLeft+.001);assert.equal(s.weapon.mag,2);s.interruptReload();s.update(s.reloadLeft+.001);
 assert.equal(s.reloadStage,'end');assert.equal(s.weapon.mag,3);s.update(s.reloadLeft+.001);
 assert.equal(s.reloadLeft,0);assert.equal(s.weapon.mag+s.weapon.reserve,total);
 assert(s.reload());s.update(10);assert.equal(s.weapon.mag,s.def.clipSize);assert.equal(s.reloadLeft,0);
});

test('Speed Cola speeds each shotgun reload stage; switching cancels its transfer',()=>{
 const s=new Session(data);s.giveWeapon('spas_zm');s.weapon.mag=0;s.perks.add('specialty_fastreload');s.reload();
 assert.equal(s.reloadDuration,s.def.reloadStartTime/2);s.update(s.reloadDuration+.001);
 assert.equal(s.reloadDuration,s.def.reloadTime/2);const loaded=s.weapon.mag;s.switchWeapon(0);s.update(10);
 assert.equal(s.inventory[1].mag,loaded);assert.equal(s.reloadStage,null);assert.equal(s.weapon.mag,8);
});

test('perks cost 2500 plus 500 per bought perk held; free perks do not count',()=>{
  assert.deepEqual([0,1,2,3,4,5,9].map(perkPrice),[2500,3000,3500,4000,4500,5000,7000]);
  const s=new Session(data);assert.equal(s.perkPrice,2500);
  for(const id of ['specialty_armorvest','specialty_rof']){s.markBought(id);s.perks.add(id);}assert.equal(s.perkPrice,3500);
  s.markBought('specialty_fastreload');s.drinking='specialty_fastreload';assert.equal(s.perkPrice,4000);
  s.drinking=null;s.perks.add('specialty_quickrevive');assert.equal(s.perkPrice,3500);   // a free perk (gobblegum, Easter egg) leaves the price alone
  s.clearPerks();s.perks.add('specialty_armorvest');assert.equal(s.perkPrice,2500);       // lost on going down, then given free: not bought any more
});
test('dual wield guns fire independently, each from its own half of the mag', () => {
 const s=new Session(data,()=>0);s.inventory=[{id:'cz75dw_zm',mag:24,reserve:100,upgraded:false}];s.slot=0;s.phase='fighting';
 assert.deepEqual([s.handMag('left'),s.handMag('right')],[12,12]);
 assert(s.fireHand('left'));assert(!s.fireHand('left'));assert(s.fireHand('right'));   // separate cooldowns
 assert.deepEqual([s.handMag('left'),s.handMag('right'),s.weapon.mag],[11,11,22]);
 for(let i=0;i<20;i++){s.update(1);s.fireHand('left');}
 assert.equal(s.handMag('left'),0);assert(!s.fireHand('left'));s.update(1);assert(s.fireHand('right'));   // the right still has rounds
 s.weapon.mag=24;assert.deepEqual([s.handMag('left'),s.handMag('right')],[12,12]);   // a refill of the total fills both
 s.weapon.mag=10;s.weapon.magL=0;assert(s.reload());assert.equal(s.reloadHand,'both');s.update(5);assert.deepEqual([s.handMag('left'),s.handMag('right'),s.weapon.mag],[12,12,24]);
 // one gun empty, the other full: only the empty one reloads, and the full one keeps firing meanwhile
 s.weapon.mag=12;s.weapon.magL=0;assert(s.reload());assert.equal(s.reloadHand,'left');assert(s.reloadEmpty);
 assert(!s.fireHand('left'));assert(s.fireHand('right'));s.update(5);assert.deepEqual([s.handMag('left'),s.handMag('right'),s.weapon.mag],[12,11,23]);
 assert(s.reload());assert.equal(s.reloadHand,'right');assert(!s.reloadEmpty);assert(!s.fireHand('right'));s.update(5);assert.deepEqual([s.handMag('left'),s.handMag('right')],[12,12]);
});
