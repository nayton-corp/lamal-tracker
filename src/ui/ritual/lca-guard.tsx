"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { acknowledgeLcaAction } from "@/app/actions";

const HOLD_MS = 1500;

/**
 * Confirmation du garde-fou LCA : case à cocher **et** appui long de 1,5 s.
 * Un simple tap ne suffit jamais à passer cette étape.
 */
export function LcaGuardConfirm({ lineId, year }: { lineId: number; year: number }) {
  const [checked, setChecked] = useState(false);
  const [holding, setHolding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function start() {
    if (!checked || pending) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      if ("vibrate" in navigator) navigator.vibrate?.(30);
      startTransition(async () => {
        const result = await acknowledgeLcaAction(lineId, year);
        if (result && !result.ok) setError(result.message ?? "Erreur.");
      });
    }, HOLD_MS);
  }

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    setHolding(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 border-black/20 bg-white/70 p-3 text-black">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-6 shrink-0 accent-black" />
        <span className="text-[15px] font-semibold leading-snug">
          J&apos;ai compris : je résilie uniquement l&apos;assurance de base (LAMal). Mes complémentaires (LCA) restent actives et je ne les résilie
          pas maintenant.
        </span>
      </label>
      <button
        type="button"
        disabled={!checked || pending}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !e.repeat) start();
        }}
        onKeyUp={cancel}
        onContextMenu={(e) => e.preventDefault()}
        className="relative min-h-14 select-none overflow-hidden rounded-2xl bg-black px-4 text-base font-bold text-white transition disabled:opacity-40"
        aria-describedby="hold-hint"
      >
        <span
          aria-hidden
          className="absolute inset-0 origin-left bg-lca-strong/60"
          style={{ transform: holding ? "scaleX(1)" : "scaleX(0)", transition: holding ? `transform ${HOLD_MS}ms linear` : "transform 150ms ease-out" }}
        />
        <span className="relative">{pending ? "Enregistrement…" : holding ? "Maintiens…" : "Maintenir pour confirmer"}</span>
      </button>
      <p id="hold-hint" className="text-center text-sm text-black/70">
        Coche la case puis garde le doigt appuyé 1,5 seconde.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-white p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
