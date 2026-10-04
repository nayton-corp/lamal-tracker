import { operator } from "@/server/operator";
import { LegalPage } from "@/ui/legal-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mentions légales" };

/** Qui exploite cette instance, et comment le joindre (variables OPERATOR_* et CONTACT_EMAIL). */
export default function ImprintPage() {
  const { name, address, contact } = operator();
  return (
    <LegalPage title="Mentions légales" subtitle="Qui exploite ce service.">
      <h2>Exploitant</h2>
      {name ? (
        <address className="not-italic">
          {name}
          {address.map((line) => (
            <span key={line} className="block">{line}</span>
          ))}
        </address>
      ) : (
        <p>L&apos;exploitant de cette instance n&apos;a pas encore renseigné ses coordonnées.</p>
      )}
      {contact && (
        <p>
          Contact : <a href={`mailto:${contact}`}>{contact}</a>
        </p>
      )}
      <h2>Hébergement</h2>
      <p>Les données sont hébergées en Suisse.</p>
      <h2>Indépendance</h2>
      <p>
        Le service n&apos;est lié à aucune caisse-maladie, ne vend aucune assurance et ne reçoit aucune commission. Les primes proviennent des données publiques de l&apos;Office fédéral de la santé publique (OFSP) et la redistribution de la taxe CO2 de l&apos;Office fédéral de l&apos;environnement (OFEV).
      </p>
    </LegalPage>
  );
}
