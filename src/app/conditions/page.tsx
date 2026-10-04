import Link from "next/link";
import { operator } from "@/server/operator";
import { LegalPage } from "@/ui/legal-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conditions d'utilisation" };

/** Conditions d'utilisation : courtes, en langage courant, lisibles sans compte. */
export default function TermsPage() {
  const { name, contact } = operator();
  const who = name ?? "l'exploitant de cette instance";
  return (
    <LegalPage title="Conditions d'utilisation" subtitle="Ce que l'app fait pour vous, et ce qui reste de votre ressort.">
      <h2>Le service</h2>
      <p>
        Primes LAMal aide les foyers en Suisse à suivre leurs primes d&apos;assurance maladie de base (LAMal), à comparer chaque année les offres des caisses à partir des données officielles de l&apos;OFSP, et à préparer les courriers pour changer de caisse. Le service est proposé gratuitement par {who}, sur invitation.
      </p>
      <h2>Ce qui reste de votre responsabilité</h2>
      <p>
        L&apos;app vous aide à préparer les courriers, mais c&apos;est vous qui les vérifiez, les signez, les envoyez et veillez à ce qu&apos;ils arrivent à temps. Pour changer de caisse au 1<sup>er</sup> janvier, la résiliation doit être <strong>reçue</strong> par votre caisse au plus tard le dernier jour ouvrable de novembre : la date d&apos;envoi conseillée par l&apos;app laisse une marge pour la Poste, mais seule compte la date de réception.
      </p>
      <p>
        Les primes et les économies affichées sont des estimations faites à partir des primes officielles publiées. Elles ne remplacent ni l&apos;offre de la caisse ni un conseil personnalisé. L&apos;app n&apos;est pas un courtier : elle ne vend aucune assurance et ne reçoit aucune commission.
      </p>
      <p>
        Pour les assurances complémentaires (LCA), la caisse peut refuser une demande ou poser des réserves. L&apos;app vous alerte, mais ne résilie jamais une complémentaire à votre place : ne la résiliez qu&apos;une fois la nouvelle acceptée par écrit.
      </p>
      <h2>Votre compte</h2>
      <p>
        Vous gardez votre mot de passe pour vous et vous ne saisissez que des personnes de votre foyer, avec leur accord. Les données que vous saisissez restent les vôtres : vous pouvez les télécharger ou les supprimer à tout moment dans « Mon compte › Mes données ». Un compte sans connexion pendant 24 mois est supprimé après deux rappels.
      </p>
      <h2>Disponibilité</h2>
      <p>
        Le service est fourni tel quel, sans garantie de disponibilité. Il peut être interrompu pour maintenance ou arrêté ; dans ce cas, vous serez prévenu par courriel au moins 30 jours avant, pour télécharger vos données. Un compte qui abuse du service (envois répétés, tentative d&apos;accès aux données d&apos;autrui) peut être suspendu.
      </p>
      <h2>Responsabilité</h2>
      <p>
        Dans la mesure permise par la loi, {who} ne répond pas d&apos;un dommage dû à un délai manqué, à une erreur de saisie, à une donnée officielle inexacte ou à une interruption du service. La responsabilité pour faute grave ou intentionnelle demeure réservée.
      </p>
      <h2>Données personnelles</h2>
      <p>
        Leur traitement est décrit dans la <Link href="/confidentialite">déclaration de confidentialité</Link>.
      </p>
      <h2>Modifications et droit applicable</h2>
      <p>
        Ces conditions peuvent évoluer ; un changement important vous est annoncé dans l&apos;app ou par courriel. Le droit suisse s&apos;applique.
        {contact ? <> Questions : <a href={`mailto:${contact}`}>{contact}</a>.</> : null}
      </p>
      <p className="text-sm text-muted">Version du 4 octobre 2026.</p>
    </LegalPage>
  );
}
