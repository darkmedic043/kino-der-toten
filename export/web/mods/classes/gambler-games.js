// The Gambler's games (pure logic, no DOM or three.js: gambler.js draws them and test/gambler.test.mjs runs them).
// A game is plain data (so the odds can be simulated on a structuredClone) and its rules live in GAMES[id]:
//   start(rng)          the opening state: {id, t, dur, over, ...}
//   tick(s, dt, rng)    time passes: reels stop, the wheel slows; sets s.over when the game is done
//   on(s, ev, k, rng)   ev 'kill' | 'head' | 'melee' | 'multi' (your gun tilting it, applied with chance k = 1 − House
//                       Edge) or 'z' | 'reload' (your decisions). Returns a short word for the board, or null
//   result(s)           {tier: 'bust' | 'push' | 'win' | 'big' | 'jackpot', label}
// Odds are honest: odds() plays the rest of the game out many times from a copy, with hidden cards redrawn, at the
// player's recent kill rate, and counts the outcomes.
export const TIERS=['bust','push','win','big','jackpot'];
export const tierUp=t=>TIERS[Math.min(TIERS.length-1,Math.max(2,TIERS.indexOf(t)+1))];
const pick=(a,rng)=>a[Math.floor(rng()*a.length)];
const d6=rng=>1+Math.floor(rng()*6);
const sum=a=>a.reduce((x,y)=>x+y,0);
const counts=a=>{const m=new Map();for(const v of a)m.set(v,(m.get(v)??0)+1);return m;};
// the most common value (ties: the higher one)
const mode=a=>{let best=null,n=0;for(const [v,c] of counts(a))if(c>n||c===n&&v>best){best=v;n=c;}return {v:best,n};};

// ---- One-Armed Bandit ------------------------------------------------------------------------------------------
// Three reels stop one by one, then they sit on the payline: a kill may nudge a reel that's off the target
// symbol one step either way, a headshot nudges the first one the short way toward the target.
export const STRIP=['cherry','bell','bar','melon','seven','bell','cherry','bar','skull','melon'];
const VALUE={seven:5,melon:4,bar:3,bell:2,cherry:1,skull:0};
export const STOPS=[2.2,3.6,5];
function slotTarget(s){
  const shown=s.reels.map(p=>STRIP[p]),m=mode(shown.filter(x=>x!=='skull'));
  if(m.n>=2)return m.v;
  return shown.filter(x=>x!=='skull').sort((a,b)=>VALUE[b]-VALUE[a])[0]??'seven';
}
function nudge(s,smart,rng){
  if(s.t<STOPS[2])return null;
  const target=slotTarget(s),off=[0,1,2].filter(i=>STRIP[s.reels[i]]!==target);if(!off.length)return null;
  const i=smart?off[0]:off[Math.floor(rng()*off.length)];
  let dir=rng()<.5?1:-1;
  if(smart){const n=STRIP.length,fwd=[...Array(n).keys()].find(k=>STRIP[(s.reels[i]+k)%n]===target),back=[...Array(n).keys()].find(k=>STRIP[(s.reels[i]-k+n*9)%n]===target);dir=back<fwd?-1:1;}
  s.reels[i]=(s.reels[i]+dir+STRIP.length)%STRIP.length;s.nudged=i;return 'NUDGE';
}
const slots={
  name:'One-Armed Bandit',family:'wheel',
  start:rng=>({id:'slots',t:0,dur:8.5,over:false,reels:[0,1,2].map(()=>Math.floor(rng()*STRIP.length)),nudged:-1}),
  tick(s,dt){s.t+=dt;if(s.t>=s.dur)s.over=true;},
  on(s,ev,k,rng){
    if(ev==='z'||ev==='reload'){if(s.t>=STOPS[2]){s.over=true;return 'CASH IN';}return null;}
    if(rng()>=k)return null;
    if(ev==='head'||ev==='multi')return nudge(s,true,rng);
    if(ev==='kill'||ev==='melee')return rng()<.5?nudge(s,false,rng):null;
    return null;
  },
  result(s){
    const shown=s.reels.map(p=>STRIP[p]),m=mode(shown);
    if(m.n===3&&m.v==='seven')return {tier:'jackpot',label:'MELON 777'};
    if(m.n===3&&m.v==='skull')return {tier:'bust',label:'THREE SKULLS'};
    if(m.n===3)return {tier:'big',label:'THREE '+m.v.toUpperCase()+'S'};
    if(m.n===2&&m.v==='cherry')return {tier:'push',label:'PAIR OF CHERRIES'};
    if(m.n===2&&m.v!=='skull')return {tier:'win',label:'PAIR OF '+m.v.toUpperCase()+'S'};
    return {tier:'bust',label:'NO LINE'};
  },
  hint:'KILLS NUDGE A REEL · HEADSHOTS AIM IT · Z CASHES IN',
};

// ---- Blackjack -----------------------------------------------------------------------------------------------
// An endless shoe. Z hits, reload stands; the clock stands for you. A kill peeks at the next card, two headshots in a
// row (or one, when the peeked card would bust you) swap it for another; a multikill burns the dealer's hole card when
// it's strong. The dealer stands on 17.
const card=rng=>1+Math.floor(rng()*13);   // 1 ace … 11 J, 12 Q, 13 K
export function handTotal(h){let t=0,aces=0;for(const c of h){t+=c===1?11:Math.min(10,c);if(c===1)aces++;}while(t>21&&aces--)t-=10;return t;}
function dealerPlay(s,rng){while(handTotal(s.dealer)<17)s.dealer.push(card(rng));}
const blackjack={
  name:'Blackjack',family:'cards',
  start(rng){const s={id:'blackjack',t:0,dur:12,over:false,player:[card(rng),card(rng)],dealer:[card(rng),card(rng)],next:card(rng),peek:false,streak:0,hidden:true,stood:false};
    if(handTotal(s.player)===21){s.over=true;s.hidden=false;}return s;},
  tick(s,dt,rng){s.t+=dt;if(!s.over&&s.t>=s.dur){s.stood=true;s.hidden=false;dealerPlay(s,rng);s.over=true;}},
  on(s,ev,k,rng){
    if(s.over)return null;
    if(ev==='z'){s.player.push(s.next);s.next=card(rng);s.peek=false;const t=handTotal(s.player);
      if(t>21||t===21||s.player.length>=5){if(t<=21){s.hidden=false;dealerPlay(s,rng);}s.over=true;}return 'HIT';}
    if(ev==='reload'){s.stood=true;s.hidden=false;dealerPlay(s,rng);s.over=true;return 'STAND';}
    if(ev!=='head')s.streak=0;
    if(rng()>=k)return null;
    if(ev==='head'){const bad=s.peek&&handTotal([...s.player,s.next])>21;s.peek=true;if(bad||++s.streak>=2){s.streak=0;s.next=card(rng);s.peek=false;return 'SWAP';}return 'PEEK';}
    if(ev==='multi'&&s.hidden&&handTotal(s.dealer)>=17){s.dealer[1]=card(rng);return 'BURN';}
    if(ev==='kill'||ev==='melee'||ev==='multi'){if(s.peek)return null;s.peek=true;return 'PEEK';}
    return null;
  },
  result(s){
    const p=handTotal(s.player),d=handTotal(s.dealer);
    if(s.player.length===2&&p===21)return {tier:'jackpot',label:'BLACKJACK'};
    if(p>21)return {tier:'bust',label:'BUST · '+p};
    if(s.player.length>=5)return {tier:'big',label:'FIVE-CARD CHARLIE'};
    if(d>21)return {tier:p===21?'big':'win',label:'DEALER BUSTS'};
    if(p>d)return {tier:p===21?'big':'win',label:p+' BEATS '+d};
    if(p===d)return {tier:'push',label:'PUSH · '+p};
    return {tier:'bust',label:'DEALER WINS · '+d};
  },
  hint:'Z HITS · R STANDS · A KILL PEEKS · TWO HEADSHOTS SWAP THE CARD',
};

// ---- Bone Dice -------------------------------------------------------------------------------------------------
// Your three dice against the house's three. A headshot adds a pip to one of your dice, a multikill re-rolls the lowest,
// any kill may rattle one up a pip (the gun adds two pips to a die at most). Z calls it early.
const lowest=a=>a.indexOf(Math.min(...a));
const dice={
  name:'Bone Dice',family:'dice',
  start(rng){let house;do house=[d6(rng),d6(rng),d6(rng)];while(sum(house)<7);return {id:'dice',t:0,dur:11,over:false,mine:[d6(rng),d6(rng),d6(rng)],pips:[0,0,0],house,last:-1};},
  tick(s,dt){s.t+=dt;if(s.t>=s.dur)s.over=true;},
  on(s,ev,k,rng){
    if(s.over)return null;
    if(ev==='z'){s.over=true;return 'CALLED';}
    if(ev==='reload')return null;
    if(rng()>=k)return null;
    const low=lowest(s.mine),under=[0,1,2].filter(j=>s.mine[j]<6&&s.pips[j]<2),i=under[Math.floor(rng()*under.length)];
    if(ev==='multi'){s.mine[low]=d6(rng);s.pips[low]=0;s.last=low;return 'RE-ROLL';}
    if(i==null)return null;
    if(ev==='head'||ev==='melee'){s.mine[i]++;s.pips[i]++;s.last=i;return '+1';}
    if(ev==='kill'&&rng()<.2){s.mine[i]++;s.pips[i]++;s.last=i;return 'RATTLE +1';}
    return null;
  },
  result(s){
    const m=mode(s.mine),a=sum(s.mine),b=sum(s.house);
    if(m.n===3&&m.v===6)return {tier:'jackpot',label:'BOXCARS'};
    if(m.n===3)return {tier:'big',label:'TRIPLE '+m.v+'S'};
    if(a>b)return {tier:a-b>=5?'big':'win',label:a+' OVER '+b};
    if(a===b)return {tier:'push',label:'TIE · '+a};
    return {tier:'bust',label:s.mine.filter(v=>v===1).length>=2?'SNAKE EYES':'HOUSE ROLLS '+b};
  },
  hint:'HEADSHOT +1 · MULTIKILL RE-ROLLS · Z CALLS IT',
};

// ---- Roulette ---------------------------------------------------------------------------------------------------
// The European wheel. Your bet: a colour and a lucky number of that colour. The ball slows by itself; kills brake it
// harder when that lands it on your colour, and a headshot knocks it a pocket on when it's heading off it, until it settles (the last stretch, when it may still bounce a pocket on).
export const WHEEL=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const colourOf=n=>n===0?'green':RED.has(n)?'red':'black';
const SETTLE=1.6;   // pockets/s under which the ball can't be pushed any more
export const landing=s=>(Math.floor(s.p+(s.v>0?s.v*s.v/(2*s.a):0))%37+37)%37;
const roulette={
  name:'Roulette',family:'wheel',
  start(rng){const colour=rng()<.5?'red':'black',mine=WHEEL.filter(n=>colourOf(n)===colour);const v=13+rng()*4;
    return {id:'roulette',t:0,dur:12,over:false,p:rng()*37,v,a:v/11,colour,lucky:pick(mine,rng),bounced:false};},
  tick(s,dt,rng){
    s.t+=dt;if(s.over)return;
    s.p+=s.v*dt;s.v=Math.max(0,s.v-s.a*dt);
    if(!s.bounced&&s.v<SETTLE){s.bounced=true;if(rng()<.25)s.p+=1;}
    if(s.v<=0||s.t>=s.dur+3){s.v=0;s.over=true;}
  },
  on(s,ev,k,rng){
    if(s.over||ev==='z'||ev==='reload'||s.v<SETTLE)return null;
    if(rng()>=k)return null;
    if(ev==='head'){if(colourOf(WHEEL[landing(s)])===s.colour)return null;s.p+=1;return 'SKIP';}
    if(ev==='kill'||ev==='melee'||ev==='multi'){const v=s.v;s.v*=ev==='multi'?.7:.86;if(colourOf(WHEEL[landing(s)])===s.colour||WHEEL[landing(s)]===0)return 'BRAKE';s.v=v;return null;}
    return null;
  },
  result(s){
    const n=WHEEL[landing(s)];
    if(n===0)return {tier:'jackpot',label:'GREEN 0'};
    if(n===s.lucky)return {tier:'big',label:'STRAIGHT UP · '+n};
    if(colourOf(n)===s.colour)return {tier:'win',label:n+' '+s.colour.toUpperCase()};
    return {tier:'bust',label:n+' '+colourOf(n).toUpperCase()};
  },
  hint:'KILLS BRAKE THE WHEEL · HEADSHOTS SKIP A POCKET',
};

// ---- Poker --------------------------------------------------------------------------------------------------------
// Five cards. A kill ranks up your lowest loose card (once per card), two headshots in a row make one wild
// (one wild at most). When the clock runs
// out the loose cards are drawn again; Z or reload locks the hand as it is.
const pcard=rng=>({r:2+Math.floor(rng()*13),s:Math.floor(rng()*4),w:false});
// best hand of 5 cards, wilds tried as every card: {rank 0-10, name}
const HANDS=['HIGH CARD','PAIR','TWO PAIR','THREE OF A KIND','STRAIGHT','FLUSH','FULL HOUSE','FOUR OF A KIND','STRAIGHT FLUSH','ROYAL FLUSH','FIVE OF A KIND'];
function rank5(cards){
  const r=cards.map(c=>c.r).sort((a,b)=>b-a),cs=[...counts(r).values()].sort((a,b)=>b-a),flush=cards.every(c=>c.s===cards[0].s);
  const u=[...new Set(r)],straight=u.length===5&&(u[0]-u[4]===4||u.join()==='14,5,4,3,2');
  if(cs[0]===5)return 10;
  if(straight&&flush)return u[0]===14&&u[4]===10?9:8;
  if(cs[0]===4)return 7;if(cs[0]===3&&cs[1]===2)return 6;if(flush)return 5;if(straight)return 4;if(cs[0]===3)return 3;if(cs[0]===2&&cs[1]===2)return 2;
  if(cs[0]===2)return 1;return 0;
}
export function bestHand(cards){
  const wild=cards.filter(c=>c.w),fixed=cards.filter(c=>!c.w);
  if(!wild.length)return {rank:rank5(cards),pair:pairRank(cards)};
  // a wild only needs to be tried as each rank, in the fixed cards' suit (a flush) or another one
  const suit=fixed.length&&fixed.every(c=>c.s===fixed[0].s)?fixed[0].s:0,opts=[];
  for(let r=2;r<=14;r++){opts.push({r,s:suit,w:false});opts.push({r,s:(suit+1)%4,w:false});}
  let best=-1,pair=0;
  const tryHand=h=>{const k=rank5(h),hi=k===1?pairRank(h):0;if(k>best||k===best&&hi>pair){best=k;pair=hi;}};
  if(wild.length===1)for(const a of opts)tryHand([...fixed,a]);
  else for(const a of opts)for(const b of opts)tryHand([...fixed,a,b]);
  return {rank:best,pair};
}
const pairRank=h=>{for(const [v,c] of counts(h.map(c=>c.r)))if(c===2)return v;return 0;};
// which cards count toward the hand (kept on the draw, never ranked up)
function used(cards){
  const c=counts(cards.filter(x=>!x.w).map(x=>x.r));
  if(!cards.some(x=>x.w)){const k=rank5(cards);if(k>=4&&k!==7)return cards.map(()=>true);}   // a made straight, flush or full house
  return cards.map(x=>x.w||c.get(x.r)>=2);
}
function looseLowest(s){const u=used(s.cards);let i=-1;s.cards.forEach((c,j)=>{if(!u[j]&&(i<0||c.r<s.cards[i].r))i=j;});return i;}
const poker={
  name:'Poker',family:'cards',
  start:rng=>({id:'poker',t:0,dur:12,over:false,cards:[0,1,2,3,4].map(()=>pcard(rng)),locked:false,drawn:false,last:-1,streak:0}),
  tick(s,dt,rng){
    s.t+=dt;if(s.over||s.t<s.dur)return;
    if(!s.locked){const u=used(s.cards);s.cards=s.cards.map((c,j)=>u[j]?c:pcard(rng));s.drawn=true;}
    s.over=true;
  },
  on(s,ev,k,rng){
    if(s.over)return null;
    if(ev==='z'||ev==='reload'){s.locked=true;s.over=true;return 'LOCKED';}
    if(ev!=='head')s.streak=0;
    if(rng()>=k)return null;
    const i=looseLowest(s);if(i<0)return null;const c=s.cards[i];
    if(ev==='head'&&++s.streak>=2&&!s.cards.some(c=>c.w)){s.streak=0;c.w=true;s.last=i;return 'WILD';}
    if(c.up||c.r>=14)return null;
    c.r++;c.up=1;s.last=i;return 'RANK UP';
    return null;
  },
  result(s){
    const h=bestHand(s.cards),name=HANDS[h.rank];
    if(h.rank>=8)return {tier:'jackpot',label:name};
    if(h.rank>=4)return {tier:'big',label:name};
    if(h.rank>=2)return {tier:'win',label:name};
    if(h.rank===1&&h.pair>=11)return {tier:'push',label:'JACKS OR BETTER'};
    return {tier:'bust',label:h.rank===1?'LOW PAIR':'NOTHING'};
  },
  hint:'A KILL RANKS UP A CARD · HEADSHOT MAKES ONE WILD · Z OR R LOCKS THE HAND',
};

// ---- Fistful of Dice ----------------------------------------------------------------------------------------------
// Five dice to fill with one face. A kill may hold a die showing the most common face (or rolls a loose one), a melee kill
// sets a loose die to it (once), a headshot may re-roll a loose die that's off it (twice a game). Three of a kind pays from 4s up. Z re-rolls the loose dice (once).
const fistful={
  name:'Fistful of Dice',family:'dice',
  start:rng=>({id:'fistful',t:0,dur:12,over:false,dice:[0,1,2,3,4].map(()=>d6(rng)),held:[false,false,false,false,false],rerolls:1,last:-1}),
  tick(s,dt){s.t+=dt;if(s.t>=s.dur||s.held.every(Boolean))s.over=true;},
  on(s,ev,k,rng){
    if(s.over)return null;
    const best=mode(s.held.some(Boolean)?s.dice.filter((_,i)=>s.held[i]):s.dice).v,loose=s.dice.map((_,i)=>i).filter(i=>!s.held[i]);
    if(ev==='z'){if(!s.rerolls||!loose.length)return null;s.rerolls--;for(const i of loose)if(s.dice[i]!==best)s.dice[i]=d6(rng);return 'RE-ROLL';}
    if(ev==='reload')return null;
    if(rng()>=k||!loose.length)return null;
    if(ev==='melee'&&!s.set){s.set=true;const i=loose.find(i=>s.dice[i]!==best)??loose[0];s.dice[i]=best;s.held[i]=true;s.last=i;return 'SET';}
    const m=loose.find(i=>s.dice[i]===best);
    if(ev==='head'&&(s.tumbles??0)<2&&rng()<.5){const i=loose.find(i=>s.dice[i]!==best);if(i!=null){s.tumbles=(s.tumbles??0)+1;s.dice[i]=d6(rng);s.last=i;return 'TUMBLE';}}
    if(ev==='kill'&&rng()<.45)return null;
    if(ev==='kill'||ev==='multi'||ev==='head'){if(m!=null){s.held[m]=true;s.last=m;return 'HOLD';}return null;}
    return null;
  },
  result(s){
    const cs=[...counts(s.dice).values()].sort((a,b)=>b-a),m=mode(s.dice),u=[...new Set(s.dice)].sort();
    if(cs[0]===5)return {tier:'jackpot',label:'FIVE OF A KIND'};
    if(cs[0]===4)return {tier:'big',label:'FOUR '+m.v+'S'};
    if(cs[0]===3&&cs[1]===2)return {tier:'big',label:'FULL HOUSE'};
    if(u.length===5&&u[4]-u[0]===4)return {tier:'win',label:'STRAIGHT'};
    if(cs[0]===3)return {tier:m.v>=4?'win':'push',label:'THREE '+m.v+'S'};
    if(cs[0]===2&&cs[1]===2)return {tier:'push',label:'TWO PAIR'};
    return {tier:'bust',label:'SCATTERED'};
  },
  hint:'A KILL HOLDS A DIE · MELEE SETS ONE · HEADSHOT TUMBLES · Z RE-ROLLS ONCE',
};

export const GAMES={slots,blackjack,dice,roulette,poker,fistful};
export const newGame=(id,rng=Math.random)=>GAMES[id].start(rng);
export const familyOf=id=>GAMES[id]?.family;

// ---- odds ------------------------------------------------------------------------------------------------------------
// play the rest out n times at the player's pace: rate kills/s, of which head are headshots and melee melee kills
export function odds(s,{k=1,rate=.6,head=.3,melee=.05,multi=.1,n=120,rng=Math.random}={}){
  const g=GAMES[s.id],out={bust:0,push:0,win:0,big:0,jackpot:0},dt=.1;
  for(let i=0;i<n;i++){
    const c=structuredClone(s);
    // what the player can't see is redrawn
    if(c.id==='blackjack'){if(!c.peek)c.next=card(rng);if(c.hidden)c.dealer[1]=card(rng);}
    let guard=0;
    while(!c.over&&guard++<400){
      if(rng()<rate*dt){const r=rng();g.on(c,r<melee?'melee':r<melee+head?'head':'kill',k,rng);if(rng()<multi)g.on(c,'multi',k,rng);}
      if(c.over)break;
      policy(c,rng);
      if(!c.over)g.tick(c,dt,rng);
    }
    out[g.result(c).tier]++;
  }
  for(const t in out)out[t]/=n;
  return {...out,win:out.win+out.big+out.jackpot,big:out.big+out.jackpot};   // win: at least a win; big: at least big
}
// the simulated player's decisions
function policy(c,rng){
  const g=GAMES[c.id];
  if(c.id==='blackjack'&&c.t>.4&&Math.floor(c.t*10)%5===0){const t=handTotal(c.player),n=c.peek?handTotal([...c.player,c.next]):0;
    if(c.peek?n<=21&&t<19:t<17)g.on(c,'z',1,rng);else if(t>=17||c.peek&&n>21)g.on(c,'reload',1,rng);}
  if(c.id==='fistful'&&c.rerolls&&c.t>2&&rng()<.03)g.on(c,'z',1,rng);
  if(c.id==='dice'&&c.t>c.dur*.6&&sum(c.mine)-sum(c.house)>=3)g.on(c,'z',1,rng);
}

// ---- Let It Ride: double or nothing on a flip of the coin ------------------------------------------------------------
export const rideOdds=(bonus=0)=>Math.max(.1,Math.min(.85,.5+bonus));

// ---- payouts -----------------------------------------------------------------------------------------------------------
// rewards: [{id, tiers:['win'|'big'], ...}]. win: one 'win' reward; big: one 'big' and one 'win'; jackpot: the game's
// jackpot and one 'big'. extra adds 'win' rewards. Never the same reward twice in one payout.
export function payout(tier,rewards,{extra=0,rng=Math.random}={}){
  if(tier==='bust'||tier==='push')return [];
  const used=new Set(),from=t=>{const a=rewards.filter(r=>r.tiers?.includes(t)&&!used.has(r.id));if(!a.length)return null;const r=pick(a,rng);used.add(r.id);return r.id;};
  const out=tier==='jackpot'?['jackpot',from('big')]:tier==='big'?[from('big'),from('win')]:[from('win')];
  for(let i=0;i<extra;i++)out.push(from('win'));
  return out.filter(Boolean);
}
// the next game for the marquee: any game in the pool but the last one (if there's a choice)
export function nextGame(pool,last,rng=Math.random){const a=pool.length>1?pool.filter(g=>g!==last):pool;return pick(a,rng);}
