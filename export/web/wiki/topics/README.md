# Wiki topics

Each file here is one section of the wiki (`/wiki/`). `wiki.js` imports every id in its `TOPICS` list; a missing file is
skipped. A topic builds its pages from the game's data files when the wiki loads, so numbers follow the game.

```js
export default {
  id: 'gobblegums', title: 'Gobblegums', order: 50,
  blurb: 'One line for the wiki home page.',
  async load(ctx) {
    const gums = await ctx.json('mods/gobblegums/gums.json');      // path from the site root (export/web)
    return {
      intro: ctx.md('Short overview shown on the section page.'),     // optional
      groups: ['Classic', 'Mega'],                                     // optional group order (sidebar + index)
      pages: gums.gums.map(g => ({
        id: ctx.slug(g.name), title: g.name, group: 'Classic', sub: 'Rare · 3 rounds',
        color: '#7cd65a', img: ctx.url('mods/...png'), keywords: 'extra search words',
        html: c => c.infobox({...}) + c.md(g.desc),                    // a string, or a function (built on first view)
        after: (el, ctx) => {},                                         // optional: runs after the page is shown
      })),
    };
  },
};
```

- **Page ids are `ctx.slug(title)`** unless there's a good reason, so other topics can link without knowing internals:
  `ctx.link('perks', ctx.slug('Juggernog'))`, `ctx.link('maps', ctx.slug('Der Eisendrache'), 'the castle')`.
  Topic ids: basics, maps, weapons, perks, gobblegums, classes, operators, progression, pass.
- Helpers (`helpers.js`): `esc md table infobox spoiler badge note cards bar num pct secs slug cap url json text load`,
  plus `link href find pages` from wiki.js. Easter-egg steps and secrets go inside `ctx.spoiler(label, html)`.
- Write for players: no file names, code ids or developer notes. Only things a player can actually get or see in the game.
- Check every page: `node .tools/wiki-check.mjs` (headless; reports console errors, failed pages and broken links;
  `--shots <dir> [topic]` saves screenshots).
- `ctx.md()` escapes HTML, except anchors made by `ctx.link()` (those stay links); a `- ` list may follow a line of text
  directly. For other HTML, build it outside `md()` and concatenate.
