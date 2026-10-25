import {
  Bell, ChevronRight, Download, Globe, KeyRound, Languages, LogOut, MessageSquareWarning,
  Monitor, Moon, Palette, Shield, Sun, Trash2, User as UserIcon,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { UserAvatar } from "@/components/media/covers";
import { Button } from "@/components/ui/button";
import { SettingRow, SimpleSelect, Switch } from "@/components/ui/controls";
import { BottomSheet, BottomSheetContent, SheetAction } from "@/components/ui/overlays";
import { Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { isLocale, LOCALES, useT } from "@/i18n";
import { useAsync } from "@/hooks/useAsync";
import { usePageMeta } from "@/hooks/usePageMeta";
import { isNative, openExternal, platform, saveFile, scheduleDailyVerse } from "@/native";
import {
  accountProviders, authService, disableWebPush, enableWebPush, exportMyData, libraryService,
} from "@/services";
import { preferencesStore, usePreferences, useSession, useTheme, type ThemeMode } from "@/store";
import { useScreen } from "@/store/screen";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "cuenta", label: "Cuenta", icon: UserIcon },
  { id: "seguridad", label: "Seguridad", icon: KeyRound },
  { id: "privacidad", label: "Privacidad y datos", icon: Shield },
  { id: "notificaciones", label: "Recordatorios", icon: Bell },
  { id: "apariencia", label: "Apariencia", icon: Palette },
  { id: "idioma", label: "Idioma", icon: Languages },
  { id: "descargas", label: "Descargas", icon: Download },
  { id: "ayuda", label: "Reportar un problema o sugerir", icon: MessageSquareWarning },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "1.0.0";

export default function Settings() {
  usePageMeta("Configuración", "Ajusta tu cuenta, privacidad y apariencia.");
  const navigate = useNavigate();
  const { user, role, signOut, setUser } = useSession();
  const { mode, setMode } = useTheme();
  const prefs = usePreferences();
  const t = useT();
  const providers = accountProviders();

  const [open, setOpen] = useState<SectionId | null>(null);
  const [busy, setBusy] = useState(false);

  // Cuenta
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [bio, setBio] = useState(user.bio);
  const [city, setCity] = useState(user.city);

  // Seguridad
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  // Privacidad
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Recordatorio
  // APK: aviso local, activado por defecto. Web: push del Worker, solo si la persona lo activa.
  const [daily, setDaily] = useState(() =>
    isNative() ? localStorage.getItem("heseria.dailyVerse") !== "0" : Boolean(localStorage.getItem("heseria.pushToken")),
  );

  // Ayuda

  const downloads = useAsync(() => libraryService.downloads(), [open === "descargas"]);
  const usedMb = (downloads.data ?? []).reduce((n, d) => n + d.sizeMb, 0);

  useScreen({ title: "Configuración", back: true, hideSections: true });

  const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
    { value: "system", label: "Sistema", icon: Monitor },
  ];

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="surface-card flex items-center gap-3.5 p-4">
        <UserAvatar user={user} className="size-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <Badge variant="primary" className="mt-1.5">
            {ROLE_LABELS[role]}
          </Badge>
        </div>
      </div>

      {!providers.emailVerified && providers.password && (
        <div className="rounded-xl border border-warning/30 bg-warning/8 p-3.5">
          <p className="text-sm font-medium">Verifica tu correo</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Te mandamos un enlace a {user.email}. Verificarlo protege tu cuenta si olvidas la contraseña.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2.5"
            loading={busy}
            onClick={() => run(async () => {
              await authService.resendVerification();
              toast.success("Te reenviamos el correo de verificación.");
            })}
          >
            Reenviar correo
          </Button>
        </div>
      )}

      <ul className="overflow-hidden rounded-2xl border border-border">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setOpen(s.id)}
              className="flex w-full items-center gap-3.5 border-b border-border px-4 py-3.5 text-left transition-colors last:border-0 active:bg-secondary"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                <s.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">{s.label}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-border p-3.5 text-xs text-muted-foreground">
        <p>
          Heseria {VERSION} {isNative() ? `· app ${platform()}` : "· web"}
        </p>
        <p className="mt-1">
          Biblia: RVR1960, NTV, LBLA, DHH y TLA (© de sus editoriales); RV1909, King James y
          Bíblia Portuguesa Mundial (dominio público).
          Mapa de iglesias: © colaboradores de OpenStreetMap.
        </p>
        <button
          type="button"
          onClick={() => void openExternal("https://aguiteks.com/")}
          className="mt-1.5 font-medium text-primary"
        >
          By Aguiteks
        </button>
      </div>

      <Button
        variant="outline"
        full
        className="text-destructive"
        onClick={async () => {
          await signOut();
          navigate("/login", { replace: true });
        }}
      >
        <LogOut className="size-4" /> Cerrar sesión
      </Button>

      {/* ------------------------------------------------------------ cuenta */}
      <BottomSheet open={open === "cuenta"} onOpenChange={(v) => !v && setOpen(null)}>
        <BottomSheetContent title="Cuenta">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" htmlFor="set-first">
                <Input id="set-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label="Apellido" htmlFor="set-last">
                <Input id="set-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
            <Field
              label="Correo"
              htmlFor="set-email"
              hint={providers.emailVerified ? "Verificado." : "Pendiente de verificar."}
            >
              <Input id="set-email" value={user.email} disabled />
            </Field>
            <Field label="Biografía" htmlFor="set-bio">
              <Textarea id="set-bio" value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} />
            </Field>
            <Field label="Ciudad" htmlFor="set-city">
              <Input id="set-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Button
              full
              size="lg"
              loading={busy}
              disabled={firstName.trim().length < 2}
              onClick={() => run(async () => {
                const updated = await authService.updateProfile({
                  firstName: firstName.trim(), lastName: lastName.trim(), bio: bio.trim(), city: city.trim(),
                });
                setUser(updated);
                toast.success("Perfil actualizado");
                setOpen(null);
              })}
            >
              Guardar cambios
            </Button>
          </div>
        </BottomSheetContent>
      </BottomSheet>

      {/* --------------------------------------------------------- seguridad */}
      <BottomSheet open={open === "seguridad"} onOpenChange={(v) => !v && setOpen(null)}>
        <BottomSheetContent title="Seguridad">
          {providers.password ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (next.length < 6) return setPwError("La contraseña nueva necesita al menos 6 caracteres.");
                if (next !== confirm) return setPwError("Las contraseñas nuevas no coinciden.");
                void run(async () => {
                  await authService.changePassword(current, next);
                  setCurrent("");
                  setNext("");
                  setConfirm("");
                  toast.success("Contraseña actualizada");
                  setOpen(null);
                });
              }}
            >
              <Field label="Contraseña actual" htmlFor="pw-current">
                <Input id="pw-current" type="password" autoComplete="current-password" value={current}
                  onChange={(e) => { setCurrent(e.target.value); setPwError(null); }} />
              </Field>
              <Field label="Nueva contraseña" htmlFor="pw-new" hint="Mínimo 6 caracteres.">
                <Input id="pw-new" type="password" autoComplete="new-password" value={next}
                  onChange={(e) => { setNext(e.target.value); setPwError(null); }} />
              </Field>
              <Field label="Confirmar nueva contraseña" htmlFor="pw-confirm" error={pwError ?? undefined}>
                <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setPwError(null); }} />
              </Field>
              <Button type="submit" full size="lg" loading={busy} disabled={!current || !next}>
                Cambiar contraseña
              </Button>
            </form>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Entras con tu cuenta de Google, así que no tienes una contraseña de Heseria. La
              seguridad la gestiona Google desde tu cuenta.
            </p>
          )}
        </BottomSheetContent>
      </BottomSheet>

      {/* -------------------------------------------------------- privacidad */}
      <BottomSheet open={open === "privacidad"} onOpenChange={(v) => !v && setOpen(null)}>
        <BottomSheetContent title="Privacidad y datos">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Tu correo y tu fecha de nacimiento solo los ves tú. Tu nombre, tu foto y tu biografía los
            ven las personas de la comunidad. Tus peticiones privadas solo las ves tú.
          </p>
          <div className="mt-4 space-y-0.5">
            <SheetAction
              icon={Download}
              label="Descargar mis datos"
              description="Un archivo con todo lo que Heseria guarda de ti"
              onClick={() => run(async () => {
                const blob = await exportMyData();
                const result = await saveFile(blob, `heseria-mis-datos-${new Date().toISOString().slice(0, 10)}.json`);
                if (result.where === "failed") throw new Error("No se pudo guardar el archivo.");
                toast.success("Tus datos quedaron guardados");
              })}
            />
            <SheetAction
              icon={Trash2}
              label="Eliminar mi cuenta"
              destructive
              onClick={() => setConfirmDelete(true)}
            />
          </div>
          {confirmDelete && (
            <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/8 p-3.5">
              <p className="text-sm font-medium">¿Eliminar tu cuenta para siempre?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Se borran tu perfil y tu acceso. Esto no se puede deshacer.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-destructive text-destructive-foreground"
                  loading={busy}
                  onClick={() => run(async () => {
                    await authService.deleteAccount();
                    await signOut();
                    toast.success("Tu cuenta fue eliminada");
                    navigate("/login", { replace: true });
                  })}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>

      {/* ------------------------------------------------------- recordatorio */}
      <BottomSheet open={open === "notificaciones"} onOpenChange={(v) => !v && setOpen(null)}>
        <BottomSheetContent title="Recordatorios">
          <SettingRow
            title="Música al leer"
            description="Un instrumental suave mientras lees la Biblia o un devocional."
          >
            <Switch
              checked={prefs.readingMusic}
              aria-label="Música al leer"
              onCheckedChange={(v) => preferencesStore.set({ readingMusic: v })}
            />
          </SettingRow>
          <SettingRow
            title="Versículo del día"
            description="Un aviso cada mañana a las 7:00 para leer la Biblia."
          >
            <Switch
              checked={daily}
              aria-label="Recordatorio diario"
              onCheckedChange={async (v) => {
                if (!isNative()) {
                  const problem = v ? await enableWebPush() : (await disableWebPush(), null);
                  if (problem) return void toast.info(problem);
                  setDaily(v);
                  toast.success(v ? "Recibirás el versículo cada mañana" : "Aviso desactivado");
                  return;
                }
                const ok = await scheduleDailyVerse(v);
                if (!ok) {
                  toast.info(isNative()
                    ? "Activa los avisos de Heseria en los ajustes del teléfono."
                    : "Los recordatorios funcionan en la app instalada.");
                  return;
                }
                setDaily(v);
                localStorage.setItem("heseria.dailyVerse", v ? "1" : "0");
                toast.success(v ? "Te recordaremos cada mañana" : "Recordatorio desactivado");
              }}
            />
          </SettingRow>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Los mensajes, las oraciones y los anuncios llegan a la campana de la app mientras la
            tienes abierta.
          </p>
        </BottomSheetContent>
      </BottomSheet>

      {/* --------------------------------------------------------- apariencia */}
      <BottomSheet open={open === "apariencia"} onOpenChange={(v) => !v && setOpen(null)}>
        <BottomSheetContent title="Apariencia">
          <div className="grid grid-cols-3 gap-2.5">
            {themeOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMode(o.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors",
                  mode === o.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                <o.icon className="size-5" />
                <span className="text-xs font-medium">{o.label}</span>
              </button>
            ))}
          </div>
        </BottomSheetContent>
      </BottomSheet>

      {/* ------------------------------------------------------------- idioma */}
      <BottomSheet open={open === "idioma"} onOpenChange={(v) => !v && setOpen(null)}>
        <BottomSheetContent title={t("settings.language")}>
          <SimpleSelect
            value={prefs.language}
            onValueChange={(v) => {
              if (!isLocale(v)) return;
              preferencesStore.set({ language: v });
              toast.success(LOCALES.find((l) => l.code === v)?.name ?? v);
            }}
            options={LOCALES.map((l) => ({ value: l.code, label: l.name }))}
            ariaLabel="Idioma de la aplicación"
          />
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Globe className="mt-0.5 size-3.5 shrink-0" />
            {t("settings.languageHelp")}
          </p>
        </BottomSheetContent>
      </BottomSheet>

      {/* ---------------------------------------------------------- descargas */}
      <BottomSheet open={open === "descargas"} onOpenChange={(v) => !v && setOpen(null)}>
        <BottomSheetContent title="Descargas">
          <SettingRow title="Modo sin conexión" description="Muestra únicamente lo descargado.">
            <Switch
              checked={prefs.offline}
              onCheckedChange={(v) => preferencesStore.set({ offline: v })}
              aria-label="Modo sin conexión"
            />
          </SettingRow>
          <div className="mt-4 rounded-xl border border-border p-3.5">
            <p className="text-sm font-medium">Espacio usado</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {downloads.loading
                ? "Calculando…"
                : `${usedMb.toFixed(1)} MB en ${downloads.data?.length ?? 0} descargas`}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              loading={busy}
              disabled={!downloads.data?.length}
              onClick={() => run(async () => {
                for (const d of downloads.data ?? []) {
                  const kind = d.type === "Podcast" ? "podcast" : d.type.toLowerCase();
                  await libraryService.removeDownload(d.id, kind);
                }
                if (isNative()) {
                  const { Filesystem, Directory } = await import("@capacitor/filesystem");
                  await Filesystem.rmdir({ path: "Heseria", directory: Directory.Documents, recursive: true })
                    .catch(() => undefined);
                }
                downloads.reload();
                toast.success("Descargas eliminadas");
              })}
            >
              <Trash2 className="size-3.5" /> Borrar descargas
            </Button>
          </div>
        </BottomSheetContent>
      </BottomSheet>

      {/* -------------------------------------------------------------- ayuda */}
      <BottomSheet open={open === "ayuda"} onOpenChange={(v) => !v && setOpen(null)}>
        <BottomSheetContent title="Sugerir una función o reportar una falla">
          <FeedbackForm screen="configuración" onSent={() => setOpen(null)} />
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
