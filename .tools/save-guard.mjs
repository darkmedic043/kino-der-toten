// Guards a player's cloud save (fork-only, used by kino-server.mjs). The client's rule is newest-wins, so a device with
// an old copy could replace the account's save outright, with nothing left to go back to (2026-11-01: ten days of
// progress). Two things here stop that: a device may only replace a save it has seen, and earlier saves are kept.
//   <profile>.history/auto-<time>.json       the save as it was, every 3 hours (the last 120, about 15 days)
//   <profile>.history/rejected-<time>.json   uploads refused as out of date (the last 10)
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EVERY = 3 * 3600e3, KEEP = { auto: 120, rejected: 10 };
const lastAuto = new Map();

// May this upload replace the stored save? Yes when the same device wrote it last, or the upload was based on it.
// An upload without `base` comes from a device that has not synced since this rule began: its sync already took the
// newer copy, so it is allowed.
export const staleUpload = (cur, doc) => doc.base != null && !!cur?.keys && cur.device !== doc.device && cur.updatedAt !== doc.base;

export function keepCopy(file, doc, kind, now = Date.now()) {
  if (!doc?.keys) return false;
  if (kind === 'auto') { if (now - (lastAuto.get(file) ?? 0) < EVERY) return false; lastAuto.set(file, now); }
  try {
    const dir = file.replace(/\.json$/, '.history');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${kind}-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(doc));
    const old = readdirSync(dir).filter(f => f.startsWith(kind + '-')).sort().slice(0, -KEEP[kind]);
    for (const f of old) unlinkSync(join(dir, f));
    return true;
  } catch { return false; }
}
