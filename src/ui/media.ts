"use client";

import { useSyncExternalStore } from "react";

/** Vrai à partir de la largeur « ordinateur » (lg de Tailwind). Faux côté serveur. */
export function useDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

const DESKTOP = "(min-width: 1024px)";
