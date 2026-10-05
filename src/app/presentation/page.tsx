import { BadgeSwissFranc, Ban, CalendarClock, FileSignature, Landmark, LockKeyhole, Scale, ShieldCheck, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirectIfSignedIn } from "@/server/auth";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { InstallHelp } from "@/ui/install-help";
import { LegalLinks } from "@/ui/legal-links";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Primes LAMal · vos primes d'assurance maladie sous contrôle" } };

const STEPS = [
  {
    src: "/apercus/hausse.webp",
    alt: "Écran du bilan annuel : prime de l'année prochaine sans rien faire, hausse mensuelle et économie possible.",
    title: "Voir la hausse",
    text: "Dès la publication des primes, fin septembre, l'app calcule ce que vous paierez l'an prochain sans rien faire, et combien vous pourriez économiser.",
  },
  {
    src: "/apercus/strategie.webp",
    alt: "Écran de choix de la stratégie : économie maximale ou même contrat chez une caisse moins chère, avec l'économie annuelle.",
    title: "Choisir en quelques minutes",
    text: "Toutes les caisses, toutes les franchises et tous les modèles. Vous choisissez une stratégie ; l'app propose la meilleure offre pour chaque personne du foyer.",
  },
  {
    src: "/apercus/demarches.webp",
    alt: "Écran des démarches : qui change de caisse, signature et courriers à envoyer dans l'ordre.",
    title: "Envoyer les courriers",
    text: "Demande d'adhésion et résiliation pré-remplies, adresses officielles, date limite d'envoi et liste de contrôle. Vous imprimez, signez et postez.",
  },
];

const PROMISES = [
  { Icon: Landmark, title: "Hébergé en Suisse", text: "Les données restent sur un serveur en Suisse, protégées selon la loi suisse (nLPD)." },
  { Icon: Ban, title: "Rien n'est revendu", text: "Ni publicité, ni outil de mesure, ni revente de données. Jamais." },
  { Icon: BadgeSwissFranc, title: "Aucune commission", text: "L'app ne touche rien des caisses-maladie : elle n'a aucune raison d'en favoriser une." },
  { Icon: LockKeyhole, title: "Vos données vous appartiennent", text: "Signatures chiffrées, copie complète téléchargeable et suppression en un geste." },
];

/** Présentation publique, affichée à la place de l'accueil quand personne n'est connecté. */
export default async function PresentationPage() {
  await redirectIfSignedIn();
  return (
    <main id="contenu" className="mx-auto max-w-xl space-y-12 px-4 pt-8 pb-12 md:max-w-3xl lg:max-w-5xl lg:px-8 lg:pt-14">
      <header className="space-y-5 lg:grid lg:grid-cols-[3fr_2fr] lg:items-center lg:gap-10 lg:space-y-0">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon.svg" alt="" width={44} height={44} className="rounded-xl" />
            <p className="text-lg font-bold">Primes LAMal</p>
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-balance lg:text-5xl">Votre assurance maladie de base, moins chère chaque automne.</h1>
          <p className="text-lg text-muted">
            Les primes augmentent presque chaque année. Primes LAMal vous montre la hausse, trouve la caisse la moins chère pour votre foyer et prépare les courriers pour changer. Sans jargon, sans démarchage.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/inscription">J&apos;ai une invitation</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/login">Se connecter</Link>
            </Button>
          </div>
          <p className="text-sm text-muted">Gratuit. L&apos;accès se fait pour l&apos;instant sur invitation.</p>
        </div>
        <Image src={STEPS[0]!.src} alt={STEPS[0]!.alt} width={540} height={900} priority unoptimized className="mx-auto hidden w-64 rounded-3xl border border-border shadow-card lg:block" />
      </header>

      <section aria-labelledby="pour-qui" className="space-y-4">
        <h2 id="pour-qui" className="text-2xl font-bold">Pour qui ?</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="space-y-1">
            <Users aria-hidden className="size-6 text-primary" />
            <p className="font-semibold">Les foyers en Suisse</p>
            <p className="text-sm text-muted">Seul, en couple ou en famille : chaque personne a son contrat, enfants compris. Vous pouvez inviter votre conjoint.</p>
          </Card>
          <Card className="space-y-1">
            <TrendingUp aria-hidden className="size-6 text-primary" />
            <p className="font-semibold">Qui veut payer moins</p>
            <p className="text-sm text-muted">Pour la même assurance de base, les prix varient beaucoup d&apos;une caisse à l&apos;autre. Changer chaque année est votre droit.</p>
          </Card>
          <Card className="space-y-1">
            <CalendarClock aria-hidden className="size-6 text-primary" />
            <p className="font-semibold">Sans y passer la soirée</p>
            <p className="text-sm text-muted">Un rappel quand les primes sortent, un parcours guidé, et le courrier est prêt bien avant le 30 novembre.</p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="comment" className="space-y-4">
        <h2 id="comment" className="text-2xl font-bold">Comment ça marche</h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.src} className="space-y-3">
              <Image src={s.src} alt={s.alt} width={540} height={900} unoptimized className="mx-auto w-56 rounded-3xl border border-border shadow-card md:w-full" />
              <p className="font-semibold">
                <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary text-sm text-on-primary">{i + 1}</span>
                {s.title}
              </p>
              <p className="text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">Les primes viennent des données officielles de l&apos;Office fédéral de la santé publique (OFSP), mises à jour automatiquement.</p>
      </section>

      <section aria-labelledby="engagement" className="space-y-4">
        <h2 id="engagement" className="text-2xl font-bold">Notre engagement sur vos données</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {PROMISES.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
              <Icon aria-hidden className="mt-0.5 size-6 shrink-0 text-saving" />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <Link href="/confidentialite" className="text-primary underline">Lire la déclaration de confidentialité</Link>
        </p>
      </section>

      <section aria-labelledby="limites" className="space-y-3">
        <h2 id="limites" className="text-2xl font-bold">Ce que l&apos;app ne fait pas à votre place</h2>
        <Card className="space-y-3 text-sm">
          <p className="flex gap-3">
            <FileSignature aria-hidden className="size-5 shrink-0 text-primary" />
            <span>Elle prépare les courriers ; c&apos;est vous qui les signez, les envoyez et veillez à ce qu&apos;ils arrivent à temps.</span>
          </p>
          <p className="flex gap-3">
            <Scale aria-hidden className="size-5 shrink-0 text-primary" />
            <span>Ce n&apos;est pas un courtier ni un conseil personnalisé : les chiffres sont des estimations à partir des primes officielles.</span>
          </p>
          <p className="flex gap-3">
            <ShieldCheck aria-hidden className="size-5 shrink-0 text-primary" />
            <span>Elle ne connaît pas vos complémentaires mieux que vous : pour elles, elle vous alerte et vous laisse décider.</span>
          </p>
        </Card>
      </section>

      <section aria-labelledby="installer" className="space-y-3">
        <h2 id="installer" className="text-2xl font-bold">L&apos;installer sur votre téléphone</h2>
        <Card>
          <InstallHelp />
        </Card>
      </section>

      <footer className="space-y-4 border-t border-border pt-6 text-center">
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/inscription">J&apos;ai une invitation</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/login">Se connecter</Link>
          </Button>
        </div>
        <LegalLinks />
      </footer>
    </main>
  );
}
