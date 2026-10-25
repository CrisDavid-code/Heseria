import {
  BookMarked, BookOpen, CalendarDays, Church, Clapperboard, Compass, Download, GraduationCap,
  HandHeart, Heart, HeartHandshake, History, Home, LayoutDashboard, Library, type LucideIcon, MessageSquare, Mic2,
  Music, Settings, Sparkles, Tv, User, Users, Video, Bell,
} from "lucide-react";
import { isSuperAdmin, portalsFor } from "@/lib/permissions";
import type { TKey } from "@/i18n/locales";
import type { Role } from "@/types";

/**
 * HESERIA — Mobile navigation model.
 *
 * Five bottom tabs, each owning a stack of screens. Anything outside those
 * stacks is reached from the account sheet or from in-content links, never
 * from a permanent sidebar (spec §4, §5).
 */

export interface TabDef {
  id: string;
  /** Texto en español: es lo que se ve si falta la traducción. */
  label: string;
  /** Clave para traducirlo. Ver `src/i18n`. Sin ella se usa `label`. */
  labelKey?: TKey;
  href: string;
  icon: LucideIcon;
  /** Every path prefix that keeps this tab highlighted. */
  match: string[];
  /** Segmented sub-navigation shown under the top bar. */
  sections: { label: string; href: string }[];
}

export const TABS: TabDef[] = [
  {
    id: "inicio",
    label: "Inicio",
    labelKey: "nav.home",
    href: "/home",
    icon: Home,
    match: ["/home", "/notifications", "/profile", "/settings"],
    sections: [
      { label: "Para ti", href: "/home" },
      { label: "Continuar viendo", href: "/home?vista=viendo" },
      { label: "Continuar escuchando", href: "/home?vista=escuchando" },
      { label: "Recomendaciones", href: "/home?vista=recomendaciones" },
    ],
  },
  {
    id: "explorar",
    label: "Explorar",
    labelKey: "nav.explore",
    href: "/explore",
    icon: Compass,
    match: [
      "/explore", "/search", "/music", "/podcasts", "/sermons", "/videos", "/academy", "/courses",
    ],
    // Cada opción vive en una sola pestaña: iglesias, eventos y ministerios están en Comunidad.
    sections: [
      { label: "Descubrir", href: "/explore" },
      { label: "Música", href: "/music" },
      { label: "Podcasts", href: "/podcasts" },
      { label: "Sermones", href: "/sermons" },
      { label: "Videos", href: "/videos" },
      { label: "Cursos", href: "/academy" },
    ],
  },
  {
    id: "biblia",
    label: "Biblia",
    labelKey: "nav.bible",
    href: "/bible",
    icon: BookOpen,
    match: ["/bible", "/devotionals", "/plans", "/prayer"],
    sections: [
      { label: "Biblia", href: "/bible" },
      { label: "Devocionales", href: "/devotionals" },
      { label: "Planes", href: "/plans" },
      { label: "Oración", href: "/prayer" },
    ],
  },
  {
    id: "comunidad",
    label: "Comunidad",
    labelKey: "nav.community",
    href: "/community",
    icon: Users,
    match: ["/community", "/groups", "/messages", "/calls", "/churches", "/my-church", "/events", "/ministries"],
    sections: [
      { label: "Feed", href: "/community" },
      { label: "Grupos", href: "/groups" },
      { label: "Mensajes", href: "/messages" },
      { label: "Iglesias", href: "/churches" },
      { label: "Eventos", href: "/events" },
      { label: "Ministerios", href: "/ministries" },
    ],
  },
  {
    id: "biblioteca",
    label: "Biblioteca",
    labelKey: "nav.library",
    href: "/library",
    icon: Library,
    match: ["/library", "/foundation"],
    sections: [
      { label: "Guardados", href: "/library?tab=guardados" },
      { label: "Música", href: "/library?tab=musica" },
      { label: "Videos", href: "/library?tab=videos" },
      { label: "Cursos", href: "/library?tab=cursos" },
      { label: "Historial", href: "/library?tab=historial" },
      { label: "Descargas", href: "/library?tab=descargas" },
    ],
  },
];

/**
 * Barra del superadministrador: no usa la app como usuario, solo administra
 * (patrón del skill: la cuenta admin solo ve el panel).
 */
export const OWNER_TABS: TabDef[] = [
  { id: "panel", label: "Panel", href: "/admin", icon: LayoutDashboard, match: ["/admin"], sections: [] },
  { id: "fundacion", label: "Fundación", href: "/admin/foundation", icon: HandHeart, match: ["/admin/foundation"], sections: [] },
  { id: "comentarios", label: "Comentarios", href: "/admin/feedback", icon: MessageSquare, match: ["/admin/feedback"], sections: [] },
  { id: "cuenta", label: "Cuenta", href: "/settings", icon: Settings, match: ["/settings", "/notifications"], sections: [] },
];

/** Las pestañas de cada cuenta: el superadmin tiene las suyas. */
export const tabsFor = (user: { email?: string; role?: Role } | null | undefined) =>
  isSuperAdmin(user) ? OWNER_TABS : TABS;

/** Rutas que el superadmin puede abrir; todo lo demás lo devuelve al panel. */
export const ownerAllowed = (pathname: string) => OWNER_TABS.some((t) => t.match.some((m) => pathname === m || pathname.startsWith(`${m}/`)));

/** Which tab owns a given pathname. Falls back to the first tab. */
export function tabForPath(pathname: string, tabs: TabDef[] = TABS): TabDef {
  // La coincidencia más larga gana: /admin/foundation es Fundación, no Panel.
  let best: TabDef | undefined;
  let len = -1;
  for (const t of tabs) {
    for (const m of t.match) {
      if ((pathname === m || pathname.startsWith(`${m}/`)) && m.length > len) {
        best = t;
        len = m.length;
      }
    }
  }
  return best ?? tabs[0];
}

/** Screens reachable from the account sheet rather than a tab. */
export interface SheetLink {
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
}

export const ACCOUNT_LINKS: SheetLink[] = [
  { label: "Mi perfil", href: "/profile", icon: User, description: "Tu actividad, cursos y playlists" },
  { label: "Notificaciones", href: "/notifications", icon: Bell, description: "Mensajes, oración y eventos" },
  { label: "Mi iglesia", href: "/my-church", icon: Church, description: "Horarios, ministerios y sermones" },
  { label: "Fundación", href: "/foundation", icon: HandHeart, description: "Casos, donaciones y voluntariado" },
  { label: "Configuración", href: "/settings", icon: Settings, description: "Cuenta, privacidad y descargas" },
];

const PORTAL_ICONS: Record<string, LucideIcon> = {
  "/church-admin": Church,
  "/teacher": GraduationCap,
  "/artist": Music,
  "/creator": Video,
  "/admin": Settings,
  "/admin/moderation": Settings,
};

/** Management portals the current role may open (spec §45). */
export function portalLinks(role: Role): SheetLink[] {
  return portalsFor(role).map((p) => ({
    label: p.label,
    href: p.href,
    icon: PORTAL_ICONS[p.href] ?? Settings,
  }));
}

/** Categories used by /explore and the search filters. */
export const EXPLORE_CATEGORIES: { label: string; href: string; icon: LucideIcon; gradient: string }[] = [
  { label: "Biblia", href: "/bible", icon: BookOpen, gradient: "from-cyan-500/70 to-blue-700/70" },
  { label: "Música", href: "/music", icon: Music, gradient: "from-fuchsia-400/70 to-indigo-800/70" },
  { label: "Podcasts", href: "/podcasts", icon: Mic2, gradient: "from-amber-400/70 to-orange-700/70" },
  { label: "Sermones", href: "/sermons", icon: Clapperboard, gradient: "from-teal-400/70 to-emerald-700/70" },
  { label: "Videos", href: "/videos", icon: Video, gradient: "from-sky-400/70 to-indigo-800/70" },
  { label: "Cursos", href: "/academy", icon: GraduationCap, gradient: "from-lime-400/70 to-teal-800/70" },
  { label: "Iglesias", href: "/churches", icon: Church, gradient: "from-cyan-500/70 to-blue-700/70" },
  { label: "Ministerios", href: "/ministries", icon: HeartHandshake, gradient: "from-teal-400/70 to-emerald-700/70" },
  { label: "Eventos", href: "/events", icon: CalendarDays, gradient: "from-amber-400/70 to-orange-700/70" },
  { label: "Comunidad", href: "/community", icon: Users, gradient: "from-sky-400/70 to-indigo-800/70" },
  { label: "Fundación", href: "/foundation", icon: HandHeart, gradient: "from-rose-400/70 to-purple-800/70" },
];
