"use client";

import { Download, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "./button";

/** Événement non standard de Chrome et Edge : proposer l'installation au moment choisi. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const noSubscription = () => () => {};

/** Déjà ouverte comme une app (écran d'accueil) : rien à expliquer. */
function useStandalone(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
}

function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const keep = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const installed = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", keep);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return event;
}

/**
 * Installer l'app sur l'écran d'accueil : un bouton quand le navigateur le permet (Android,
 * Chrome, Edge), sinon les gestes pour iPhone et Android, toujours lisibles.
 */
export function InstallHelp() {
  const standalone = useStandalone();
  const prompt = useInstallPrompt();
  const [done, setDone] = useState(false);
  if (standalone) return <p className="text-sm text-muted">L&apos;app est installée sur cet appareil.</p>;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setDone(true);
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">Installée, l&apos;app s&apos;ouvre depuis l&apos;écran d&apos;accueil comme les autres, en plein écran, et peut vous envoyer les rappels.</p>
      {prompt && !done && (
        <Button type="button" block onClick={install}>
          <Download aria-hidden className="size-5" /> Installer l&apos;app
        </Button>
      )}
      {done && <p className="font-medium text-saving">C&apos;est fait : l&apos;icône est sur votre écran d&apos;accueil.</p>}
      <details className="rounded-xl bg-surface-2 px-3 [&_summary]:min-h-11">
        <summary className="flex cursor-pointer items-center font-medium">Sur iPhone ou iPad (Safari)</summary>
        <ol className="list-decimal space-y-1 pb-3 pl-5">
          <li>
            Touchez le bouton Partager <Share aria-label="(carré avec une flèche vers le haut)" className="inline size-4 align-text-bottom" /> en bas de l&apos;écran.
          </li>
          <li>
            Choisissez « Sur l&apos;écran d&apos;accueil » <SquarePlus aria-hidden className="inline size-4 align-text-bottom" /> (faites défiler la liste si besoin).
          </li>
          <li>Touchez « Ajouter ». Pour recevoir les rappels, ouvrez ensuite l&apos;app depuis cette icône.</li>
        </ol>
      </details>
      <details className="rounded-xl bg-surface-2 px-3 [&_summary]:min-h-11">
        <summary className="flex cursor-pointer items-center font-medium">Sur Android (Chrome)</summary>
        <ol className="list-decimal space-y-1 pb-3 pl-5">
          <li>Touchez le menu ⋮ en haut à droite.</li>
          <li>Choisissez « Installer l&apos;application » ou « Ajouter à l&apos;écran d&apos;accueil ».</li>
          <li>Confirmez : l&apos;icône Primes LAMal apparaît avec vos autres apps.</li>
        </ol>
      </details>
    </div>
  );
}
