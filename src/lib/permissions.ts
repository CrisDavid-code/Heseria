/**
 * HESERIA — Frontend permissions.
 *
 * These gates exist for UX only: they decide what a role sees and can try.
 * Real authorization is enforced by firestore.rules. Never treat this as security.
 */
import type { Permission, Role } from "@/types";

const BASE: Permission[] = ["canView"];
const CONTRIBUTOR: Permission[] = [...BASE, "canCreate", "canEdit"];
const PUBLISHER: Permission[] = [...CONTRIBUTOR, "canPublish", "canDelete"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  visitor: ["canView"],
  user: [...BASE, "canCreate"],
  member: [...BASE, "canCreate"],
  server: [...CONTRIBUTOR],
  leader: [...CONTRIBUTOR, "canManage"],
  youth_leader: [...CONTRIBUTOR, "canManage"],
  teacher: [...PUBLISHER, "canManageCourses"],
  musician: [...CONTRIBUTOR],
  artist: [...PUBLISHER],
  pastor: [...PUBLISHER, "canManage", "canManageChurch"],
  // Solo la Fundación Heseria (admin) recauda: nadie más tiene este permiso.
  missionary: [...CONTRIBUTOR],
  creator: [...PUBLISHER],
  church_admin: [...PUBLISHER, "canManage", "canManageChurch", "canManageCourses"],
  moderator: [...BASE, "canModerate", "canDelete"],
  admin: [
    "canView", "canCreate", "canEdit", "canDelete", "canManage", "canModerate",
    "canPublish", "canManageChurch", "canManageCourses",
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  visitor: "Visitante",
  user: "Usuario",
  member: "Miembro de iglesia",
  server: "Servidor",
  leader: "Líder",
  youth_leader: "Líder juvenil",
  teacher: "Maestro",
  musician: "Músico",
  artist: "Artista",
  pastor: "Pastor",
  missionary: "Misionero",
  creator: "Creador",
  church_admin: "Administrador de iglesia",
  moderator: "Moderador",
  admin: "Administrador global",
};

/**
 * Superadministrador: la cuenta dueña de Heseria. Debe coincidir con `ownerEmail()` de
 * firestore.rules, que es donde de verdad se decide. Solo ve el panel y la Fundación.
 */
export const OWNER_EMAIL = "christianaguilar421@gmail.com";
export const isSuperAdmin = (user: { email?: string; role?: Role } | null | undefined) =>
  user?.role === "admin" && user.email?.toLowerCase() === OWNER_EMAIL;

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Which management portals a role may open. Drives the sidebar's "Gestión" group. */
export function portalsFor(role: Role): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  if (can(role, "canManageChurch")) out.push({ label: "Admin de iglesia", href: "/church-admin" });
  if (can(role, "canManageCourses")) out.push({ label: "Portal docente", href: "/teacher" });
  if (role === "artist" || role === "musician") out.push({ label: "Portal de artista", href: "/artist" });
  if (role === "creator" || role === "admin") out.push({ label: "Portal de creador", href: "/creator" });
  if (can(role, "canModerate") && role !== "admin") out.push({ label: "Moderación", href: "/admin/moderation" });
  if (role === "admin") out.push({ label: "Administración global", href: "/admin" });
  return out;
}
