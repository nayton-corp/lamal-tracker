"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

/**
 * Page de connexion : les pages mises en cache par le service worker contiennent des données
 * personnelles ; elles sont purgées dès qu'on n'est plus connecté (déconnexion, session expirée).
 */
export function ClearCaches() {
  useEffect(() => {
    if ("caches" in window) caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
  }, []);
  return null;
}
