/**
 * HESERIA — Congregaciones de Guatemala.
 *
 * Sustituye al catálogo de iglesias del dataset original, que era chileno.
 *
 * **Son congregaciones de demostración, no reales.** Los nombres son
 * inventados a propósito: no se debe hacer pasar por verificada la ficha de una
 * iglesia que existe de verdad, ni publicar su dirección o su teléfono sin que
 * ella lo pida. Cuando la plataforma abra el registro, cada congregación creará
 * y confirmará su propia ficha.
 *
 * Lo que **sí es real** son las coordenadas: corresponden a los barrios y
 * ciudades indicados, así que la distancia que calcula la app desde tu GPS es
 * correcta y las iglesias aparecen donde deben en el mapa.
 *
 * Todas son evangélicas —protestantes— por petición expresa. Ninguna es
 * católica, y `denomination` nunca toma ese valor.
 */

/** Denominaciones admitidas. Sirve también para validar altas nuevas. */
export const DENOMINATIONS = [
  "Evangélica",
  "Pentecostal",
  "Bautista",
  "Presbiteriana",
  "Metodista",
  "Carismática",
  "Menonita",
  "Asambleas de Dios",
  "Iglesia de Dios",
  "Nazarena",
];

const COLORS = [
  "from-cyan-500/70 to-blue-700/70",
  "from-violet-500/70 to-purple-800/70",
  "from-teal-400/70 to-emerald-700/70",
  "from-amber-400/70 to-orange-700/70",
  "from-rose-400/70 to-pink-700/70",
  "from-sky-400/70 to-indigo-800/70",
  "from-lime-400/70 to-teal-800/70",
  "from-fuchsia-400/70 to-indigo-800/70",
  "from-indigo-500/70 to-slate-800/70",
  "from-emerald-400/70 to-cyan-800/70",
];

const SERVICES = [
  [
    { day: "Domingo", time: "09:00", type: "Culto principal" },
    { day: "Domingo", time: "17:00", type: "Culto vespertino" },
    { day: "Miércoles", time: "19:00", type: "Estudio bíblico" },
  ],
  [
    { day: "Domingo", time: "10:00", type: "Culto familiar" },
    { day: "Jueves", time: "19:30", type: "Oración" },
  ],
  [
    { day: "Domingo", time: "08:00", type: "Primer culto" },
    { day: "Domingo", time: "11:00", type: "Segundo culto" },
    { day: "Viernes", time: "19:00", type: "Jóvenes" },
  ],
  [
    { day: "Domingo", time: "09:30", type: "Culto" },
    { day: "Martes", time: "19:00", type: "Célula" },
    { day: "Sábado", time: "16:00", type: "Niños" },
  ],
];

/**
 * Cada entrada: nombre, denominación, ciudad, departamento, latitud, longitud.
 * Las coordenadas apuntan al barrio o al centro de la localidad.
 */
const SEED = [
  ["Comunidad Cristiana Monte Alto", "Evangélica", "Ciudad de Guatemala", "Zona 10", 14.5995, -90.5136],
  ["Iglesia Nueva Vida", "Pentecostal", "Ciudad de Guatemala", "Zona 1", 14.6407, -90.5133],
  ["Centro Evangelístico Roca Firme", "Asambleas de Dios", "Ciudad de Guatemala", "Zona 7", 14.6289, -90.5450],
  ["Iglesia Bautista El Buen Pastor", "Bautista", "Ciudad de Guatemala", "Zona 11", 14.6015, -90.5527],
  ["Comunidad de Gracia", "Presbiteriana", "Ciudad de Guatemala", "Zona 15", 14.5931, -90.4787],
  ["Ministerios Manantial de Vida", "Carismática", "Mixco", "Guatemala", 14.6314, -90.6065],
  ["Iglesia Cristiana Camino de Luz", "Evangélica", "Villa Nueva", "Guatemala", 14.5264, -90.5871],
  ["Centro Cristiano Betania", "Iglesia de Dios", "San Miguel Petapa", "Guatemala", 14.5044, -90.5606],
  ["Iglesia Metodista Emanuel", "Metodista", "Ciudad de Guatemala", "Zona 9", 14.6093, -90.5192],
  ["Comunidad Cristiana Getsemaní", "Evangélica", "Antigua Guatemala", "Sacatepéquez", 14.5586, -90.7295],
  ["Iglesia Evangélica Príncipe de Paz", "Pentecostal", "Quetzaltenango", "Quetzaltenango", 14.8347, -91.5180],
  ["Centro Bíblico Peniel", "Bautista", "Quetzaltenango", "Quetzaltenango", 14.8450, -91.5100],
  ["Iglesia Cristiana Horeb", "Evangélica", "Escuintla", "Escuintla", 14.3050, -90.7850],
  ["Comunidad Nueva Alianza", "Menonita", "Chimaltenango", "Chimaltenango", 14.6611, -90.8208],
  ["Iglesia Cristiana Shalom", "Nazarena", "Cobán", "Alta Verapaz", 15.4708, -90.3711],
  ["Ministerio Vida Abundante", "Carismática", "Huehuetenango", "Huehuetenango", 15.3194, -91.4708],
  ["Iglesia Evangélica Bet-El", "Evangélica", "Puerto Barrios", "Izabal", 15.7278, -88.5944],
  ["Centro Cristiano Jerusalén", "Asambleas de Dios", "Retalhuleu", "Retalhuleu", 14.5361, -91.6781],
  ["Comunidad Cristiana El Redentor", "Presbiteriana", "Santa Lucía Cotzumalguapa", "Escuintla", 14.3325, -91.0233],
  ["Iglesia Cristiana Cristo Vive", "Evangélica", "Panajachel", "Sololá", 14.7408, -91.1567],
];

/** Genera valores estables: la misma iglesia siempre igual. */
function seeded(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
const between = (n, min, max) => Math.floor(seeded(n) * (max - min + 1)) + min;

/**
 * Construye el catálogo de iglesias.
 * `pastors` son identificadores de usuario a los que asignar el pastorado.
 */
export function guatemalanChurches(pastors = []) {
  return SEED.map(([name, denomination, city, region, lat, lng], i) => ({
    id: `c${i + 1}`,
    name,
    denomination,
    city,
    region,
    country: "Guatemala",
    language: "Español",
    lat,
    lng,
    description:
      `Congregación ${denomination.toLowerCase()} en ${city}. Cultos dominicales, ` +
      "grupos pequeños durante la semana y trabajo social en la comunidad.",
    members: between(i + 3, 90, 2400),
    services: SERVICES[i % SERVICES.length],
    ministries: [],
    pastorId: pastors[i % Math.max(pastors.length, 1)] ?? null,
    contact: {
      email: `contacto@${name.toLowerCase().replace(/[^a-z]+/g, "")}.gt`,
      phone: `+502 ${between(i + 11, 2200, 7899)} ${between(i + 17, 1000, 9999)}`,
      site: "",
    },
    color: COLORS[i % COLORS.length],
    /** Se recalcula contra la posición real de quien consulta. */
    distanceKm: 0,
    /** Marca explícita: no es una congregación real. */
    demo: true,
  }));
}
