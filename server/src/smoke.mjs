/**
 * HESERIA — Prueba de humo de la API.
 *
 *   node src/smoke.mjs [http://localhost:4000]
 *
 * Recorre el ciclo completo: registro, sesión, lectura del catálogo, escritura
 * en comunidad y oración, biblioteca, publicación de contenido, notificaciones
 * y métricas. Sale con código 1 si algo falla.
 */
const BASE = process.argv[2] ?? "http://localhost:4000";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FALLA ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(method, path, { token, body, raw } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return raw ? { res, data } : { status: res.status, data };
}

const get = (p, o) => call("GET", p, o);
const post = (p, body, o) => call("POST", p, { ...o, body });
const patch = (p, body, o) => call("PATCH", p, { ...o, body });
const del = (p, o) => call("DELETE", p, o);

console.log(`\nHESERIA — prueba de humo contra ${BASE}\n`);

/* ------------------------------------------------------------ 1. salud */

console.log("Salud y medios");
{
  const { status, data } = await get("/api/health");
  check("GET /api/health", status === 200 && data.ok, `estado ${status}`);
  check("declara sus capacidades", data.features?.realtime === true && data.features?.calls === true,
    JSON.stringify(data.features));

  const manifest = await get("/api/media/manifest");
  check("manifest de medios con 4 piezas", manifest.data?.length === 4, `${manifest.data?.length}`);

  const audio = await fetch(`${BASE}/media/cielo-abierto.mp3`, { method: "HEAD" });
  check("audio servido", audio.ok && audio.headers.get("content-type")?.includes("audio"), audio.status);

  const video = await fetch(`${BASE}/media/heseria-demo.mp4`, { method: "HEAD" });
  check("video servido", video.ok && video.headers.get("content-type")?.includes("video"), video.status);

  const range = await fetch(`${BASE}/media/heseria-demo.mp4`, { headers: { Range: "bytes=0-1023" } });
  check("video admite saltos (206)", range.status === 206, range.status);
}

/* -------------------------------------------------------- 2. registro */

console.log("\nRegistro e inicio de sesión");
const unique = Date.now().toString(36);
const newEmail = `prueba.${unique}@heseria.app`;
let token = null;
let refreshToken = null;
let userId = null;
{
  const weak = await post("/api/auth/register", {
    firstName: "Ana", lastName: "Prueba", email: newEmail, password: "123", acceptedTerms: true,
  });
  check("rechaza contraseña débil", weak.status === 400, `estado ${weak.status}`);

  const noTerms = await post("/api/auth/register", {
    firstName: "Ana", lastName: "Prueba", email: newEmail, password: "clave-seguraaa", acceptedTerms: false,
  });
  check("exige aceptar términos", noTerms.status === 400, `estado ${noTerms.status}`);

  const { status, data } = await post("/api/auth/register", {
    firstName: "Ana", lastName: "Prueba", email: newEmail, password: "clave-seguraaa",
    city: "Santiago", country: "Chile", acceptedTerms: true,
  });
  check("registro correcto", status === 201 && Boolean(data.accessToken), `estado ${status}`);
  check("no devuelve la contraseña", !JSON.stringify(data).includes("password_hash"));
  token = data.accessToken;
  refreshToken = data.refreshToken;
  userId = data.user?.id;

  const dup = await post("/api/auth/register", {
    firstName: "Ana", lastName: "Prueba", email: newEmail, password: "clave-seguraaa", acceptedTerms: true,
  });
  check("rechaza correo duplicado", dup.status === 409, `estado ${dup.status}`);

  const bad = await post("/api/auth/login", { email: newEmail, password: "incorrecta" });
  check("rechaza contraseña incorrecta", bad.status === 401, `estado ${bad.status}`);

  const good = await post("/api/auth/login", { email: newEmail, password: "clave-seguraaa" });
  check("inicia sesión", good.status === 200 && Boolean(good.data.accessToken), `estado ${good.status}`);

  const me = await get("/api/auth/me", { token });
  check("GET /me con token", me.status === 200 && me.data.email === newEmail, `estado ${me.status}`);

  const anon = await get("/api/auth/me");
  check("GET /me sin token da 401", anon.status === 401, `estado ${anon.status}`);

  const refreshed = await post("/api/auth/refresh", { refreshToken });
  check("renueva la sesión", refreshed.status === 200 && Boolean(refreshed.data.accessToken), `estado ${refreshed.status}`);
  token = refreshed.data.accessToken ?? token;
  refreshToken = refreshed.data.refreshToken ?? refreshToken;

  const reused = await post("/api/auth/refresh", { refreshToken: refreshed.data ? refreshToken : "x" });
  void reused;

  const updated = await patch("/api/auth/me", { bio: "Probando Heseria", city: "Valparaíso" }, { token });
  check("actualiza el perfil", updated.status === 200 && updated.data.bio === "Probando Heseria", `estado ${updated.status}`);
}

/* --------------------------------------------- 3. sesión de administración */

console.log("\nSesión de administración");
let adminToken = null;
{
  const { status, data } = await post("/api/auth/login", { email: "admin@heseria.app", password: "heseria" });
  check("entra el administrador global", status === 200 && data.user?.role === "admin", `estado ${status}`);
  adminToken = data.accessToken;
}

/* --------------------------------------------------------- 4. catálogo */

console.log("\nCatálogo");
{
  // Cantidades mínimas: la base es de trabajo, así que el catálogo puede haber
  // crecido desde la siembra. Lo que se comprueba es que responda y traiga
  // al menos lo sembrado.
  const cases = [
    ["/api/churches", 8], ["/api/ministries", 12], ["/api/music/songs", 24],
    ["/api/music/artists", 8], ["/api/music/albums", 8], ["/api/music/playlists", 6],
    ["/api/podcasts", 6], ["/api/sermons", 12], ["/api/videos", 18],
    ["/api/movies", 12], ["/api/series", 6], ["/api/courses", 20],
    ["/api/devotionals", 12], ["/api/plans", 12], ["/api/events", 12],
    ["/api/groups", 8], ["/api/foundation/cases", 10], ["/api/foundation/volunteer", 6],
    ["/api/bible/books", 34], ["/api/bible/versions", 6],
  ];
  for (const [path, expected] of cases) {
    const { status, data } = await get(path);
    check(
      `GET ${path} → ${expected} o más`,
      status === 200 && Array.isArray(data) && data.length >= expected,
      `${status} / ${data?.length}`,
    );
  }

  const chapter = await get("/api/bible/juan/3");
  check("GET /api/bible/juan/3", chapter.status === 200 && chapter.data.verses?.length > 0, `estado ${chapter.status}`);

  const missing = await get("/api/bible/inexistente/1");
  check("capítulo inexistente da 404", missing.status === 404, `estado ${missing.status}`);

  const song = await get("/api/music/songs/s1");
  check("canción con audio real", Boolean(song.data?.audioUrl), song.data?.audioUrl);

  const movie = await get("/api/movies/mv1");
  check("película con video real", Boolean(movie.data?.videoUrl), movie.data?.videoUrl);

  const course = await get("/api/courses/co1");
  check("lección con video real", Boolean(course.data?.modules?.[0]?.lessons?.[0]?.videoUrl));

  const search = await get("/api/search?q=adoracion");
  check("búsqueda sin acentos encuentra resultados", search.status === 200 && search.data.length > 0, `${search.data?.length}`);

  const today = await get("/api/devotionals/today");
  check("devocional del día", today.status === 200 && Boolean(today.data.id), `estado ${today.status}`);

  // Ciudad de Guatemala, Zona 10. Las distancias se calculan de verdad.
  const nearby = await get("/api/churches/nearby?lat=14.5995&lng=-90.5136&radius=25");
  check(
    "iglesias cercanas ordenadas por distancia real",
    nearby.status === 200 &&
      nearby.data.located === true &&
      nearby.data.churches.length > 1 &&
      nearby.data.churches[0].distanceKm <= nearby.data.churches[1].distanceKm,
    JSON.stringify(nearby.data.churches?.slice(0, 2).map((c) => c.distanceKm)),
  );

  const lejos = await get("/api/churches/nearby?lat=14.5995&lng=-90.5136&radius=5");
  check(
    "el radio recorta el resultado",
    lejos.data.total < nearby.data.total && lejos.data.churches.every((c) => c.distanceKm <= 5),
    `${lejos.data.total} de ${nearby.data.total}`,
  );

  const sinGps = await get("/api/churches/nearby");
  check(
    "sin coordenadas no inventa distancias",
    sinGps.data.located === false && sinGps.data.churches.every((c) => c.distanceKm === null),
  );

  const denominaciones = await get("/api/churches-denominations");
  check(
    "solo hay denominaciones evangélicas",
    denominaciones.status === 200 &&
      denominaciones.data.length > 0 &&
      !denominaciones.data.some((d) => /cat[oó]lic/i.test(d)),
    JSON.stringify(denominaciones.data),
  );

  const bautistas = await get("/api/churches/nearby?lat=14.5995&lng=-90.5136&denomination=Bautista");
  check(
    "filtra por denominación",
    bautistas.data.churches.every((c) => c.denomination === "Bautista"),
  );

  const enGuatemala = await get("/api/churches");
  check(
    "todas las iglesias están en Guatemala y con coordenadas",
    enGuatemala.data.every((c) => c.country === "Guatemala" && Number.isFinite(c.lat)),
  );
}

/* --------------------------------------------------------- 5. comunidad */

console.log("\nComunidad, oración y mensajes");
let postId = null;
{
  const feed = await get("/api/community/feed");
  check("feed público", feed.status === 200 && feed.data.length === 12, `${feed.data?.length}`);

  const anon = await post("/api/community/posts", { body: "Sin sesión", type: "reflexion" });
  check("publicar sin sesión da 401", anon.status === 401, `estado ${anon.status}`);

  const created = await post(
    "/api/community/posts",
    { body: "Publicación creada por la prueba de humo.", type: "testimonio", hashtags: ["#prueba"] },
    { token },
  );
  check("crea publicación", created.status === 201 && Boolean(created.data.id), `estado ${created.status}`);
  postId = created.data.id;

  const liked = await post(`/api/community/posts/${postId}/like`, {}, { token });
  check("da me gusta", liked.data?.likes === 1 && liked.data?.liked === true, JSON.stringify(liked.data));

  const unliked = await post(`/api/community/posts/${postId}/like`, {}, { token });
  check("retira me gusta", unliked.data?.likes === 0 && unliked.data?.liked === false, JSON.stringify(unliked.data));

  const commented = await post(`/api/community/posts/${postId}/comments`, { body: "Comentario de prueba" }, { token });
  check("comenta", commented.status === 201, `estado ${commented.status}`);

  const withComment = await get(`/api/community/posts/${postId}`, { token });
  check("el comentario persiste", withComment.data?.comments?.length === 1, `${withComment.data?.comments?.length}`);

  const prayer = await post(
    "/api/prayers",
    { title: "Petición de prueba", body: "Cuerpo de la petición de prueba.", category: "General" },
    { token },
  );
  check("crea petición de oración", prayer.status === 201, `estado ${prayer.status}`);

  const prayed = await post(`/api/prayers/${prayer.data.id}/pray`, {}, { token });
  check("ora por una petición", prayed.data?.prayingCount === 1, JSON.stringify(prayed.data));

  const prayers = await get("/api/prayers?scope=mine", { token });
  check("mis peticiones", prayers.data?.length === 1, `${prayers.data?.length}`);

  const conversations = await get("/api/conversations", { token: adminToken });
  check("lista conversaciones", conversations.status === 200, `estado ${conversations.status}`);

  const opened = await post("/api/conversations", { userId: "u2" }, { token });
  check("abre conversación directa", opened.status === 201 && Boolean(opened.data.id), `estado ${opened.status}`);

  const sent = await post(`/api/conversations/${opened.data.id}/messages`, { body: "Hola desde la prueba" }, { token });
  check("envía mensaje", sent.status === 201 && sent.data.body === "Hola desde la prueba", `estado ${sent.status}`);

  const messages = await get(`/api/conversations/${opened.data.id}/messages`, { token });
  check("lee mensajes", messages.data?.length === 1, `${messages.data?.length}`);

  const intruder = await get(`/api/conversations/${opened.data.id}/messages`, { token: adminToken });
  check("ajeno a la conversación recibe 403", intruder.status === 403, `estado ${intruder.status}`);

  const followed = await post("/api/users/u3/follow", {}, { token });
  check("sigue a alguien", followed.data?.following === true, JSON.stringify(followed.data));
}

/* -------------------------------------------------------- 6. biblioteca */

console.log("\nBiblioteca, historial y academia");
{
  const saved = await post("/api/library/toggle", { kind: "song", id: "s1" }, { token });
  check("guarda en biblioteca", saved.data?.saved === true, JSON.stringify(saved.data));

  const songs = await get("/api/library/song", { token });
  check("la biblioteca devuelve la canción", songs.data?.length === 1, `${songs.data?.length}`);

  const removed = await post("/api/library/toggle", { kind: "song", id: "s1" }, { token });
  check("quita de biblioteca", removed.data?.saved === false);

  const history = await post("/api/history", { kind: "song", id: "s2", positionSec: 45, progress: 0.2 }, { token });
  check("registra historial", history.status === 201, `estado ${history.status}`);

  const listening = await get("/api/continue/listening", { token });
  check("sigue escuchando usa el historial", listening.data?.length === 1, `${listening.data?.length}`);

  const enrolled = await post("/api/courses/co1/enroll", {}, { token });
  check("matricula en un curso", enrolled.data?.enrolled === true);

  const course = await get("/api/courses/co1");
  const lesson = course.data.modules[0].lessons[0];
  const done = await post(`/api/courses/co1/lessons/${lesson.id}/complete`, {}, { token });
  check("completa una lección", done.status === 200 && done.data.progress > 0, JSON.stringify(done.data));

  const progress = await get("/api/courses/co1/progress", { token });
  check("el progreso persiste", progress.data?.completedLessons?.length === 1);

  const volunteerOnly = true;
  void volunteerOnly;

  const volunteer = await post("/api/foundation/volunteer/vo1/apply", { message: "Quiero ayudar" }, { token });
  check("postula a voluntariado", volunteer.status === 201, `estado ${volunteer.status}`);
}

/* ----------------------------------------------------------- 6b. aportes */

console.log("\nAportes sin pasarela");
{
  // La administración configura PayPal y una transferencia.
  const configured = await patch(
    "/api/admin/payment-methods",
    {
      methods: [
        {
          id: "paypal", type: "paypal", label: "PayPal",
          description: "Paga con tu cuenta de PayPal.",
          handle: "heseriademo", instructions: "", enabled: true,
        },
        {
          id: "transferencia", type: "transferencia", label: "Transferencia",
          description: "Desde tu banco.", handle: "",
          instructions: "Banco Demo · Cuenta 000-111-222 · Heseria",
          enabled: true,
        },
      ],
    },
    { token: adminToken },
  );
  check("configura los métodos de aporte", configured.status === 200 && configured.data.length === 2,
    `estado ${configured.status}`);

  const badMethod = await patch(
    "/api/admin/payment-methods",
    { methods: [{ id: "x", type: "paypal", label: "Sin cuenta", description: "", handle: "", instructions: "", enabled: true }] },
    { token: adminToken },
  );
  check("no deja activar un método sin destino", badMethod.status === 400, `estado ${badMethod.status}`);

  // Se restauran los dos válidos tras la prueba anterior.
  await patch(
    "/api/admin/payment-methods",
    {
      methods: [
        { id: "paypal", type: "paypal", label: "PayPal", description: "Paga con tu cuenta de PayPal.", handle: "heseriademo", instructions: "", enabled: true },
        { id: "transferencia", type: "transferencia", label: "Transferencia", description: "Desde tu banco.", handle: "", instructions: "Banco Demo · Cuenta 000-111-222", enabled: true },
      ],
    },
    { token: adminToken },
  );

  const visible = await get("/api/payment-methods");
  check("la app ve los métodos activos", visible.data?.length === 2, `${visible.data?.length}`);
  check("no expone la cuenta de cobro al público", !JSON.stringify(visible.data).includes("heseriademo"));

  const card = await post(
    "/api/donations",
    { amount: 25, projectId: "fc1", cardNumber: "4111111111111111" },
    { token },
  );
  check("rechaza datos de tarjeta", card.status === 400, `estado ${card.status}`);

  const donation = await post(
    "/api/donations",
    { amount: 25, currency: "USD", projectId: "fc1", method: "paypal" },
    { token },
  );
  check("registra el aporte", donation.status === 201 && donation.data.reference?.startsWith("HSR-"),
    `estado ${donation.status}`);
  check("entrega el enlace de PayPal con el monto",
    donation.data?.payUrl === "https://www.paypal.com/paypalme/heseriademo/25USD",
    donation.data?.payUrl);
  check("queda pendiente hasta confirmar", donation.data?.status === "pendiente", donation.data?.status);

  const transfer = await post(
    "/api/donations",
    { amount: 40, projectId: "fc1", method: "transferencia" },
    { token },
  );
  check("la transferencia entrega instrucciones y no enlace",
    transfer.data?.payUrl === null && transfer.data?.instructions.includes("Banco Demo"),
    JSON.stringify(transfer.data?.instructions));

  const declared = await post(`/api/donations/${donation.data.id}/confirm`, { note: "4XJ92831LS" }, { token });
  check("la persona declara el pago", declared.data?.status === "por-verificar", declared.data?.status);

  const inbox = await get("/api/admin/donations?status=por-verificar", { token: adminToken });
  check("aparece en la bandeja de verificación",
    inbox.data?.some((d) => d.id === donation.data.id && d.donorNote === "4XJ92831LS"));

  const settled = await post(
    `/api/admin/donations/${donation.data.id}/settle`,
    { status: "completada" },
    { token: adminToken },
  );
  check("la administración lo confirma", settled.data?.status === "completada", settled.data?.status);

  const mine = await get("/api/donations", { token });
  check("el historial refleja el aporte confirmado",
    mine.data?.some((d) => d.id === donation.data.id && d.status === "completada"));

  const ajeno = await post(`/api/donations/${donation.data.id}/confirm`, {}, { token: adminToken });
  check("nadie confirma el aporte de otro", ajeno.status === 403, `estado ${ajeno.status}`);
}

/* ------------------------------------------------------ 6c. recuperación */

console.log("\nRecuperación de contraseña");
{
  const asked = await post("/api/auth/forgot-password", { email: newEmail });
  check("acepta la solicitud", asked.status === 200 && asked.data.sent === true);
  check("entrega un código cuando no hay correo configurado",
    asked.data.emailConfigured === false ? /^\d{6}$/.test(asked.data.code ?? "") : true,
    asked.data.code);

  const unknown = await post("/api/auth/forgot-password", { email: "nadie@heseria.app" });
  check("responde igual para un correo inexistente",
    unknown.status === 200 && unknown.data.sent === true && !unknown.data.code);

  if (asked.data.code) {
    const wrong = await post("/api/auth/reset-password", { token: "000000", password: "otra-clave-larga" });
    check("rechaza un código equivocado", wrong.status === 400, `estado ${wrong.status}`);

    const done = await post("/api/auth/reset-password", {
      token: asked.data.code,
      password: "clave-nueva-2026",
    });
    check("cambia la contraseña con el código", done.status === 200 && done.data.ok);

    const reused = await post("/api/auth/reset-password", {
      token: asked.data.code,
      password: "otra-mas",
    });
    check("el código no sirve dos veces", reused.status === 400, `estado ${reused.status}`);

    const relogin = await post("/api/auth/login", { email: newEmail, password: "clave-nueva-2026" });
    check("entra con la contraseña nueva", relogin.status === 200 && Boolean(relogin.data.accessToken));
    token = relogin.data.accessToken ?? token;
  }
}

/* ------------------------------------------------------- 7. contenido */

console.log("\nContenido y distribución");
let contentId = null;
{
  const denied = await post(
    "/api/content",
    { kind: "video", title: "No permitido", source: { url: "https://youtu.be/abc", provider: "youtube", kind: "link" } },
    { token },
  );
  check("un usuario normal no publica contenido", denied.status === 403, `estado ${denied.status}`);

  const created = await post(
    "/api/content",
    {
      kind: "video",
      title: "Video de la prueba de humo",
      subtitle: "Equipo Heseria",
      description: "Publicado por la prueba automática.",
      category: "Institucional",
      durationSec: 30,
      source: { url: "/media/heseria-demo.mp4", provider: "direct-video", kind: "link" },
    },
    { token: adminToken },
  );
  check("el administrador publica contenido", created.status === 201, `estado ${created.status}`);
  contentId = created.data.id;
  check("la publicación dispara la campaña automática", Boolean(created.data.campaignId), created.data.campaignId);

  const badUrl = await post(
    "/api/content",
    { kind: "video", title: "Enlace inválido", source: { url: "javascript:alert(1)", kind: "link" } },
    { token: adminToken },
  );
  check("rechaza enlaces no http", badUrl.status === 400, `estado ${badUrl.status}`);

  const listed = await get("/api/content?kind=video");
  check("el contenido aparece en el catálogo público", listed.data?.some((c) => c.id === contentId));

  const detail = await get(`/api/content/${contentId}`);
  check("detalle del contenido", detail.status === 200 && detail.data.source.url === "/media/heseria-demo.mp4");

  const viewed = await post("/api/views", { id: contentId, kind: "content", seconds: 30 }, { token });
  check("registra la vista", viewed.status === 201 && viewed.data.first === true, JSON.stringify(viewed.data));

  const unpublished = await post(`/api/content/${contentId}/unpublish`, {}, { token: adminToken });
  check("despublica", unpublished.data?.status === "borrador");

  const hidden = await get("/api/content?kind=video");
  check("despublicado desaparece del listado público", !hidden.data?.some((c) => c.id === contentId));

  await post(`/api/content/${contentId}/publish`, {}, { token: adminToken });
}

/* --------------------------------------------------- 8. notificaciones */

console.log("\nNotificaciones");
{
  const inbox = await get("/api/notifications", { token });
  check("el usuario nuevo recibió la campaña automática",
    inbox.data?.some((n) => n.title.includes("Video de la prueba de humo")),
    `${inbox.data?.length} notificaciones`);

  const unread = await get("/api/notifications/unread-count", { token });
  check("cuenta de no leídas", unread.data?.count >= 1, JSON.stringify(unread.data));

  const first = inbox.data[0];
  const read = await post(`/api/notifications/${first.id}/read`, {}, { token });
  check("marca como leída", read.status === 200);

  const segments = await get("/api/broadcast/segments", { token: adminToken });
  check("segmentos con tamaño real", segments.data?.find((s) => s.id === "todos")?.size >= 38,
    JSON.stringify(segments.data?.map((s) => `${s.id}:${s.size}`)));

  const campaign = await post(
    "/api/broadcast/campaigns",
    { title: "Aviso de prueba", body: "Mensaje enviado por la prueba de humo.", segment: "todos", href: "/home" },
    { token: adminToken },
  );
  check("envía campaña manual", campaign.status === 201 && campaign.data.delivered >= 38,
    `entregadas ${campaign.data?.delivered}`);

  const arrived = await get("/api/notifications", { token });
  check("la campaña llega al buzón del usuario",
    arrived.data?.some((n) => n.title === "Aviso de prueba"));

  const denied = await get("/api/broadcast/campaigns", { token });
  check("un usuario normal no ve las campañas", denied.status === 403, `estado ${denied.status}`);

  const rules = await get("/api/broadcast/rules", { token: adminToken });
  check("cinco reglas automáticas", rules.data?.length === 5, `${rules.data?.length}`);

  const toggled = await patch("/api/broadcast/rules/r-course", { enabled: true }, { token: adminToken });
  check("activa una regla", toggled.data?.enabled === true);
  await patch("/api/broadcast/rules/r-course", { enabled: false }, { token: adminToken });

  const scheduled = await post(
    "/api/broadcast/campaigns",
    {
      title: "Programada", body: "Se envía más tarde.", segment: "activos",
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    },
    { token: adminToken },
  );
  check("programa una campaña", scheduled.data?.status === "programada", scheduled.data?.status);
}

/* ------------------------------------------------------------ 9. métricas */

console.log("\nMétricas y moderación");
{
  const active = await get("/api/audience/active", { token: adminToken });
  const roster = await get("/api/admin/users", { token: adminToken });
  check(
    "usuarios activos calculados",
    active.status === 200 &&
      active.data.total === roster.data.filter((u) => u.status === "active").length &&
      active.data.monthly <= active.data.total,
    JSON.stringify(active.data),
  );

  const engagement = await get(`/api/audience/engagement/${contentId}`, { token: adminToken });
  check("quién vio y quién no",
    engagement.data?.viewers?.length === 1 && engagement.data?.nonViewers?.length > 0,
    `vieron ${engagement.data?.viewers?.length}, no vieron ${engagement.data?.nonViewers?.length}`);

  const kpis = await get("/api/analytics/kpis?scope=admin", { token: adminToken });
  check("KPI del panel global", kpis.data?.length === 4, `${kpis.data?.length}`);

  const series = await get("/api/analytics/series", { token: adminToken });
  check("serie de actividad", series.status === 200 && series.data.length > 0, `${series.data?.length}`);

  const breakdown = await get("/api/analytics/breakdown", { token: adminToken });
  check("reparto por tipo", breakdown.status === 200 && breakdown.data.length > 0);

  const retention = await get("/api/audience/retention", { token: adminToken });
  check("retención semanal", retention.data?.length === 12, `${retention.data?.length}`);

  const denied = await get("/api/audience/active", { token });
  check("un usuario normal no ve métricas", denied.status === 403, `estado ${denied.status}`);

  const reported = await post(`/api/community/posts/${postId}/report`, { reason: "Spam" }, { token });
  check("reporta una publicación", reported.status === 201, `estado ${reported.status}`);

  // El dataset trae catorce reportes en seis estados distintos; solo tres
  // están pendientes, más el que acaba de crear esta prueba.
  const queue = await get("/api/moderation?status=pendiente", { token: adminToken });
  check("cola de pendientes", queue.status === 200 && queue.data.length >= 4, `${queue.data?.length}`);

  const full = await get("/api/moderation", { token: adminToken });
  check("cola completa", full.data?.length >= 15, `${full.data?.length}`);

  const resolved = await post(`/api/moderation/${queue.data[0].id}/resolve`, { status: "resuelto" }, { token: adminToken });
  check("resuelve un reporte", resolved.data?.ok === true);
}

/* ------------------------------------------------------- 10. administración */

console.log("\nAdministración");
{
  const users = await get("/api/admin/users?q=prueba", { token: adminToken });
  check("busca cuentas", users.status === 200 && users.data.length >= 1, `${users.data?.length}`);

  const created = await post(
    "/api/admin/catalog/event",
    { title: "Evento creado en la prueba", type: "Conferencia", modality: "Presencial", date: "2026-12-01", city: "Santiago" },
    { token: adminToken },
  );
  check("crea un evento en el catálogo", created.status === 201 && Boolean(created.data.id), `estado ${created.status}`);

  const events = await get("/api/events");
  check("el evento nuevo se publica a todos", events.data?.some((e) => e.id === created.data.id));

  const edited = await patch(
    `/api/admin/catalog/event/${created.data.id}`,
    { title: "Evento editado" },
    { token: adminToken },
  );
  check("edita el evento", edited.data?.title === "Evento editado");

  const deleted = await del(`/api/admin/catalog/event/${created.data.id}`, { token: adminToken });
  check("borra el evento", deleted.data?.ok === true);

  const denied = await post("/api/admin/catalog/event", { title: "No" }, { token });
  check("un usuario normal no edita el catálogo", denied.status === 403, `estado ${denied.status}`);

  const selfDemote = await patch(`/api/admin/users/${userId}`, { role: "moderator" }, { token: adminToken });
  check("el administrador cambia roles", selfDemote.data?.role === "moderator", JSON.stringify(selfDemote.data?.role));

  const health = await get("/api/admin/health", { token: adminToken });
  const usersNow = await get("/api/admin/users", { token: adminToken });
  check(
    "informe de salud",
    health.status === 200 && health.data.counts.users === usersNow.data.length,
    `${health.data?.counts?.users} vs ${usersNow.data?.length}`,
  );
}

/* ------------------------------------------------------------ 11. limpieza */

console.log("\nLimpieza");
{
  await del(`/api/community/posts/${postId}`, { token: adminToken });
  await del(`/api/content/${contentId}`, { token: adminToken });
  const removed = await del("/api/auth/me", { token: adminToken === token ? adminToken : token });
  check("borra la cuenta de prueba", removed.status === 200, `estado ${removed.status}`);
}

/* ------------------------------------------------------------- resumen */

console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} correctas · ${failed} fallidas`);
if (failures.length) {
  console.log("\n  Fallos:");
  for (const f of failures) console.log(`   · ${f}`);
}
console.log("");
process.exit(failed ? 1 : 0);
