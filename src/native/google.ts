/**
 * HESERIA — Entrar con Google.
 *
 * El mismo código sirve en el navegador y en la app instalada: el plugin usa
 * la hoja nativa de Google en Android e iOS y el flujo web en el navegador.
 * De ahí solo sacamos el *ID token*, que es lo único que el servidor acepta;
 * la verificación de verdad ocurre allí, contra las claves públicas de Google.
 *
 * El `clientId` no es un secreto: Google lo expone en cada petición. Por eso
 * puede venir del servidor y vivir en el cliente sin problema.
 */
import { SocialLogin } from "@capgo/capacitor-social-login";

let initializedFor: string | null = null;

/** Prepara el plugin. Es barato repetirlo, pero solo hace falta una vez. */
async function ensureInitialized(clientId: string): Promise<void> {
  if (initializedFor === clientId) return;
  await SocialLogin.initialize({ google: { webClientId: clientId } });
  initializedFor = clientId;
}

/**
 * Abre el selector de cuentas de Google y devuelve el ID token.
 * Devuelve `null` si la persona cierra el diálogo sin elegir cuenta: eso no es
 * un error que merezca un mensaje rojo.
 */
export async function googleIdToken(clientId: string): Promise<string | null> {
  await ensureInitialized(clientId);

  let response;
  try {
    response = await SocialLogin.login({
      provider: "google",
      options: { scopes: ["email", "profile"] },
    });
  } catch (err) {
    if (isCancelled(err)) return null;
    throw err;
  }

  const result = response.result as { idToken?: string | null } | undefined;
  const idToken = result?.idToken ?? null;
  if (!idToken) {
    throw new Error("Google no devolvió el token de identidad. Intenta de nuevo.");
  }
  return idToken;
}

/** Cierra la sesión de Google, para que la próxima vez vuelva a preguntar. */
export async function googleSignOut(): Promise<void> {
  if (!initializedFor) return;
  try {
    await SocialLogin.logout({ provider: "google" });
  } catch {
    // Si no había sesión abierta no hay nada que cerrar.
  }
}

/** Cancelar no es fallar: Google lo comunica de formas distintas por plataforma. */
function isCancelled(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    message.includes("cancel") ||
    message.includes("canceled") ||
    message.includes("cancelled") ||
    message.includes("dismiss") ||
    message.includes("closed by user") ||
    message.includes("12501")
  );
}
