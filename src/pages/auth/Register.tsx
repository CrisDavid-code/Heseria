import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { CountryPicker } from "@/components/ui/CountryPicker";
import { Field, Input } from "@/components/ui/primitives";
import { useAction } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { authService } from "@/services";
import { useSession } from "@/store";

interface Errors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirm?: string;
  country?: string;
  city?: string;
  terms?: string;
}

export default function Register() {
  usePageMeta("Crear cuenta", "Crea tu cuenta gratuita en Heseria.");
  const navigate = useNavigate();
  const { signIn } = useSession();
  const { execute, pending, error: serverError } = useAction(authService.register);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirm: "",
    country: "",
    city: "",
    birthDate: "",
  });
  const [terms, setTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  /**
   * Solo se exige lo imprescindible para tener una cuenta: cómo te llamas, tu
   * correo y una contraseña. El resto ayuda a recomendarte contenido, pero
   * nadie debería quedarse fuera por no querer decir dónde vive.
   */
  function validate(): Errors {
    const e: Errors = {};
    if (!form.firstName.trim()) e.firstName = "Escribe tu nombre.";
    if (!form.lastName.trim()) e.lastName = "Escribe tu apellido.";
    if (!form.email.includes("@")) e.email = "Escribe un correo válido.";
    if (form.password.length < 8) e.password = "Usa al menos 8 caracteres.";
    if (form.confirm !== form.password) e.confirm = "Las contraseñas no coinciden.";
    if (!terms) e.terms = "Debes aceptar los términos para continuar.";
    return e;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    const session = await execute({ ...form, acceptedTerms: terms });
    if (session) {
      await signIn(session);
      toast.success("Cuenta creada. Personalicemos tu experiencia.");
      navigate("/onboarding", { replace: true });
    }
  }

  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Crea tu cuenta</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Es gratis y solo necesitamos tu nombre y tu correo. El resto puedes
        completarlo después.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" htmlFor="firstName" required error={errors.firstName}>
            <Input
              id="firstName"
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => set("firstName")(e.target.value)}
              aria-invalid={Boolean(errors.firstName)}
            />
          </Field>
          <Field label="Apellido" htmlFor="lastName" required error={errors.lastName}>
            <Input
              id="lastName"
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => set("lastName")(e.target.value)}
              aria-invalid={Boolean(errors.lastName)}
            />
          </Field>
        </div>

        <Field label="Correo electrónico" htmlFor="regEmail" required error={errors.email}>
          <Input
            id="regEmail"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            placeholder="tu@correo.com"
            aria-invalid={Boolean(errors.email)}
          />
        </Field>

        <Field
          label="Contraseña"
          htmlFor="regPassword"
          required
          error={errors.password}
          hint="Mínimo 8 caracteres."
        >
          <div className="relative">
            <Input
              id="regPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set("password")(e.target.value)}
              className="pr-11"
              aria-invalid={Boolean(errors.password)}
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

        <Field label="Confirmar contraseña" htmlFor="confirm" required error={errors.confirm}>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => set("confirm")(e.target.value)}
            aria-invalid={Boolean(errors.confirm)}
          />
        </Field>

        {/* Todo lo de abajo es opcional: se puede completar después. */}
        <details className="rounded-xl border border-border bg-muted/30 px-3.5 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium">
            <span className="flex items-center justify-between gap-2">
              Cuéntanos un poco más
              <span className="text-xs font-normal text-muted-foreground">Opcional</span>
            </span>
          </summary>

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Nos ayuda a mostrarte iglesias y eventos cerca de ti. Puedes dejarlo en
            blanco y completarlo cuando quieras desde tu perfil.
          </p>

          <div className="mt-3 space-y-3">
            <Field label="País" htmlFor="country">
              <CountryPicker
                id="country"
                value={form.country}
                onChange={set("country")}
              />
            </Field>

            <Field label="Ciudad" htmlFor="city">
              <Input
                id="city"
                autoComplete="address-level2"
                value={form.city}
                onChange={(e) => set("city")(e.target.value)}
                placeholder="Dónde vives"
              />
            </Field>

            <Field label="Fecha de nacimiento" htmlFor="birthDate">
              <Input
                id="birthDate"
                type="date"
                value={form.birthDate}
                onChange={(e) => set("birthDate")(e.target.value)}
              />
            </Field>
          </div>
        </details>

        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
            <Checkbox
              checked={terms}
              onCheckedChange={(v) => setTerms(Boolean(v))}
              className="mt-0.5"
              aria-invalid={Boolean(errors.terms)}
            />
            <span>
              Acepto los términos de uso y la política de privacidad de Heseria.
            </span>
          </label>
          {errors.terms && (
            <p role="alert" className="mt-1.5 text-xs text-destructive">
              {errors.terms}
            </p>
          )}
        </div>

        {serverError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive"
          >
            {serverError.message}
          </p>
        )}

        <Button type="submit" full size="lg" loading={pending}>
          Crear cuenta
        </Button>
      </form>

      <GoogleSignIn label="Crear cuenta con Google" />

      <p className="mt-7 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
