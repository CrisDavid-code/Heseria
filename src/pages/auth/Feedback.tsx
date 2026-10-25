import { Link } from "react-router-dom";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useSession } from "@/store";

/** Pública: una falla al entrar o registrarse también tiene que poder reportarse. */
export default function Feedback() {
  usePageMeta("Reportar una falla", "Cuéntanos qué no funciona en Heseria.");
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {signedIn ? "Sugerir o reportar" : "Reportar una falla"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {signedIn
          ? "Cuéntanos qué no funciona o qué te gustaría ver en Heseria."
          : "Cuéntanos qué no funciona. Para sugerir funciones, inicia sesión."}
      </p>
      <div className="mt-6">
        <FeedbackForm screen="pública" allowIdea={signedIn} />
      </div>
      <p className="mt-6 text-center text-sm">
        <Link to={signedIn ? "/home" : "/login"} className="font-medium text-primary hover:underline">
          Volver
        </Link>
      </p>
    </>
  );
}
