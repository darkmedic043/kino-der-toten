#!/usr/bin/env python3
"""Pull sounds out of a Black Ops III sound bank (.sabl, version 15) without Greyhound, as FLAC (the bank's own format).

  python3 -I .tools/extract_sabl.py <bank.sabl> <out dir> <substring> [<substring>...]

Layout: header '2UX#' v15; u32 entry count at 0x14; u64 offset of the entry table at 0x28 (36 bytes per entry:
u32 id, u32 size, u32 frames, u32 pad, u64 data offset, ...); the name table (128 bytes per entry, zero padded,
e.g. 'zmb\\level\\zm_castle\\random_perk\\rand_perk_mach_loop.LL100.pc.snd') fills the end of the file, in entry order.
Each matching entry is written as <out>/<file name>.flac (no folders). Used for Der Eisendrache's Wunderfizz
(waw-ports.md); the files are ripped game audio: keep them git-ignored and out of Rind's OWN list.
"""
import mmap, os, struct, sys

src, out, pats = sys.argv[1], sys.argv[2], sys.argv[3:]
with open(src, 'rb') as f:
    m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
    if m[:4] != b'2UX#': sys.exit('not a sound bank')
    count = struct.unpack_from('<I', m, 0x14)[0]; table = struct.unpack_from('<Q', m, 0x28)[0]; names = len(m) - count * 128
    os.makedirs(out, exist_ok=True)
    for i in range(count):
        name = m[names + i * 128:names + (i + 1) * 128].split(b'\0')[0].decode(errors='replace')
        if not any(p in name for p in pats): continue
        _id, size, frames, _pad, off = struct.unpack_from('<IIIIQ', m, table + i * 36)
        stem = name.replace('\\', '/').rsplit('/', 1)[-1].split('.')[0]
        with open(os.path.join(out, stem + '.flac'), 'wb') as o: o.write(m[off:off + size])
        print(f'{stem}.flac  {size} bytes  {name}')
