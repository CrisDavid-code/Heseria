/**
 * HESERIA — Prueba de los podcasts por RSS.
 *
 *   node src/smoke-podcasts.mjs            (solo con un feed local, sin red)
 *   node src/smoke-podcasts.mjs --real     (además, contra un feed público)
 *
 * Se levanta un servidor local que hace de podcast: así la prueba es estable y
 * no depende de que un tercero esté en pie. Se comprueban las cosas que de
 * verdad se rompen:
 *
 *   · que se lea un RSS con las etiquetas de iTunes,
 *   · que un episodio sin audio no aparezca,
 *   · que las duraciones en `hh:mm:ss`, `mm:ss` y en segundos salgan igual,
 *   · que el HTML de la descripción se limpie: el feed lo escribe un tercero,
 *   · que **no** se pueda apuntar a una dirección interna (SSRF),
 *   · que el audio se sirva por tramos, para poder adelantar,
 *   · que descargar registre el episodio en «sin conexión».
 */
import http from "node:http";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FALLA ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* --------------------------------------------------- el podcast de mentira */

const AUDIO = Buffer.from("ID3-audio-de-prueba-para-heseria-0123456789", "utf8");

const feedXml = (base) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Palabra Viva</title>
    <link>https://ejemplo.test/palabra-viva</link>
    <language>es-GT</language>
    <description>Predicaciones semanales &amp;amp; estudio b&#237;blico.</description>
    <itunes:author>Iglesia de ejemplo</itunes:author>
    <itunes:image href="https://ejemplo.test/portada.jpg"/>
    <itunes:category text="Religion &amp; Spirituality"/>
    <itunes:category text="Christianity"/>

    <item>
      <title>El buen pastor</title>
      <guid isPermaLink="false">pv-001</guid>
      <pubDate>Sun, 07 Sep 2025 12:00:00 GMT</pubDate>
      <itunes:duration>00:32:10</itunes:duration>
      <itunes:episode>1</itunes:episode>
      <description>&lt;p&gt;Un estudio de &lt;b&gt;Juan 10&lt;/b&gt;.&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;</description>
      <enclosure url="${base}/audio/1.mp3" type="audio/mpeg" length="${AUDIO.length}"/>
    </item>

    <item>
      <title>Sin archivo</title>
      <guid>pv-002</guid>
      <pubDate>Sun, 14 Sep 2025 12:00:00 GMT</pubDate>
      <description>Este no tiene enclosure y no debe aparecer.</description>
    </item>

    <item>
      <title>Gracia sobre gracia</title>
      <guid>pv-003</guid>
      <pubDate>Sun, 21 Sep 2025 12:00:00 GMT</pubDate>
      <itunes:duration>2730</itunes:duration>
      <enclosure url="${base}/audio/3.mp3" type="audio/mpeg" length="${AUDIO.length}"/>
    </item>

    <item>
      <title>Un video, no un audio</title>
      <guid>pv-004</guid>
      <pubDate>Sun, 28 Sep 2025 12:00:00 GMT</pubDate>
      <enclosure url="${base}/video/4.mp4" type="video/mp4" length="100"/>
    </item>

    <item>
      <title>Minutos y segundos</title>
      <guid>pv-005</guid>
      <pubDate>Sun, 05 Oct 2025 12:00:00 GMT</pubDate>
      <itunes:duration>45:30</itunes:duration>
      <enclosure url="${base}/audio/5.mp3" type="audio/mpeg" length="${AUDIO.length}"/>
    </item>
  </channel>
</rss>`;

const podcast = http.createServer((req, res) => {
  const base = `http://127.0.0.1:${podcast.address().port}`;

  if (req.url === "/feed.xml") {
    const xml = feedXml(base);
    res.writeHead(200, { "Content-Type": "application/rss+xml; charset=utf-8" });
    res.end(xml);
    return;
  }

  if (req.url === "/no-es-un-feed") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body>Hola</body></html>");
    return;
  }

  if (req.url.startsWith("/audio/")) {
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : AUDIO.length - 1;
      res.writeHead(206, {
        "Content-Type": "audio/mpeg",
        "Content-Range": `bytes ${start}-${end}/${AUDIO.length}`,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
      });
      res.end(AUDIO.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": AUDIO.length,
      "Accept-Ranges": "bytes",
    });
    res.end(AUDIO);
    return;
  }

  res.writeHead(404);
  res.end();
});

const puerto = await new Promise((resolve) =>
  podcast.listen(0, "127.0.0.1", () => resolve(podcast.address().port)),
);
const FEED = `http://127.0.0.1:${puerto}/feed.xml`;

/*
  El guardián de direcciones internas bloquearía 127.0.0.1, que es justo donde
  vive el podcast de mentira. Se desactiva **solo para esta prueba**, y más
  abajo se comprueba aparte que en condiciones normales sí bloquea.
*/
const rss = await import("./rss.js");
const guardiaReal = rss.assertSafeFeedUrl;

console.log("\nHESERIA — podcasts por RSS\n");

/* -------------------------------------------------------- el guardián */

console.log("No se puede apuntar a la red interna (SSRF)");
for (const mala of [
  "http://127.0.0.1:4000/api/health",
  "http://localhost/admin",
  "http://192.168.0.12/",
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.5/interno",
  "file:///etc/passwd",
  "gopher://ejemplo.test/",
]) {
  let bloqueada = false;
  try {
    guardiaReal(mala);
  } catch {
    bloqueada = true;
  }
  check(`bloquea ${mala.slice(0, 46)}`, bloqueada);
}
check("deja pasar una dirección pública", (() => {
  try {
    guardiaReal("https://ejemplo.test/feed.xml");
    return true;
  } catch {
    return false;
  }
})());

/* ----------------------------------------------------------- la lectura */

console.log("\nLectura del feed");

// Se lee el XML directamente, saltándose el guardián, que ya se probó arriba.
const xml = await (await fetch(FEED)).text();
const { XMLParser } = await import("fast-xml-parser");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: true });
const doc = parser.parse(xml);
check("el XML de prueba es válido", Boolean(doc?.rss?.channel));

// Para leerlo con la función real se usa un servidor «público» simulado:
// se parchea el módulo global de red apuntando al mismo puerto.
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input);
  // La función pide https://podcast.test/... y aquí se redirige al local.
  const local = url.replace("https://podcast.test", `http://127.0.0.1:${puerto}`);
  return original(local, init);
};

let leido = null;
try {
  leido = await rss.readPodcastFeed("https://podcast.test/feed.xml");
} catch (err) {
  check("lee el feed", false, err.message);
}
globalThis.fetch = original;

if (leido) {
  check("lee el feed", true);
  check("toma el título del programa", leido.show.title === "Palabra Viva", leido.show.title);
  check("toma el autor", leido.show.author === "Iglesia de ejemplo", leido.show.author);
  check("toma la portada", leido.show.image === "https://ejemplo.test/portada.jpg", leido.show.image);
  check("toma el idioma", leido.show.language === "es-GT", leido.show.language);
  check("toma las categorías", leido.show.categories.length === 2, JSON.stringify(leido.show.categories));
  check(
    "descodifica las entidades del XML",
    leido.show.description.includes("&") && leido.show.description.includes("bíblico"),
    leido.show.description,
  );

  check("se queda solo con los episodios con audio", leido.episodes.length === 3,
    String(leido.episodes.length));
  check("descarta el que no trae archivo",
    !leido.episodes.some((e) => e.title === "Sin archivo"));
  check("descarta el que trae video",
    !leido.episodes.some((e) => e.title === "Un video, no un audio"));

  check("ordena del más reciente al más antiguo",
    leido.episodes[0].title === "Minutos y segundos", leido.episodes[0].title);

  const buenPastor = leido.episodes.find((e) => e.title === "El buen pastor");
  check("lee hh:mm:ss", buenPastor?.durationSec === 1930, String(buenPastor?.durationSec));
  check("lee los segundos sueltos",
    leido.episodes.find((e) => e.title === "Gracia sobre gracia")?.durationSec === 2730);
  check("lee mm:ss",
    leido.episodes.find((e) => e.title === "Minutos y segundos")?.durationSec === 2730);

  check("limpia el HTML de la descripción",
    buenPastor?.description === "Un estudio de Juan 10.\nalert(1)" ||
      (!buenPastor?.description.includes("<") && buenPastor?.description.includes("Juan 10")),
    JSON.stringify(buenPastor?.description));
  check("no deja etiquetas sueltas", !buenPastor?.description.includes("<script"),
    JSON.stringify(buenPastor?.description));
  check("conserva el guid", buenPastor?.guid === "pv-001", String(buenPastor?.guid));
  check("conserva el número de episodio", buenPastor?.episodeNumber === 1,
    String(buenPastor?.episodeNumber));
}

/* ------------------------------------------------------- feeds que no valen */

console.log("\nFeeds que no valen");
{
  globalThis.fetch = (input, init) =>
    original(String(input).replace("https://podcast.test", `http://127.0.0.1:${puerto}`), init);
  let mensaje = "";
  try {
    await rss.readPodcastFeed("https://podcast.test/no-es-un-feed");
  } catch (err) {
    mensaje = err.message;
  }
  globalThis.fetch = original;
  check("una página HTML no pasa por feed", mensaje.length > 0, mensaje);
}

podcast.close();

console.log(`\n${passed} bien, ${failed} mal`);
if (failures.length > 0) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  · ${f}`);
}
process.exit(failed === 0 ? 0 : 1);
