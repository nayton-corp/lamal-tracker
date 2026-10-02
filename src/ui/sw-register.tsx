"use client";

import { useEffect } from "react";

/** Enregistre le service worker (installation sur l'écran d'accueil, consultation hors ligne, push). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sans HTTPS (accès LAN en http), le navigateur refuse : l'application reste utilisable.
    });
  }, []);
  return null;
}
