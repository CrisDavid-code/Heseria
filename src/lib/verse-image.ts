/**
 * HESERIA — Versículos como imagen.
 *
 * Los fondos se dibujan por código, no son archivos: se combinan una paleta y
 * un motivo, y de ahí salen cientos de fondos distintos sin pesar nada en el
 * paquete ni arrastrar derechos de imagen de nadie.
 *
 * Todo se pinta en un canvas y sale como PNG, listo para compartir.
 */

export type Format = "cuadrado" | "historia" | "horizontal";

export const FORMATS: Record<Format, { width: number; height: number; label: string }> = {
  cuadrado: { width: 1080, height: 1080, label: "Cuadrado" },
  historia: { width: 1080, height: 1920, label: "Historia" },
  horizontal: { width: 1920, height: 1080, label: "Horizontal" },
};

/* ------------------------------------------------------------- paletas */

export interface Palette {
  id: string;
  name: string;
  /** Del color de arriba al de abajo. */
  from: string;
  to: string;
  /** Color del texto y de los adornos. */
  ink: string;
  /** Un acento para la referencia. */
  accent: string;
}

export const PALETTES: Palette[] = [
  { id: "amanecer", name: "Amanecer", from: "#F9A826", to: "#B23A48", ink: "#FFFFFF", accent: "#FFE7B3" },
  { id: "noche", name: "Noche", from: "#0F1117", to: "#1E293B", ink: "#FFFFFF", accent: "#22D3EE" },
  { id: "oceano", name: "Océano", from: "#0EA5E9", to: "#1E3A8A", ink: "#FFFFFF", accent: "#BAE6FD" },
  { id: "oliva", name: "Olivo", from: "#4D7C0F", to: "#14532D", ink: "#FFFFFF", accent: "#D9F99D" },
  { id: "desierto", name: "Desierto", from: "#F4A261", to: "#8C5A2B", ink: "#FFFFFF", accent: "#FFE8D1" },
  { id: "lavanda", name: "Lavanda", from: "#A78BFA", to: "#4C1D95", ink: "#FFFFFF", accent: "#EDE9FE" },
  { id: "rosa", name: "Aurora", from: "#FB7185", to: "#7E22CE", ink: "#FFFFFF", accent: "#FFE4E6" },
  { id: "esmeralda", name: "Esmeralda", from: "#34D399", to: "#065F46", ink: "#FFFFFF", accent: "#D1FAE5" },
  { id: "brasa", name: "Brasa", from: "#F97316", to: "#7C2D12", ink: "#FFFFFF", accent: "#FFEDD5" },
  { id: "acero", name: "Acero", from: "#64748B", to: "#0F172A", ink: "#FFFFFF", accent: "#CBD5E1" },
  { id: "trigo", name: "Trigo", from: "#FDE68A", to: "#B45309", ink: "#3B2005", accent: "#7C2D12" },
  { id: "cielo", name: "Cielo", from: "#BAE6FD", to: "#3B82F6", ink: "#0C2340", accent: "#0B4A8F" },
  { id: "marfil", name: "Marfil", from: "#FAF7F0", to: "#E7DFD0", ink: "#3F3A31", accent: "#8A7B5F" },
  { id: "vino", name: "Vino", from: "#9F1239", to: "#3B0764", ink: "#FFFFFF", accent: "#FBCFE8" },
  { id: "menta", name: "Menta", from: "#A7F3D0", to: "#0D9488", ink: "#03312B", accent: "#04564B" },
  { id: "medianoche", name: "Medianoche", from: "#1E1B4B", to: "#020617", ink: "#FFFFFF", accent: "#818CF8" },
  { id: "arena", name: "Arena", from: "#E7C9A9", to: "#9A6B44", ink: "#3A2412", accent: "#6B4423" },
  { id: "bosque", name: "Bosque", from: "#166534", to: "#052E16", ink: "#FFFFFF", accent: "#86EFAC" },
  { id: "coral", name: "Coral", from: "#FCA5A5", to: "#BE123C", ink: "#FFFFFF", accent: "#FFE4E6" },
  { id: "indigo", name: "Índigo", from: "#6366F1", to: "#1E1B4B", ink: "#FFFFFF", accent: "#C7D2FE" },
];

/* -------------------------------------------------------------- motivos */

export interface Motif {
  id: string;
  name: string;
}

export const MOTIFS: Motif[] = [
  { id: "liso", name: "Liso" },
  { id: "cruz", name: "Cruz" },
  { id: "rayos", name: "Rayos de luz" },
  { id: "montanas", name: "Montañas" },
  { id: "olas", name: "Aguas" },
  { id: "amanecer", name: "Amanecer" },
  { id: "estrellas", name: "Estrellas" },
  { id: "trigo", name: "Espigas" },
  { id: "paloma", name: "Paloma" },
  { id: "camino", name: "Camino" },
  { id: "vid", name: "Vid" },
  { id: "llama", name: "Llama" },
  { id: "arcos", name: "Arcos" },
  { id: "puntos", name: "Textura" },
  { id: "circulos", name: "Círculos" },
  { id: "lluvia", name: "Lluvia" },
];

/** Cuántas combinaciones distintas hay: paletas por motivos. */
export const BACKGROUND_COUNT = PALETTES.length * MOTIFS.length;

export interface Background {
  paletteId: string;
  motifId: string;
}

/** Todas las combinaciones, para la galería. */
export function allBackgrounds(): Background[] {
  const out: Background[] = [];
  // Se intercalan para que la galería no muestre veinte fondos seguidos iguales.
  for (const motif of MOTIFS) {
    for (const palette of PALETTES) {
      out.push({ paletteId: palette.id, motifId: motif.id });
    }
  }
  return out;
}

/** Un fondo estable a partir de un texto: la misma cita, el mismo fondo. */
export function backgroundFor(seed: string): Background {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return {
    paletteId: PALETTES[hash % PALETTES.length].id,
    motifId: MOTIFS[Math.floor(hash / PALETTES.length) % MOTIFS.length].id,
  };
}

/* -------------------------------------------------------------- dibujo */

const palette = (id: string) => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

/** Ruido determinista, para que el mismo fondo se dibuje siempre igual. */
function noise(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function drawMotif(
  ctx: CanvasRenderingContext2D,
  motifId: string,
  w: number,
  h: number,
  p: Palette,
) {
  ctx.save();
  const ink = p.ink;

  const alpha = (a: number) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
  };

  switch (motifId) {
    case "cruz": {
      alpha(0.1);
      const armW = w * 0.075;
      const tall = h * 0.52;
      const wide = w * 0.34;
      const cx = w / 2;
      const cy = h * 0.42;
      ctx.fillRect(cx - armW / 2, cy - tall / 2, armW, tall);
      ctx.fillRect(cx - wide / 2, cy - tall * 0.16, wide, armW);
      break;
    }

    case "rayos": {
      const cx = w / 2;
      const cy = -h * 0.1;
      for (let i = 0; i < 14; i++) {
        alpha(0.05 + noise(i) * 0.05);
        const angle = (i / 14) * Math.PI + Math.PI * 0.02;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * h * 2.2, cy + Math.sin(angle) * h * 2.2);
        ctx.lineTo(cx + Math.cos(angle + 0.06) * h * 2.2, cy + Math.sin(angle + 0.06) * h * 2.2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case "montanas": {
      const base = h * 0.88;
      const ranges = [
        { peak: h * 0.2, a: 0.09, offset: 0 },
        { peak: h * 0.13, a: 0.13, offset: w * 0.3 },
      ];
      for (const range of ranges) {
        alpha(range.a);
        ctx.beginPath();
        ctx.moveTo(-w * 0.1, base);
        for (let x = -w * 0.1; x <= w * 1.1; x += w / 26) {
          const t = (x + range.offset) / w;
          const y = base - range.peak * (0.5 + 0.5 * Math.sin(t * 5.2) * Math.cos(t * 2.1));
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w * 1.1, h * 1.1);
        ctx.lineTo(-w * 0.1, h * 1.1);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case "olas": {
      for (let i = 0; i < 6; i++) {
        alpha(0.06 + i * 0.012);
        const y = h * (0.62 + i * 0.07);
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += w / 40) {
          ctx.lineTo(x, y + Math.sin(x / (w / 6) + i) * h * 0.022);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case "amanecer": {
      alpha(0.12);
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.72, Math.min(w, h) * 0.3, 0, Math.PI * 2);
      ctx.fill();
      alpha(0.07);
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.72, Math.min(w, h) * 0.42, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case "estrellas": {
      for (let i = 0; i < 90; i++) {
        alpha(0.18 + noise(i * 3) * 0.4);
        const r = 1 + noise(i * 7) * (w * 0.004);
        ctx.beginPath();
        ctx.arc(noise(i) * w, noise(i + 100) * h * 0.75, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "trigo": {
      ctx.lineWidth = Math.max(1.5, w * 0.003);
      for (let i = 0; i < 9; i++) {
        alpha(0.1);
        const x = w * (0.08 + i * 0.105);
        const top = h * (0.58 + noise(i) * 0.08);
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.quadraticCurveTo(x + w * 0.02, (h + top) / 2, x + w * 0.01, top);
        ctx.stroke();
        for (let g = 0; g < 5; g++) {
          const gy = top + g * (h * 0.028);
          ctx.beginPath();
          ctx.ellipse(x + w * 0.012, gy, w * 0.008, h * 0.014, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }

    case "paloma": {
      alpha(0.11);
      const cx = w / 2;
      const cy = h * 0.36;
      const s = Math.min(w, h) * 0.16;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.55, s * 0.34, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.15, cy - s * 0.1);
      ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.85, cx + s * 0.5, cy - s * 0.42);
      ctx.quadraticCurveTo(cx + s * 0.1, cy - s * 0.2, cx - s * 0.15, cy - s * 0.1);
      ctx.fill();
      break;
    }

    case "camino": {
      alpha(0.1);
      ctx.beginPath();
      ctx.moveTo(w * 0.34, h);
      ctx.quadraticCurveTo(w * 0.5, h * 0.66, w * 0.47, h * 0.42);
      ctx.lineTo(w * 0.53, h * 0.42);
      ctx.quadraticCurveTo(w * 0.62, h * 0.7, w * 0.78, h);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case "vid": {
      ctx.lineWidth = Math.max(2, w * 0.004);
      alpha(0.12);
      ctx.beginPath();
      ctx.moveTo(-w * 0.05, h * 0.12);
      for (let x = -w * 0.05; x <= w * 1.05; x += w / 30) {
        ctx.lineTo(x, h * 0.12 + Math.sin(x / (w / 5)) * h * 0.035);
      }
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const x = w * (0.04 + i * 0.085);
        const y = h * 0.12 + Math.sin(x / (w / 5)) * h * 0.035;
        ctx.beginPath();
        ctx.ellipse(x, y + h * 0.03, w * 0.016, h * 0.012, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "llama": {
      alpha(0.12);
      const cx = w / 2;
      const base = h * 0.78;
      const s = Math.min(w, h) * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx, base);
      ctx.quadraticCurveTo(cx - s * 0.7, base - s * 0.55, cx - s * 0.1, base - s * 1.5);
      ctx.quadraticCurveTo(cx + s * 0.28, base - s * 0.95, cx + s * 0.62, base - s * 0.5);
      ctx.quadraticCurveTo(cx + s * 0.5, base, cx, base);
      ctx.fill();
      break;
    }

    case "arcos": {
      ctx.lineWidth = Math.max(2, w * 0.006);
      for (let i = 0; i < 5; i++) {
        alpha(0.07 + i * 0.01);
        ctx.beginPath();
        ctx.arc(w / 2, h * 1.05, Math.min(w, h) * (0.32 + i * 0.13), Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case "puntos": {
      const step = Math.max(18, w / 34);
      for (let y = step; y < h; y += step) {
        for (let x = step; x < w; x += step) {
          alpha(0.05 + noise(x * y) * 0.06);
          ctx.beginPath();
          ctx.arc(x, y, w * 0.0035, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }

    case "circulos": {
      ctx.lineWidth = Math.max(2, w * 0.005);
      for (let i = 0; i < 6; i++) {
        alpha(0.06);
        ctx.beginPath();
        ctx.arc(w * 0.78, h * 0.22, Math.min(w, h) * (0.08 + i * 0.075), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case "lluvia": {
      ctx.lineWidth = Math.max(1.5, w * 0.0025);
      for (let i = 0; i < 60; i++) {
        alpha(0.07 + noise(i * 5) * 0.08);
        const x = noise(i) * w;
        const y = noise(i + 50) * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w * 0.012, y + h * 0.045);
        ctx.stroke();
      }
      break;
    }

    default:
      break;
  }

  ctx.restore();
}

/* --------------------------------------------------------------- texto */

/** Parte el texto en líneas que quepan en el ancho dado. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface VerseImageOptions {
  text: string;
  reference: string;
  background: Background;
  format: Format;
  /** Pie con la invitación a descargar la app. */
  footer?: string;
}

/**
 * Dibuja el versículo y devuelve el canvas.
 *
 * El tamaño de letra se ajusta solo hasta que el texto cabe: una cita larga se
 * lee más pequeña, pero nunca se sale ni se corta.
 */
export function renderVerseCanvas(options: VerseImageOptions): HTMLCanvasElement {
  const { width, height } = FORMATS[options.format];
  const p = palette(options.background.paletteId);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Fondo: degradado diagonal.
  const gradient = ctx.createLinearGradient(0, 0, width * 0.4, height);
  gradient.addColorStop(0, p.from);
  gradient.addColorStop(1, p.to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawMotif(ctx, options.background.motifId, width, height, p);

  // Un velo suave para que el texto se lea siempre, sea cual sea el fondo.
  const veil = ctx.createLinearGradient(0, height * 0.2, 0, height);
  const dark = p.ink === "#FFFFFF";
  veil.addColorStop(0, dark ? "rgba(0,0,0,0)" : "rgba(255,255,255,0)");
  veil.addColorStop(1, dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);

  const margin = width * 0.1;
  const maxWidth = width - margin * 2;
  const family = '"Space Grotesk", "Segoe UI", system-ui, sans-serif';

  // Se reduce la letra hasta que el bloque quepa cómodamente.
  let size = Math.round(width * (options.format === "historia" ? 0.075 : 0.068));
  let lines: string[] = [];
  const maxBlock = height * (options.format === "historia" ? 0.46 : 0.52);

  for (; size > width * 0.026; size -= 2) {
    ctx.font = `600 ${size}px ${family}`;
    lines = wrap(ctx, `“${options.text}”`, maxWidth);
    if (lines.length * size * 1.34 <= maxBlock) break;
  }

  const lineHeight = size * 1.34;
  const blockHeight = lines.length * lineHeight;
  let y = height / 2 - blockHeight / 2 + size * 0.85;

  ctx.textAlign = "center";
  ctx.fillStyle = p.ink;
  ctx.shadowColor = dark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.35)";
  ctx.shadowBlur = width * 0.02;

  for (const lineText of lines) {
    ctx.fillText(lineText, width / 2, y);
    y += lineHeight;
  }
  ctx.shadowBlur = 0;

  // Referencia, precedida de una línea corta.
  const refY = y + size * 0.5;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = Math.max(2, width * 0.004);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(width / 2 - width * 0.05, refY);
  ctx.lineTo(width / 2 + width * 0.05, refY);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = `500 ${Math.round(size * 0.62)}px ${family}`;
  ctx.fillStyle = p.accent;
  ctx.fillText(options.reference, width / 2, refY + size * 0.95);

  // Pie: la marca y la invitación a descargar.
  if (options.footer) {
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = p.ink;
    ctx.font = `500 ${Math.round(width * 0.026)}px ${family}`;
    ctx.fillText(options.footer, width / 2, height - margin * 0.55);
    ctx.globalAlpha = 1;
  }

  return canvas;
}

/** Igual, pero devuelve el PNG listo para compartir o descargar. */
export function renderVerseBlob(options: VerseImageOptions): Promise<Blob | null> {
  const canvas = renderVerseCanvas(options);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Vista previa pequeña, para la galería de fondos. */
export function renderVerseDataUrl(options: VerseImageOptions): string {
  return renderVerseCanvas(options).toDataURL("image/png");
}
