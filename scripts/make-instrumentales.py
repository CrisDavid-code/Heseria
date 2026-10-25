"""
HESERIA — Instrumentales originales para leer y orar.

    python3 scripts/make-instrumentales.py

Composiciones propias de Heseria generadas por código (piano en arpegios, colchón de cuerdas
y bajo suave, con reverberación): no usan grabaciones ni melodías de terceros, así que no tienen
derechos ajenos. Salen a public/musica/*.mp3 + index.json; la app los toca al leer la Biblia
(se pueden pausar o desactivar) y aparecen en Música. Requiere numpy y ffmpeg.
"""
import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/musica"
RATE = 44100
CHORD_SEC = 6.0
CYCLES = 7  # 7 vueltas × 4 acordes × 6 s ≈ 2 min 48 s

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(name):
    """'A4', 'F#3', 'Bb2' → Hz."""
    letter, rest = name[0], name[1:]
    acc = 1 if rest.startswith("#") else -1 if rest.startswith("b") else 0
    octave = int(rest.lstrip("#b"))
    return 440 * 2 ** ((NOTE[letter] + acc + (octave - 4) * 12 - 9) / 12)


TRACKS = [
    ("aguas-de-reposo", "Aguas de reposo", "Salmo 23:2", [
        ["D3", "A3", "D4", "F#4"], ["A2", "E3", "A3", "C#4"], ["B2", "F#3", "B3", "D4"], ["G2", "D3", "G3", "B3"]]),
    ("amanecer", "Amanecer en su presencia", "Salmo 5:3", [
        ["C3", "G3", "C4", "E4"], ["A2", "E3", "A3", "C4"], ["F2", "C3", "F3", "A3"], ["G2", "D3", "G3", "B3"]]),
    ("refugio", "Refugio", "Salmo 46:1", [
        ["Bb2", "F3", "Bb3", "D4"], ["F2", "C3", "F3", "A3"], ["G2", "D3", "G3", "Bb3"], ["Eb3", "Bb3", "Eb4", "G4"]]),
    ("quietud", "Quietud", "Salmo 46:10", [
        ["G2", "D3", "G3", "B3"], ["E2", "B2", "E3", "G3"], ["C3", "G3", "C4", "E4"], ["D3", "A3", "D4", "F#4"]]),
]


def t_of(sec):
    return np.arange(int(sec * RATE)) / RATE


def piano(f, sec=3.5):
    t = t_of(sec)
    tone = sum((0.6 ** (h - 1)) * np.exp(-t * (1.6 + h * 0.9)) * np.sin(2 * np.pi * f * h * t) for h in range(1, 6))
    return tone * (1 - np.exp(-t * 300)) * 0.22


def pad(freqs, sec):
    t = t_of(sec)
    env = np.minimum(1, np.minimum(t / 2.0, (sec - t) / 2.0).clip(0))
    wave = sum(np.sin(2 * np.pi * f * d * t) for f in freqs for d in (0.997, 1.0, 1.003))
    return wave * env * (0.85 + 0.15 * np.sin(2 * np.pi * 0.2 * t)) * 0.035


def reverb(x, seed):
    rng = np.random.default_rng(seed)
    n = int(2.8 * RATE)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / RATE * 2.2)
    ir[0] = 1 / 0.25  # señal directa
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir * 0.25, size), size)[: len(x)]
    return y


def render(chords):
    total = CHORD_SEC * 4 * CYCLES + 4
    mix = np.zeros(int(total * RATE))

    def add(sig, at):
        i = int(at * RATE)
        mix[i : i + len(sig)] += sig[: len(mix) - i]

    step = CHORD_SEC / 12  # corcheas tranquilas
    patterns = [[0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1], [0, 2, 3, None, 2, None, 1, 2, 3, None, 2, None]]
    for c in range(CYCLES):
        for k, chord in enumerate(chords):
            at = (c * 4 + k) * CHORD_SEC
            freqs = [hz(n) for n in chord]
            add(pad(freqs[1:], CHORD_SEC + 2), at)
            add(piano(freqs[0] / 2, CHORD_SEC) * 0.8, at)  # bajo
            if 0 < c < CYCLES - 1:  # la primera y la última vuelta, solo colchón
                for j, idx in enumerate(patterns[c % 2]):
                    if idx is not None:
                        add(piano(freqs[idx] * 2), at + j * step)
    left, right = reverb(mix, 1), reverb(mix, 2)
    stereo = np.stack([left, right], axis=1)
    fade = np.minimum(1, np.minimum(np.arange(len(stereo)) / (3 * RATE), (len(stereo) - np.arange(len(stereo))) / (4 * RATE)))
    stereo *= fade[:, None]
    return stereo / np.abs(stereo).max() * 0.8


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for slug, title, ref, chords in TRACKS:
        audio = render(chords)
        pcm = (audio * 32767).astype("<i2").tobytes()
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(RATE), "-ac", "2", "-i", "-",
             "-c:a", "libmp3lame", "-b:a", "80k", "-metadata", f"title={title}", "-metadata", "artist=Heseria",
             str(OUT / f"{slug}.mp3")],
            input=pcm, check=True,
        )
        index.append({"id": slug, "title": title, "verse": ref, "durationSec": round(len(audio) / RATE),
                      "src": f"/musica/{slug}.mp3"})
        print("✓", title)
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False))


if __name__ == "__main__":
    main()
