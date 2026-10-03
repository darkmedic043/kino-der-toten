"""Read Greyhound SEAnim files (SETools format v1).

    python3 .tools/seanim.py anim.seanim      # prints a summary

read_seanim(path) -> {type, framerate, frames, bones: {name: {loc, rot, scale}}, notes, modifiers}
with keys as [(frame, (x, y, z))] / [(frame, (x, y, z, w))]. Animation type
0 absolute, 1 additive, 2 relative, 3 delta (SEAnim's ANIM_TYPE_*).
"""
import pathlib, struct, sys

TYPES = {0: 'absolute', 1: 'additive', 2: 'relative', 3: 'delta'}

def read_seanim(path):
    b = pathlib.Path(path).read_bytes(); o = 0
    def take(fmt):
        nonlocal o
        v = struct.unpack_from('<'+fmt, b, o); o += struct.calcsize('<'+fmt); return v
    def cstr():
        nonlocal o
        e = b.index(0, o); s = b[o:e].decode('utf-8', 'replace'); o = e+1; return s
    if b[:6] != b'SEAnim': raise ValueError('not an SEAnim file')
    o = 6
    version, header_size = take('HH')
    anim_type, anim_flags, data_flags, prop_flags = take('BBBB')
    o += 2
    framerate, frame_count, bone_count = take('fII')
    mod_count, = take('B'); o += 3
    note_count, = take('I')
    names = [cstr() for _ in range(bone_count)]
    bfmt = 'B' if bone_count <= 0xff else 'H' if bone_count <= 0xffff else 'I'
    modifiers = {}
    for _ in range(mod_count):
        i, = take(bfmt); t, = take('B'); modifiers[names[i]] = TYPES.get(t, t)
    ffmt = 'B' if frame_count <= 0xff else 'H' if frame_count <= 0xffff else 'I'
    vfmt = 'd' if prop_flags & 1 else 'f'
    bones = {}
    for name in names:
        take('B')   # per-bone flags (cosmetic)
        bone = {}
        if data_flags & 1: bone['loc'] = [(take(ffmt)[0], take(vfmt*3)) for _ in range(take(ffmt)[0])]
        if data_flags & 2: bone['rot'] = [(take(ffmt)[0], take(vfmt*4)) for _ in range(take(ffmt)[0])]
        if data_flags & 4: bone['scale'] = [(take(ffmt)[0], take(vfmt*3)) for _ in range(take(ffmt)[0])]
        bones[name] = bone
    notes = []
    if data_flags & 64:
        for _ in range(note_count): notes.append((take(ffmt)[0], cstr()))
    return {'type': TYPES.get(anim_type, anim_type), 'framerate': framerate, 'frames': frame_count,
            'bones': bones, 'notes': notes, 'modifiers': modifiers}

if __name__ == '__main__':
    a = read_seanim(sys.argv[1])
    print(a['type'], a['framerate'], 'fps', a['frames'], 'frames,', len(a['bones']), 'bones; notes:', a['notes'][:12])
    print('modifiers:', a['modifiers'])
    print(', '.join(f"{n}({len(v.get('loc', []))}/{len(v.get('rot', []))})" for n, v in a['bones'].items()))
