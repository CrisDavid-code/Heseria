import { cn } from "@/lib/utils";

export function HeseriaMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-[0.6rem] bg-[#EAEAEA] p-1",
        className,
      )}
      aria-hidden
    >
      {/* Logo oficial (docs/marca); los íconos salen de scripts/make-logo.py. */}
      <img src="/logo-mark.png" alt="" className="h-full w-full object-contain" />
    </span>
  );
}

export function HeseriaWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <HeseriaMark />
      <span className="font-display text-lg font-semibold tracking-tight">Heseria</span>
    </span>
  );
}
