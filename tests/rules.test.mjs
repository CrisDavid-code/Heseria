/**
 * HESERIA — Prueba de las reglas de Firestore contra el emulador.
 *
 *   npx firebase emulators:exec --only firestore,auth --project demo-heseria "node tests/rules.test.mjs"
 *
 * Sin servidor propio, estas reglas son la única barrera: cualquiera con la
 * configuración pública puede intentar leer o escribir. Por cada colección se
 * prueba que lo permitido pasa y que lo ajeno, lo inventado y lo que se sale
 * de rango falla (patrón del skill de Aguiteks).
 *
 * Las cuentas son de prueba y viven solo en el emulador.
 */
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword,
} from "firebase/auth";
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore,
  increment, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";

const PROJECT = "demo-heseria";
const OWNER = "christianaguilar421@gmail.com";
const PASSWORD = "prueba-heseria-123";

let passed = 0;
let failed = 0;
const failures = [];
const ok = (name) => { passed++; console.log(`  ok   ${name}`); };
const bad = (name, why) => { failed++; failures.push(`${name} — ${why}`); console.log(`  FALLA ${name} — ${why}`); };

async function allowed(name, work) {
  try { await work(); ok(name); } catch (err) { bad(name, `se negó: ${err.code ?? err.message}`); }
}
async function denied(name, work) {
  try { await work(); bad(name, "se permitió y no debía"); } catch (err) {
    if (String(err.code).includes("permission-denied")) ok(name);
    else bad(name, `falló por otra razón: ${err.code ?? err.message}`);
  }
}

/* --------------------------------------------------------- preparación */

// Borra todo lo del emulador para empezar limpio.
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });

/** Una persona con su propia conexión, como un teléfono distinto. */
async function person(email, { verified = false } = {}) {
  const app = initializeApp({ apiKey: "demo", projectId: PROJECT, appId: "1:1:web:1" }, email);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  if (verified) {
    // El emulador acepta «Bearer owner» como administración para marcar el correo.
    await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ localId: user.uid, emailVerified: true }),
    });
    await auth.signOut();
    await signInWithEmailAndPassword(auth, email, PASSWORD);
    await auth.currentUser.getIdToken(true);
  }
  return { app, auth, db, uid: user.uid };
}

const profile = (first) => ({
  firstName: first, lastName: "Prueba", name: `${first} Prueba`, handle: first.toLowerCase(),
  role: "user", status: "active", bio: "", city: "", country: "", churchId: "", ministries: [],
  interests: [], followers: 0, following: 0, color: "", avatarUrl: "", onboarded: false,
  joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
});

console.log("\nHESERIA — reglas de Firestore (emulador)\n");

const ana = await person("ana@prueba.test");
const beto = await person("beto@prueba.test");
const owner = await person(OWNER, { verified: true });

/* ------------------------------------------------------------- perfiles */

console.log("Perfiles y roles");
await allowed("crear su propio perfil como «user»", () => setDoc(doc(ana.db, "users", ana.uid), profile("Ana")));
await allowed("crear el de Beto", () => setDoc(doc(beto.db, "users", beto.uid), profile("Beto")));
await denied("nadie nace admin", () => setDoc(doc(beto.db, "users", "otro"), { ...profile("X"), role: "admin" }));
await denied("crear el perfil de otra persona", () => setDoc(doc(ana.db, "users", "ajeno"), profile("Ajeno")));
await allowed("editar su biografía", () => updateDoc(doc(ana.db, "users", ana.uid), { bio: "Hola" }));
await denied("darse el rol de pastor", () => updateDoc(doc(ana.db, "users", ana.uid), { role: "pastor" }));
await denied("inflarse los seguidores", () => updateDoc(doc(ana.db, "users", ana.uid), { followers: 999 }));
await denied("editar el perfil de otra persona", () => updateDoc(doc(ana.db, "users", beto.uid), { bio: "hackeado" }));
await allowed("seguir a alguien suma uno", () => updateDoc(doc(ana.db, "users", beto.uid), { followers: increment(1) }));
await denied("sumar de a diez no", () => updateDoc(doc(ana.db, "users", beto.uid), { followers: increment(10) }));
await denied("leer el correo privado de otra persona", () => getDoc(doc(ana.db, `users/${beto.uid}/private`, "info")));
await allowed("leer su propio correo privado", async () => {
  await setDoc(doc(ana.db, `users/${ana.uid}/private`, "info"), { email: "ana@prueba.test" });
  await getDoc(doc(ana.db, `users/${ana.uid}/private`, "info"));
});

await allowed("la dueña crea su perfil", () => setDoc(doc(owner.db, "users", owner.uid), profile("Dueña")));
await allowed("la dueña se nombra administradora", () => updateDoc(doc(owner.db, "users", owner.uid), { role: "admin" }));
await allowed("la administración nombra pastor a Beto", () => updateDoc(doc(owner.db, "users", beto.uid), { role: "pastor" }));
await denied("la administración no toca la biografía ajena", () => updateDoc(doc(owner.db, "users", beto.uid), { bio: "x" }));

/* ------------------------------------------------------------ contenido */

console.log("\nContenido editorial y de sus dueños");
await allowed("la administración carga una iglesia", () => setDoc(doc(owner.db, "churches", "osm-n1"), { name: "Iglesia de prueba", lat: 14.6, lng: -90.5, members: 0 }));
await denied("una persona cualquiera no crea iglesias", () => setDoc(doc(ana.db, "churches", "falsa"), { name: "Falsa" }));
await allowed("cualquiera lee iglesias (también sin sesión)", () => getDocs(collection(ana.db, "churches")));
await allowed("unirse a una iglesia suma un miembro", async () => {
  const b = writeBatch(ana.db);
  b.set(doc(ana.db, "churches/osm-n1/members", ana.uid), { at: serverTimestamp() });
  b.update(doc(ana.db, "churches", "osm-n1"), { members: increment(1) });
  await b.commit();
});
await denied("Ana no publica media (es «user»)", () => addDoc(collection(ana.db, "content"), { kind: "song", title: "Mi canción", ownerId: ana.uid, status: "publicado", source: {}, createdAt: serverTimestamp() }));
// Beto ya es pastor: el token no cambia, el rol se lee del documento.
await allowed("Beto (pastor) publica su sermón", () => addDoc(collection(beto.db, "content"), { kind: "sermon", title: "Gracia sobre gracia", ownerId: beto.uid, status: "publicado", source: { url: "https://www.youtube.com/embed/x" }, createdAt: serverTimestamp() }));
await denied("Beto no publica a nombre de Ana", () => addDoc(collection(beto.db, "content"), { kind: "sermon", title: "Falso", ownerId: ana.uid, status: "publicado", source: {}, createdAt: serverTimestamp() }));
await denied("un tipo de media inventado no entra", () => addDoc(collection(beto.db, "content"), { kind: "pirateria", title: "Película ajena", ownerId: beto.uid, status: "publicado", source: {}, createdAt: serverTimestamp() }));

/* ------------------------------------------------------------- oración */

console.log("\nOración");
let prayerId;
await allowed("Ana pide oración pública", async () => {
  const r = await addDoc(collection(ana.db, "prayers"), { authorId: ana.uid, title: "Por mi familia", body: "Oren por la salud de mi mamá.", category: "Familia", visibility: "public", churchId: "", prayingCount: 0, answered: false, createdAt: serverTimestamp() });
  prayerId = r.id;
});
await denied("no se crea una petición con contador inflado", () => addDoc(collection(ana.db, "prayers"), { authorId: ana.uid, title: "Trampa", body: "Contador falso", category: "x", visibility: "public", churchId: "", prayingCount: 500, answered: false, createdAt: serverTimestamp() }));
await allowed("Beto ora por ella (+1)", async () => {
  const b = writeBatch(beto.db);
  b.set(doc(beto.db, `prayers/${prayerId}/prayedBy`, beto.uid), { at: serverTimestamp() });
  b.update(doc(beto.db, "prayers", prayerId), { prayingCount: increment(1) });
  await b.commit();
});
await denied("Beto no marca como respondida la petición de Ana", () => updateDoc(doc(beto.db, "prayers", prayerId), { answered: true }));
let privateId;
await allowed("Ana guarda una petición privada", async () => {
  const r = await addDoc(collection(ana.db, "prayers"), { authorId: ana.uid, title: "Privada", body: "Solo para mí y Dios.", category: "x", visibility: "private", churchId: "", prayingCount: 0, answered: false, createdAt: serverTimestamp() });
  privateId = r.id;
});
await denied("Beto no lee la petición privada de Ana", () => getDoc(doc(beto.db, "prayers", privateId)));
await denied("una consulta sin filtrar no puede barrer las privadas", () => getDocs(collection(beto.db, "prayers")));
await allowed("la consulta de públicas sí", () => getDocs(query(collection(beto.db, "prayers"), where("visibility", "==", "public"))));

/* ------------------------------------------------------------- mensajes */

console.log("\nMensajes");
const chatId = [ana.uid, beto.uid].sort().join("_");
await allowed("saber si un chat existe aunque no exista", () => getDoc(doc(ana.db, "chats", chatId)));
await allowed("Ana abre un chat con Beto", () => setDoc(doc(ana.db, "chats", chatId), { members: [ana.uid, beto.uid].sort(), lastAt: serverTimestamp(), readBy: {}, unread: {} }));
await allowed("Ana escribe", () => setDoc(doc(ana.db, `chats/${chatId}/messages`, "m1"), { authorId: ana.uid, body: "Hola Beto", kind: "text", reactions: [], createdAt: serverTimestamp() }));
await denied("Ana no firma como Beto", () => setDoc(doc(ana.db, `chats/${chatId}/messages`, "m2"), { authorId: beto.uid, body: "Soy Beto", kind: "text", reactions: [], createdAt: serverTimestamp() }));
await denied("Ana no cambia la lista de miembros", () => updateDoc(doc(ana.db, "chats", chatId), { members: [ana.uid, beto.uid, "intruso"] }));
await allowed("Beto lee el mensaje", () => getDocs(collection(beto.db, `chats/${chatId}/messages`)));
await denied("Beto no reescribe el texto de Ana", () => updateDoc(doc(beto.db, `chats/${chatId}/messages`, "m1"), { body: "editado" }));
await allowed("Beto reacciona", () => updateDoc(doc(beto.db, `chats/${chatId}/messages`, "m1"), { reactions: ["🙏"] }));
await denied("la dueña tampoco lee chats ajenos", () => getDocs(collection(owner.db, `chats/${chatId}/messages`)));

/* ------------------------------------------------------------ llamadas */

console.log("\nLlamadas");
let callId;
await allowed("Ana llama a Beto", async () => {
  const r = await addDoc(collection(ana.db, "calls"), { from: ana.uid, to: beto.uid, kind: "audio", status: "ringing", createdAt: serverTimestamp() });
  callId = r.id;
});
// Así escucha la app las llamadas entrantes y salientes: consultas, no lecturas sueltas.
await allowed("Beto escucha las llamadas que le hacen (where to == yo)", () => getDocs(query(collection(beto.db, "calls"), where("to", "==", beto.uid))));
await allowed("Ana escucha las que hace (where from == yo)", () => getDocs(query(collection(ana.db, "calls"), where("from", "==", ana.uid))));
await denied("Ana no espía las llamadas de otro", () => getDocs(query(collection(ana.db, "calls"), where("to", "==", owner.uid))));
await allowed("Beto contesta", () => updateDoc(doc(beto.db, "calls", callId), { status: "accepted" }));
await allowed("intercambian la señal WebRTC", () => addDoc(collection(beto.db, `calls/${callId}/signals`), { from: beto.uid, signal: { kind: "answer" }, createdAt: serverTimestamp() }));
await denied("la dueña no se mete en la llamada", () => getDocs(collection(owner.db, `calls/${callId}/signals`)));
await denied("nadie crea una llamada a nombre de otro", () => addDoc(collection(ana.db, "calls"), { from: beto.uid, to: ana.uid, kind: "audio", status: "ringing", createdAt: serverTimestamp() }));

/* ------------------------------------------------------------- avisos */

console.log("\nAvisos");
await allowed("Ana deja un aviso a Beto firmado por ella", () => addDoc(collection(ana.db, `users/${beto.uid}/notifications`), { category: "mensajes", title: "Nuevo mensaje", body: "Hola", href: "/messages", createdAt: serverTimestamp(), read: false, from: ana.uid }));
await denied("Ana no se hace pasar por otra persona", () => addDoc(collection(ana.db, `users/${beto.uid}/notifications`), { category: "mensajes", title: "x", body: "y", href: "", createdAt: serverTimestamp(), read: false, from: beto.uid }));
await denied("Ana no manda avisos de «sistema»", () => addDoc(collection(ana.db, `users/${beto.uid}/notifications`), { category: "sistema", title: "Tu cuenta será cerrada", body: "Haz clic aquí", href: "", createdAt: serverTimestamp(), read: false, from: ana.uid }));
await denied("Ana no lee los avisos de Beto", () => getDocs(collection(ana.db, `users/${beto.uid}/notifications`)));

/* ------------------------------------------- fundación (única que recauda) */

console.log("\nFundación y ofrendas");
{
  // Otro administrador (no superadmin): administra, pero no toca la Fundación ni nombra admins.
  const ceci = await person("ceci.admin@prueba.com", { verified: true });
  await allowed("Ceci crea su perfil", () => setDoc(doc(ceci.db, "users", ceci.uid), profile("Ceci")));
  await allowed("el superadmin nombra administradora a Ceci", () => updateDoc(doc(owner.db, "users", ceci.uid), { role: "admin" }));
  await denied("Ceci (admin) no abre casos de la Fundación", () => setDoc(doc(ceci.db, "foundationCases", "caso-ceci"), { title: "x", goal: 1 }));
  await denied("ni cambia los métodos de pago", () => setDoc(doc(ceci.db, "settings", "payments"), { methods: [] }));
  await denied("ni nombra a otro administrador", () => updateDoc(doc(ceci.db, "users", beto.uid), { role: "admin" }));
  await denied("ni le quita el rol al superadmin", () => updateDoc(doc(ceci.db, "users", owner.uid), { role: "user" }));
  await allowed("pero sí reparte roles normales", () => updateDoc(doc(ceci.db, "users", beto.uid), { role: "pastor" }));
  await deleteApp(ceci.app);
}
await allowed("Ana registra su dispositivo para el versículo del día", () => setDoc(doc(ana.db, "pushTokens", "tok-ana"), { uid: ana.uid, platform: "web", updatedAt: serverTimestamp() }));
await denied("no registra un dispositivo a nombre de otro", () => setDoc(doc(ana.db, "pushTokens", "tok-x"), { uid: beto.uid, platform: "web", updatedAt: serverTimestamp() }));
await denied("nadie lee los dispositivos desde la app", () => getDoc(doc(owner.db, "pushTokens", "tok-ana")));
await denied("Beto no borra el dispositivo de Ana", () => deleteDoc(doc(beto.db, "pushTokens", "tok-ana")));
await allowed("Ana lo da de baja", () => deleteDoc(doc(ana.db, "pushTokens", "tok-ana")));
await denied("un pastor no abre una colecta", () => setDoc(doc(beto.db, "foundationCases", "mi-colecta"), { title: "Ayuda para mí", goal: 1000 }));
await denied("nadie cambia a dónde llega el dinero", () => setDoc(doc(beto.db, "settings", "payments"), { methods: [{ type: "paypal", handle: "estafador" }] }));
await allowed("la Fundación configura sus métodos", () => setDoc(doc(owner.db, "settings", "payments"), { methods: [] }));
await allowed("la Fundación abre un caso", () => setDoc(doc(owner.db, "foundationCases", "caso-1"), { title: "Caso real", goal: 1000, raised: 0 }));
await allowed("Ana registra una ofrenda pendiente", () => setDoc(doc(ana.db, "donations", "dn1"), { donorId: ana.uid, amount: 25, currency: "USD", status: "pendiente", reference: "HSR-1", createdAt: serverTimestamp() }));
await denied("nadie registra una ofrenda ya «completada»", () => setDoc(doc(ana.db, "donations", "dn2"), { donorId: ana.uid, amount: 25, currency: "USD", status: "completada", reference: "HSR-2", createdAt: serverTimestamp() }));
await denied("nunca datos de tarjeta", () => setDoc(doc(ana.db, "donations", "dn3"), { donorId: ana.uid, amount: 25, currency: "USD", status: "pendiente", reference: "HSR-3", cardNumber: "4111", createdAt: serverTimestamp() }));
await allowed("Ana dice «ya la hice»", () => updateDoc(doc(ana.db, "donations", "dn1"), { status: "por-verificar", donorNote: "Ref 123", declaredAt: serverTimestamp() }));
await denied("Ana no se la confirma a sí misma", () => updateDoc(doc(ana.db, "donations", "dn1"), { status: "completada" }));
await denied("Beto no ve las ofrendas de Ana", () => getDoc(doc(beto.db, "donations", "dn1")));
await allowed("la Fundación la confirma", () => updateDoc(doc(owner.db, "donations", "dn1"), { status: "completada", confirmedAt: serverTimestamp() }));

/* ------------------------------------------------------------- archivos */

console.log("\nArchivos");
await allowed("Beto sube material de un curso para matriculados", () => setDoc(doc(beto.db, "files", "f1"), { name: "guia.pdf", mime: "application/pdf", size: 1000, ownerId: beto.uid, visibility: "enrolled", courseId: "curso-x", scope: "course", scopeId: "curso-x", chunks: 1, createdAt: serverTimestamp() }));
await allowed("…y su contenido", () => setDoc(doc(beto.db, "files/f1/chunks", "0"), { data: "JVBERi0=" }));
await denied("Ana sin matricularse no lo abre", () => getDoc(doc(ana.db, "files/f1/chunks", "0")));
await allowed("Ana se matricula", () => setDoc(doc(ana.db, `users/${ana.uid}/enrollments`, "curso-x"), { completedLessons: [] }));
await allowed("…y ahora sí lo abre", () => getDoc(doc(ana.db, "files/f1/chunks", "0")));
// Las listas: así es como la app pide el material. Sin la visibilidad y el
// curso en la consulta, Firestore no puede probar la regla y la rechaza.
await allowed("Ana (matriculada) lista el material del curso", async () => {
  const snap = await getDocs(query(collection(ana.db, "files"),
    where("scope", "==", "course"), where("scopeId", "==", "curso-x"),
    where("visibility", "==", "enrolled"), where("courseId", "==", "curso-x")));
  if (snap.size !== 1) throw new Error(`esperaba 1 archivo, llegaron ${snap.size}`);
});
await allowed("Beto (maestro de ese material) también lo lista", () => getDocs(query(collection(beto.db, "files"),
  where("scope", "==", "course"), where("scopeId", "==", "curso-x"),
  where("visibility", "==", "enrolled"), where("courseId", "==", "curso-x"))));
await denied("una lista sin filtrar por visibilidad no se permite", () => getDocs(query(collection(ana.db, "files"),
  where("scope", "==", "course"), where("scopeId", "==", "curso-x"))));
await denied("un archivo de más de 10 MB no entra", () => setDoc(doc(ana.db, "files", "f2"), { name: "x", mime: "video/mp4", size: 50 * 1024 * 1024, ownerId: ana.uid, visibility: "public", chunks: 80, createdAt: serverTimestamp() }));

/* ------------------------------------------------------------ comentarios */

console.log("\nComunidad");
let postId;
await allowed("Ana publica", async () => {
  const r = await addDoc(collection(ana.db, "posts"), { authorId: ana.uid, type: "testimonio", body: "Dios es fiel", hashtags: [], groupId: "", image: "", likes: 0, shares: 0, commentCount: 0, color: "", createdAt: serverTimestamp() });
  postId = r.id;
});
await denied("nadie publica con «me gusta» de entrada", () => addDoc(collection(ana.db, "posts"), { authorId: ana.uid, type: "texto", body: "x", hashtags: [], likes: 100, shares: 0, commentCount: 0, createdAt: serverTimestamp() }));
await denied("Beto no borra la publicación de Ana", () => deleteDoc(doc(beto.db, "posts", postId)));
await allowed("la moderación (admin) sí", () => deleteDoc(doc(owner.db, "posts", postId)));
await allowed("cualquiera puede reportar un problema sin sesión… o con ella", () => addDoc(collection(ana.db, "feedback"), { type: "bug", message: "Algo falló", userId: ana.uid, device: "web · 390x844", screenshot: "data:image/jpeg;base64,AAAA", createdAt: serverTimestamp() }));
await allowed("con sesión se sugiere una función", () => addDoc(collection(ana.db, "feedback"), { type: "idea", message: "Modo lectura nocturna", userId: ana.uid, createdAt: serverTimestamp() }));
{
  // Sin sesión: un teléfono que todavía no entra.
  const guest = getFirestore(initializeApp({ apiKey: "demo", projectId: PROJECT, appId: "1:1:web:1" }, "invitado"));
  connectFirestoreEmulator(guest, "127.0.0.1", 8080);
  await allowed("sin sesión se reporta una falla", () => addDoc(collection(guest, "feedback"), { type: "bug", message: "No puedo entrar", userId: null, createdAt: serverTimestamp() }));
  await denied("pero sin sesión no se sugieren funciones", () => addDoc(collection(guest, "feedback"), { type: "idea", message: "Idea", userId: null, createdAt: serverTimestamp() }));
}
await denied("no se reporta a nombre de otra persona", () => addDoc(collection(ana.db, "feedback"), { type: "bug", message: "x", userId: "otra", createdAt: serverTimestamp() }));
await denied("ni con un tipo inventado o campos extra", () => addDoc(collection(ana.db, "feedback"), { type: "spam", message: "x", userId: ana.uid, createdAt: serverTimestamp() }));
await denied("ni con una «captura» que no es imagen", () => addDoc(collection(ana.db, "feedback"), { type: "bug", message: "x", userId: ana.uid, screenshot: "<script>", createdAt: serverTimestamp() }));
await denied("pero no lee los reportes de otros", () => getDocs(collection(ana.db, "feedback")));

/* ------------------------------------------------------------- resumen */

for (const p of [ana, beto, owner]) await deleteApp(p.app);
console.log(`\n${passed} bien, ${failed} mal`);
if (failures.length) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  · ${f}`);
}
process.exit(failed === 0 ? 0 : 1);
