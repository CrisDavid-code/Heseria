import {
  Bell, BookOpen, CalendarDays, Check, Church, GraduationCap, Heart, MessageSquare, Settings,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState } from "@/components/states";
import { Chip } from "@/components/ui/primitives";
import { usePageMeta } from "@/hooks/usePageMeta";
import { registerPush } from "@/native";
import { useNotifications } from "@/store";
import { useScreen } from "@/store/screen";
import { cn, timeAgo } from "@/lib/utils";
import type { NotificationItem } from "@/types";

const ICONS: Record<NotificationItem["category"], typeof Bell> = {
  mensajes: MessageSquare,
  oración: Heart,
  comunidad: Users,
  cursos: GraduationCap,
  eventos: CalendarDays,
  iglesia: Church,
  sistema: Settings,
};

const FILTERS: (NotificationItem["category"] | "todas")[] = [
  "todas", "mensajes", "oración", "comunidad", "cursos", "eventos", "iglesia", "sistema",
];

export default function Notifications() {
  usePageMeta("Notificaciones", "Todo lo que pasó mientras no estabas.");
  const { items, unread, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("todas");

  useScreen({
    title: "Notificaciones",
    back: true,
    hideSections: true,
    actions:
      unread > 0 ? (
        <button
          type="button"
          onClick={() => {
            markAllRead();
            toast.success("Todas marcadas como leídas");
          }}
          className="tap-target grid place-items-center rounded-full text-primary active:bg-secondary"
          aria-label="Marcar todas como leídas"
        >
          <Check className="size-5" />
        </button>
      ) : null,
  });

  const visible = filter === "todas" ? items : items.filter((n) => n.category === filter);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={async () => {
          const result = await registerPush();
          toast[result.granted ? "success" : "info"](
            result.granted
              ? "Notificaciones push activadas"
              : "Las notificaciones push se activarán en el dispositivo",
          );
        }}
        className="flex w-full items-center gap-3 rounded-xl border border-primary/25 bg-primary/8 p-3.5 text-left"
      >
        <Bell className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Activar notificaciones push</span>
          <span className="block text-xs text-muted-foreground">
            Recibe avisos de mensajes, oración y eventos en tu teléfono.
          </span>
        </span>
      </button>

      <div className="scroll-x -mx-4 flex gap-2 px-4">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === "todas" ? "Todas" : f[0].toUpperCase() + f.slice(1)}
          </Chip>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Sin notificaciones aquí"
          description="Cuando haya novedades en esta categoría te avisaremos."
          actionLabel="Ir al inicio"
          actionHref="/home"
        />
      ) : (
        <ul className="space-y-1">
          {visible.map((n) => {
            const Icon = ICONS[n.category];
            return (
              <li key={n.id}>
                <Link
                  to={n.href ?? "/home"}
                  onClick={() => markRead(n.id)}
                  className={cn(
                    "flex gap-3 rounded-xl p-3 transition-colors active:bg-secondary",
                    !n.read && "bg-primary/6",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full",
                      n.read ? "bg-secondary text-muted-foreground" : "bg-primary/15 text-primary",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span
                        className={cn("min-w-0 flex-1 text-sm", !n.read && "font-medium")}
                      >
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="No leída" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground clamp-2">
                      {n.body}
                    </span>
                    <span className="mt-1 block text-[0.68rem] text-muted-foreground/70">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        to="/bible"
        className="flex items-center gap-3 rounded-xl border border-border p-3.5 text-sm transition-colors active:bg-secondary"
      >
        <BookOpen className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">Configura tu recordatorio de lectura diaria</span>
      </Link>
    </div>
  );
}
