// Friends in game (social.js): tells friends this player is in a game (the map, and the co-op room so they can join),
// and shows friend requests and invites as notifications while playing. The co-op lobby (mods/multiplayer) has
// ADD FRIEND on players and the invite list.
import { startSocial, setStatus } from '../../social.js';

export default async function setup(api){
  const {host}=api,map=api.map??{};
  const status=()=>({status:'game',map:map.id??'',mapName:map.title??map.name??'',room:window.kino.coop?.code??''});
  await startSocial(status());
  let last='',t=0;
  host.on('update',dt=>{if((t-=dt)>0)return;t=2;const s=status(),k=JSON.stringify(s);if(k!==last){last=k;setStatus(s);}});
}
