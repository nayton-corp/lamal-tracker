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

const noSubscription = () => () => {};

/**
 * Passkeys possibles ici : navigateur compatible et page sécurisée (HTTPS ou localhost).
 * Null côté serveur, avant de le savoir.
 */
export function usePasskeySupport(): boolean | null {
  return useSyncExternalStore(
    noSubscription,
    () => window.isSecureContext && typeof window.PublicKeyCredential === "function",
    () => null,
  );
}
