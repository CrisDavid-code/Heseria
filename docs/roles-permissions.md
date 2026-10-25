# Roles y permisos

Definidos en [`src/lib/permissions.ts`](../src/lib/permissions.ts).

> **Aviso.** Estos permisos son **solo de interfaz**: deciden qué ve y qué puede intentar
> cada rol. La autorización real la aplica el servidor en cada endpoint
> ([`server/src/auth.js`](../server/src/auth.js)), con la misma tabla. Nunca trates este
> archivo como seguridad.

---

## 1. Los quince roles

| Rol | Etiqueta |
| --- | --- |
| `visitor` | Visitante |
| `user` | Usuario |
| `member` | Miembro de iglesia |
| `server` | Servidor |
| `leader` | Líder |
| `youth_leader` | Líder juvenil |
| `teacher` | Maestro |
| `musician` | Músico |
| `artist` | Artista |
| `pastor` | Pastor |
| `missionary` | Misionero |
| `creator` | Creador |
| `church_admin` | Administrador de iglesia |
| `moderator` | Moderador |
| `admin` | Administrador global |

---

## 2. Permisos

`canView`, `canCreate`, `canEdit`, `canDelete`, `canManage`, `canModerate`,
`canPublish`, `canManageChurch`, `canManageCourses`, `canManageFoundation`.

| Rol | Permisos |
| --- | --- |
| visitor | ver |
| user · member | ver, crear |
| server | ver, crear, editar |
| leader · youth_leader | + gestionar |
| musician | ver, crear, editar |
| teacher | publicar, borrar, **gestionar cursos** |
| artist · creator | publicar, borrar |
| pastor | publicar, gestionar, **gestionar iglesia** |
| missionary | crear, editar, **gestionar fundación** |
| church_admin | publicar, gestionar, **iglesia + cursos** |
| moderator | ver, **moderar**, borrar |
| admin | todos |

Uso:

```ts
import { can, canAny, ROLE_LABELS } from "@/lib/permissions";

if (can(role, "canManageChurch")) { /* … */ }
```

---

## 3. Portales por rol

`portalsFor(role)` decide qué aparece en la sección **Gestión** de la hoja de cuenta:

| Portal | Quién entra |
| --- | --- |
| `/church-admin` | pastor, church_admin, admin |
| `/teacher` | teacher, church_admin, admin |
| `/artist` | artist, musician |
| `/creator` | creator, admin |
| `/admin/moderation` | moderator |
| `/admin` | admin |

---

## 4. Inicio adaptativo

`/home` cambia sus accesos rápidos según el rol:

| Rol | Accesos |
| --- | --- |
| pastor | Sermones, miembros, peticiones, eventos |
| church_admin | Panel, miembros, donaciones, eventos |
| teacher | Cursos, estudiantes, evaluaciones, certificados |
| musician | Ensayo, cursos de música, ministerio, eventos |
| artist | Música, estadísticas, eventos, álbumes |
| creator | Contenido, publicar video, estadísticas, comunidad |
| missionary | Casos, voluntariado, oración, comunidad |
| admin | Panel global, moderación, iglesias, reportes |
| resto | Biblia, devocional, música, oración |

Además, `recommendationService.forYou(role)` reordena las filas de recomendación: a un
músico le encabeza música, a un pastor sermones, a un maestro cursos.

---

## 5. Cuentas de demostración

El cambiador de roles de la interfaz **se eliminó**: cualquiera podía ponerse el rol de
administración global desde la hoja de cuenta. Ahora el rol lo decide la cuenta con la
que se entra, y el servidor lo comprueba en cada petición.

Para ver la app con otro rol se entra con la cuenta correspondiente:
`admin@heseria.app`, `pastor@heseria.app`, `teacher@heseria.app`, `artist@heseria.app`…
La lista completa está en [`backend.md`](backend.md#cuentas-sembradas).

**Bórralas o cámbiales la contraseña antes de publicar**, y quita el bloque de
credenciales de prueba de la pantalla de acceso.

## 6. Qué aplica el servidor

1. El rol se guarda en la cuenta y viaja en el token.
2. Cada endpoint se valida con `requirePermission` o `requireRole`.
3. Reglas propias: solo la administración global reparte roles y no puede quitarse el
   suyo; nadie suspende ni borra su propia cuenta; quien publica contenido solo gestiona
   el suyo.

Queda pendiente:

- **Permisos por ámbito.** Un `church_admin` debería gestionar **su** iglesia, no
  cualquiera. Hoy el permiso es global dentro de su tipo.
- **Auditoría** de las acciones administrativas: quién publicó, moderó, envió una
  notificación o cambió un rol.
