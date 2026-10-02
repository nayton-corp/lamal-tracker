"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { subscribePushAction, testPushAction, unsubscribePushAction } from "@/app/actions/data";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Support = "checking" | "ok" | "insecure" | "unsupported";

function detectSupport(): Support {
  if (!window.isSecureContext) return "insecure";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return "ok";
}

const noSubscribe = () => () => {};

export function PushPanel({ devices }: { devices: number }) {
  const support = useSyncExternalStore<Support>(noSubscribe, detectSupport, () => "checking");
  const [subscribed, setSubscribed] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (support !== "ok") return;
    navigator.serviceWorker.ready.then(async (reg) => setSubscribed(Boolean(await reg.pushManager.getSubscription())));
  }, [support]);

  const subscribe = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setMsg({ error: "Les notifications sont bloquées : autorisez-les dans les réglages du navigateur, puis réessayez." });
        const { publicKey } = await (await fetch("/api/push")).json();
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        await subscribePushAction({ endpoint: json.endpoint, keys: json.keys });
        setSubscribed(true);
        setMsg({ ok: "C'est fait : cet appareil recevra les rappels." });
      } catch (e) {
        setMsg({ error: e instanceof Error ? e.message : String(e) });
      }
    });

  const unsubscribe = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Recevez une alerte quand les nouvelles primes sont publiées (fin septembre), puis un rappel avant la date limite pour changer de caisse.{devices > 0 && ` Activé sur ${devices} appareil(s).`}
      </p>
      {support === "insecure" && (
        <Alert tone="info" title="Rappels indisponibles sur cette adresse">
          Les rappels et l&apos;installation sur l&apos;écran d&apos;accueil demandent une adresse sécurisée (qui commence par https://). La personne qui a installé l&apos;app peut l&apos;activer (voir le README).
        </Alert>
      )}
      {support === "unsupported" && <Alert tone="info" title="Navigateur non compatible">Sur iPhone, installez d&apos;abord l&apos;app sur l&apos;écran d&apos;accueil.</Alert>}
      {support === "ok" &&
        (subscribed ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => start(async () => setMsg(await testPushAction()))} disabled={pending}>
              Envoyer un rappel d&apos;essai
            </Button>
            <Button variant="ghost" onClick={unsubscribe} disabled={pending}>
              <BellOff aria-hidden className="size-4" /> Désactiver
            </Button>
          </div>
        ) : (
          <Button onClick={subscribe} disabled={pending} block>
            <Bell aria-hidden className="size-4" /> Activer les rappels sur cet appareil
          </Button>
        ))}
      {msg?.ok && <Alert tone="success" title={msg.ok} />}
      {msg?.error && <Alert tone="danger" title={msg.error} />}
    </div>
  );
}
