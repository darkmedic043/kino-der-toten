#!/usr/bin/env python3
"""Funeral Bells, the Season 1 hit-sound set (pass.s2.sound.funeralbells): three short synthesised church-bell strikes,
written to export/web/mods/shop/sounds/bell1-3.wav. Made from scratch here (inharmonic bell partials with their own
decay times, a hum, a strike click), so the files are ours to publish and install. Standard library only."""
import math, os, random, struct, wave
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','export','web','mods','shop','sounds')
RATE=44100
# partials of a minor-third church bell, as ratios of the strike note: hum, prime, tierce, quint, nominal, upper partials
PARTIALS=[(.5,.35,1.9),(1,.55,1.3),(1.183,.42,1.0),(1.506,.22,.7),(2,.5,.6),(2.514,.18,.38),(2.662,.14,.32),(3.011,.1,.24),(4.166,.06,.15)]
def bell(f0,dur,seed):
  rnd=random.Random(seed);n=int(RATE*dur);out=[0.0]*n
  for ratio,amp,decay in PARTIALS:
    f=f0*ratio*(1+rnd.uniform(-.004,.004));beat=rnd.uniform(.6,2.4);ph=rnd.uniform(0,6.283)
    for i in range(n):
      t=i/RATE;e=math.exp(-t/(decay*dur/1.9))
      out[i]+=amp*e*(1+.18*math.sin(6.283*beat*t))*math.sin(6.283*f*t+ph)
  for i in range(int(RATE*.012)):   # the clapper's click
    out[i]+=rnd.uniform(-1,1)*.5*(1-i/(RATE*.012))**2
  for i in range(int(RATE*.004)):out[i]*=i/(RATE*.004)   # no pop at the start
  for i in range(int(RATE*.08)):out[n-1-i]*=i/(RATE*.08)   # nor at the end
  peak=max(abs(x) for x in out);return [x/peak*.85 for x in out]
def write(name,data):
  with wave.open(os.path.join(OUT,name),'wb') as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE)
    w.writeframes(b''.join(struct.pack('<h',int(max(-1,min(1,x))*32767)) for x in data))
os.makedirs(OUT,exist_ok=True)
for k,(f0,dur) in enumerate([(392,1.1),(349.2,1.2),(440,1.0)]):write(f'bell{k+1}.wav',bell(f0,dur,k+7))
print('wrote bell1-3.wav')
