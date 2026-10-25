/**
 * HESERIA — Si una pantalla falla, no se queda en blanco y la falla se reporta sola.
 *
 * Plantilla del skill de Aguiteks (Chambas GT), con el reporte automático: en cuanto ocurre,
 * el error técnico llega a Administración → Comentarios sin que la persona tenga que tocar
 * nada, y se abre de una vez el formulario por si quiere contar qué estaba haciendo.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { reportError } from "@/lib/auto-report";

interface State {
  error: Error | null;
  sent: "sending" | "yes" | "failed";
  told: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, sent: "sending", told: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, sent: "sending", told: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error);
    const stack = `${info.componentStack ?? ""}`.trim().split("\n").slice(0, 6).join("\n");
    void reportError(error, stack).then((ok) => this.setState({ sent: ok ? "yes" : "failed" }));
  }

  render() {
    const { error, sent, told } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 bg-background p-6">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <h1 className="text-center font-display text-xl font-semibold">Algo salió mal en esta pantalla</h1>
        <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground" role="status">
          {sent === "yes" && <CheckCircle2 className="size-4 text-success" aria-hidden />}
          {sent === "sending"
            ? "Estamos enviando el reporte de la falla…"
            : sent === "yes"
              ? "Ya enviamos el reporte técnico. Tus datos están a salvo."
              : "No pudimos enviar el reporte (¿sin conexión?). Cuéntanos abajo y lo enviamos."}
        </p>

        {told ? (
          <p className="rounded-2xl bg-primary/10 p-3 text-center text-sm">Gracias. Lo revisaremos pronto.</p>
        ) : (
          <div className="rounded-2xl border border-border p-4">
            <p className="mb-2 text-sm font-medium">¿Qué estabas haciendo? (opcional)</p>
            <FeedbackForm
              screen={`${location.pathname} · ${error.message.slice(0, 80)}`}
              allowIdea={false}
              onSent={() => this.setState({ told: true })}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            this.setState({ error: null });
            history.back();
          }}
          className="min-h-12 w-full rounded-full border border-border px-6 font-semibold transition active:scale-[0.97]"
        >
          Regresar
        </button>
        <button
          type="button"
          onClick={() => location.assign("/")}
          className="min-h-12 w-full rounded-full px-6 text-sm font-medium text-primary"
        >
          Ir al inicio
        </button>
      </div>
    );
  }
}
