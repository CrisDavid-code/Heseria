import { ArrowLeft, Home, Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeseriaMark } from "@/components/layout/Brand";
import { GenerativeCover } from "@/components/media/covers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { usePageMeta } from "@/hooks/usePageMeta";
import { EXPLORE_CATEGORIES } from "@/lib/nav";

export default function NotFound() {
  usePageMeta("Página no encontrada", "La página que buscas no existe o cambió de dirección.");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5 py-12">
      <div className="w-full max-w-lg text-center">
        <Link to="/" className="mb-10 inline-flex items-center gap-2.5">
          <HeseriaMark />
          <span className="font-display text-lg font-semibold tracking-tight">Heseria</span>
        </Link>

        <p className="font-display text-7xl font-semibold tracking-tight text-primary sm:text-8xl">
          404
        </p>
        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
          Esta página no existe
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Puede que el enlace haya cambiado o que el contenido ya no esté disponible. Busca lo que
          necesitas o vuelve al inicio.
        </p>

        <form
          className="mt-7 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) navigate(`/search?q=${encodeURIComponent(query)}`);
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en Heseria"
              aria-label="Buscar en Heseria"
              className="pl-9"
            />
          </div>
          <Button type="submit">Buscar</Button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2.5">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" /> Volver
          </Button>
          <Button asChild variant="outline">
            <Link to="/home">
              <Home className="size-4" /> Ir al inicio
            </Link>
          </Button>
        </div>

        <div className="mt-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            O explora una sección
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {EXPLORE_CATEGORIES.slice(0, 6).map((c) => (
              <Link key={c.href} to={c.href} className="group">
                <GenerativeCover
                  seed={c.label}
                  gradient={c.gradient}
                  className="flex aspect-3/1 items-center justify-center transition-transform group-hover:-translate-y-0.5"
                  label={c.label}
                >
                  <span className="relative z-10 text-sm font-medium text-white">{c.label}</span>
                </GenerativeCover>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
