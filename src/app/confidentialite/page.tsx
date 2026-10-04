import Link from "next/link";
import { Card } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";

export const metadata = { title: "Confidentialité" };

/** Déclaration de confidentialité, lisible sans compte (elle est citée à l'inscription). */
export default function PrivacyPage() {
  const contact = process.env.CONTACT_EMAIL?.trim();
  return (
    <Page>
      <PageHeader title="Confidentialité" subtitle="Ce que l'app enregistre, pourquoi, et vos droits." />
      <Card className="space-y-4 leading-relaxed [&_h2]:pt-2 [&_h2]:font-semibold">
        <h2>Ce qui est enregistré</h2>
        <p>
          Votre courriel et votre mot de passe (haché, jamais en clair) ; pour chaque personne du foyer, le prénom, le nom, la date de naissance et l&apos;adresse ; les contrats d&apos;assurance (caisse, franchise, modèle, prime, complémentaires) ; vos choix lors du rituel annuel, les lettres préparées et les signatures dessinées.
        </p>
        <p>Ce sont des données relatives à la santé au sens de la loi sur la protection des données (nLPD). Elles ne servent qu&apos;à vous aider à suivre et comparer vos primes.</p>
        <h2>Ce qui n&apos;est jamais fait</h2>
        <p>Aucune revente, aucune publicité, aucun outil de mesure tiers, aucune commission des caisses-maladie. Les courriels envoyés ne contiennent aucune donnée de santé.</p>
        <h2>Où et combien de temps</h2>
        <p>
          Les données sont hébergées en Suisse, sur le serveur de l&apos;exploitant de cette instance. Elles restent tant que votre compte existe. Le journal de sécurité (connexions, changements de mot de passe) est conservé 12 mois.
        </p>
        <h2>Partage du foyer</h2>
        <p>Les comptes que vous invitez dans votre foyer voient les mêmes personnes et contrats. L&apos;administrateur de l&apos;instance voit la liste des comptes, jamais le contenu des foyers.</p>
        <h2>Vos droits</h2>
        <p>
          Vous pouvez demander l&apos;accès à vos données, leur rectification ou leur suppression{contact ? <> en écrivant à <a href={`mailto:${contact}`} className="text-primary underline">{contact}</a></> : " auprès de l'administrateur de l'instance"}. Le propriétaire d&apos;un foyer peut tout effacer à tout moment dans les réglages.
        </p>
      </Card>
      <p className="text-center text-sm">
        <Link href="/" className="text-primary underline">Retour</Link>
      </p>
    </Page>
  );
}
