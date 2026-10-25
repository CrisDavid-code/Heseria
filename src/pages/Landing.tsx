/**
 * HESERIA — Bienvenida (módulo 10 del skill: portada atractiva antes del login).
 *
 * Habla primero de Dios y después de la app: una promesa de la Biblia que cambia con un toque,
 * lo que la persona encontrará (tarjetas deslizables), una oración para hacer ahí mismo y el
 * evangelio en un versículo. En la app instalada se ve la primera vez; luego abre el acceso.
 */
import {
  ArrowRight, BookOpen, Church, HandHeart, Heart, Headphones, Music, RefreshCw, Sparkles,
  Sunrise, Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InstallInvite } from "@/components/InstallInvite";
import { HeseriaMark } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/usePageMeta";
import { DAILY, dailyVerse } from "@/data/daily-verses";
import { bookName, verseText } from "@/services/bible";

export const WELCOME_KEY = "heseria.welcomed";
const welcomed = () => {
  try {
    localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* sin almacenamiento: se vuelve a mostrar */
  }
};

const FEATURES = [
  { icon: BookOpen, title: "Su Palabra contigo", body: "8 versiones de la Biblia, sin conexión, con notas, resaltados y comparación.", to: "/bible", tint: "from-cyan-500/30 to-blue-700/30" },
  { icon: Sunrise, title: "Un encuentro cada mañana", body: "Devocionales, planes de lectura y el versículo del día en tu teléfono.", to: "/devotionals", tint: "from-amber-400/30 to-orange-700/30" },
  { icon: Heart, title: "No oras solo", body: "Comparte tus peticiones y ora por otros. Celebra cada respuesta de Dios.", to: "/prayer", tint: "from-rose-400/30 to-purple-800/30" },
  { icon: Headphones, title: "Alabanza y enseñanza", body: "Podcasts, sermones y música instrumental para orar y leer.", to: "/podcasts", tint: "from-fuchsia-400/30 to-indigo-800/30" },
  { icon: Church, title: "Tu iglesia y tu gente", body: "Encuentra congregaciones, grupos y una comunidad que camina contigo.", to: "/churches", tint: "from-teal-400/30 to-emerald-700/30" },
  { icon: HandHeart, title: "Fe que sirve", body: "Ayuda a quien lo necesita con la Fundación Heseria.", to: "/foundation", tint: "from-lime-400/30 to-teal-800/30" },
];

const PRAYER =
  "Señor Jesús, gracias porque me amas y diste tu vida por mí. Hoy abro mi corazón a ti: perdona mis pecados, guía mis pasos y enséñame a escuchar tu voz en tu Palabra. Quiero conocerte y caminar contigo cada día. Amén.";

/** Una promesa de la Biblia (RVR1960, dentro de la app). Empieza por la de hoy. */
function usePromise() {
  const [index, setIndex] = useState(() => DAILY.findIndex((d) => d.join() === dailyVerse().join()));
  const [verse, setVerse] = useState<{ ref: string; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const [book, ch, v] = DAILY[index];
    Promise.all([verseText(book, ch, v), bookName(book)])
      .then(([text, name]) => alive && setVerse({ text, ref: `${name} ${ch}:${v}` }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [index]);
  return { verse, next: () => setIndex((i) => (i + 1 + Math.floor(Math.random() * (DAILY.length - 1))) % DAILY.length) };
}

export default function Landing() {
  usePageMeta("Heseria — Dios te habla cada día", "La Biblia, devocionales, oración, música y comunidad para caminar con Dios cada día.");
  const promise = usePromise();
  const [prayed, setPrayed] = useState(false);
  const [showPrayer, setShowPrayer] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      {/* ----------------------------------------------------------- portada */}
      <section className="relative overflow-hidden hero-gradient">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-primary/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 size-96 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative mx-auto max-w-3xl px-5 pb-14 pt-safe">
          <div className="flex items-center justify-between pt-5">
            <span className="flex items-center gap-2.5">
              <HeseriaMark className="size-9" />
              <span className="font-display text-lg font-semibold tracking-tight">Heseria</span>
            </span>
            <Link to="/login" onClick={welcomed} className="text-sm font-medium text-primary">
              Ya tengo cuenta
            </Link>
          </div>

          <p className="mt-12 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3" /> Bienvenido a casa
          </p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Dios te habla <span className="bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-transparent">cada día</span>.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            Heseria es un lugar para escucharle en su Palabra, hablarle en oración y caminar con Él junto a tu
            iglesia y tu comunidad.
          </p>

          {/* Promesa interactiva */}
          <figure className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Una promesa para ti</p>
            <blockquote className="mt-3 min-h-20 font-display text-xl leading-snug" aria-live="polite">
              {promise.verse ? `«${promise.verse.text}»` : "…"}
            </blockquote>
            <figcaption className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{promise.verse?.ref}</span>
              <button
                type="button"
                onClick={promise.next}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm font-medium transition active:scale-95"
              >
                <RefreshCw className="size-3.5" /> Otra promesa
              </button>
            </figcaption>
          </figure>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="sm:flex-1">
              <Link to="/register" onClick={welcomed}>
                Comenzar mi camino <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="sm:flex-1">
              <Link to="/login" onClick={welcomed}>Iniciar sesión</Link>
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground sm:text-left">Gratis. Sin anuncios. Para toda la familia.</p>
        </div>
      </section>

      {/* ---------------------------------------------------- qué encontrarás */}
      <section className="mx-auto max-w-3xl py-14">
        <h2 className="px-5 font-display text-2xl font-semibold tracking-tight">Lo que encontrarás</h2>
        <p className="mt-1.5 px-5 text-sm text-muted-foreground">Desliza para conocer cada espacio.</p>
        <ul className="mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
          {FEATURES.map((f) => (
            <li key={f.title} className="w-[78%] shrink-0 snap-center sm:w-64">
              <Link
                to={f.to}
                onClick={welcomed}
                className={`flex h-full flex-col rounded-3xl border border-border bg-gradient-to-br ${f.tint} p-5 transition active:scale-[0.98]`}
              >
                <span className="grid size-11 place-items-center rounded-2xl bg-background/70 text-primary">
                  <f.icon className="size-5" />
                </span>
                <span className="mt-4 font-display text-lg font-semibold">{f.title}</span>
                <span className="mt-1.5 flex-1 text-sm text-muted-foreground">{f.body}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Entrar <ArrowRight className="size-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------- evangelio */}
      <section className="border-y border-border bg-surface-2/40">
        <div className="mx-auto max-w-3xl px-5 py-14 text-center">
          <Heart className="mx-auto size-8 text-rose-400" aria-hidden />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight">Eres amado por Dios</h2>
          <p className="mx-auto mt-4 max-w-xl font-display text-lg leading-relaxed">
            «Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en
            él cree, no se pierda, mas tenga vida eterna.»
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Juan 3:16</p>

          {!showPrayer ? (
            <Button size="lg" variant="outline" className="mt-8" onClick={() => setShowPrayer(true)}>
              <Sparkles className="size-4" /> Quiero hacer una oración
            </Button>
          ) : (
            <div className="mx-auto mt-8 max-w-xl rounded-3xl border border-border bg-surface p-5 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Ora conmigo</p>
              <p className="mt-3 leading-relaxed">{PRAYER}</p>
              {prayed ? (
                <p className="mt-4 rounded-2xl bg-primary/10 p-3 text-sm" role="status">
                  ¡Amén! El cielo se alegra contigo (Lucas 15:7). Crea tu cuenta y empieza a leer el Evangelio de Juan:
                  te acompañamos cada día.
                </p>
              ) : (
                <Button full className="mt-4" onClick={() => setPrayed(true)}>
                  Hice esta oración
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- comunidad */}
      <section className="mx-auto grid max-w-3xl gap-3 px-5 py-14 sm:grid-cols-3">
        {[
          { icon: Users, title: "Comunidad", body: "Grupos, mensajes y eventos con tu iglesia." },
          { icon: Music, title: "Adoración", body: "Música para orar y leer, sin distracciones." },
          { icon: Church, title: "Iglesias", body: "Encuentra una congregación cerca de ti." },
        ].map((c) => (
          <div key={c.title} className="rounded-3xl border border-border p-5">
            <c.icon className="size-5 text-primary" aria-hidden />
            <p className="mt-3 font-semibold">{c.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
          </div>
        ))}
      </section>

      {/* ------------------------------------------------------------ instalar */}
      <section className="mx-auto max-w-md px-5 pb-10">
        <InstallInvite />
      </section>

      {/* ----------------------------------------------------------- llamado */}
      <section className="hero-gradient border-t border-border">
        <div className="mx-auto max-w-3xl px-5 py-14 text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Empieza hoy con Dios</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            «Lámpara es a mis pies tu palabra, y lumbrera a mi camino.» — Salmo 119:105
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/register" onClick={welcomed}>
              Crear mi cuenta gratis <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 pb-safe">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <HeseriaMark className="size-6" /> Heseria · {new Date().getFullYear()}
          </span>
          <Link to="/feedback" className="hover:text-foreground">Reportar una falla</Link>
        </div>
      </footer>
    </div>
  );
}
