import test from 'node:test';
import assert from 'node:assert/strict';
import {TIERS,tierUp,GAMES,newGame,odds,payout,rideOdds,nextGame,handTotal,bestHand,WHEEL,colourOf,STRIP} from '../export/web/mods/classes/gambler-games.js';

// a seeded rng so every run plays the same games
const seeded=seed=>()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};

test('tiers step up from at least a win and stop at the jackpot',()=>{
  assert.equal(tierUp('bust'),'win');assert.equal(tierUp('win'),'big');assert.equal(tierUp('big'),'jackpot');assert.equal(tierUp('jackpot'),'jackpot');
});

test('blackjack totals count aces as 1 or 11',()=>{
  assert.equal(handTotal([1,13]),21);assert.equal(handTotal([1,1,9]),21);assert.equal(handTotal([10,12,5]),25);assert.equal(handTotal([1,5,9]),15);
});

test('poker hands, with a wild played as the best card',()=>{
  const c=(r,s,w=false)=>({r,s,w});
  assert.equal(bestHand([c(14,0),c(13,0),c(12,0),c(11,0),c(10,0)]).rank,9);
  assert.equal(bestHand([c(9,0),c(9,1),c(9,2),c(4,0),c(4,1)]).rank,6);
  assert.equal(bestHand([c(9,0),c(9,1),c(9,2),c(9,3),c(2,0,true)]).rank,10);
  assert.equal(bestHand([c(2,0),c(3,0),c(4,0),c(5,0),c(13,1,true)]).rank,8);
  assert.equal(bestHand([c(11,0),c(11,1),c(3,2),c(6,0),c(8,1)]).pair,11);
});

test('the roulette wheel has 37 pockets with one green',()=>{
  assert.equal(new Set(WHEEL).size,37);assert.equal(WHEEL.filter(n=>colourOf(n)==='green').length,1);
  assert.equal(WHEEL.filter(n=>colourOf(n)==='red').length,18);assert(STRIP.includes('seven'));
});

test('every game finishes on the clock and gives a known tier',()=>{
  const rng=seeded(7);
  for(const id in GAMES)for(let i=0;i<40;i++){
    const g=GAMES[id],s=newGame(id,rng);let n=0;
    while(!s.over&&n++<400){if(rng()<.08)g.on(s,['kill','head','melee','multi'][Math.floor(rng()*4)],1,rng);g.tick(s,.1,rng);}
    assert(s.over,id+' never ended');
    const r=g.result(s);assert(TIERS.includes(r.tier),id+' gave '+r.tier);assert.equal(typeof r.label,'string');
  }
});

test('odds add up and the gun tilts them',()=>{
  for(const id in GAMES){
    let calm=0,hot=0;
    for(let i=0;i<30;i++){
      const s=newGame(id,seeded(100+i));
      const a=odds(s,{rate:0,n:40,rng:seeded(i)}),b=odds(s,{rate:1.2,head:.5,n:40,rng:seeded(i)});
      assert(Math.abs(a.bust+a.push+a.win-1)<1e-9,id+' odds don\'t sum to 1');
      assert(a.big<=a.win&&a.jackpot<=a.big);
      calm+=a.win;hot+=b.win;
    }
    if(id!=='blackjack')assert(hot>calm,id+': shooting should help ('+calm+' → '+hot+')');
  }
});

test('odds() works on a copy and leaves the game alone',()=>{
  const s=newGame('poker',seeded(3)),before=JSON.stringify(s);odds(s,{n:20});assert.equal(JSON.stringify(s),before);
});

test('payouts: one reward per tier step, never the same twice',()=>{
  const rewards=[{id:'a',tiers:['win']},{id:'b',tiers:['win']},{id:'c',tiers:['big']},{id:'d',tiers:['big']}],rng=seeded(1);
  assert.deepEqual(payout('bust',rewards),[]);assert.deepEqual(payout('push',rewards),[]);
  assert.equal(payout('win',rewards,{rng}).length,1);
  const big=payout('big',rewards,{rng});assert.equal(big.length,2);assert(['c','d'].includes(big[0]));assert(['a','b'].includes(big[1]));
  const jp=payout('jackpot',rewards,{rng,extra:1});assert.equal(jp[0],'jackpot');assert.equal(new Set(jp).size,jp.length);
  assert.equal(payout('win',rewards,{rng,extra:5}).length,2);   // only two 'win' rewards exist
});

test('Let It Ride stays a gamble and the marquee never repeats a game',()=>{
  assert.equal(rideOdds(),.5);assert.equal(rideOdds(2),.85);assert.equal(rideOdds(-2),.1);
  const rng=seeded(9);for(let i=0;i<50;i++)assert.notEqual(nextGame(['slots','dice','blackjack'],'dice',rng),'dice');
  assert.equal(nextGame(['dice'],'dice',rng),'dice');
});
