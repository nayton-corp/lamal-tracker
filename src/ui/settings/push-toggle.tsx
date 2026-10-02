"use client";

import { useEffect, useState } from "react";
import { Button } from "../primitives";

type State = "loading" | "unsupported" | "insecure" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Active les notifications push sur cet appareil (nécessite HTTPS et, sur iPhone, l'app ajoutée à l'écran d'accueil). */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!window.isSecureContext) return setState("insecure");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const { publicKey } = (await (await fetch("/api/push/subscribe")).json()) as { publicKey: string };
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error();
      setState("on");
      setMessage("Notifications activées sur cet appareil.");
    } catch {
      setMessage("Impossible d'activer les notifications sur cet appareil.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      setMessage(null);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const res = await fetch("/api/push/test", { method: "POST" })
      .then((r) => r.json() as Promise<{ sent: number }>)
      .catch(() => ({ sent: 0 }));
    setMessage(res.sent > 0 ? `Notification envoyée à ${res.sent} appareil(s).` : "Aucun appareil n'a reçu la notification.");
    setBusy(false);
  }

  const explanations: Partial<Record<State, string>> = {
    insecure: "Les notifications exigent une connexion HTTPS (par exemple via Tailscale). Voir le README pour la mise en place.",
    unsupported:
      "Ce navigateur ne gère pas les notifications. Sur iPhone, ajoute d'abord l'app à l'écran d'accueil (Partager → Sur l'écran d'accueil).",
    denied: "Les notifications sont bloquées pour ce site dans les réglages du navigateur.",
  };

  return (
    <div className="flex flex-col gap-3">
      {explanations[state] ? (
        <p className="text-sm text-muted">{explanations[state]}</p>
      ) : state === "loading" ? (
        <p className="text-sm text-muted">Vérification…</p>
      ) : state === "on" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={test} disabled={busy}>
            Envoyer un test
          </Button>
          <Button variant="ghost" onClick={disable} disabled={busy}>
            Désactiver sur cet appareil
          </Button>
        </div>
      ) : (
        <Button onClick={enable} disabled={busy}>
          Activer les notifications
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm font-medium">
          {message}
        </p>
      )}
    </div>
  );
}
