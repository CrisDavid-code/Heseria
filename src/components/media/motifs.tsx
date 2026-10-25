/**
 * HESERIA — Ilustraciones de portada.
 *
 * Cada portada se dibuja: no hay fotografías con licencia en el paquete. Pero
 * dibujar por dibujar da formas que no dicen nada, así que el motivo se elige
 * **según el título y el tipo** de lo que se está mostrando: un sermón sobre el
 * perdón lleva una cruz, un curso lleva un libro abierto, una canción lleva
 * notas, un caso de la fundación lleva manos.
 *
 * Todo es SVG sobre el degradado de la ficha, así que pesa nada y se ve nítido
 * a cualquier tamaño.
 */
import { hashIndex } from "@/lib/utils";

export type MotifId =
  | "cruz"
  | "cielo"
  | "amanecer"
  | "paloma"
  | "montanas"
  | "aguas"
  | "libro"
  | "manos"
  | "notas"
  | "templo"
  | "trigo"
  | "llama"
  | "corona"
  | "camino"
  | "vitral"
  | "estrellas";

/* ------------------------------------------------------------ el dibujo */

const FILL = "rgba(255,255,255,0.16)";
const LINE = "rgba(255,255,255,0.3)";
const SOFT = "rgba(255,255,255,0.09)";

/** Cada motivo es un fragmento de SVG sobre un lienzo de 100 × 100. */
const SHAPES: Record<MotifId, React.ReactNode> = {
  cruz: (
    <>
      <circle cx="50" cy="44" r="30" fill={SOFT} />
      <rect x="46" y="16" width="8" height="64" rx="2" fill={FILL} />
      <rect x="30" y="34" width="40" height="8" rx="2" fill={FILL} />
      <rect x="46" y="16" width="8" height="64" rx="2" fill="none" stroke={LINE} strokeWidth="0.6" />
    </>
  ),

  cielo: (
    <>
      <ellipse cx="26" cy="34" rx="20" ry="11" fill={SOFT} />
      <ellipse cx="40" cy="30" rx="14" ry="9" fill={SOFT} />
      <ellipse cx="72" cy="52" rx="24" ry="12" fill={FILL} />
      <ellipse cx="58" cy="48" rx="15" ry="9" fill={FILL} />
      <circle cx="78" cy="22" r="9" fill="rgba(255,255,255,0.24)" />
    </>
  ),

  amanecer: (
    <>
      <circle cx="50" cy="72" r="22" fill="rgba(255,255,255,0.22)" />
      <circle cx="50" cy="72" r="32" fill={SOFT} />
      {Array.from({ length: 9 }).map((_, i) => (
        <line
          key={i}
          x1="50"
          y1="72"
          x2={50 + Math.cos(Math.PI + (i / 8) * Math.PI) * 60}
          y2={72 + Math.sin(Math.PI + (i / 8) * Math.PI) * 60}
          stroke={LINE}
          strokeWidth="0.8"
        />
      ))}
      <rect x="0" y="72" width="100" height="28" fill="rgba(0,0,0,0.12)" />
    </>
  ),

  paloma: (
    <>
      <circle cx="50" cy="46" r="28" fill={SOFT} />
      <ellipse cx="52" cy="52" rx="17" ry="10" transform="rotate(-14 52 52)" fill={FILL} />
      <path d="M42 46 Q44 26 72 36 Q52 44 42 46 Z" fill="rgba(255,255,255,0.24)" />
      <circle cx="38" cy="49" r="2" fill="rgba(255,255,255,0.5)" />
      <path d="M66 58 L80 66 M66 58 L78 54" stroke={LINE} strokeWidth="0.9" fill="none" />
    </>
  ),

  montanas: (
    <>
      <circle cx="74" cy="24" r="8" fill="rgba(255,255,255,0.2)" />
      <path d="M0 82 L26 46 L44 70 L62 38 L100 82 Z" fill={FILL} />
      <path d="M0 92 L30 62 L52 84 L74 58 L100 92 Z" fill={SOFT} />
      <path d="M62 38 L70 52 L54 52 Z" fill="rgba(255,255,255,0.26)" />
    </>
  ),

  aguas: (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <path
          key={i}
          d={`M0 ${54 + i * 10} Q25 ${46 + i * 10} 50 ${54 + i * 10} T100 ${54 + i * 10} V100 H0 Z`}
          fill={i % 2 ? SOFT : FILL}
        />
      ))}
      <circle cx="76" cy="26" r="10" fill="rgba(255,255,255,0.18)" />
    </>
  ),

  libro: (
    <>
      <path d="M50 34 Q32 26 14 32 V74 Q32 68 50 76 Z" fill={FILL} />
      <path d="M50 34 Q68 26 86 32 V74 Q68 68 50 76 Z" fill="rgba(255,255,255,0.2)" />
      <line x1="50" y1="34" x2="50" y2="76" stroke={LINE} strokeWidth="0.8" />
      {Array.from({ length: 3 }).map((_, i) => (
        <line
          key={i}
          x1="20"
          y1={42 + i * 9}
          x2="42"
          y2={44 + i * 9}
          stroke={LINE}
          strokeWidth="0.6"
        />
      ))}
    </>
  ),

  manos: (
    <>
      <circle cx="50" cy="50" r="30" fill={SOFT} />
      <path d="M30 68 Q30 46 42 42 L46 56 Q50 44 56 44 L54 60 Q62 48 68 52 L60 72 Q48 80 38 74 Z" fill={FILL} />
      <path d="M50 30 L54 40 L64 40 L56 46 L59 56 L50 50 L41 56 L44 46 L36 40 L46 40 Z" fill="rgba(255,255,255,0.22)" />
    </>
  ),

  notas: (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={i} x1="0" y1={34 + i * 8} x2="100" y2={34 + i * 8} stroke={SOFT} strokeWidth="0.8" />
      ))}
      <ellipse cx="34" cy="62" rx="7" ry="5" transform="rotate(-18 34 62)" fill={FILL} />
      <rect x="39" y="34" width="2.4" height="28" fill={FILL} />
      <ellipse cx="64" cy="54" rx="7" ry="5" transform="rotate(-18 64 54)" fill={FILL} />
      <rect x="69" y="26" width="2.4" height="28" fill={FILL} />
      <path d="M41 34 Q56 30 71 26" stroke={FILL} strokeWidth="2.4" fill="none" />
    </>
  ),

  templo: (
    <>
      <rect x="26" y="48" width="48" height="36" fill={FILL} />
      <path d="M22 48 L50 26 L78 48 Z" fill="rgba(255,255,255,0.22)" />
      <rect x="48" y="12" width="4" height="16" fill={FILL} />
      <rect x="43" y="17" width="14" height="4" fill={FILL} />
      <path d="M44 84 V64 Q50 58 56 64 V84 Z" fill="rgba(255,255,255,0.28)" />
      <rect x="32" y="58" width="8" height="10" rx="4" fill={SOFT} />
      <rect x="60" y="58" width="8" height="10" rx="4" fill={SOFT} />
    </>
  ),

  trigo: (
    <>
      {Array.from({ length: 4 }).map((_, i) => {
        const x = 26 + i * 16;
        return (
          <g key={i}>
            <path d={`M${x} 88 Q${x + 3} 64 ${x + 1} 40`} stroke={LINE} strokeWidth="1" fill="none" />
            {Array.from({ length: 4 }).map((__, g) => (
              <ellipse
                key={g}
                cx={x + 1}
                cy={44 + g * 9}
                rx="3.4"
                ry="5"
                transform={`rotate(${g % 2 ? 22 : -22} ${x + 1} ${44 + g * 9})`}
                fill={FILL}
              />
            ))}
          </g>
        );
      })}
    </>
  ),

  llama: (
    <>
      <circle cx="50" cy="54" r="28" fill={SOFT} />
      <path d="M50 80 Q30 66 46 34 Q52 52 62 44 Q74 62 50 80 Z" fill={FILL} />
      <path d="M50 76 Q40 66 50 48 Q56 62 50 76 Z" fill="rgba(255,255,255,0.3)" />
    </>
  ),

  corona: (
    <>
      <circle cx="50" cy="52" r="30" fill={SOFT} />
      <path d="M26 66 L22 38 L38 52 L50 30 L62 52 L78 38 L74 66 Z" fill={FILL} />
      <rect x="26" y="66" width="48" height="7" rx="2" fill="rgba(255,255,255,0.24)" />
      <circle cx="50" cy="30" r="3" fill="rgba(255,255,255,0.4)" />
    </>
  ),

  camino: (
    <>
      <circle cx="74" cy="24" r="9" fill="rgba(255,255,255,0.2)" />
      <path d="M0 90 L36 90 Q46 62 44 40 L56 40 Q58 66 70 90 L100 90 V100 H0 Z" fill={SOFT} />
      <path d="M40 88 L44 62 M48 56 L50 44" stroke={LINE} strokeWidth="1.6" strokeDasharray="4 4" fill="none" />
    </>
  ),

  vitral: (
    <>
      <path d="M30 82 V40 Q50 18 70 40 V82 Z" fill={SOFT} />
      <path d="M30 82 V40 Q50 18 70 40 V82 Z" fill="none" stroke={LINE} strokeWidth="0.9" />
      <line x1="50" y1="22" x2="50" y2="82" stroke={LINE} strokeWidth="0.7" />
      <line x1="30" y1="56" x2="70" y2="56" stroke={LINE} strokeWidth="0.7" />
      <path d="M38 82 V60 Q50 48 62 60 V82 Z" fill={FILL} />
    </>
  ),

  estrellas: (
    <>
      {Array.from({ length: 22 }).map((_, i) => {
        const x = ((i * 37) % 97) + 2;
        const y = ((i * 53) % 74) + 4;
        const r = 0.8 + ((i * 7) % 3) * 0.6;
        return <circle key={i} cx={x} cy={y} r={r} fill="rgba(255,255,255,0.45)" />;
      })}
      <path d="M22 30 L24 36 L30 38 L24 40 L22 46 L20 40 L14 38 L20 36 Z" fill="rgba(255,255,255,0.5)" />
      <path d="M0 84 Q30 72 60 84 T100 78 V100 H0 Z" fill={SOFT} />
    </>
  ),
};

/* --------------------------------------------------- elección del motivo */

/**
 * Palabras que apuntan a cada motivo. Se busca en el título y en el subtítulo,
 * sin tildes ni mayúsculas.
 */
const KEYWORDS: [MotifId, string[]][] = [
  ["cruz", ["cruz", "calvario", "salvacion", "redencion", "sacrificio", "perdon", "gracia", "arrepentimiento", "evangelio", "cristo", "jesus", "viernes santo", "sangre"]],
  ["paloma", ["espiritu", "santo", "paz", "consuelo", "pentecostes", "avivamiento", "uncion", "dones"]],
  ["libro", ["biblia", "palabra", "estudio", "curso", "escritura", "doctrina", "teologia", "leer", "lectura", "panorama", "hermeneutica", "escuela", "ensenanza", "discipulado", "academia", "clase", "leccion"]],
  ["notas", ["musica", "cancion", "alabanza", "adoracion", "coro", "himno", "album", "banda", "instrumento", "guitarra", "piano", "voz", "ensayo", "concierto", "worship"]],
  ["templo", ["iglesia", "congregacion", "templo", "culto", "comunidad", "miembros", "ministerio", "celula", "grupo", "reunion", "asamblea", "servicio"]],
  ["manos", ["ayuda", "social", "fundacion", "voluntariado", "donacion", "servir", "necesidad", "pobreza", "alimentos", "misericordia", "solidaridad", "familia", "huerfanos", "viudas", "hambre", "salud", "medica"]],
  ["montanas", ["fe", "montana", "prueba", "monte", "desafio", "proposito", "llamado", "vision", "mision", "misionero", "nacion", "camino dificil", "victoria"]],
  ["aguas", ["agua", "bautismo", "rio", "mar", "manantial", "fuente", "sed", "pozo", "lluvia", "olas", "tormenta", "barca"]],
  ["amanecer", ["esperanza", "nuevo", "manana", "amanecer", "devocional", "diario", "comenzar", "renuevo", "restauracion", "luz", "despertar", "madrugada"]],
  ["trigo", ["cosecha", "siembra", "sembrar", "fruto", "semilla", "campo", "mayordomia", "provision", "abundancia", "pan"]],
  ["llama", ["fuego", "pasion", "avivar", "celo", "oracion", "intercesion", "clamor", "ayuno", "vigilia", "altar"]],
  ["corona", ["reino", "rey", "senor", "gloria", "eternidad", "cielo", "recompensa", "corona", "majestad", "trono", "soberania"]],
  ["camino", ["camino", "viaje", "peregrino", "seguir", "pasos", "direccion", "guia", "decision", "futuro", "plan"]],
  ["vitral", ["historia", "tradicion", "santos", "herencia", "raices", "legado", "patrimonio"]],
  ["estrellas", ["noche", "estrella", "promesa", "abraham", "navidad", "adviento", "nacimiento", "belen", "milagro"]],
  ["cielo", ["cielo", "nube", "ascension", "arriba", "celestial", "aire", "vuelo", "libertad"]],
];

/** Motivo por defecto según el tipo de contenido, cuando el título no dice nada. */
const BY_KIND: Record<string, MotifId> = {
  song: "notas",
  album: "notas",
  playlist: "notas",
  artist: "notas",
  podcast: "paloma",
  sermon: "cruz",
  video: "cielo",
  movie: "montanas",
  series: "montanas",
  course: "libro",
  devotional: "amanecer",
  plan: "camino",
  church: "templo",
  ministry: "templo",
  group: "templo",
  event: "estrellas",
  foundationCase: "manos",
  volunteer: "manos",
  prayer: "llama",
  bible: "libro",
  user: "cielo",
};

const MOTIF_IDS = Object.keys(SHAPES) as MotifId[];

/** Quita tildes y mayúsculas para comparar. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * ¿Aparece la palabra clave en el título? Se compara palabra por palabra, no
 * como trozo suelto: si no, "pan" caería dentro de "Panorama" y "fe" dentro de
 * "confesión". Se aceptan el plural y el femenino (agua/aguas, santo/santa).
 */
function matches(words: string[], key: string): boolean {
  const parts = key.split(" ");
  if (parts.length > 1) {
    // Clave de varias palabras: buscarlas seguidas.
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((part, j) => same(words[i + j], part))) return true;
    }
    return false;
  }
  return words.some((w) => same(w, key));
}

/** Igual, o el mismo con plural o cambio de género al final. */
function same(word: string, key: string): boolean {
  if (word === key) return true;
  if (word === key + "s" || word === key + "es") return true;
  if (key.endsWith("o") && (word === key.slice(0, -1) + "a" || word === key.slice(0, -1) + "as")) {
    return true;
  }
  return false;
}

/**
 * Elige el motivo: primero por lo que dice el título, después por el tipo de
 * contenido y, si no hay nada, uno estable derivado del identificador.
 */
export function pickMotif(options: {
  title?: string;
  kind?: string;
  seed: string;
}): MotifId {
  const words = fold(options.title ?? "").split(/[^a-z0-9]+/).filter(Boolean);

  if (words.length > 0) {
    for (const [motif, keys] of KEYWORDS) {
      if (keys.some((k) => matches(words, k))) return motif;
    }
  }

  if (options.kind && BY_KIND[options.kind]) return BY_KIND[options.kind];

  return MOTIF_IDS[hashIndex(options.seed, MOTIF_IDS.length)];
}

/**
 * El tipo de contenido deducido de la ruta: `/music/albums/abc` da "album".
 * Así una tarjeta no tiene que declarar su tipo dos veces: ya lo dice su enlace.
 */
const ROUTE_KINDS: Record<string, string> = {
  sermons: "sermon",
  songs: "song",
  albums: "album",
  playlists: "playlist",
  artists: "artist",
  podcasts: "podcast",
  videos: "video",
  movies: "movie",
  series: "series",
  courses: "course",
  devotionals: "devotional",
  plans: "plan",
  churches: "church",
  ministries: "ministry",
  groups: "group",
  events: "event",
  foundation: "foundationCase",
  volunteering: "volunteer",
  prayer: "prayer",
  bible: "bible",
  profile: "user",
  music: "song",
};

export function kindFromHref(href?: string): string | undefined {
  if (!href) return undefined;
  const parts = href.split("?")[0].split("#")[0].split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const kind = ROUTE_KINDS[parts[i]];
    if (kind) return kind;
  }
  return undefined;
}

/** Pinta el motivo indicado dentro de la portada. */
export function MotifArt({ motif }: { motif: MotifId }) {
  return (
    <svg
      className="absolute inset-0 size-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {SHAPES[motif]}
    </svg>
  );
}
