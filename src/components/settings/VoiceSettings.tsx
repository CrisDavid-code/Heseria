/**
 * Configuración → Lectura en voz alta: elegir la voz (las más naturales primero) y probarla.
 */
import { Check, Download, Play } from "lucide-react";
import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/states";
import { useAsync } from "@/hooks/useAsync";
import { speakOne, stopAll } from "@/hooks/useSpeech";
import { chooseVoice, chosenVoiceId, listVoices, voiceLabel } from "@/lib/voices";
import { cn } from "@/lib/utils";

const SAMPLE = "En el principio era el Verbo, y el Verbo era con Dios, y el Verbo era Dios.";

export function VoiceSettings() {
  const voices = useAsync(() => listVoices(), []);
  const [chosen, setChosen] = useState(chosenVoiceId);
  const best = voices.data?.[0]?.id ?? null;
  const active = chosen ?? best;

  async function test(id: string) {
    chooseVoice(id);
    setChosen(id);
    await stopAll();
    await speakOne(SAMPLE, 1).catch(() => undefined);
  }

  if (voices.loading) return <ListSkeleton count={3} />;
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Heseria lee con las voces de tu teléfono. Las marcadas como naturales suenan humanas. Toca una
        para escucharla y elegirla.
      </p>
      {!voices.data?.length ? (
        <p className="text-sm text-muted-foreground">Este dispositivo no tiene voces en español instaladas.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {voices.data.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => void test(v.id)}
                className={cn("flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm", active === v.id ? "border-primary bg-primary/10" : "border-border")}
              >
                {active === v.id ? <Check className="size-4 shrink-0 text-primary" /> : <Play className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate">{voiceLabel(v)}</span>
                {v.quality >= 30 && <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[0.65rem] text-success">Natural</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {Capacitor.getPlatform() === "android" && (
        <Button
          variant="outline"
          full
          onClick={async () => {
            const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
            await TextToSpeech.openInstall().catch(() => undefined);
          }}
        >
          <Download className="size-4" /> Instalar voces naturales de Google
        </Button>
      )}
    </div>
  );
}
