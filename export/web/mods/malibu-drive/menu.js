// A pick-one menu for Malibu Drive's JARVIS consoles and Tony's phone (the original's Tom_BMX music-box menus,
// tom_music_player 1-3). The game keeps running (mods.keepActive, as the terminal booth does): the cursor is freed,
// keys 1-9 pick, Esc or the close button cancels, and the pointer is captured again afterwards.
const CSS = `#malibu-menu{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:#0006;font:600 14px/1.3 Arial,Helvetica,sans-serif;color:#dff6ff}
#malibu-menu .box{min-width:340px;max-width:92vw;background:linear-gradient(#0b2433ee,#06141ef2);border:1px solid #5fd3ff;box-shadow:0 0 24px #2fb6ff66,inset 0 0 30px #2fb6ff22;padding:16px 18px 14px;border-radius:6px}
#malibu-menu h2{margin:0 0 2px;font:700 13px/1.2 Arial,Helvetica,sans-serif;letter-spacing:3px;color:#7fe0ff}
#malibu-menu .sub{margin:0 0 12px;font-size:11px;color:#8fb8c8;letter-spacing:1px}
#malibu-menu button{display:flex;width:100%;gap:10px;align-items:baseline;margin:4px 0;padding:8px 10px;background:#0e3348;border:1px solid #2d7da3;color:#e8fbff;font:600 14px Arial,Helvetica,sans-serif;text-align:left;cursor:pointer;border-radius:3px}
#malibu-menu button:hover:not(:disabled),#malibu-menu button.pad-focus{background:#14506e;border-color:#7fe0ff}
#malibu-menu button:disabled{opacity:.45;cursor:default}
#malibu-menu button b{min-width:18px;color:#7fe0ff}#malibu-menu button span{margin-left:auto;font-size:11px;color:#8fb8c8}
#malibu-menu .close{justify-content:center;margin-top:10px;background:#1a2a33;border-color:#3b5563}`;

export function createMenu(api) {
  const { host } = api;
  let open = null;
  if (!document.getElementById('malibu-menu-css')) { const st = document.createElement('style'); st.id = 'malibu-menu-css'; st.textContent = CSS; document.head.append(st); }
  function close(pick = null) {
    if (!open) return;
    const { el, onPick, keydown } = open; open = null;
    el.remove(); removeEventListener('keydown', keydown, true); host.keepActive = false;
    const c = api.renderer?.domElement;
    if (api.session.phase !== 'gameover' && !api.getState().input?.touch?.mode && c?.requestPointerLock) Promise.resolve(c.requestPointerLock()).catch(() => api.setActive(false));
    if (pick) onPick(pick);
  }
  // show({title, sub, items: [{id, label, note, disabled}], onPick(item)})
  function show({ title, sub = '', items, onPick }) {
    close();
    const el = document.createElement('div'); el.id = 'malibu-menu';
    el.innerHTML = `<div class="box"><h2>${title}</h2><div class="sub">${sub}</div></div>`;
    const box = el.firstChild;
    items.forEach((it, i) => {
      const b = document.createElement('button'); b.disabled = !!it.disabled;
      b.innerHTML = `<b>${i + 1}</b>${it.label}${it.note ? `<span>${it.note}</span>` : ''}`;
      b.addEventListener('click', () => !it.disabled && close(it));
      box.append(b);
    });
    const x = document.createElement('button'); x.className = 'close'; x.textContent = 'Close (Esc)'; x.addEventListener('click', () => close()); box.append(x);
    const keydown = e => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      const n = /^Digit(\d)$/.exec(e.code)?.[1];
      if (n) { const it = items[+n - 1]; e.preventDefault(); e.stopPropagation(); if (it && !it.disabled) close(it); return; }
      e.stopPropagation();   // the player stands still while choosing
    };
    addEventListener('keydown', keydown, true);
    host.keepActive = true; document.exitPointerLock?.();
    document.body.append(el);
    open = { el, onPick, keydown };
  }
  host.on('update', () => { if (open && ['reviving', 'gameover'].includes(api.session.phase)) close(); });
  host.on('reset', () => close());
  return { show, close, isOpen: () => !!open };
}
