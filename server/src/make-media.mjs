/**
 * HESERIA — Generador de medios de prueba.
 *
 * Produce audio y video ORIGINALES, sintetizados aquí mismo: no se descarga ni
 * se incrusta ninguna obra de terceros, así que el material de prueba no arrastra
 * derechos de autor.
 *
 *   node src/make-media.mjs
 *
 * Salida en `server/media/`:
 *   - tres pistas .mp3 sintetizadas (pad, arpegio, bajo y percusión suave)
 *   - un .mp4 H.264 con animación y audio, para probar el reproductor de video
 *   - manifest.json, que la siembra convierte en contenido publicado
 */
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../media");
fs.mkdirSync(OUT, { recursive: true });

const RATE = 44100;

/* =================================================================== audio */

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frecuencia de una nota en notación científica: "A4", "F#3", "Bb2". */
function freq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota inválida: ${name}`);
  const semis = NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return 440 * 2 ** ((semis + (Number(m[3]) - 4) * 12 - 9) / 12);
}

const TAU = Math.PI * 2;

/** Envolvente ataque/decaimiento/sostenido/liberación, en segundos. */
function adsr(t, dur, a = 0.01, d = 0.1, s = 0.7, r = 0.25) {
  if (t < 0 || t > dur + r) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < dur) return s;
  return s * Math.max(0, 1 - (t - dur) / r);
}

/** Onda de sierra suavizada: cuerpo cálido sin el filo del diente puro. */
function saw(phase, soft = 0.6) {
  const raw = 2 * (phase - Math.floor(phase + 0.5));
  return raw * (1 - soft) + Math.sin(TAU * phase) * soft;
}

function triangle(phase) {
  return 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
}

/** Ruido determinista: la misma semilla da siempre el mismo resultado. */
function noise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

class Buffer2ch {
  constructor(seconds) {
    this.length = Math.ceil(seconds * RATE);
    this.left = new Float64Array(this.length);
    this.right = new Float64Array(this.length);
  }
  add(index, l, r) {
    if (index < 0 || index >= this.length) return;
    this.left[index] += l;
    this.right[index] += r;
  }
}

/**
 * Escribe una nota sostenida con varios osciladores ligeramente desafinados,
 * lo que da el ancho característico de un pad.
 */
function pad(buf, note, start, dur, gain = 0.16, pan = 0) {
  const f = freq(note);
  const detunes = [0.997, 1, 1.003, 2, 0.5];
  const weights = [0.34, 0.4, 0.34, 0.1, 0.18];
  const i0 = Math.floor(start * RATE);
  const total = Math.ceil((dur + 0.6) * RATE);
  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    const env = adsr(t, dur, 0.28, 0.4, 0.62, 0.6);
    if (env <= 0) continue;
    let v = 0;
    for (let k = 0; k < detunes.length; k++) {
      v += saw(f * detunes[k] * t + k * 0.17, 0.72) * weights[k];
    }
    // Vibrato lento: evita que el acorde suene estático.
    v *= 1 + Math.sin(TAU * 0.6 * t) * 0.04;
    const s = v * env * gain;
    buf.add(i0 + i, s * (1 - Math.max(0, pan)), s * (1 + Math.min(0, pan)));
  }
}

/** Nota corta y cristalina para arpegios y melodía. */
function pluck(buf, note, start, dur, gain = 0.2, pan = 0) {
  const f = freq(note);
  const i0 = Math.floor(start * RATE);
  const total = Math.ceil((dur + 0.5) * RATE);
  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    const env = adsr(t, dur, 0.004, 0.22, 0.32, 0.45);
    if (env <= 0) continue;
    const v =
      Math.sin(TAU * f * t) * 0.6 +
      Math.sin(TAU * f * 2 * t) * 0.22 +
      Math.sin(TAU * f * 3 * t) * 0.09 +
      triangle(f * 4 * t) * 0.04;
    const s = v * env * gain;
    buf.add(i0 + i, s * (1 - Math.max(0, pan)), s * (1 + Math.min(0, pan)));
  }
}

function bass(buf, note, start, dur, gain = 0.3) {
  const f = freq(note);
  const i0 = Math.floor(start * RATE);
  const total = Math.ceil((dur + 0.3) * RATE);
  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    const env = adsr(t, dur, 0.012, 0.18, 0.6, 0.3);
    if (env <= 0) continue;
    const v = Math.sin(TAU * f * t) * 0.82 + triangle(f * 2 * t) * 0.12;
    const s = v * env * gain;
    buf.add(i0 + i, s, s);
  }
}

function kick(buf, start, gain = 0.5) {
  const i0 = Math.floor(start * RATE);
  const total = Math.ceil(0.34 * RATE);
  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    const f = 118 * Math.exp(-t * 26) + 42;
    const env = Math.exp(-t * 9.5);
    const s = Math.sin(TAU * f * t) * env * gain;
    buf.add(i0 + i, s, s);
  }
}

function shaker(buf, start, gain = 0.07) {
  const i0 = Math.floor(start * RATE);
  const total = Math.ceil(0.1 * RATE);
  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    const env = Math.exp(-t * 42);
    const s = noise(i0 + i) * env * gain;
    buf.add(i0 + i, s * 0.85, s);
  }
}

/** Reverberación sencilla por retardos: suficiente para dar sensación de sala. */
function reverb(buf, mix = 0.26) {
  const taps = [
    [0.031, 0.5], [0.047, 0.42], [0.071, 0.34],
    [0.113, 0.26], [0.157, 0.19], [0.211, 0.13],
  ];
  const wetL = new Float64Array(buf.length);
  const wetR = new Float64Array(buf.length);
  for (const [time, decay] of taps) {
    const d = Math.floor(time * RATE);
    for (let i = d; i < buf.length; i++) {
      wetL[i] += buf.left[i - d] * decay;
      wetR[i] += buf.right[i - d] * decay * 0.94;
    }
  }
  for (let i = 0; i < buf.length; i++) {
    buf.left[i] = buf.left[i] * (1 - mix) + wetL[i] * mix;
    buf.right[i] = buf.right[i] * (1 - mix) + wetR[i] * mix;
  }
}

/** Normaliza al pico deseado y aplica fundidos de entrada y salida. */
function master(buf, peak = 0.89, fade = 2.2) {
  let max = 0;
  for (let i = 0; i < buf.length; i++) {
    max = Math.max(max, Math.abs(buf.left[i]), Math.abs(buf.right[i]));
  }
  const g = max > 0 ? peak / max : 1;
  const f = Math.floor(fade * RATE);
  for (let i = 0; i < buf.length; i++) {
    let k = g;
    if (i < f) k *= i / f;
    const tail = buf.length - i;
    if (tail < f) k *= tail / f;
    // Saturación suave: redondea los picos en vez de recortarlos.
    buf.left[i] = Math.tanh(buf.left[i] * k * 1.05);
    buf.right[i] = Math.tanh(buf.right[i] * k * 1.05);
  }
}

function toWav(buf) {
  const frames = buf.length;
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf.left[i] * 32767))), i * 4);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf.right[i] * 32767))), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/* ------------------------------------------------------ composiciones */

/** Acorde a partir de la tónica y el tipo, en la octava indicada. */
function chord(root, type, octave) {
  const intervals = type === "min" ? [0, 3, 7] : type === "sus" ? [0, 5, 7] : [0, 4, 7];
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const base = NOTE[root[0]] + (root[1] === "#" ? 1 : root[1] === "b" ? -1 : 0);
  return intervals.map((iv) => {
    const abs = base + iv;
    return `${names[abs % 12]}${octave + Math.floor(abs / 12)}`;
  });
}

/**
 * «Cielo abierto» — 88 BPM, progresión D–A–Bm–G.
 * Pad sostenido, arpegio de corcheas, bajo en la tónica y percusión discreta.
 */
function trackCieloAbierto() {
  const bpm = 88;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = 34;
  const buf = new Buffer2ch(bars * bar + 4);

  const progression = [
    ["D", "maj", "D2"], ["A", "maj", "A1"], ["B", "min", "B1"], ["G", "maj", "G1"],
  ];
  const melody = ["F#5", "E5", "D5", "E5", "A5", "G5", "F#5", "D5"];

  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    const [root, type, low] = progression[b % 4];
    const voicing = chord(root, type, 3);
    const intro = b < 2;
    const full = b >= 6 && b < 30;

    for (const note of voicing) pad(buf, note, t, bar * 0.98, intro ? 0.1 : 0.16);
    pad(buf, voicing[0].replace(/\d/, "4"), t, bar * 0.98, 0.07, 0.3);
    bass(buf, low, t, bar * 0.9, intro ? 0.16 : 0.3);

    if (b >= 2) {
      const arp = [voicing[0], voicing[1], voicing[2], voicing[1].replace(/\d/, "4")];
      for (let e = 0; e < 8; e++) {
        const note = arp[e % arp.length];
        pluck(buf, note, t + e * (beat / 2), beat * 0.42, 0.13, e % 2 ? 0.35 : -0.35);
      }
    }
    if (b >= 10 && b < 30) {
      const note = melody[(b - 10) % melody.length];
      pluck(buf, note, t + beat * 0.5, beat * 1.6, 0.17, 0);
      pluck(buf, note, t + beat * 2.5, beat * 1.2, 0.11, 0.2);
    }
    if (full) {
      kick(buf, t, 0.42);
      kick(buf, t + beat * 2, 0.36);
      for (let e = 0; e < 8; e++) shaker(buf, t + e * (beat / 2), e % 2 ? 0.05 : 0.08);
    }
  }

  reverb(buf, 0.3);
  master(buf);
  return buf;
}

/** «Manantial» — 72 BPM en Sol, más íntima: pad, arpegio y bajo, sin batería. */
function trackManantial() {
  const bpm = 72;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = 26;
  const buf = new Buffer2ch(bars * bar + 4);

  const progression = [
    ["G", "maj", "G1"], ["E", "min", "E1"], ["C", "maj", "C2"], ["D", "sus", "D2"],
  ];

  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    const [root, type, low] = progression[b % 4];
    const voicing = chord(root, type, 3);
    for (const note of voicing) pad(buf, note, t, bar * 0.99, 0.15);
    bass(buf, low, t, bar * 0.95, 0.26);

    const arp = [voicing[0], voicing[2], voicing[1].replace(/\d/, "4"), voicing[2]];
    for (let e = 0; e < 6; e++) {
      pluck(buf, arp[e % arp.length], t + e * (bar / 6), bar / 6, 0.12, e % 2 ? 0.3 : -0.3);
    }
    if (b >= 8 && b < 22) {
      pluck(buf, voicing[2].replace(/\d/, "5"), t + beat, beat * 2.4, 0.14);
    }
  }

  reverb(buf, 0.34);
  master(buf);
  return buf;
}

/** «Adviento» — 30 s, la banda sonora del video de prueba. */
function trackAdviento(seconds = 30) {
  const bpm = 96;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = Math.floor(seconds / bar);
  const buf = new Buffer2ch(bars * bar + 2);

  const progression = [["A", "min", "A1"], ["F", "maj", "F1"], ["C", "maj", "C2"], ["G", "maj", "G1"]];

  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    const [root, type, low] = progression[b % 4];
    const voicing = chord(root, type, 3);
    for (const note of voicing) pad(buf, note, t, bar * 0.98, 0.15);
    bass(buf, low, t, bar * 0.9, 0.28);
    for (let e = 0; e < 8; e++) {
      pluck(buf, voicing[e % 3], t + e * (beat / 2), beat * 0.4, 0.12, e % 2 ? 0.3 : -0.3);
    }
    kick(buf, t, 0.4);
    kick(buf, t + beat * 2, 0.34);
    for (let e = 0; e < 8; e++) shaker(buf, t + e * (beat / 2), 0.06);
  }

  reverb(buf, 0.26);
  master(buf, 0.89, 1.2);
  return buf;
}

/* =================================================================== video */

/** Fuente de mapa de bits 5×7. Suficiente para rótulos y contadores. */
const GLYPHS = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "11110", "10001", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "11110", "10000", "10000", "10000", "11111"],
  F: ["11111", "10000", "11110", "10000", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "·": ["00000", "00000", "00000", "01100", "01100", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

const W = 960;
const H = 540;
const FPS = 24;

function drawText(frame, text, x, y, scale, [r, g, b], alpha = 1) {
  // Los índices de un TypedArray deben ser enteros: con decimales la escritura
  // se descarta en silencio y el texto simplemente no aparece.
  let cursor = Math.round(x);
  y = Math.round(y);
  for (const raw of text.toUpperCase()) {
    const glyph = GLYPHS[raw] ?? GLYPHS[" "];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== "1") continue;
        for (let py = 0; py < scale; py++) {
          const yy = y + gy * scale + py;
          if (yy < 0 || yy >= H) continue;
          for (let px = 0; px < scale; px++) {
            const xx = cursor + gx * scale + px;
            if (xx < 0 || xx >= W) continue;
            const i = (yy * W + xx) * 3;
            frame[i] = frame[i] * (1 - alpha) + r * alpha;
            frame[i + 1] = frame[i + 1] * (1 - alpha) + g * alpha;
            frame[i + 2] = frame[i + 2] * (1 - alpha) + b * alpha;
          }
        }
      }
    }
    cursor += scale * 6;
  }
  return cursor - x;
}

function textWidth(text, scale) {
  return text.length * scale * 6 - scale;
}

function fillRect(frame, x, y, w, h, [r, g, b], alpha = 1) {
  x = Math.round(x);
  y = Math.round(y);
  for (let yy = Math.max(0, y); yy < Math.min(H, y + Math.round(h)); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(W, x + Math.round(w)); xx++) {
      const i = (yy * W + xx) * 3;
      frame[i] = frame[i] * (1 - alpha) + r * alpha;
      frame[i + 1] = frame[i + 1] * (1 - alpha) + g * alpha;
      frame[i + 2] = frame[i + 2] * (1 - alpha) + b * alpha;
    }
  }
}

/**
 * Dibuja un fotograma: degradado en movimiento, marca, contador de segundos,
 * barra de progreso y un pulso al ritmo de la música. El contador permite
 * comprobar de un vistazo que el salto en la línea de tiempo funciona.
 */
function renderFrame(frame, index, totalFrames) {
  const t = index / FPS;
  const progress = index / totalFrames;

  // Fondo: degradado diagonal que gira lentamente.
  const angle = t * 0.18;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = ((x / W - 0.5) * cosA - (y / H - 0.5) * sinA + 0.5);
      const v = ((x / W - 0.5) * sinA + (y / H - 0.5) * cosA + 0.5);
      const k = Math.min(1, Math.max(0, u * 0.7 + v * 0.3));
      const i = (y * W + x) * 3;
      // De azul profundo (#0F1117) a cian Heseria (#22D3EE), pasando por índigo.
      frame[i] = 15 + k * 20 + Math.sin(t * 0.9 + v * 3) * 6;
      frame[i + 1] = 17 + k * 120 + Math.sin(t * 0.7 + u * 4) * 10;
      frame[i + 2] = 23 + k * 170 + Math.cos(t * 0.5 + v * 2) * 12;
    }
  }

  // Pulso al ritmo: 96 BPM → un latido cada 0.625 s.
  const beatPhase = (t % 0.625) / 0.625;
  const pulse = Math.exp(-beatPhase * 4);
  const radius = 120 + pulse * 26;
  const cx = W / 2;
  const cy = H / 2 - 40;
  for (let y = Math.floor(cy - radius - 3); y < Math.ceil(cy + radius + 3); y++) {
    if (y < 0 || y >= H) continue;
    for (let x = Math.floor(cx - radius - 3); x < Math.ceil(cx + radius + 3); x++) {
      if (x < 0 || x >= W) continue;
      const d = Math.hypot(x - cx, y - cy);
      const edge = Math.abs(d - radius);
      if (edge > 3) continue;
      const a = (1 - edge / 3) * (0.35 + pulse * 0.5);
      const i = (y * W + x) * 3;
      frame[i] = frame[i] * (1 - a) + 236 * a;
      frame[i + 1] = frame[i + 1] * (1 - a) + 254 * a;
      frame[i + 2] = frame[i + 2] * (1 - a) + 255 * a;
    }
  }

  const brand = "HESERIA";
  const scale = 9;
  drawText(frame, brand, (W - textWidth(brand, scale)) / 2, cy - 32, scale, [255, 255, 255]);

  const sub = "VIDEO DE PRUEBA";
  drawText(frame, sub, (W - textWidth(sub, 3)) / 2, cy + 46, 3, [186, 230, 253], 0.9);

  // Reloj: mm:ss + fotograma, para verificar la búsqueda en la línea de tiempo.
  const mm = String(Math.floor(t / 60)).padStart(2, "0");
  const ss = String(Math.floor(t % 60)).padStart(2, "0");
  const clock = `${mm}:${ss}`;
  drawText(frame, clock, (W - textWidth(clock, 7)) / 2, cy + 96, 7, [255, 255, 255], 0.95);

  const meta = `FOTOGRAMA ${String(index).padStart(4, "0")} / ${totalFrames}`;
  drawText(frame, meta, (W - textWidth(meta, 2)) / 2, cy + 168, 2, [203, 213, 225], 0.75);

  // Barra de progreso al pie.
  fillRect(frame, 60, H - 54, W - 120, 6, [255, 255, 255], 0.18);
  fillRect(frame, 60, H - 54, Math.round((W - 120) * progress), 6, [34, 211, 238], 0.95);

  // Esquinas: identificación de la pista y resolución.
  drawText(frame, "HESERIA · MEDIA TEST", 60, 46, 2, [226, 232, 240], 0.8);
  const res = `${W}X${H} ${FPS}FPS`;
  drawText(frame, res, W - 60 - textWidth(res, 2), 46, 2, [226, 232, 240], 0.6);
}

function renderVideo(audioWav, seconds, outFile) {
  const totalFrames = seconds * FPS;
  const rawAudio = path.join(OUT, ".video-audio.wav");
  fs.writeFileSync(rawAudio, audioWav);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, [
      "-y",
      "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-s", `${W}x${H}`, "-r", String(FPS), "-i", "pipe:0",
      "-i", rawAudio,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
      "-pix_fmt", "yuv420p", "-profile:v", "baseline", "-level", "3.1",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
      "-movflags", "+faststart",
      "-shortest",
      outFile,
    ], { stdio: ["pipe", "ignore", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      fs.rmSync(rawAudio, { force: true });
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg salió con ${code}\n${stderr.slice(-1500)}`));
    });

    const frame = new Uint8Array(W * H * 3);
    let i = 0;
    const buffer = Buffer.allocUnsafe(W * H * 3);

    function pump() {
      while (i < totalFrames) {
        renderFrame(frame, i, totalFrames);
        buffer.set(frame);
        i++;
        if (!proc.stdin.write(Buffer.from(buffer))) {
          proc.stdin.once("drain", pump);
          return;
        }
      }
      proc.stdin.end();
    }
    pump();
  });
}

/* ===================================================================== main */

function encodeMp3(wav, outFile, tags) {
  const tmp = path.join(OUT, ".tmp.wav");
  fs.writeFileSync(tmp, wav);
  const args = ["-y", "-i", tmp, "-codec:a", "libmp3lame", "-q:a", "3"];
  for (const [k, v] of Object.entries(tags)) args.push("-metadata", `${k}=${v}`);
  args.push(outFile);
  execFileSync(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
  fs.rmSync(tmp, { force: true });
}

const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(2);

console.log("Sintetizando audio…");

const cielo = trackCieloAbierto();
const manantial = trackManantial();
const adviento = trackAdviento(30);

const tracks = [
  {
    buf: cielo, file: "cielo-abierto.mp3", id: "media-song-1", kind: "song",
    title: "Cielo abierto", subtitle: "Heseria Estudio", category: "Adoración",
    description: "Pista instrumental original, sintetizada para probar la reproducción de audio en la app.",
    color: "from-cyan-500/70 to-blue-700/70",
  },
  {
    buf: manantial, file: "manantial.mp3", id: "media-song-2", kind: "song",
    title: "Manantial", subtitle: "Heseria Estudio", category: "Contemplativa",
    description: "Segunda pista original: más lenta, útil para probar la cola y el cambio de canción.",
    color: "from-teal-400/70 to-emerald-700/70",
  },
  {
    buf: adviento, file: "adviento.mp3", id: "media-song-3", kind: "song",
    title: "Adviento", subtitle: "Heseria Estudio", category: "Instrumental",
    description: "Tema corto de treinta segundos. Es también la banda sonora del video de prueba.",
    color: "from-amber-400/70 to-orange-700/70",
  },
];

for (const t of tracks) {
  const out = path.join(OUT, t.file);
  encodeMp3(toWav(t.buf), out, { title: t.title, artist: "Heseria Estudio", album: "Pruebas Heseria" });
  t.durationSec = Math.round(t.buf.length / RATE);
  console.log(`  ${t.file} — ${t.durationSec}s, ${mb(out)} MB`);
}

console.log("Renderizando video (960×540, 24 fps, 30 s)…");
const videoFile = path.join(OUT, "heseria-demo.mp4");
await renderVideo(toWav(adviento), 30, videoFile);
console.log(`  heseria-demo.mp4 — 30s, ${mb(videoFile)} MB`);

const manifest = [
  ...tracks.map(({ buf, ...rest }) => ({ ...rest, provider: "direct-audio", void: void buf })),
  {
    id: "media-video-1", kind: "video", file: "heseria-demo.mp4", provider: "direct-video",
    title: "Heseria — video de prueba", subtitle: "Equipo Heseria", category: "Institucional",
    description: "Video generado por el sistema: contador de tiempo, barra de progreso y pulso al ritmo, para comprobar reproducción, pausa y búsqueda.",
    durationSec: 30, color: "from-fuchsia-400/70 to-indigo-800/70",
  },
].map(({ void: _drop, ...rest }) => rest);

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nmanifest.json con ${manifest.length} elementos. Listo.`);
