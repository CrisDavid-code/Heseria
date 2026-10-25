/**
 * HESERIA — Botón de «Continuar con Google».
 *
 * Solo aparece si el servidor dice que Google está configurado. Un botón que
 * no puede hacer su trabajo es peor que no tener botón: promete algo y falla.
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/hooks/useAsync";
import { googleIdToken } from "@/native/google";
import { isNative } from "@/native";
import { authService } from "@/services";
import { useSession } from "@/store";

export function GoogleSignIn({ label = "Continuar con Google" }: { label?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useSession();
  const providers = useAsync(() => authService.providers(), []);
  const [busy, setBusy] = useState(false);

  const google = providers.data?.google;
  if (!google?.enabled || !google.clientId) return null;

  const from = (location.state as { from?: string } | null)?.from ?? "/home";

  async function onClick() {
    setBusy(true);
    try {
      // App nativa: hoja de Google del plugin. Web: ventana de Firebase.
      let idToken: string | null = null;
      if (isNative()) {
        idToken = await googleIdToken(google!.clientId!);
        if (!idToken) return; // La persona cerró el diálogo.
      }

      const session = await authService.google(idToken);
      if (!session) return;
      await signIn(session);
      toast.success(
        session.created
          ? `Tu cuenta está lista, ${session.user.firstName}`
          : `Hola de nuevo, ${session.user.firstName}`,
      );
      navigate(session.created ? "/onboarding" : from, { replace: true });
    } catch (err) {
      toast.error(explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">o</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" full size="lg" loading={busy} onClick={() => void onClick()}>
        <GoogleMark />
        {label}
      </Button>
    </>
  );
}

/**
 * Traduce el fallo a algo que se pueda leer y, sobre todo, accionar.
 *
 * Google y el plugin devuelven sus mensajes en inglés y a veces solo un
 * código. Dejar «Failed to open popup» en pantalla no le dice a nadie que lo
 * que tiene que hacer es permitir las ventanas emergentes.
 */
function explain(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();

  if (raw.includes("popup")) {
    return "Tu navegador bloqueó la ventana de Google. Permite las ventanas emergentes de este sitio e inténtalo de nuevo.";
  }
  if (raw.includes("origin") || raw.includes("redirect_uri") || raw.includes("400")) {
    return "Esta dirección todavía no está autorizada en Google. Desde la app instalada sí funciona.";
  }
  if (raw.includes("network") || raw.includes("fetch")) {
    return "No hay conexión con Google. Revisa tu internet e inténtalo otra vez.";
  }
  if (raw.includes("10") && raw.includes("developer")) {
    return "La app no está registrada en Google con esta firma. Avísanos y lo corregimos.";
  }
  return err instanceof Error && err.message ? err.message : "No pudimos entrar con Google.";
}

/** La G de Google con sus colores oficiales, como pide su guía de marca. */
function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.8 2.6 13.6l7.8 6c1.9-5.6 7.2-10.1 13.6-10.1z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.4z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.4c-.5-1.4-.8-2.9-.8-4.4s.3-3 .8-4.4l-7.8-6C1 16.7 0 20.2 0 24s1 7.3 2.6 10.4l7.8-6z"
      />
      <path
        fill="#34A853"
        d="M24 47.5c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.7-4.5-13.6-10.1l-7.8 6C6.5 42.2 14.6 47.5 24 47.5z"
      />
    </svg>
  );
}
