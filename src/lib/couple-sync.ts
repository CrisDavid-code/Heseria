/**
 * Lectura sincronizada en pareja (opt-in, por dispositivo). Con la opción activa, cada capítulo
 * que abres se comparte, y si tu pareja cambia de capítulo te avisa con un botón para ir allí
 * (no te mueve sin preguntar).
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { coupleService, type Couple } from "@/services";
import { auth } from "@/services/firebase";

const KEY = "heseria.coupleSync";

export function coupleSync(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setCoupleSync(id: string | null) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
}

export function useCoupleSync(book: string, chapter: number, bookName: (id: string) => string) {
  const navigate = useNavigate();
  const live = useRef<Couple | null>(null);
  const id = coupleSync();

  useEffect(() => {
    if (!id) return;
    return coupleService.watch(id, (c) => {
      if (!c) return setCoupleSync(null); // se desvincularon
      const prev = live.current?.passage;
      live.current = c;
      const p = c.passage;
      if (!p || p.by === auth.currentUser?.uid || (prev && prev.book === p.book && prev.chapter === p.chapter)) return;
      if (location.pathname === `/bible/${p.book}/${p.chapter}`) return;
      const name = c.names[p.by] || "Tu pareja";
      toast(`${name} está en ${bookName(p.book)} ${p.chapter}`, { action: { label: "Ir", onClick: () => navigate(`/bible/${p.book}/${p.chapter}`) } });
    });
  }, [id, navigate, bookName]);

  useEffect(() => {
    if (!id) return;
    const p = live.current?.passage;
    if (p && p.book === book && p.chapter === chapter) return;
    void coupleService.setPassage(id, book, chapter).catch(() => undefined);
  }, [id, book, chapter]);
}
