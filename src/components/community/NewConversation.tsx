/**
 * HESERIA — Empezar una conversación.
 *
 * Busca a cualquier persona de la plataforma y abre el chat. Si ya existía una
 * conversación con ella, se reutiliza en vez de crear una duplicada.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/media/covers";
import { BottomSheet, BottomSheetContent } from "@/components/ui/overlays";
import { Input } from "@/components/ui/primitives";
import { ListSkeleton } from "@/components/states";
import { useAsync } from "@/hooks/useAsync";
import { messageService, userService } from "@/services";
import { useSession } from "@/store";
import { fold } from "@/lib/countries";

export function NewConversationSheet({
  open,
  onOpenChange,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Recibe el identificador de la conversación lista para abrir. */
  onOpened: (conversationId: string) => void;
}) {
  const { user } = useSession();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const people = useAsync(() => userService.list(), []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const id = window.setTimeout(() => searchRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, [open]);

  const results = useMemo(() => {
    const term = fold(query.trim());
    return (people.data ?? [])
      .filter((p) => p.id !== user.id)
      .filter(
        (p) =>
          !term ||
          fold(p.name).includes(term) ||
          fold(p.handle).includes(term) ||
          fold(p.city ?? "").includes(term),
      )
      .slice(0, 60);
  }, [people.data, query, user.id]);

  async function start(personId: string) {
    setBusy(personId);
    try {
      const { id } = await messageService.openWith(personId);
      onOpenChange(false);
      onOpened(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo abrir la conversación.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title="Nuevo mensaje"
        description="Busca a quien quieras escribirle."
        fullScreen
      >
        <div className="mx-auto flex h-full max-w-md flex-col">
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre o usuario"
              aria-label="Buscar persona"
              autoCapitalize="off"
              className="pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Borrar búsqueda"
                className="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-4">
            {people.loading ? (
              <ListSkeleton />
            ) : results.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-muted-foreground">
                {query
                  ? `No encontramos a nadie con «${query}».`
                  : "Todavía no hay personas a las que escribir."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {results.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void start(person.id)}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors active:bg-secondary disabled:opacity-60"
                    >
                      <UserAvatar user={person} className="size-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{person.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{person.handle}
                          {person.city ? ` · ${person.city}` : ""}
                        </span>
                      </span>
                      {busy === person.id && (
                        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
