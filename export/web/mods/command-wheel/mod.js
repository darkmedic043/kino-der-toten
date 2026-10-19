// The command wheel (user, 2026-10-19: "a simple command wheel, this allows me to add stuff to perks without crowding the
// controls"). Hold U (rebindable: Settings -> Controls, "Command wheel") or the middle mouse button: a radial menu opens
// round the crosshair while the game keeps running. Move the mouse toward a slice and let go to use it; click, 1-8 or
// the mouse wheel work too; Esc or right click closes it. Touch: a WHEEL toolbar button opens it and slices are tapped.
// Other code adds commands through window.kino.commandWheel:
//   add(id, () => [{ label, sub?, icon?, color?, disabled?, use() }, ...])   a provider: asked for its entries each time
//   remove(id)                                                               the wheel opens (none: it stays shut)
//   isOpen(), open(), close()
// At most 8 slices; a provider's entries keep their order, providers in the order they were added.
const R = 150, DEAD = 34, MAX = 8;

export default async function setup(api) {
  const { host, getState } = api;
  const providers = new Map();
  let open = false, entries = [], pick = -1, cx = 0, cy = 0, how = null;   // how: the key code or 'mouse' holding it open
  const touch = matchMedia('(pointer: coarse)').matches;

  const style = document.createElement('style');
  style.textContent = `
#command-wheel{position:fixed;left:50%;top:50%;width:${R * 2 + 120}px;height:${R * 2 + 120}px;margin:${-(R + 60)}px 0 0 ${-(R + 60)}px;z-index:40;pointer-events:none;
  opacity:0;transform:scale(.85);transition:opacity .12s,transform .12s;font-family:inherit}
#command-wheel.on{opacity:1;transform:none}
#command-wheel svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#command-wheel .cw-slice{fill:#0b0f0cd0;stroke:#ffffff2a;stroke-width:1.5;transition:fill .08s}
#command-wheel .cw-slice.sel{fill:var(--c,#7cd65a);fill-opacity:.42;stroke:var(--c,#7cd65a);stroke-opacity:.9}
#command-wheel .cw-slice.off{fill:#0b0f0c90}
#command-wheel .cw-hub{fill:#000a;stroke:#ffffff30}
#command-wheel .cw-item{position:absolute;width:118px;margin-left:-59px;margin-top:-30px;text-align:center;color:#eee;text-shadow:0 1px 2px #000;pointer-events:none;line-height:1.1}
#command-wheel .cw-item img{width:30px;height:30px;display:block;margin:0 auto 3px;filter:drop-shadow(0 1px 2px #000)}
#command-wheel .cw-item b{display:block;font-size:12px;letter-spacing:.5px;text-transform:uppercase}
#command-wheel .cw-item small{display:block;font-size:10px;color:#b9c2b5;margin-top:2px}
#command-wheel .cw-item.off{opacity:.4}
#command-wheel .cw-item i{position:absolute;top:-14px;left:50%;margin-left:-7px;font:600 10px/14px inherit;font-style:normal;color:#ffffff80}
#command-wheel .cw-mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;color:#ffffffb0;font-size:10px;letter-spacing:2px;width:90px}
#command-wheel .cw-dot{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#fff;box-shadow:0 0 6px #fff}
#command-wheel.touch{pointer-events:auto}
#command-wheel.touch .cw-slice{pointer-events:auto;cursor:pointer}
.touch-toolbar .touch-wheel[hidden]{display:none}`;
  document.head.append(style);
  const el = document.createElement('div'); el.id = 'command-wheel'; document.body.append(el);

  const NS = 'http://www.w3.org/2000/svg', C = R + 60;
  const arc = (a0, a1, r0, r1) => {   // an annular slice from angle a0 to a1 (radians, 0 = up, clockwise)
    const p = (a, r) => `${C + Math.sin(a) * r},${C - Math.cos(a) * r}`, big = a1 - a0 > Math.PI ? 1 : 0;
    return `M${p(a0, r1)}A${r1},${r1} 0 ${big} 1 ${p(a1, r1)}L${p(a1, r0)}A${r0},${r0} 0 ${big} 0 ${p(a0, r0)}Z`;
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function gather() {
    const out = [];
    for (const fn of providers.values()) { try { for (const e of fn() ?? []) if (e?.label) out.push(e); } catch (err) { console.warn('[command-wheel]', err); } }
    return out.slice(0, MAX);
  }
  function render() {
    const n = entries.length, step = Math.PI * 2 / n, gap = n > 1 ? .025 : 0;
    const svg = document.createElementNS(NS, 'svg');
    entries.forEach((e, i) => {
      const a0 = i * step - step / 2 + gap, a1 = (i + 1) * step - step / 2 - gap;
      const path = document.createElementNS(NS, 'path'); path.setAttribute('d', n === 1 ? arc(0, Math.PI * 2 - .0001, 48, R) : arc(a0, a1, 48, R));
      path.setAttribute('class', 'cw-slice' + (e.disabled ? ' off' : '')); path.dataset.i = i; if (e.color) path.style.setProperty('--c', e.color);
      svg.append(path);
    });
    const hub = document.createElementNS(NS, 'circle'); hub.setAttribute('cx', C); hub.setAttribute('cy', C); hub.setAttribute('r', 44); hub.setAttribute('class', 'cw-hub'); svg.append(hub);
    el.innerHTML = ''; el.append(svg);
    entries.forEach((e, i) => {
      const a = i * step, r = n === 1 ? 0 : (R + 48) / 2 + 6, d = document.createElement('div');
      d.className = 'cw-item' + (e.disabled ? ' off' : ''); d.style.left = C + Math.sin(a) * r + 'px'; d.style.top = C - Math.cos(a) * r + (n === 1 ? -80 : 0) + 'px';
      d.innerHTML = `${touch ? '' : `<i>${i + 1}</i>`}${e.icon ? `<img src="${esc(e.icon)}" alt="">` : ''}<b>${esc(e.label)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}`;
      el.append(d);
    });
    const mid = document.createElement('div'); mid.className = 'cw-mid'; mid.textContent = 'CLOSE'; el.append(mid);
    if (!touch) { const dot = document.createElement('div'); dot.className = 'cw-dot'; el.append(dot); }
    select(pick);
  }
  function select(i) {
    pick = i;
    el.querySelectorAll('.cw-slice').forEach(s => s.classList.toggle('sel', +s.dataset.i === i));
    const mid = el.querySelector('.cw-mid'); if (mid) mid.textContent = i < 0 ? 'CLOSE' : '';
    const dot = el.querySelector('.cw-dot'); if (dot) dot.style.transform = `translate(${cx}px,${cy}px)`;
  }
  function aim(dx, dy) {
    cx += dx; cy += dy; const d = Math.hypot(cx, cy); if (d > R * .8) { cx *= R * .8 / d; cy *= R * .8 / d; }
    if (Math.hypot(cx, cy) < DEAD) return select(-1);
    if (entries.length === 1) return select(0);
    const a = (Math.atan2(cx, -cy) + Math.PI * 2) % (Math.PI * 2), step = Math.PI * 2 / entries.length;
    select(Math.round(a / step) % entries.length);
  }
  function show(by) {
    if (open || !getState().active && !touch) return false;
    entries = gather(); if (!entries.length) { api.toast?.('Command wheel: nothing to do right now', 1.5); return false; }
    open = true; how = by; cx = cy = 0; pick = -1; render(); el.classList.toggle('touch', touch); el.classList.add('on');
    if (entries.length === 1) { cy = -R * .5; aim(0, 0); }   // one command: already on it, let go to use it
    return true;
  }
  function hide(run) {
    if (!open) return; open = false; how = null; el.classList.remove('on');
    const e = run && pick >= 0 ? entries[pick] : null; entries = [];
    if (e && !e.disabled) { try { e.use?.(); } catch (err) { console.warn('[command-wheel]', err); } }
  }

  // ---- input: capture phase, so the game's own handlers don't see what the wheel uses ------------------------------------
  const typing = e => e.target?.closest?.('input,textarea,select,[contenteditable]');
  addEventListener('keydown', e => {
    if (typing(e)) return;
    if (open) {
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hide(false); return; }
      const n = /^Digit([1-8])$/.exec(e.code)?.[1];
      if (n) { e.preventDefault(); e.stopImmediatePropagation(); if (+n <= entries.length) { select(+n - 1); hide(true); } return; }
    }
    if (e.code !== 'KeyU' || e.repeat) return;
    e.preventDefault();
    if (open && how !== 'KeyU') hide(false); else show('KeyU');
  }, true);
  addEventListener('keyup', e => { if (e.code === 'KeyU' && open && how === 'KeyU') hide(true); }, true);
  addEventListener('mousemove', e => { if (!open || touch) return; e.stopImmediatePropagation(); aim(e.movementX, e.movementY); }, true);   // no looking round while choosing
  addEventListener('mousedown', e => {
    if (e.button === 1 && !open) { if (show('mouse')) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    if (!open || touch) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.button === 0) hide(true); else if (e.button === 2) hide(false);
  }, true);
  addEventListener('mouseup', e => { if (e.button === 1 && open && how === 'mouse') { e.preventDefault(); hide(true); } }, true);
  addEventListener('wheel', e => {
    if (!open) return; e.stopImmediatePropagation();
    const n = entries.length, i = ((pick < 0 ? (e.deltaY > 0 ? -1 : 0) : pick) + (e.deltaY > 0 ? 1 : -1) + n) % n;
    const a = i * Math.PI * 2 / n; cx = Math.sin(a) * R * .5; cy = -Math.cos(a) * R * .5; select(i);
  }, { capture: true, passive: true });
  // touch: tap a slice, or the middle to close
  el.addEventListener('pointerdown', e => {
    if (!open || !touch) return; e.preventDefault(); e.stopPropagation();
    const s = e.target.closest?.('.cw-slice'); if (s) select(+s.dataset.i); else select(-1); hide(true);
  });
  // the game paused, a menu opened, a new game: close without running anything
  host.on('update', () => { if (open && !touch && !getState().active) hide(false); });
  host.on('reset', () => hide(false));

  // touch: a WHEEL button on the toolbar, shown only while there is something on the wheel
  const toolbar = touch && document.querySelector('#touch-controls .touch-toolbar');
  if (toolbar) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'touch-button touch-wheel'; b.setAttribute('aria-label', 'Command wheel'); b.innerHTML = '<span>WHEEL</span>'; b.hidden = true;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (open) hide(false); else show('touch'); });
    toolbar.append(b);
    let t = 0; host.on('update', dt => { if ((t -= dt ?? .016) > 0) return; t = .5; b.hidden = !providers.size || !gather().length; });
  }

  window.kino.commandWheel = {
    add(id, fn) { providers.set(id, fn); }, remove(id) { providers.delete(id); },
    isOpen: () => open, open: () => show('api'), close: () => hide(false),
    entries: () => (open ? entries : gather()).map(e => ({ label: e.label, sub: e.sub ?? null, disabled: !!e.disabled })),
    use(i) { if (!open && !show('api')) return false; if (i < 0 || i >= entries.length) { hide(false); return false; } select(i); hide(true); return true; },   // tests, the cheat console
  };
}
