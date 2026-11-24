/**
 * HESERIA — Asistente bíblico (POST /ia). La clave ANTHROPIC_API_KEY vive solo como secreto del
 * Worker. Cada pregunta exige el token de sesión de Firebase de la persona (verificado aquí) y
 * hay un tope diario por cuenta. Sin clave configurada responde 503 «no-configurado».
 * No se guardan preguntas ni respuestas.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface AiEnv {
  ANTHROPIC_API_KEY?: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  DATABASE: string;
  SITE: string;
}

const DAILY_LIMIT = 20;
const ORIGINS = ["https://heseria.web.app", "https://heseria-app.web.app", "https://localhost", "capacitor://localhost", "http://localhost:5173"];

const SYSTEM = `Eres el asistente bíblico de Heseria, una app cristiana evangélica. Respondes en español, con calidez y brevedad (máximo 250 palabras).
Reglas:
- Basa tus respuestas en la Biblia y cita siempre las referencias (libro capítulo:versículo) para que la persona las lea en la app. No transcribas pasajes largos: resume y remite a la referencia.
- Si citas un versículo textual, aclara de qué versión es; si no estás seguro de la redacción exacta, no lo cites literal: da solo la referencia.
- Distingue lo que dice el texto de tu explicación. En temas donde las denominaciones difieren, dilo con respeto y presenta las posturas principales.
- No inventes datos históricos ni referencias. Si no sabes algo, dilo.
- No das consejo médico, legal ni financiero. Ante crisis (autolesión, abuso, violencia) anima con amor a buscar ayuda inmediata de un adulto de confianza, su pastor o los servicios de emergencia.`;

const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

export function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export async function handleAi(req: Request, env: AiEnv, firestoreToken: () => Promise<string>): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "metodo" }, 405, origin);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "no-configurado" }, 503, origin);

  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as { project_id: string };
  const uid = await verifyIdToken(req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "", sa.project_id).catch(() => null);
  if (!uid) return json({ error: "sesion" }, 401, origin);

  const body = (await req.json().catch(() => null)) as { question?: unknown; context?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 1000) : "";
  const context = typeof body?.context === "string" ? body.context.slice(0, 120) : "";
  if (!question) return json({ error: "pregunta" }, 400, origin);

  const left = await spend(env, sa.project_id, uid, await firestoreToken());
  if (left < 0) return json({ error: "limite", limit: DAILY_LIMIT }, 429, origin);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: context ? `(Estoy leyendo ${context}.) ${question}` : question }],
    });
    if (res.stop_reason === "refusal") return json({ error: "rechazada" }, 200, origin);
    const answer = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return json({ answer, left }, 200, origin);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "ocupado" }, 503, origin);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "no-configurado" }, 503, origin);
    return json({ error: "proveedor" }, 502, origin);
  }
}

/* ------------------------------------------------ token de sesión de Firebase (RS256) */

let keys: { at: number; jwks: (JsonWebKey & { kid: string })[] } | null = null;

async function verifyIdToken(token: string, projectId: string): Promise<string> {
  const [h, p, s] = token.split(".");
  const header = JSON.parse(atob64(h)) as { alg: string; kid: string };
  const claims = JSON.parse(atob64(p)) as { iss: string; aud: string; exp: number; iat: number; sub: string };
  const now = Date.now() / 1000;
  if (header.alg !== "RS256" || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw 0;
  if (claims.exp < now || claims.iat > now + 300 || !claims.sub) throw 0;
  if (!keys || Date.now() - keys.at > 3600e3) {
    const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    keys = { at: Date.now(), jwks: ((await r.json()) as { keys: (JsonWebKey & { kid: string })[] }).keys };
  }
  const jwk = keys.jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw 0;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw 0;
  return claims.sub;
}

const atob64 = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
const bytes = (s: string) => Uint8Array.from(atob64(s), (c) => c.charCodeAt(0));

/* ------------------------------------------------ tope diario (aiUsage/{uid_fecha}) */

// ponytail: leer y escribir no es atómico; dos preguntas simultáneas pueden pasar el tope por una.
async function spend(env: AiEnv, project: string, uid: string, token: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/${env.DATABASE}/documents/aiUsage/${uid}_${day}`;
  const auth = { Authorization: `Bearer ${token}` };
  const cur = await fetch(url, { headers: auth });
  const used = cur.ok ? Number(((await cur.json()) as { fields?: { count?: { integerValue?: string } } }).fields?.count?.integerValue ?? 0) : 0;
  if (used >= DAILY_LIMIT) return -1;
  await fetch(`${url}?updateMask.fieldPaths=count&updateMask.fieldPaths=uid`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { count: { integerValue: String(used + 1) }, uid: { stringValue: uid } } }),
  });
  return DAILY_LIMIT - used - 1;
}
