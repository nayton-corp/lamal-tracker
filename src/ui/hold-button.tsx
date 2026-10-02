"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "./cn";

/**
 * Confirmation par appui long (1,5 s) pour une action à ne pas déclencher par erreur.
 * Alternative clavier : maintenir Espace/Entrée. Annulé si on relâche avant la fin.
 */
export function HoldButton({ onConfirm, children, disabled, durationMs = 1500 }: { onConfirm: () => Promise<void> | void; children: React.ReactNode; disabled?: boolean; durationMs?: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = () => {
    if (disabled || busy || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(async () => {
      timer.current = null;
      setHolding(false);
      setBusy(true);
      try {
        if ("vibrate" in navigator) navigator.vibrate?.(30);
        await onConfirm();
      } finally {
        setBusy(false);
      }
    }, durationMs);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={cancel}
      className={cn(
        "relative min-h-14 w-full cursor-pointer select-none overflow-hidden rounded-xl bg-lca-strong px-4 text-base font-semibold text-black transition-opacity disabled:opacity-50",
      )}
      style={{ WebkitTouchCallout: "none" }}
    >
      <span
        aria-hidden
        className="absolute inset-0 origin-left bg-black/20"
        style={{ transform: holding ? "scaleX(1)" : "scaleX(0)", transition: holding ? `transform ${durationMs}ms linear` : "transform 150ms ease-out" }}
      />
      <span className="relative inline-flex items-center gap-2">
        {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {holding ? "Maintenez…" : children}
      </span>
    </button>
  );
}
