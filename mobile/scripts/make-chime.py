"""The assistant's opening chime: a soft, rising three-note bell with a shimmer.

E5 -> B5 -> E6, each a bell-like tone (a fundamental, two harmonics and one inharmonic
partial) with a rounded attack and an exponential decay, a detuned twin for shimmer, a
quiet low E underneath for warmth, and a light multi-tap reverb for air. Peak at -6 dBFS:
a sound the interface makes should never be the loudest thing on the phone.
"""
import math
import struct
import sys
import wave

RATE = 44_100
LENGTH = 1.35  # seconds
N = int(RATE * LENGTH)


def bell(freq, start, amp, tau, detune_cents=4.0):
    """One bell note, as a list of samples added into the mix from `start` seconds."""
    partials = [(1.0, 1.0), (2.0, 0.22), (3.0, 0.07), (2.76, 0.045)]
    twin = freq * (2 ** (detune_cents / 1200))
    out = [0.0] * N
    begin = int(start * RATE)
    attack = 0.012
    for i in range(begin, N):
        t = (i - begin) / RATE
        # A rounded attack (a quarter sine), then an exponential fall.
        env = math.sin(min(t / attack, 1.0) * math.pi / 2) * math.exp(-t / tau)
        if env < 1e-5 and t > attack:
            break
        s = 0.0
        for ratio, weight in partials:
            # Higher partials die away faster, as they do in a real bell.
            fade = math.exp(-t * (ratio - 1) * 1.8)
            s += weight * fade * (
                math.sin(2 * math.pi * freq * ratio * t)
                + 0.5 * math.sin(2 * math.pi * twin * ratio * t)
            )
        out[i] = amp * env * s / 1.5
    return out


def pad(freq, start, amp, rise, tau):
    """A quiet low tone that swells in and fades, to give the bell some body."""
    out = [0.0] * N
    begin = int(start * RATE)
    for i in range(begin, N):
        t = (i - begin) / RATE
        env = (1 - math.exp(-t / rise)) * math.exp(-t / tau)
        out[i] = amp * env * (math.sin(2 * math.pi * freq * t) + 0.3 * math.sin(4 * math.pi * freq * t))
    return out


layers = [
    bell(659.25, 0.000, 0.85, 0.30),   # E5
    bell(987.77, 0.085, 0.70, 0.36),   # B5
    bell(1318.51, 0.170, 0.42, 0.46),  # E6
    pad(329.63, 0.000, 0.16, 0.04, 0.40),  # E4, underneath
]
dry = [sum(layer[i] for layer in layers) for i in range(N)]

# Air: a few early reflections and one gentle feedback echo for the tail.
wet = dry[:]
for delay_ms, gain in ((29, 0.26), (43, 0.20), (61, 0.15), (83, 0.11)):
    d = int(RATE * delay_ms / 1000)
    for i in range(d, N):
        wet[i] += dry[i - d] * gain
d = int(RATE * 0.097)
for i in range(d, N):
    wet[i] += wet[i - d] * 0.30

# Fade the last 150 ms so it ends in silence rather than a click.
fade = int(RATE * 0.15)
for k in range(fade):
    wet[N - fade + k] *= 1 - k / fade

peak = max(abs(x) for x in wet) or 1.0
target = 10 ** (-6 / 20)  # -6 dBFS
samples = [int(max(-1.0, min(1.0, x / peak * target)) * 32767) for x in wet]

path = sys.argv[1]
with wave.open(path, 'wb') as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(RATE)
    out.writeframes(b''.join(struct.pack('<h', s) for s in samples))

print(f'{path}: {LENGTH:.2f}s, {RATE} Hz mono 16-bit, peak -6 dBFS')
