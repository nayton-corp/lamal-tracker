"use client";

import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

function canShareFiles(): boolean {
  if (typeof navigator.canShare !== "function") return false;
  const probe = new File([new Blob(["x"], { type: "application/pdf" })], "x.pdf", { type: "application/pdf" });
  return navigator.canShare({ files: [probe] });
}

/** Partage du PDF via la Web Share API (impression, e-mail, AirDrop…) quand le navigateur le permet. */
export function ShareLetterButton({ url, fileName }: { url: string; fileName: string }) {
  // Capacité du navigateur : lue côté client seulement, « non » au rendu serveur.
  const supported = useSyncExternalStore(noop, canShareFiles, () => false);
  const [error, setError] = useState<string | null>(null);

  if (!supported) return null;

  async function share() {
    setError(null);
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], fileName, { type: "application/pdf" });
      await navigator.share({ files: [file], title: "Lettre de résiliation LAMal" });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Le partage a échoué.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={share}
        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold"
      >
        Partager / imprimer
      </button>
      {error && <p className="w-full text-xs text-up">{error}</p>}
    </>
  );
}
