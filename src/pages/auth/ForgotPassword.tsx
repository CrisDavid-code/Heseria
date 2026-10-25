import { ArrowLeft, MailCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { useAction } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { authService } from "@/services";

/**
 * Recuperar la contraseña.
 *
 * Firebase manda el correo con un enlace seguro: la contraseña nueva se escribe
 * en esa página, no en la app. Por eso aquí solo se pide el correo.
 */
export default function ForgotPassword() {
  usePageMeta("Recuperar contraseña", "Te enviamos un enlace para restablecer tu contraseña.");
  const { execute, pending, error: failure } = useAction(authService.requestPasswordReset);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Escribe un correo válido.");
      return;
    }
    setError(undefined);
    const result = await execute(email);
    if (result?.sent) setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-success/15 text-success">
          <MailCheck className="size-6" />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Revisa tu correo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Si <span className="font-medium text-foreground">{email}</span> tiene una cuenta en Heseria,
          te llegará un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.
        </p>

        <div className="mt-7 space-y-2.5">
          <Button
            variant="outline"
            full
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
          >
            Usar otro correo
          </Button>
          <Button asChild variant="ghost" full>
            <Link to="/login">Volver a iniciar sesión</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Link
        to="/login"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver
      </Link>

      <h1 className="font-display text-2xl font-semibold tracking-tight">¿Olvidaste tu contraseña?</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Escribe tu correo y te enviamos un enlace para crear una nueva.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <Field label="Correo electrónico" htmlFor="forgotEmail" required error={error ?? failure?.message}>
          <Input
            id="forgotEmail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              // El error se va al corregir el dato (lección del skill).
              setError(undefined);
            }}
            placeholder="tu@correo.com"
            aria-invalid={Boolean(error)}
          />
        </Field>

        <Button type="submit" full size="lg" loading={pending}>
          Enviar enlace
        </Button>
      </form>
    </>
  );
}
