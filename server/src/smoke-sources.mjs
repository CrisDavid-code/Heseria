/**
 * HESERIA — Prueba del reconocimiento de enlaces externos.
 *
 *   node src/smoke-sources.mjs
 *
 * Comprueba que un enlace de YouTube o de Spotify, en cualquiera de sus formas,
 * acaba en el reproductor oficial correcto, y —lo que más importa— que **no se
 * cuela nada** que no sea de ellos. El proveedor se deduce del enlace, así que
 * un fallo aquí significaría poder meter una página cualquiera en un iframe
 * dentro del teléfono de la comunidad.
 */
import { parseMediaUrl, parseSpotify, isExternal } from "./media-source.js";

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

const esperado = (entrada, provider, url) => {
  const r = parseMediaUrl(entrada);
  check(
    `${entrada.slice(0, 58)} → ${provider}`,
    r?.provider === provider && r?.url === url,
    JSON.stringify({ provider: r?.provider, url: r?.url }),
  );
};

console.log("\nHESERIA — enlaces externos\n");

console.log("YouTube, en todas sus formas");
esperado("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ");
esperado("https://youtu.be/dQw4w9WgXcQ", "youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ");
esperado("https://m.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ");
esperado("https://music.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ");
esperado("https://www.youtube.com/shorts/abc123XYZ_-", "youtube", "https://www.youtube.com/embed/abc123XYZ_-");
esperado("https://www.youtube.com/live/abc123XYZ_-", "youtube", "https://www.youtube.com/embed/abc123XYZ_-");
esperado("youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ");
{
  const r = parseMediaUrl("https://www.youtube.com/watch?v=abc12345678&list=PLtest123");
  check("conserva la lista cuando el enlace la trae",
    r?.url === "https://www.youtube.com/embed/abc12345678?list=PLtest123", r?.url);
}
{
  const r = parseMediaUrl("https://www.youtube.com/playlist?list=PLtest123");
  check("una lista suelta se incrusta como serie",
    r?.url === "https://www.youtube.com/embed/videoseries?list=PLtest123", r?.url);
}
{
  // Las listas «mix» las genera YouTube por sesión y no se pueden incrustar.
  const r = parseMediaUrl("https://www.youtube.com/watch?v=abc12345678&list=RDabc12345678");
  check("ignora las listas mix, que no se incrustan",
    r?.url === "https://www.youtube.com/embed/abc12345678", r?.url);
}

console.log("\nSpotify");
esperado(
  "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  "spotify",
  "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT",
);
esperado(
  "https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123",
  "spotify",
  "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT",
);
esperado(
  "spotify:album:1DFixLWuPkv3KT3TnV35m3",
  "spotify",
  "https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3",
);
esperado(
  "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  "spotify",
  "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
);
esperado(
  "https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKyQ",
  "spotify",
  "https://open.spotify.com/embed/episode/512ojhOuo1ktJprKbVcKyQ",
);
{
  const r = parseMediaUrl("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
  check("guarda el enlace para abrirlo en su app",
    r?.originalUrl === "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", r?.originalUrl);
}
{
  const r = parseSpotify("https://open.spotify.com/no-existe/abc");
  check("un tipo de Spotify inventado no cuela", r === null, JSON.stringify(r));
}

{
  // Analizar una fuente ya normalizada debe dar lo mismo. Si no, el
  // reproductor de Spotify sale con alto de video y una franja negra debajo.
  const r = parseSpotify("https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT");
  check("reconoce su propia URL de incrustación",
    r?.type === "track" && r?.id === "4cOdK2wGLETKBW3PvgPWqT", JSON.stringify(r));
}
{
  const una = parseMediaUrl("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
  const otra = parseMediaUrl(una.url);
  check("analizarla dos veces da lo mismo", una.url === otra.url, una.url + " vs " + otra.url);
}
{
  const una = parseMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const otra = parseMediaUrl(una.url);
  check("y con YouTube igual", una.url === otra.url, una.url + " vs " + otra.url);
}

console.log("\nVimeo y archivos");
esperado("https://vimeo.com/76979871", "vimeo", "https://player.vimeo.com/video/76979871");
esperado("https://cdn.heseria.app/audio/cancion.mp3", "direct-audio", "https://cdn.heseria.app/audio/cancion.mp3");
esperado("https://cdn.heseria.app/video/clase.mp4", "direct-video", "https://cdn.heseria.app/video/clase.mp4");
esperado("https://cdn.heseria.app/live/stream.m3u8", "hls", "https://cdn.heseria.app/live/stream.m3u8");
{
  const r = parseMediaUrl("/uploads/up_abc.mp3");
  check("un archivo del propio servidor se reconoce",
    r?.kind === "file" && r?.provider === "direct-audio", JSON.stringify(r));
}

console.log("\nLo que NO debe hacerse pasar por YouTube ni por Spotify");
for (const impostor of [
  "https://youtube.com.atacante.example/watch?v=abc12345678",
  "https://notyoutube.com/watch?v=abc12345678",
  "https://open.spotify.com.atacante.example/track/abc",
  "https://spotify.evil.example/track/abc",
]) {
  const r = parseMediaUrl(impostor);
  check(
    `${impostor.slice(0, 52)} no es un proveedor`,
    r?.provider === "unknown",
    String(r?.provider),
  );
}
for (const basura of ["javascript:alert(1)", "data:text/html,<script>", "", "   "]) {
  const r = parseMediaUrl(basura);
  check(`«${basura.slice(0, 24)}» se rechaza`, r === null, JSON.stringify(r));
}

console.log("\nQué cuenta como externo");
check("YouTube es externo", isExternal("youtube"));
check("Spotify es externo", isExternal("spotify"));
check("un archivo propio no lo es", !isExternal("direct-audio"));

console.log(`\n${passed} bien, ${failed} mal`);
if (failures.length > 0) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  · ${f}`);
}
process.exit(failed === 0 ? 0 : 1);
