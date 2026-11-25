/**
 * Configuración → Lectura en voz alta: elegir la voz (las más naturales primero) y probarla.
 */
import { Check, Download, Play, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { installVoice, NEURAL_VOICES, neuralSupported, removeVoice } from "@/lib/neural-voice";
import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/states";
import { useAsync } from "@/hooks/useAsync";
import { speakOne, stopAll } from "@/hooks/useSpeech";
import { chooseVoice, chosenVoiceId, listVoices, neuralInstalled, voiceLabel } from "@/lib/voices";
import { cn } from "@/lib/utils";

const SAMPLE = "En el principio era el Verbo, y el Verbo era con Dios, y el Verbo era Dios.";

export function VoiceSettings() {
  const voices = useAsync(() => listVoices(), []);
  const neural = useAsync(() => neuralInstalled(), []);
  const [chosen, setChosen] = useState(chosenVoiceId);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const best = neural.data?.[0]?.id ?? voices.data?.[0]?.id ?? null;

  async function install(id: string) {
    setProgress((p) => ({ ...p, [id]: 0 }));
    try {
      await installVoice(id, (pct) => setProgress((p) => ({ ...p, [id]: pct })));
      neural.reload();
      await test(`neural:${id}`);
      toast.success("Voz natural lista. Funciona también sin conexión.");
    } catch {
      toast.error("No se pudo descargar la voz. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setProgress((p) => { const { [id]: _, ...rest } = p; return rest; });
    }
  }
  const active = chosen ?? best;

  async function test(id: string) {
    chooseVoice(id);
    setChosen(id);
    await stopAll();
    await speakOne(SAMPLE, 1).catch(() => undefined);
  }

  if (voices.loading) return <ListSkeleton count={3} />;
  const have = new Set((neural.data ?? []).map((v) => v.id.slice(7)));
  return (
    <div className="space-y-3">
      {neuralSupported() && (
        <section className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Voces naturales de Heseria</p>
          <p className="text-xs text-muted-foreground">
            Voces neuronales que suenan humanas. Se descargan una sola vez (unos 60 MB, mejor con wifi) y luego funcionan sin internet.
          </p>
          {NEURAL_VOICES.map((n) => {
            const id = `neural:${n.id}`;
            const pct = progress[n.id];
            return (
              <div key={n.id} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", active === id ? "border-primary bg-primary/10" : "border-border")}>
                <button type="button" disabled={!have.has(n.id)} onClick={() => void test(id)} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-100">
                  {active === id ? <Check className="size-4 shrink-0 text-primary" /> : <Play className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{n.name}</span>
                    <span className="block text-[0.65rem] text-muted-foreground">Licencia {n.license}{have.has(n.id) ? " · descargada" : ` · ${n.mb} MB`}</span>
                  </span>
                </button>
                {have.has(n.id) ? (
                  <button type="button" aria-label={`Quitar ${n.name}`} onClick={() => void removeVoice(n.id).then(() => { if (chosen === id) { chooseVoice(null); setChosen(null); } neural.reload(); })}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </button>
                ) : (
                  <Button size="sm" variant="outline" loading={pct !== undefined} onClick={() => void install(n.id)}>
                    {pct !== undefined ? `${pct}%` : <><Download className="size-3.5" /> Descargar</>}
                  </Button>
                )}
              </div>
            );
          })}
        </section>
      )}
      <p className="text-sm font-medium">Voces del teléfono</p>
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
