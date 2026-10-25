/**
 * HESERIA — Si una pantalla falla, no se queda en blanco.
 *
 * Plantilla del skill de Aguiteks: se muestra qué pasó y se ofrece mandar el
 * error a la administración (colección `feedback`). Así llegan los fallos
 * reales que ocurren en los teléfonos, que de otro modo nadie vería.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { sendFeedback } from "@/services";

interface State {
  error: Error | null;
  sent: "no" | "sending" | "yes" | "failed";
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, sent: "no" };
  private info = "";

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, sent: "no" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.info = `${info.componentStack ?? ""}`.trim().split("\n").slice(0, 6).join("\n");
    console.error(error);
  }

  private async report() {
    const e = this.state.error!;
    this.setState({ sent: "sending" });
    try {
      await sendFeedback({
        type: "bug",
        screen: location.pathname,
        message: `Error automático: ${e.message}\n\n${(e.stack ?? "").slice(0, 900)}\n\n${this.info}`,
      });
      this.setState({ sent: "yes" });
    } catch {
      this.setState({ sent: "failed" });
    }
  }

  render() {
    const { error, sent } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <AlertTriangle className="size-10 text-warning" aria-hidden />
        <h1 className="font-display text-xl font-semibold">Algo salió mal en esta pantalla</h1>
        <p className="text-sm text-muted-foreground">
          Tus datos están a salvo. Mándanos el reporte para corregirlo y vuelve a intentarlo.
        </p>
        <p className="w-full break-words rounded-xl bg-muted p-3 text-left font-mono text-xs text-muted-foreground">
          {error.message}
        </p>
        <button
          type="button"
          disabled={sent === "sending" || sent === "yes"}
          onClick={() => void this.report()}
          className="min-h-12 w-full rounded-full bg-primary px-6 font-semibold text-primary-foreground transition active:scale-[0.97] disabled:opacity-60"
        >
          {sent === "yes"
            ? "Reporte enviado, gracias"
            : sent === "sending"
              ? "Enviando…"
              : sent === "failed"
                ? "No se pudo enviar. Reintentar"
                : "Enviar reporte del error"}
        </button>
        <button
          type="button"
          onClick={() => {
            this.setState({ error: null, sent: "no" });
            history.back();
          }}
          className="min-h-12 w-full rounded-full border border-border px-6 font-semibold transition active:scale-[0.97]"
        >
          Regresar
        </button>
      </div>
    );
  }
}
