// Each Advanced Warfare gun's Gunsmith kit and where its parts go (aw-kits.json; the parts are one Blender model,
// .tools/build_aw_attachments.py). Runs after weapons.json is merged, so kits change without rebuilding the guns: the
// build's own mounts (the BO3 red dot and foregrip) stay on the guns whose kit lists them.
export async function applyKits(data,base){
  const r=await fetch(base+'aw-kits.json').catch(()=>null);if(!r?.ok)return;
  const {model,guns}=await r.json();
  for(const [id,g] of Object.entries(guns)){
    const d=data.weapons[id];if(!d)continue;
    const mounts={};
    for(const k of g.kit)if(d.mounts?.[k])mounts[k]=d.mounts[k];
    for(const [k,m] of Object.entries(g.mounts??{}))mounts[k]={...m,model,node:'part_'+m.part};
    d.statAttachments=g.kit;d.mounts=mounts;
    if(d.upgrade)d.upgrade.mounts=mounts;   // gunsmith.js fills `mounted` on any def that has `mounts`
  }
}
