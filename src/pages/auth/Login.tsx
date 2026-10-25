import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { InstallInvite } from "@/components/InstallInvite";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/primitives";
import { useAction } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { authService } from "@/services";
import { useSession } from "@/store";

export default function Login() {
  usePageMeta("Iniciar sesión", "Entra a tu cuenta de Heseria.");
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useSession();
  const { execute, pending, error } = useAction(authService.login);

  // Vuelve a donde iba antes de que la sesión la enviara aquí.
  const from = (location.state as { from?: string } | null)?.from ?? "/home";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const session = await execute({ email, password, remember });
    if (session) {
      await signIn(session);
      toast.success(`Hola de nuevo, ${session.user.firstName}`);
      navigate(from, { replace: true });
    }
  }

  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Inicia sesión</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Continúa donde lo dejaste: tus planes, cursos y comunidad te esperan.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <Field label="Correo electrónico" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            aria-invalid={Boolean(error)}
            required
          />
        </Field>

        <Field label="Contraseña" htmlFor="password" required>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              className="pr-11"
              aria-invalid={Boolean(error)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-1 top-1 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        )}

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
            Recordar sesión
          </label>
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button type="submit" full size="lg" loading={pending}>
          Iniciar sesión
        </Button>
      </form>

      <GoogleSignIn label="Entrar con Google" />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Crea una gratis
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        ¿Algo no funciona?{" "}
        <Link to="/feedback" className="font-medium text-primary hover:underline">
          Repórtalo
        </Link>
      </p>
      <InstallInvite className="mt-6" />
    </>
  );
}
