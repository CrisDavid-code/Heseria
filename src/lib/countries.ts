/**
 * HESERIA — Países.
 *
 * Lista completa en español, con su código ISO 3166-1 alfa-2. Se usa en el
 * registro y en el perfil, tanto para elegir de la lista como para escribir y
 * que filtre.
 *
 * El orden es alfabético por nombre en español. La búsqueda ignora tildes, así
 * que «peru» encuentra «Perú» y «panama» encuentra «Panamá».
 */

export interface Country {
  /** ISO 3166-1 alfa-2. Es lo que conviene guardar, no el nombre. */
  code: string;
  name: string;
  /** Bandera en emoji, derivada del código. */
  flag: string;
}

/** Convierte «GT» en 🇬🇹 usando los caracteres regionales de Unicode. */
function flagOf(code: string): string {
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

const NAMES: [string, string][] = [
  ["AF", "Afganistán"], ["AL", "Albania"], ["DE", "Alemania"], ["AD", "Andorra"],
  ["AO", "Angola"], ["AI", "Anguila"], ["AG", "Antigua y Barbuda"], ["SA", "Arabia Saudí"],
  ["DZ", "Argelia"], ["AR", "Argentina"], ["AM", "Armenia"], ["AW", "Aruba"],
  ["AU", "Australia"], ["AT", "Austria"], ["AZ", "Azerbaiyán"], ["BS", "Bahamas"],
  ["BD", "Bangladés"], ["BB", "Barbados"], ["BH", "Baréin"], ["BE", "Bélgica"],
  ["BZ", "Belice"], ["BJ", "Benín"], ["BM", "Bermudas"], ["BY", "Bielorrusia"],
  ["BO", "Bolivia"], ["BA", "Bosnia y Herzegovina"], ["BW", "Botsuana"], ["BR", "Brasil"],
  ["BN", "Brunéi"], ["BG", "Bulgaria"], ["BF", "Burkina Faso"], ["BI", "Burundi"],
  ["BT", "Bután"], ["CV", "Cabo Verde"], ["KH", "Camboya"], ["CM", "Camerún"],
  ["CA", "Canadá"], ["QA", "Catar"], ["TD", "Chad"], ["CL", "Chile"],
  ["CN", "China"], ["CY", "Chipre"], ["VA", "Ciudad del Vaticano"], ["CO", "Colombia"],
  ["KM", "Comoras"], ["KP", "Corea del Norte"], ["KR", "Corea del Sur"], ["CI", "Costa de Marfil"],
  ["CR", "Costa Rica"], ["HR", "Croacia"], ["CU", "Cuba"], ["CW", "Curazao"],
  ["DK", "Dinamarca"], ["DM", "Dominica"], ["EC", "Ecuador"], ["EG", "Egipto"],
  ["SV", "El Salvador"], ["AE", "Emiratos Árabes Unidos"], ["ER", "Eritrea"], ["SK", "Eslovaquia"],
  ["SI", "Eslovenia"], ["ES", "España"], ["US", "Estados Unidos"], ["EE", "Estonia"],
  ["SZ", "Esuatini"], ["ET", "Etiopía"], ["PH", "Filipinas"], ["FI", "Finlandia"],
  ["FJ", "Fiyi"], ["FR", "Francia"], ["GA", "Gabón"], ["GM", "Gambia"],
  ["GE", "Georgia"], ["GH", "Ghana"], ["GI", "Gibraltar"], ["GD", "Granada"],
  ["GR", "Grecia"], ["GL", "Groenlandia"], ["GP", "Guadalupe"], ["GU", "Guam"],
  ["GT", "Guatemala"], ["GF", "Guayana Francesa"], ["GG", "Guernsey"], ["GN", "Guinea"],
  ["GQ", "Guinea Ecuatorial"], ["GW", "Guinea-Bisáu"], ["GY", "Guyana"], ["HT", "Haití"],
  ["HN", "Honduras"], ["HU", "Hungría"], ["IN", "India"], ["ID", "Indonesia"],
  ["IQ", "Irak"], ["IR", "Irán"], ["IE", "Irlanda"], ["IS", "Islandia"],
  ["KY", "Islas Caimán"], ["CK", "Islas Cook"], ["FO", "Islas Feroe"], ["MV", "Islas Maldivas"],
  ["FK", "Islas Malvinas"], ["MH", "Islas Marshall"], ["SB", "Islas Salomón"], ["TC", "Islas Turcas y Caicos"],
  ["VG", "Islas Vírgenes Británicas"], ["VI", "Islas Vírgenes de EE. UU."], ["IL", "Israel"], ["IT", "Italia"],
  ["JM", "Jamaica"], ["JP", "Japón"], ["JE", "Jersey"], ["JO", "Jordania"],
  ["KZ", "Kazajistán"], ["KE", "Kenia"], ["KG", "Kirguistán"], ["KI", "Kiribati"],
  ["KW", "Kuwait"], ["LA", "Laos"], ["LS", "Lesoto"], ["LV", "Letonia"],
  ["LB", "Líbano"], ["LR", "Liberia"], ["LY", "Libia"], ["LI", "Liechtenstein"],
  ["LT", "Lituania"], ["LU", "Luxemburgo"], ["MK", "Macedonia del Norte"], ["MG", "Madagascar"],
  ["MY", "Malasia"], ["MW", "Malaui"], ["ML", "Malí"], ["MT", "Malta"],
  ["MA", "Marruecos"], ["MQ", "Martinica"], ["MU", "Mauricio"], ["MR", "Mauritania"],
  ["MX", "México"], ["FM", "Micronesia"], ["MD", "Moldavia"], ["MC", "Mónaco"],
  ["MN", "Mongolia"], ["ME", "Montenegro"], ["MS", "Montserrat"], ["MZ", "Mozambique"],
  ["MM", "Myanmar"], ["NA", "Namibia"], ["NR", "Nauru"], ["NP", "Nepal"],
  ["NI", "Nicaragua"], ["NE", "Níger"], ["NG", "Nigeria"], ["NO", "Noruega"],
  ["NC", "Nueva Caledonia"], ["NZ", "Nueva Zelanda"], ["OM", "Omán"], ["NL", "Países Bajos"],
  ["PK", "Pakistán"], ["PW", "Palaos"], ["PS", "Palestina"], ["PA", "Panamá"],
  ["PG", "Papúa Nueva Guinea"], ["PY", "Paraguay"], ["PE", "Perú"], ["PF", "Polinesia Francesa"],
  ["PL", "Polonia"], ["PT", "Portugal"], ["PR", "Puerto Rico"], ["HK", "RAE de Hong Kong"],
  ["MO", "RAE de Macao"], ["GB", "Reino Unido"], ["CF", "República Centroafricana"], ["CZ", "República Checa"],
  ["CG", "República del Congo"], ["CD", "República Democrática del Congo"], ["DO", "República Dominicana"],
  ["RE", "Reunión"], ["RW", "Ruanda"], ["RO", "Rumanía"], ["RU", "Rusia"],
  ["WS", "Samoa"], ["AS", "Samoa Americana"], ["BL", "San Bartolomé"], ["KN", "San Cristóbal y Nieves"],
  ["SM", "San Marino"], ["MF", "San Martín"], ["PM", "San Pedro y Miquelón"], ["VC", "San Vicente y las Granadinas"],
  ["SH", "Santa Elena"], ["LC", "Santa Lucía"], ["ST", "Santo Tomé y Príncipe"], ["SN", "Senegal"],
  ["RS", "Serbia"], ["SC", "Seychelles"], ["SL", "Sierra Leona"], ["SG", "Singapur"],
  ["SX", "Sint Maarten"], ["SY", "Siria"], ["SO", "Somalia"], ["LK", "Sri Lanka"],
  ["ZA", "Sudáfrica"], ["SD", "Sudán"], ["SS", "Sudán del Sur"], ["SE", "Suecia"],
  ["CH", "Suiza"], ["SR", "Surinam"], ["TH", "Tailandia"], ["TW", "Taiwán"],
  ["TZ", "Tanzania"], ["TJ", "Tayikistán"], ["TL", "Timor Oriental"], ["TG", "Togo"],
  ["TO", "Tonga"], ["TT", "Trinidad y Tobago"], ["TN", "Túnez"], ["TM", "Turkmenistán"],
  ["TR", "Turquía"], ["TV", "Tuvalu"], ["UA", "Ucrania"], ["UG", "Uganda"],
  ["UY", "Uruguay"], ["UZ", "Uzbekistán"], ["VU", "Vanuatu"], ["VE", "Venezuela"],
  ["VN", "Vietnam"], ["YE", "Yemen"], ["DJ", "Yibuti"], ["ZM", "Zambia"],
  ["ZW", "Zimbabue"],
];

export const COUNTRIES: Country[] = NAMES.map(([code, name]) => ({
  code,
  name,
  flag: flagOf(code),
})).sort((a, b) => a.name.localeCompare(b.name, "es"));

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));

export const countryByCode = (code?: string) => (code ? byCode.get(code.toUpperCase()) : undefined);

/** Acepta el código o el nombre; sirve para datos antiguos guardados por nombre. */
export function findCountry(value?: string): Country | undefined {
  if (!value) return undefined;
  return (
    byCode.get(value.toUpperCase()) ??
    COUNTRIES.find((c) => fold(c.name) === fold(value))
  );
}

/** Normaliza para comparar: sin tildes, sin mayúsculas. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Filtra por nombre o código. Vacío devuelve la lista entera. */
export function searchCountries(query: string): Country[] {
  const term = fold(query.trim());
  if (!term) return COUNTRIES;
  const starts: Country[] = [];
  const contains: Country[] = [];
  for (const country of COUNTRIES) {
    const name = fold(country.name);
    if (name.startsWith(term) || fold(country.code) === term) starts.push(country);
    else if (name.includes(term)) contains.push(country);
  }
  return [...starts, ...contains];
}
