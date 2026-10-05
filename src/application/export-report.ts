import { formatDateLong, type IsoDate } from "@/domain/dates";
import { MODEL_LABEL, type ModelType } from "@/domain/lamal";
import { guaranteeInfo } from "@/domain/lca";
import { formatChf } from "@/domain/money";
import type { Decision, ReviewStatus } from "@/domain/review";
import type { Report, ReportSection } from "@/infrastructure/pdf/report-pdf";
import type { DataExport } from "./data-rights";

/*
 * Récapitulatif lisible (PDF) de l'export : les mêmes données que le fichier JSON, présentées
 * pour une personne. Le JSON reste la copie complète et réutilisable.
 */

const day = (iso: string | null | undefined) => (iso ? formatDateLong(iso.slice(0, 10) as IsoDate) : "—");
const yesNo = (v: boolean) => (v ? "oui" : "non");
const chf = (rp: number | null | undefined) => (rp === null || rp === undefined ? "—" : formatChf(rp));

// Formes courtes, pour un tableau (les libellés de l'interface sont dans DECISION_LABEL).
const DECISION_SHORT_LABEL: Record<Decision, string> = { UNDECIDED: "pas décidé", KEEP: "garder", SWITCH: "changer de caisse", ADJUST: "adapter le contrat" };
const REVIEW_STATUS: Record<ReviewStatus, string> = { OPEN: "en cours", DECIDED: "décidé", LETTERS_SENT: "lettres envoyées", CLOSED: "clôturé" };

export function exportReport(data: DataExport): Report {
  const sections: ReportSection[] = [];
  const c = data.compte;
  sections.push({
    heading: "Compte",
    blocks: [
      {
        kind: "rows",
        rows: [
          ["Courriel", c.courriel ?? "—"],
          ["Rôle", c.role],
          ["Créé le", day(c.creeLe)],
          ["Courriel confirmé le", day(c.courrielConfirmeLe)],
          ["Consentement (données de santé)", day(c.consentementDonneesSanteLe)],
          ["Double facteur", c.doubleFacteurActifDepuis ? `actif depuis le ${day(c.doubleFacteurActifDepuis)}` : "non"],
          ["Passkeys", c.passkeys.length ? c.passkeys.map((p) => p.nom || "sans nom").join(", ") : "aucune"],
          ["Appareils connectés", String(c.appareilsConnectes.length)],
        ],
      },
    ],
  });

  const f = data.foyer;
  if (!f) {
    sections.push({ heading: "Foyer", blocks: [{ kind: "text", text: "Ce compte n'a pas (ou plus) de foyer." }] });
  } else {
    sections.push({
      heading: "Foyer",
      blocks: [
        {
          kind: "rows",
          rows: [
            ["Nom", f.adresse.nom || "—"],
            ["Adresse", [f.adresse.rue, `${f.adresse.npa} ${f.adresse.localite}`.trim()].filter(Boolean).join(", ") || "—"],
            ["Commune, canton", `${f.adresse.commune || "—"}, ${f.adresse.canton}`],
            ["Région de primes", String(f.adresse.regionPrimes)],
            ["Votre rôle", f.votreRole],
            ["Comptes du foyer", f.membres.map((m) => `${m.courriel ?? "sans courriel"} (${m.role})`).join(", ")],
          ],
        },
      ],
    });

    for (const p of f.personnes) {
      const blocks: ReportSection["blocks"] = [
        {
          kind: "rows",
          rows: [
            ["Naissance", day(p.naissance)],
            ["Accident couvert par l'employeur", yesNo(p.accidentCouvertParEmployeur)],
            ["Frais de santé estimés par an", chf(p.fraisDeSanteAnnuelsRp)],
            ["Médecin de famille", p.medecin || "—"],
          ],
        },
      ];
      if (p.contratsLamal.length)
        blocks.push({
          kind: "table",
          head: ["Année", "Caisse", "Modèle", "Franchise", "Accident", "Prime / mois"],
          rows: p.contratsLamal.map((k) => [
            String(k.coverageYear),
            k.caisse ?? "—",
            k.tariffLabel || MODEL_LABEL[k.modelType as ModelType],
            `CHF ${k.franchiseChf}`,
            yesNo(k.accident),
            chf(k.billedMonthlyRp),
          ]),
        });
      if (p.complementaires.length)
        blocks.push({
          kind: "table",
          head: ["Complémentaire", "Assureur", "Prime / mois", "Active"],
          rows: p.complementaires.map((k) => [guaranteeInfo(k.guarantee)?.label ?? k.productName, k.insurerName, chf(k.monthlyRp), yesNo(k.active)]),
        });
      if (p.signature) blocks.push({ kind: "image", label: `Signature enregistrée le ${day(p.signature.signeeLe)}`, src: p.signature.image! });
      sections.push({ heading: `${p.prenom} ${p.nom}`, blocks });
    }

    const names = new Map(f.personnes.map((p) => [p.id, `${p.prenom} ${p.nom}`]));
    for (const r of f.rituels) {
      const blocks: ReportSection["blocks"] = [{ kind: "rows", rows: [["Statut", REVIEW_STATUS[r.statut] ?? r.statut], ["Ouvert le", day(r.ouvertLe)], ["Clôturé le", day(r.clotureLe)]] }];
      if (r.decisions.length)
        blocks.push({
          kind: "table",
          head: ["Personne", "Décision", "Caisse choisie", "Franchise", "Prime / mois"],
          rows: r.decisions.map((d) => [
            names.get(d.personId) ?? "—",
            DECISION_SHORT_LABEL[d.decision] ?? d.decision,
            d.caisseChoisie ?? "—",
            d.chosenFranchiseChf === null ? "—" : `CHF ${d.chosenFranchiseChf}`,
            chf(d.chosenMonthlyRp),
          ]),
        });
      const letters = [
        ...r.lettres.map((l) => [l.content.subject, l.caisse ?? "—", day(l.generatedAt), l.sentAt ? day(l.sentAt) : "non envoyée"]),
        ...r.demandesOffre.map((o) => [o.content.subject, o.caisse ?? "—", day(o.generatedAt), o.sentAt ? day(o.sentAt) : "non envoyée"]),
      ];
      if (letters.length) blocks.push({ kind: "table", head: ["Courrier", "Destinataire", "Préparé le", "Envoyé le"], rows: letters });
      sections.push({ heading: `Rituel ${r.annee}`, blocks });
    }
  }

  // Un même événement peut figurer au journal du compte et à celui du foyer.
  const seen = new Set<string>();
  const journal = [...(f?.journal ?? []), ...c.journal]
    .filter((e) => {
      const key = `${e.date}|${e.evenement}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 60);
  if (journal.length) sections.push({ heading: "Journal de sécurité (12 derniers mois)", blocks: [{ kind: "table", head: ["Date", "Événement"], rows: journal.map((e) => [day(e.date), e.detail ? `${e.evenement} · ${e.detail}` : e.evenement]) }] });

  if (c.avisEnvoyes.length) {
    sections.push({ heading: "Avis envoyés", blocks: [{ kind: "table", head: ["Date", "Avis"], rows: c.avisEnvoyes.map((a) => [day(a.envoyeLe), a.message]) }] });
  }

  sections.push({
    heading: "À propos de ce document",
    blocks: [
      {
        kind: "text",
        text: "Ce récapitulatif reprend les données enregistrées pour votre compte et votre foyer. Le fichier JSON téléchargeable au même endroit en est la copie complète, réutilisable dans un autre outil. Mots de passe, secrets du double facteur et clés de chiffrement n'en font jamais partie.",
      },
    ],
  });

  return { title: "Primes LAMal : vos données", subtitle: `Exportées le ${day(data.exporteLe)}`, sections };
}
