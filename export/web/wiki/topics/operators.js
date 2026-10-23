// Operators: the playable characters (the Armory's Operator pane), their skins, customisation, and where the
// unlockable ones come from (Shop outfits, Melon Pass operators). Read from the character, shop and season data.
const MUTED='#9d947e';

export default {
  id:'operators',title:'Operators',order:70,
  blurb:'Who you play as: every operator, their skins and customisation, and where to unlock them.',
  async load(ctx){
    const {esc,badge,table,md,note,slug,infobox,cards}=ctx;
    const K=(await ctx.json('mods/characters/characters.json')).characters;
    const cat=await ctx.json('mods/shop/catalog.json').catch(()=>({items:[],rarities:{}}));
    const shopItem=id=>(cat.items??[]).find(i=>i.id===id);
    const rarity=r=>r?badge(ctx.cap(r),cat.rarities?.[r]??MUTED):'';
    // Melon Pass seasons: which page's major reward hands out each operator
    const seasons=[];
    try{const list=(await ctx.json('mods/pass/seasons.json')).seasons??[];
      for(const f of list)seasons.push(await ctx.json('mods/pass/'+f));}catch{}
    const passSource=shopId=>{
      for(const s of seasons)for(const [i,p] of (s.pages??[]).entries()){
        if(p.major?.reward?.id===shopId)return {season:s,page:p,index:i+1,major:true};
        const it=(p.items??[]).find(x=>x.reward?.id===shopId);if(it)return {season:s,page:p,index:i+1,premium:!!it.premium};}
      return null;};
    const seasonNo=s=>seasons.indexOf(s)+1;

    // the game lists an optional operator only when its model is on the server: check the same way
    const modelUrl=c=>'mods/characters/'+String(c.model).split('?')[0];
    // (hidden entries are never listed, so they aren't checked; results are kept for this browser session)
    const present=await Promise.all(K.map(async c=>{if(c.hidden)return false;if(!c.optional)return true;
      const key='wiki.op.'+c.id;try{const v=sessionStorage.getItem(key);if(v)return v==='1';}catch{}
      let ok=false;try{const r=await fetch(ctx.url(modelUrl(c)),{headers:{Range:'bytes=0-0'}});ok=r.ok;if(r.status===206)await r.arrayBuffer();else r.body?.cancel?.();}catch{}
      try{sessionStorage.setItem(key,ok?'1':'0');}catch{}return ok;}));
    const chars=K.filter((c,i)=>present[i]&&!c.hidden);
    const ops=chars.filter(c=>!c.skinOf&&!(c.type==='mannequin'&&c.id!=='mannequin'));
    const skinsOf=op=>chars.filter(c=>c.skinOf===op.id);
    const outfits=chars.filter(c=>c.shop&&!c.pass&&!c.skinOf);

    // player-facing blurbs (the menu's own text, minus build notes)
    const BLURB={mannequin:'The default operator: a plain test-dummy figure, ready from the start. It also comes in other colours (Blue, plus outfits from the Shop), each its own entry in the operator list.'};
    const blurb=c=>BLURB[c.id]??String(c.description??'').replace(/\s*\(converted from [^)]*\)/,'').replace(/\s*Operator\.$/,'');
    const kindOf=c=>c.type==='mannequin'?'Placeholder figure':c.type==='t5'?'Game model':'Custom model';
    const link=(t,u)=>u?`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`:esc(t);
    const credit=c=>c?`"${link(c.title,c.source)}" by ${link(c.author,c.authorUrl)}${c.license?`, licensed under ${link(c.license,c.licenseUrl)}`:''}`:'';
    const swatch=(c,h=140)=>`<div style="height:${h}px;border-radius:6px;background:linear-gradient(135deg,${c.color??'#5a5448'} 0 55%,${c.accent??'#2a2620'} 55% 100%);display:flex;align-items:flex-end;padding:8px;color:#fff;font-weight:700;text-shadow:0 1px 3px #000">${esc(c.skinName??c.name)}</div>`;
    const img=c=>c.icon?ctx.url('mods/characters/'+c.icon):null;
    const sourceOf=c=>{
      if(c.pass){const p=passSource(c.shop);
        return p?`${ctx.link('pass',null,'Melon Pass')} Season ${seasonNo(p.season)} (${esc(p.season.name)}), page ${p.index} "${esc(p.page.name)}" ${p.major?'page reward':p.premium?'(premium)':''}`:ctx.link('pass',null,'Melon Pass');}
      if(c.shop){const it=shopItem(c.shop);return it?`${ctx.link('progression','shop','Shop')}: ${ctx.num(it.price)} credits`:'Shop';}
      return 'Available from the start';};
    const pageId=c=>slug(c.name);
    const variants=c=>(c.variants??[]).length?table(['Option','Choices'],c.variants.map(v=>[`<b>${esc(v.label)}</b>`,v.options.map(o=>esc(o.label)).join(' · ')]),{cls:'compact'}):'';

    const opPage=op=>{
      const skins=[op,...skinsOf(op)];
      const own=c=>c.type==='mannequin'?'Tinted sleeves':c.fpArms?'The operator\'s own arms':null;
      const rows=[['Model',kindOf(op)],['Unlock',sourceOf(op)]];
      if(skins.length>1)rows.push(['Skins',skins.map(s=>esc(s.skinName??(s===op?'Default':s.name))).join(', ')]);
      if(own(op))rows.push(['First-person arms',own(op)]);
      if(op.variants?.length)rows.push(['Customisation',`${op.variants.length} option${op.variants.length===1?'':'s'}`]);
      let h=infobox({title:op.name,img:img(op),imgHtml:img(op)?null:swatch(op),color:op.accent??op.color,rows,foot:op.credit?'Model: '+credit(op.credit):null});
      h+=`<p class="lead">${esc(blurb(op))}</p>`;
      if(op.variants?.length)h+=`<h2>Customisation</h2><p>Pick these under the preview in the Operator menu; your picks are saved for this operator.</p>`+variants(op);
      const others=skinsOf(op);
      if(op.id==='mannequin'){
        const blue=chars.find(c=>c.id==='mannequin_blue');
        h+=`<h2>Colourways</h2><p>The Test Subject comes in several colours. Blue is free; the rest are outfits from the ${ctx.link('progression','shop','Shop')}, bought with credits. An outfit changes the body, the accent colour and your first-person sleeves.</p>`;
        h+=table(['Outfit','Colours','Price','Rarity','Notes'],[...(blue?[blue]:[]),...outfits].map(c=>{const it=c.shop?shopItem(c.shop):null;
          const nm=c.name.replace(/^Test Subject \((.*)\)$/,'$1');
          return [`<b>${esc(nm)}</b>`,`<span class="swatch" style="background:${c.color}"></span> <span class="swatch" style="background:${c.accent}"></span>`,
            it?`${ctx.num(it.price)} credits`:'Free',it?rarity(it.rarity):'',it?.rotating?'Only in the Featured slots or the weekly bundle until you own it':''];}));
        h+=`<p class="muted">Bought outfits appear in the operator list once you own them.</p>`;
      }
      if(others.length){
        h+=`<h2>Skins</h2>`;
        for(const s of others){
          const it=s.shop?shopItem(s.shop):null;
          h+=`<h3>${esc(s.skinName??s.name)} ${it?rarity(it.rarity):''}</h3>`+
            (img(s)?`<p><img src="${img(s)}" alt="" style="max-width:160px;border-radius:6px"></p>`:'')+
            `<p>${esc(blurb(s))}</p><p><b>Unlock:</b> ${sourceOf(s)}</p>`+
            (s.variants?.length?variants(s):'')+(s.credit?`<p class="muted small">Model: ${credit(s.credit)}</p>`:'');
        }
      }
      return h;};

    const overview=()=>md(`Your **operator** is the character you play as. Pick one in the main menu under **Armory → Operator**: the preview shows it idle, walking or running, in third person or from your own first-person view.

- You see your operator in **third person** (press **T** in a game to switch) and in co-op your friends see it too.
- Many operators have their **own first-person arms**, so the hands holding your gun match the body.
- **Skins** are alternate versions of an operator, listed in the strip under the preview.
- Some operators have **customisation** options (outfit pieces, colours, faces, build), saved per operator.
- Operators are cosmetic: they don't change your health, speed or weapons.`)+
      note(`Operator weapons (like the Ragnarok) are a separate weapon slot, not tied to the character you play. See ${ctx.link('weapons')}.`,'tip')+
      `<h2>Where operators come from</h2>`+md(`- **From the start**: the Test Subject and the other free operators below.
- **Shop**: Test Subject outfits, bought with credits (see [the Shop](${ctx.href('progression','shop')})).
- **[Melon Pass](${ctx.href('pass')})**: season operators and their skins, the big rewards for finishing a page.

The Operator menu also lets you preview a .glb/.gltf model file from your own computer (preview only).`)+
      `<h2>All operators</h2>`+table(['Operator','Skins','Unlock'],ops.map(o=>[`<b>${ctx.link('operators',pageId(o),o.name)}</b>`,
        [o,...skinsOf(o)].map(s=>esc(s.skinName??'Default')).join(', '),sourceOf(o)]));

    const pages=[
      {id:slug('How Operators Work'),title:'How Operators Work',group:'Guide',sub:'Picking, skins, unlocks',html:overview,keywords:'operator character skin outfit third person customisation'},
      ...ops.map(o=>({id:pageId(o),title:o.name,group:o.pass?'Melon Pass':'Operators',
        sub:o.pass?`Season ${(()=>{const p=passSource(o.shop);return p?seasonNo(p.season):'';})()} operator`:o.id==='mannequin'?`${outfits.length+1} colourways`:kindOf(o),
        color:o.accent??o.color,img:img(o),
        keywords:[o.name,...skinsOf(o).map(s=>s.skinName),...(o.id==='mannequin'?outfits.map(c=>c.name):[]),o.credit?.author??''].join(' '),
        html:()=>opPage(o)})),
    ];
    return {
      intro:md(`**${ops.length} operators** to play as, from the free Test Subject to Melon Pass operators. Pick one under **Armory → Operator**.`)+
        cards(ops.map(o=>({href:ctx.href('operators',pageId(o)),title:o.name,sub:o.pass?'Melon Pass':o.id==='mannequin'?'Free · Shop outfits':'Free',img:img(o),color:o.accent??o.color}))),
      groups:['Guide','Operators','Melon Pass'],
      pages,
    };
  },
};
