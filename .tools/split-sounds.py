#!/usr/bin/env python3
"""Cut a sound-effect compilation into separate clips at its silences.

    python3 .tools/split-sounds.py <input audio> <output folder> [--noise -40] [--gap 0.25]

Writes clip_NN.ogg files plus clips.json (duration, loudness, peak) to the
output folder, using ffmpeg's silencedetect. Edit the generated sounds.json
categories (growl / attack / death) by hand if the automatic guess is off.
"""
import argparse, json, pathlib, re, subprocess

ap = argparse.ArgumentParser()
ap.add_argument('input'); ap.add_argument('out')
ap.add_argument('--noise', type=float, default=-40, help='silence threshold in dB')
ap.add_argument('--gap', type=float, default=0.25, help='minimum silence length in seconds')
ap.add_argument('--min', type=float, default=0.15, help='drop clips shorter than this')
a = ap.parse_args()
out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)

probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.input], capture_output=True, text=True)
total = float(probe.stdout.strip())
log = subprocess.run(['ffmpeg', '-hide_banner', '-i', a.input, '-af', f'silencedetect=noise={a.noise}dB:d={a.gap}', '-f', 'null', '-'], capture_output=True, text=True).stderr
starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
# Sound runs from the end of one silence to the start of the next.
edges = [0.0] + ends
stops = starts + [total]
if starts and starts[0] < 0.01: edges, stops = ends, starts[1:] + [total]
clips = []
for i, (s, e) in enumerate(zip(edges, stops)):
    s, e = max(0, s - 0.03), min(total, e + 0.06)
    if e - s < a.min: continue
    name = f'clip_{len(clips):02d}.ogg'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{s:.3f}', '-to', f'{e:.3f}', '-i', a.input,
                    '-af', 'loudnorm=I=-16:TP=-1.5,afade=t=in:d=0.01', '-ac', '1', '-c:a', 'libvorbis', '-q:a', '5', str(out / name)], check=True)
    stats = subprocess.run(['ffmpeg', '-hide_banner', '-i', a.input, '-ss', f'{s:.3f}', '-to', f'{e:.3f}', '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mean = float(re.search(r'mean_volume: ([-\d.]+)', stats).group(1)); peak = float(re.search(r'max_volume: ([-\d.]+)', stats).group(1))
    clips.append({'file': name, 'start': round(s, 3), 'duration': round(e - s, 3), 'mean_db': mean, 'peak_db': peak})
(out / 'clips.json').write_text(json.dumps(clips, indent=2))
# First guess at categories: short loud bursts attack, the longest few are deaths, the rest growl.
by_len = sorted(clips, key=lambda c: c['duration'])
attack = [c['file'] for c in clips if c['duration'] < 0.9 and c['peak_db'] > -6]
death = [c['file'] for c in by_len[-max(1, len(clips) // 5):] if c['file'] not in attack]
growl = [c['file'] for c in clips if c['file'] not in attack and c['file'] not in death]
sounds = {'growl': growl or [c['file'] for c in clips], 'attack': attack or growl[:3], 'death': death or growl[-3:]}
(out / 'sounds.json').write_text(json.dumps(sounds, indent=2))
print(f'{len(clips)} clips from {total:.1f}s -> {out} (growl {len(sounds["growl"])}, attack {len(sounds["attack"])}, death {len(sounds["death"])})')
