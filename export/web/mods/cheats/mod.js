// Cheat console: press ` (or the pause menu's Console button) and type a
// command. The first cheat marks the game as a cheat game until the next new
// game: the progression mod grants no XP or stats and the best round isn't
// saved. Solo only; it refuses while in a co-op room.
export default async function setup(api){
  const {host,data,session,enemies,equipView}=api;
  const state={used:false};
  window.kino.cheats=state;

  // ---- Lookups ------------------------------------------------------------
  const norm=s=>String(s).toLowerCase().replace(/_zm$/,'').replace(/[^a-z0-9]/g,'');
  const weaponIds=()=>Object.keys(data.weapons).filter(id=>!id.startsWith('zombie_perk_bottle')&&data.weapons[id].model&&!['knife_zm','bowie_knife_zm','zombie_knuckle_crack'].includes(id));
  function findWeapon(query){
    const q=norm(query),ids=weaponIds();
    const exact=ids.find(id=>norm(id)===q||norm(data.weapons[id].name)===q);if(exact)return {id:exact};
    const hits=ids.filter(id=>norm(id).includes(q)||norm(data.weapons[id].name).includes(q));
    return hits.length===1?{id:hits[0]}:{matches:hits};
  }
  const PERKS={juggernog:'specialty_armorvest',jug:'specialty_armorvest',speedcola:'specialty_fastreload',speed:'specialty_fastreload',doubletap:'specialty_rof',double:'specialty_rof',quickrevive:'specialty_quickrevive',quick:'specialty_quickrevive',revive:'specialty_quickrevive'};
  const PERK_NAMES={specialty_armorvest:'Juggernog',specialty_fastreload:'Speed Cola',specialty_rof:'Double Tap',specialty_quickrevive:'Quick Revive'};
  const perkIds=()=>Object.keys(data.perkDrinks??{});
  const POWERUPS=['nuke','insta_kill','double_points','full_ammo','carpenter','fire_sale'];
  const toggles={god:false,ammo:false};

  // ---- Commands -----------------------------------------------------------
  const weaponList=filter=>weaponIds().filter(id=>!filter||norm(id).includes(norm(filter))||norm(data.weapons[id].name).includes(norm(filter))).map(id=>`${data.weapons[id].name} (${id.replace(/_zm$/,'')})`);
  const commands={
    help:{usage:'help',text:'List commands',run:()=>Object.entries(commands).filter(([k])=>!listed.has(k)).map(([,c])=>`${c.usage.padEnd(22)} ${c.text}`).concat('spawn is the same as give.')},
    weapons:{usage:'weapons [filter]',text:'List weapon names for give',run:([f])=>weaponList(f)},
    give:{usage:'give <weapon>',text:'Give a weapon (name or id, partial is fine; "monkey" for monkey bombs)',cheat:true,run:([...w])=>{
      const q=w.join(' ');if(!q)return 'Usage: give <weapon>. Type "weapons" for the list.';
      if(/^monkeys?$/.test(norm(q))){session.giveMonkeys?.();return 'Monkey bombs given';}
      const r=findWeapon(q);if(!r.id)return r.matches.length?['Which one?',...r.matches.map(id=>'  '+data.weapons[id].name+' ('+id.replace(/_zm$/,'')+')')]:'No weapon matches "'+q+'"';
      session.giveWeapon(r.id);equipView();return 'Gave '+data.weapons[r.id].name;}},
    pap:{usage:'pap',text:'Pack-a-Punch the weapon in your hands',cheat:true,run:()=>{
      const w=session.weapon,d=data.weapons[w?.id];if(!d?.upgrade)return 'This weapon can\'t be Pack-a-Punched';
      w.upgraded=true;w.mag=session.def.clipSize;w.reserve=session.def.maxAmmo;equipView();return 'Upgraded to '+session.def.name;}},
    points:{usage:'points <n>',text:'Add points (default 10000)',cheat:true,run:([n])=>{const v=Math.round(+n||10000);session.points+=v;return `+${v} points`;}},
    god:{usage:'god',text:'Toggle invincibility',cheat:true,run:()=>{toggles.god=!toggles.god;session.effects.invulnerable=toggles.god?Infinity:0;return 'God mode '+(toggles.god?'on':'off');}},
    ammo:{usage:'ammo',text:'Toggle infinite ammo (no reloads)',cheat:true,run:()=>{toggles.ammo=!toggles.ammo;return 'Infinite ammo '+(toggles.ammo?'on':'off');}},
    perk:{usage:'perk <name|all>',text:'Give a perk: jug, speed, doubletap, quick, or all',cheat:true,run:([p])=>{
      const ids=perkIds(),want=norm(p??'')==='all'?ids:[PERKS[norm(p??'')]??ids.find(id=>norm(id).includes(norm(p??'')))].filter(id=>id&&ids.includes(id));
      if(!p||!want.length)return 'Perks: jug, speed, doubletap, quick, all';
      for(const id of want)session.perks.add(id);session.health=session.maxHealth;return 'Perks: '+want.map(id=>PERK_NAMES[id]??id).join(', ');}},
    round:{usage:'round <n>',text:'Skip to a round (clears zombies)',cheat:true,run:([n])=>{
      const r=Math.max(1,Math.floor(+n));if(!r)return 'Usage: round <n>';
      window.kino.debug.clearEnemies();session.round=r-1;session.nextRound();return 'Round '+r+' starts in '+Math.ceil(session.countdown)+' s';}},
    killall:{usage:'killall',text:'Kill every zombie',cheat:true,run:()=>{const n=enemies.list.length;window.kino.debug.clearEnemies();return `Killed ${n}`;}},
    powerup:{usage:'powerup <type>',text:'Grab a power-up: '+POWERUPS.join(', '),cheat:true,run:([t])=>{
      const type=POWERUPS.find(p=>norm(p)===norm(t??''))??POWERUPS.find(p=>norm(p).includes(norm(t??'')||'-'));
      if(!type)return 'Power-ups: '+POWERUPS.join(', ');window.kino.debug.collectPowerup(type);return 'Power-up: '+type.replace('_',' ');}},
    heal:{usage:'heal',text:'Refill health',cheat:true,run:()=>{session.health=session.maxHealth;return 'Healed';}},
    clear:{usage:'clear',text:'Clear this console',run:()=>{log.innerHTML='';}},
  };
  commands.spawn=commands.give;   // common alias
  const listed=new Set(['spawn']);

  function exec(line){
    const [name,...args]=line.trim().split(/\s+/);if(!name)return;
    const cmd=commands[name.toLowerCase()];if(!cmd){print('Unknown command "'+name+'". Type help.','err');return;}
    if(cmd.cheat){
      if(window.kino.coop?.code){print('Cheats are off in co-op games.','err');return;}
      if(!api.getState().started){print('Start the game first.','err');return;}
      if(!state.used){state.used=true;badge.hidden=false;print('Cheat mode on: this game earns no XP and won\'t count toward stats or best round.','warn');}
    }
    try{const out=cmd.run(args);for(const l of [out].flat())if(l!=null)print(String(l));}catch(e){print('Error: '+e.message,'err');}
  }

  // ---- Console UI ---------------------------------------------------------
  const css=document.createElement('style');css.textContent=`
    #cheat-console{position:fixed;left:50%;top:14px;transform:translateX(-50%);width:min(640px,calc(100vw - 32px));z-index:60;background:rgba(10,10,12,.92);border:1px solid #3a3530;border-radius:8px;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;color:#e8e2d6;box-shadow:0 10px 40px rgba(0,0,0,.5)}
    #cheat-console[hidden]{display:none}
    #cheat-console .log{max-height:min(46vh,340px);overflow-y:auto;padding:10px 12px 4px;white-space:pre-wrap}
    #cheat-console .log .err{color:#e77b6b}#cheat-console .log .warn{color:#e6c35c}#cheat-console .log .cmd{color:#8f8a80}
    #cheat-console form{display:flex;gap:8px;align-items:center;border-top:1px solid #2a2622;padding:8px 12px}
    #cheat-console form b{color:#c8452f}
    #cheat-console input{flex:1;background:transparent;border:0;outline:0;color:inherit;font:inherit}
    #cheat-console .hint{padding:0 12px 8px;color:#6f6a62;font-size:11px}
    #cheat-badge{position:fixed;top:14px;right:16px;z-index:40;padding:3px 8px;border:1px solid #c8452f;border-radius:4px;color:#e8765f;font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.12em;background:rgba(0,0,0,.45);pointer-events:none}
    #cheat-badge[hidden]{display:none}
    .game-menu-row:has(#open-console) .secondary{letter-spacing:1px;padding-left:4px;padding-right:4px;white-space:nowrap}`;
  document.head.append(css);
  const panel=document.createElement('div');panel.id='cheat-console';panel.hidden=true;
  panel.innerHTML='<div class="log"></div><form autocomplete="off"><b>&gt;</b><input spellcheck="false" placeholder="type help"></form><div class="hint">Enter runs · Tab completes · ↑↓ history · Esc or ` closes</div>';
  document.body.append(panel);
  const log=panel.querySelector('.log'),input=panel.querySelector('input'),form=panel.querySelector('form');
  const badge=document.createElement('div');badge.id='cheat-badge';badge.textContent='CHEATS · NO XP';badge.hidden=true;document.body.append(badge);
  function print(text,cls=''){const p=document.createElement('div');p.textContent=text;if(cls)p.className=cls;log.append(p);log.scrollTop=log.scrollHeight;}
  print('Cheat console. Type help for commands. Using a cheat turns off XP for this game.','cmd');

  const history=[];let historyAt=0,wasActive=false;
  function open(){
    if(!panel.hidden)return;wasActive=api.getState().active;panel.hidden=false;
    document.exitPointerLock?.();api.setActive(false);input.value='';setTimeout(()=>input.focus(),0);
  }
  function close(){
    if(panel.hidden)return;panel.hidden=true;input.blur();
    // The key press that closed us counts as a user gesture, so the pointer can be recaptured.
    if(wasActive&&session.phase!=='gameover')document.querySelector('canvas')?.requestPointerLock?.()?.catch?.(()=>{});
  }
  form.addEventListener('submit',e=>{e.preventDefault();const line=input.value;input.value='';if(!line.trim())return;history.push(line);historyAt=history.length;print('> '+line,'cmd');exec(line);});
  function complete(){
    const v=input.value,parts=v.split(/\s+/);
    if(parts.length<=1){const c=Object.keys(commands).filter(k=>!listed.has(k)&&k.startsWith(parts[0].toLowerCase()));if(c.length===1)input.value=c[0]+' ';else if(c.length)print(c.join('  '),'cmd');return;}
    const [cmd,...rest]=parts,q=rest.join(' ');
    const pool=['give','spawn'].includes(cmd)?weaponIds().map(id=>id.replace(/_zm$/,'')):cmd==='powerup'?POWERUPS:cmd==='perk'?['jug','speed','doubletap','quick','all']:[];
    const c=pool.filter(k=>norm(k).startsWith(norm(q)));if(c.length===1)input.value=cmd+' '+c[0];else if(c.length)print(c.slice(0,40).join('  ')+(c.length>40?' …':''),'cmd');
  }
  // Keys typed here must not reach the game (movement, reload, rebinds…).
  input.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.code==='Escape'||e.code==='Backquote'){e.preventDefault();close();}
    else if(e.code==='Tab'){e.preventDefault();complete();}
    else if(e.code==='ArrowUp'&&history.length){e.preventDefault();historyAt=Math.max(0,historyAt-1);input.value=history[historyAt];}
    else if(e.code==='ArrowDown'&&history.length){e.preventDefault();historyAt=Math.min(history.length,historyAt+1);input.value=history[historyAt]??'';}
  });
  input.addEventListener('keyup',e=>e.stopPropagation());
  addEventListener('keydown',e=>{if(e.code==='Backquote'&&!e.repeat&&panel.hidden&&!e.target.closest?.('input,textarea,select')&&api.getState().ready!==false){e.preventDefault();e.stopImmediatePropagation();open();}},true);
  panel.addEventListener('click',e=>e.stopPropagation());panel.addEventListener('mousedown',e=>e.stopPropagation());

  // A Console button in the pause menu, next to Settings / Main menu.
  const addButton=()=>{const row=document.querySelector('#open-settings')?.parentElement;if(!row||row.querySelector('#open-console'))return !!row;
    const b=document.createElement('button');b.type='button';b.id='open-console';b.className=document.querySelector('#open-settings').className;b.textContent='CONSOLE';
    b.addEventListener('click',e=>{e.stopPropagation();open();});row.append(b);return true;};
  if(!addButton()){const t=setInterval(()=>{if(addButton())clearInterval(t);},500);setTimeout(()=>clearInterval(t),15000);}

  // ---- Per-frame effects and new games -------------------------------------
  host.on('update',()=>{
    if(toggles.ammo&&session.weapon){const d=session.def;session.weapon.mag=d.clipSize;session.weapon.reserve=d.maxAmmo;}
    if(toggles.god)session.effects.invulnerable=Infinity;
  });
  host.on('reset',()=>{state.used=false;badge.hidden=true;toggles.god=toggles.ammo=false;session.effects.invulnerable=0;});
}
