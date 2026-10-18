// keepScroll(el).innerHTML = html: rewrite an element's content without losing the player's place in it.
// Setting innerHTML throws away every scrolled box inside (and the element's own scroll), so a click that redraws a long
// list (JOURNAL.EXE's quests, the Research pane's items) used to jump back to the top (user, 2026-10-17). Scrolled boxes
// are matched before and after by their path of tag + class + index, so the new content must keep the same structure.
export function keepScroll(el) {
  return {
    set innerHTML(html) {
      const saved = [];
      for (const n of [el, ...el.querySelectorAll('*')]) if (n.scrollTop || n.scrollLeft) saved.push([keyOf(el, n), n.scrollTop, n.scrollLeft]);
      el.innerHTML = html;
      if (!saved.length) return;
      const byKey = new Map();
      for (const n of [el, ...el.querySelectorAll('*')]) { const k = keyOf(el, n); if (!byKey.has(k)) byKey.set(k, n); }
      for (const [k, top, left] of saved) { const n = byKey.get(k); if (n) { n.scrollTop = top; n.scrollLeft = left; } }
    },
  };
}
function keyOf(root, n) {
  const parts = [];
  for (let x = n; x && x !== root; x = x.parentElement) {
    let i = 0; for (let s = x.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === x.tagName && s.className === x.className) i++;
    parts.push(x.tagName + '.' + x.className + '#' + i);
  }
  return parts.join('/');
}
