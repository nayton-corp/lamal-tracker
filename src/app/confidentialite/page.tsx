import Link from "next/link";
import { operator } from "@/server/operator";
import { LegalPage } from "@/ui/legal-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confidentialité" };

/** Déclaration de confidentialité, lisible sans compte (elle est citée à l'inscription). */
export default function PrivacyPage() {
  const { contact } = operator();
  return (
    <LegalPage title="Confidentialité" subtitle="Ce que l'app enregistre, pourquoi, et vos droits.">
        <h2>Ce qui est enregistré</h2>
        <p>
          Votre courriel et votre mot de passe (haché, jamais en clair) ; pour chaque personne du foyer, le prénom, le nom, la date de naissance et l&apos;adresse ; les contrats d&apos;assurance (caisse, franchise, modèle, prime, complémentaires) ; vos choix lors du rituel annuel, les lettres préparées et les signatures dessinées.
        </p>
        <p>Ce sont des données relatives à la santé au sens de la loi sur la protection des données (nLPD). Elles ne servent qu&apos;à vous aider à suivre et comparer vos primes.</p>
        <p>Si vous envoyez un avis depuis l&apos;app, il est gardé avec votre courriel pour pouvoir vous répondre, et supprimé avec votre compte. L&apos;app tient aussi quelques compteurs globaux (comptes créés, courriers envoyés), sans lien avec un compte ou un foyer.</p>
        <p>Le minimum seulement : pas de numéro AVS, et une police importée en PDF n&apos;est jamais gardée, seules les valeurs lues le sont.</p>
        <h2>Comment c&apos;est protégé</h2>
        <p>
          Connexion chiffrée (HTTPS), mot de passe haché, passkeys et double facteur. Les signatures dessinées sont en plus chiffrées dans la base avec une clé propre à chaque foyer, elle-même protégée par une clé maître gardée hors de la base ; les secrets du double facteur le sont par la clé maître. Une copie de la base seule ne permet donc pas de les lire. Supprimer un foyer supprime sa clé.
        </p>
        <h2>Ce qui n&apos;est jamais fait</h2>
        <p>Aucune revente, aucune publicité, aucun outil de mesure tiers, aucune commission des caisses-maladie. Les courriels envoyés ne contiennent aucune donnée de santé.</p>
        <h2>Où et combien de temps</h2>
        <p>
          Les données sont hébergées en Suisse, sur le serveur de l&apos;exploitant de cette instance (voir les <Link href="/mentions-legales">mentions légales</Link>). Elles restent tant que votre compte existe. Le journal de sécurité (connexions, changements de mot de passe, exports, suppressions) est conservé 12 mois. Un compte sans connexion depuis 24 mois est supprimé, après deux rappels par courriel (30 et 7 jours avant).
        </p>
        <h2>Partage du foyer</h2>
        <p>Les comptes que vous invitez dans votre foyer voient les mêmes personnes et contrats. L&apos;administrateur de l&apos;instance voit la liste des comptes, jamais le contenu des foyers.</p>
        <h2>Vos droits</h2>
        <p>
          Dans « Mon compte › Mes données », vous téléchargez à tout moment une copie complète de vos données (JSON et PDF) et supprimez votre compte ; le propriétaire d&apos;un foyer peut aussi supprimer le foyer. La suppression est immédiate. Pour toute autre demande (rectification, question){contact ? <>, écrivez à <a href={`mailto:${contact}`}>{contact}</a></> : ", adressez-vous à l'administrateur de l'instance"}.
        </p>
    </LegalPage>
  );
}
