import { Bell, ChevronLeft, LogOut, Search, Server } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { HeseriaWordmark } from "@/components/layout/Brand";
import {
  BottomSheet, BottomSheetContent, SheetAction,
} from "@/components/ui/overlays";
import { useT } from "@/i18n";
import { GenerativeCover, UserAvatar } from "@/components/media/covers";
import { mediaUrl } from "@/services/api";
import { ACCOUNT_LINKS, OWNER_TABS, portalLinks, tabForPath, tabsFor } from "@/lib/nav";
import { isSuperAdmin } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/permissions";
import { haptic } from "@/native";
import { useNotifications, useSession } from "@/store";
import { useScreenConfig } from "@/store/screen";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------- account sheet */

function AccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { user, role, signOut } = useSession();
  const owner = isSuperAdmin(user);
  const portals = owner ? [] : portalLinks(role);
  // El superadmin no tiene perfil de usuario, iglesia ni Fundación pública: solo su barra.
  const links = owner
    ? OWNER_TABS.map((t) => ({ label: t.label, href: t.href, icon: t.icon, description: undefined }))
    : ACCOUNT_LINKS;

  const go = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="Tu cuenta">
        <Link
          to="/profile"
          onClick={() => onOpenChange(false)}
          className="mb-4 flex items-center gap-3.5 rounded-2xl border border-border p-3.5 transition-colors active:bg-secondary"
        >
          <UserAvatar user={user} className="size-12" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base font-semibold">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
          </span>
        </Link>

        <div className="space-y-0.5">
          {links.map((l) => (
            <SheetAction
              key={l.href}
              icon={l.icon}
              label={l.label}
              description={l.description}
              onClick={() => go(l.href)}
            />
          ))}
        </div>

        {portals.length > 0 && (
          <>
            <p className="mb-1 mt-5 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Gestión
            </p>
            <div className="space-y-0.5">
              {portals.map((p) => (
                <SheetAction key={p.href} icon={p.icon} label={p.label} onClick={() => go(p.href)} />
              ))}
            </div>
          </>
        )}

        <div className="mt-5 border-t border-border pt-2">
          <SheetAction
            icon={LogOut}
            label="Cerrar sesión"
            destructive
            onClick={async () => {
              await signOut();
              onOpenChange(false);
              navigate("/login", { replace: true });
            }}
          />
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------- top bar */

export function AppHeader() {
  const { pathname } = useLocation();
  const t = useT();
  const navigate = useNavigate();
  const screen = useScreenConfig();
  const { user } = useSession();
  const { unread } = useNotifications();
  const [accountOpen, setAccountOpen] = useState(false);

  const tab = tabForPath(pathname, tabsFor(user));
  const isTabRoot = tab.sections.some((s) => s.href === pathname) || pathname === tab.href;
  const showSections = !screen.hideSections && !screen.back && tab.sections.length > 1;

  if (screen.immersive) return null;

  return (
    <>
      {/*
        Fondo sólido, sin backdrop-blur: en algunos Android el desenfoque en una
        barra fija deja la pantalla en blanco al abrir el teclado (lección del skill).
      */}
      <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-surface pt-safe">
        <div className="flex h-14 items-center gap-1 px-2">
          {screen.back ? (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                // Regresar, no «ir a»: si se empujara la pantalla anterior, Atrás
                // la repetiría. Si se llegó por un enlace o un aviso y no hay
                // historial, se va a la sección sin dejar rastro.
                const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
                if (idx > 0) navigate(-1);
                else navigate(tab.href, { replace: true });
              }}
              aria-label="Volver"
              className="tap-target grid shrink-0 place-items-center rounded-full text-foreground transition-colors active:bg-secondary"
            >
              <ChevronLeft className="size-6" />
            </button>
          ) : (
            <div className="pl-2">
              {pathname === "/home" && !screen.title ? (
                <HeseriaWordmark />
              ) : (
                <h1 className="truncate font-display text-lg font-semibold tracking-tight">
                  {/* Con los chips visibles, el chip activo ya dice dónde estás: el título es la pestaña. */}
                  {showSections ? (tab.labelKey ? t(tab.labelKey) : tab.label) : screen.title || (tab.labelKey ? t(tab.labelKey) : tab.label)}
                </h1>
              )}
            </div>
          )}

          {screen.back && (
            <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold">
              {screen.title}
            </h1>
          )}

          <div className="ml-auto flex items-center gap-0.5">
            {screen.actions}

            {!screen.back && (
              <>
                <Link
                  to="/search"
                  aria-label="Buscar"
                  className="tap-target grid place-items-center rounded-full text-muted-foreground transition-colors active:bg-secondary"
                >
                  <Search className="size-[1.35rem]" />
                </Link>
                <Link
                  to="/notifications"
                  aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ""}`}
                  className="tap-target relative grid place-items-center rounded-full text-muted-foreground transition-colors active:bg-secondary"
                >
                  <Bell className="size-[1.35rem]" />
                  {unread > 0 && (
                    <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-surface" />
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    haptic("light");
                    setAccountOpen(true);
                  }}
                  aria-label="Tu cuenta"
                  className="tap-target grid place-items-center rounded-full"
                >
                  {user.avatarUrl ? (
                    <img
                      src={mediaUrl(user.avatarUrl)}
                      alt={user.name}
                      className="size-8 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className={cn(
                        "grid size-8 place-items-center rounded-full bg-gradient-to-br text-[0.7rem] font-semibold text-white",
                        user.color,
                      )}
                    >
                      {user.firstName[0]}
                      {user.lastName[0]}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {showSections && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
            {tab.sections.map((s) => {
              const active = isTabRoot
                ? s.href === pathname || s.href.startsWith(`${pathname}?`)
                : pathname.startsWith(s.href.split("?")[0]) && s.href.split("?")[0] !== "/home";
              return (
                <Link
                  key={s.href}
                  to={s.href}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-[0.8rem] transition-colors",
                    active
                      ? "border-primary/40 bg-primary/15 font-medium text-primary"
                      : "border-border text-muted-foreground active:bg-secondary",
                  )}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} />
    </>
  );
}
