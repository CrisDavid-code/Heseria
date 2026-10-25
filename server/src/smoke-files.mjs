/**
 * HESERIA — Prueba de archivos: subir, listar, ver, descargar y permisos.
 *
 *   node src/smoke-files.mjs [http://localhost:4000]
 *
 * Lo que se comprueba no es «que sube un archivo», que sería fácil, sino lo que
 * de verdad puede salir mal:
 *
 *   · que el material de un curso **no** lo baje quien no está matriculado,
 *   · que sí lo baje quien sí lo está,
 *   · que el listado no delate ni el nombre de lo que no se puede abrir,
 *   · que el servidor responda por tramos (`Range`), para poder adelantar un
 *     video sin bajarlo entero,
 *   · que un ejecutable sea rechazado,
 *   · que un adjunto de un chat solo lo vean los de esa conversación,
 *   · que borrar sea cosa de quien subió el archivo.
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:4000";

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

async function call(method, path, { token, body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
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
  return { status: res.status, data, res };
}

/** Sube un archivo con `multipart/form-data`, como lo hace la app. */
async function upload(token, { name, type, bytes, fields = {} }) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);

  const res = await fetch(`${BASE}/api/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const stamp = Date.now();

/** Crea una cuenta de prueba y devuelve su sesión. */
async function nuevaCuenta(prefijo) {
  const { status, data } = await call("POST", "/api/auth/register", {
    body: {
      firstName: "Prueba",
      lastName: prefijo,
      email: `${prefijo}.${stamp}@heseria.test`,
      password: "UnaClaveLarga123",
      acceptedTerms: true,
    },
  });
  if (status !== 201) throw new Error(`No se pudo crear la cuenta ${prefijo}: ${JSON.stringify(data)}`);
  return data;
}

console.log(`\nHESERIA — archivos, contra ${BASE}\n`);

/* --------------------------------------------------------------- cuentas */

const alumna = await nuevaCuenta("alumna");
const curiosa = await nuevaCuenta("curiosa");

/* ------------------------------------------------------ un archivo suelto */

console.log("Subir y recuperar");
let publico = null;
{
  const { status, data } = await upload(alumna.accessToken, {
    name: "apuntes.txt",
    type: "text/plain",
    bytes: "Cada día son nuevas sus misericordias.",
  });
  check("sube un archivo", status === 201, `estado ${status} ${JSON.stringify(data)}`);
  check("conserva el nombre original", data?.name === "apuntes.txt", String(data?.name));
  check("informa del tamaño", typeof data?.size === "number" && data.size > 0, String(data?.size));
  check("entrega enlaces de ver y descargar",
    typeof data?.viewUrl === "string" && typeof data?.downloadUrl === "string");
  publico = data;
}

{
  const res = await fetch(`${BASE}${publico.downloadUrl}`, {
    headers: { Authorization: `Bearer ${alumna.accessToken}` },
  });
  const text = await res.text();
  check("descarga el contenido intacto", text === "Cada día son nuevas sus misericordias.", text.slice(0, 40));
  check("lo manda como descarga",
    (res.headers.get("content-disposition") ?? "").startsWith("attachment"),
    res.headers.get("content-disposition"));
  check("dice que admite tramos", res.headers.get("accept-ranges") === "bytes");
}

{
  const res = await fetch(`${BASE}${publico.viewUrl}`, {
    headers: { Authorization: `Bearer ${alumna.accessToken}` },
  });
  check("verlo lo entrega en línea",
    (res.headers.get("content-disposition") ?? "").startsWith("inline"),
    res.headers.get("content-disposition"));
}

/* ----------------------------------------------------------------- tramos */

console.log("\nPor tramos, para poder adelantar un video");
{
  const res = await fetch(`${BASE}${publico.viewUrl}`, {
    headers: { Authorization: `Bearer ${alumna.accessToken}`, Range: "bytes=0-3" },
  });
  const text = await res.text();
  check("responde 206 a un Range", res.status === 206, `estado ${res.status}`);
  check("manda solo ese tramo", text === "Cada", JSON.stringify(text));
  check("dice qué tramo manda",
    (res.headers.get("content-range") ?? "").startsWith("bytes 0-3/"),
    res.headers.get("content-range"));
}
{
  const res = await fetch(`${BASE}${publico.viewUrl}`, {
    headers: { Authorization: `Bearer ${alumna.accessToken}`, Range: "bytes=99999-" },
  });
  check("rechaza un tramo imposible", res.status === 416, `estado ${res.status}`);
}

/* --------------------------------------------------------- sin autorizar */

console.log("\nSin sesión no se entrega nada");
{
  const res = await fetch(`${BASE}${publico.downloadUrl}`);
  check("descargar sin sesión da 401", res.status === 401, `estado ${res.status}`);
}

/* -------------------------------------------------------- tipos vetados */

console.log("\nLo que no se admite");
{
  const { status, data } = await upload(alumna.accessToken, {
    name: "virus.exe",
    type: "application/x-msdownload",
    bytes: "MZ",
  });
  check("rechaza un ejecutable", status === 400, `estado ${status}`);
  check("lo explica", data?.code === "bad_mime", JSON.stringify(data));
}

/* ------------------------------------------------ material de un curso */

console.log("\nMaterial de un curso: solo para quien lo cursa");

const cursos = await call("GET", "/api/courses", { token: alumna.accessToken });
const curso = Array.isArray(cursos.data) ? cursos.data[0] : cursos.data?.items?.[0];
if (!curso) {
  console.log("  No hay cursos sembrados; ejecuta npm run seed en server/.");
  process.exit(1);
}

// Una cuenta de administración para publicar el material.
const admin = await (async () => {
  const { db } = await import("./db.js");
  const row = db.prepare("SELECT email FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!row) return null;
  // La contraseña de la semilla es la misma para todas las cuentas de ejemplo
  // y solo existe en desarrollo: ver SEED_PASSWORD en seed.js.
  for (const clave of ["heseria"]) {
    const intento = await call("POST", "/api/auth/login", {
      body: { email: row.email, password: clave },
    });
    if (intento.status === 200) return intento.data;
  }
  return null;
})();

if (!admin) {
  console.log("  No se pudo entrar como administración; se omite la parte del curso.");
} else {
  let material = null;
  {
    const { status, data } = await upload(admin.accessToken, {
      name: "guia-de-estudio.pdf",
      type: "application/pdf",
      bytes: "%PDF-1.4 contenido de prueba",
      fields: {
        scope: "course",
        scopeId: curso.id,
        title: "Guía de estudio",
        visibility: "enrolled",
      },
    });
    check("la administración publica material del curso", status === 201, `estado ${status} ${JSON.stringify(data)}`);
    check("queda marcado como solo para matriculados", data?.visibility === "enrolled", String(data?.visibility));
    material = data;
  }

  {
    const res = await fetch(`${BASE}${material.downloadUrl}`, {
      headers: { Authorization: `Bearer ${curiosa.accessToken}` },
    });
    check("quien no está matriculado no lo baja", res.status === 403, `estado ${res.status}`);
  }

  {
    const { data } = await call("GET", `/api/files?scope=course&scopeId=${curso.id}`, {
      token: curiosa.accessToken,
    });
    check("ni siquiera aparece en su listado",
      Array.isArray(data) && !data.some((f) => f.id === material.id),
      JSON.stringify(data));
  }

  {
    const matricula = await call("POST", `/api/courses/${curso.id}/enroll`, {
      token: curiosa.accessToken,
    });
    check("se matricula", matricula.status === 200 || matricula.status === 201,
      `estado ${matricula.status}`);

    const res = await fetch(`${BASE}${material.downloadUrl}`, {
      headers: { Authorization: `Bearer ${curiosa.accessToken}` },
    });
    check("ya matriculada, sí lo baja", res.status === 200, `estado ${res.status}`);

    const { data } = await call("GET", `/api/files?scope=course&scopeId=${curso.id}`, {
      token: curiosa.accessToken,
    });
    check("y ahora sí aparece en su listado",
      Array.isArray(data) && data.some((f) => f.id === material.id));
  }

  {
    const { status } = await call("DELETE", `/api/files/${material.id}`, {
      token: curiosa.accessToken,
    });
    check("quien no lo subió no puede borrarlo", status === 403, `estado ${status}`);
  }

  {
    const { status } = await upload(curiosa.accessToken, {
      name: "mio.pdf",
      type: "application/pdf",
      bytes: "%PDF-1.4",
      fields: { scope: "course", scopeId: curso.id, visibility: "enrolled" },
    });
    check("una alumna no publica material del curso", status === 403, `estado ${status}`);
  }
}

/* --------------------------------------------------- adjunto de un chat */

console.log("\nAdjunto de un mensaje: solo para esa conversación");
{
  const conv = await call("POST", "/api/conversations", {
    token: alumna.accessToken,
    body: { userId: curiosa.user.id },
  });
  check("abre la conversación", conv.status === 200 || conv.status === 201, `estado ${conv.status}`);
  const conversationId = conv.data?.id;

  const subida = await upload(alumna.accessToken, {
    name: "acta.txt",
    type: "text/plain",
    bytes: "Acuerdos de la reunión.",
    fields: { scope: "message", scopeId: conversationId },
  });
  check("sube el adjunto", subida.status === 201, `estado ${subida.status} ${JSON.stringify(subida.data)}`);

  const enviado = await call("POST", `/api/conversations/${conversationId}/messages`, {
    token: alumna.accessToken,
    body: { body: "", attachmentId: subida.data.id },
  });
  check("manda el mensaje sin texto pero con archivo", enviado.status === 201,
    `estado ${enviado.status} ${JSON.stringify(enviado.data)}`);
  check("el mensaje trae el adjunto", enviado.data?.attachment?.id === subida.data.id,
    JSON.stringify(enviado.data?.attachment));
  check("y sabe qué clase de archivo es", enviado.data?.kind === "file", String(enviado.data?.kind));

  const recibido = await call("GET", `/api/conversations/${conversationId}/messages`, {
    token: curiosa.accessToken,
  });
  const conAdjunto = Array.isArray(recibido.data)
    ? recibido.data.find((m) => m.attachment?.id === subida.data.id)
    : null;
  check("a la otra persona le llega con el adjunto", Boolean(conAdjunto));

  const res = await fetch(`${BASE}${subida.data.downloadUrl}`, {
    headers: { Authorization: `Bearer ${curiosa.accessToken}` },
  });
  check("y puede bajarlo", res.status === 200, `estado ${res.status}`);

  const tercera = await nuevaCuenta("tercera");
  const fuera = await fetch(`${BASE}${subida.data.downloadUrl}`, {
    headers: { Authorization: `Bearer ${tercera.accessToken}` },
  });
  check("alguien de fuera de la conversación no", fuera.status === 403, `estado ${fuera.status}`);
}

/* -------------------------------------------------------------- borrado */

console.log("\nBorrar");
{
  const { status } = await call("DELETE", `/api/files/${publico.id}`, { token: alumna.accessToken });
  check("quien lo subió sí puede borrarlo", status === 200, `estado ${status}`);

  const res = await fetch(`${BASE}${publico.downloadUrl}`, {
    headers: { Authorization: `Bearer ${alumna.accessToken}` },
  });
  check("y después ya no está", res.status === 404, `estado ${res.status}`);
}

console.log(`\n${passed} bien, ${failed} mal`);
if (failures.length > 0) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  · ${f}`);
}
process.exit(failed === 0 ? 0 : 1);
