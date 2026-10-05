import { isMinorOn } from "@/domain/age";
import type { IsoDate } from "@/domain/dates";
import { isReviewWindowOpen } from "@/domain/deadlines";
import type { HomeFacts } from "@/domain/home";
import { pingenFailed } from "@/domain/pingen";
import { needsLetter } from "@/domain/ritual-steps";
import type { Db } from "@/infrastructure/db/client";
import { hasStrongFactor } from "./auth";
import { getHousehold, listPersons, listPolicies } from "./household";
import { listOfferRequests } from "./offers";
import { premiumsAvailable } from "./reference-data";
import { getReviewByYear, getReviewView, openReviewIfPossible, type ReviewView } from "./review";
import type { Scope } from "./scope";
import { listSignatures } from "./signatures";

export interface HomeOverview {
  facts: HomeFacts;
  /** Bilan de l'année cible, s'il existe. */
  view: ReviewView | null;
  /** Contrats de l'année en cours, par personne (carte « primes pas encore publiées »). */
  current: { personId: number; firstName: string; monthlyRp: number | null }[];
}

/**
 * Tout ce que montre l'accueil : l'état du foyer pour la carte de l'année et les tâches
 * (domain/home.ts). Pendant la fenêtre du bilan, celui-ci s'ouvre de lui-même pour montrer tout de
 * suite ce que coûtera l'année prochaine sans rien faire.
 */
export function homeOverview(db: Db, scope: Scope, opts: { today: IsoDate; targetYear: number }): HomeOverview | null {
  const householdRow = getHousehold(db, scope);
  if (!householdRow) return null;
  const { today, targetYear } = opts;
  const contractYear = Number(today.slice(0, 4));
  const persons = listPersons(db, householdRow.id);
  const current = persons.map((p) => {
    const policy = listPolicies(db, p.id).find((x) => x.policy.coverageYear === contractYear);
    return { personId: p.id, firstName: p.firstName, monthlyRp: policy?.policy.billedMonthlyRp ?? null };
  });

  const published = premiumsAvailable(db, targetYear);
  if (isReviewWindowOpen(today, targetYear, published) && !getReviewByYear(db, scope, targetYear)) openReviewIfPossible(db, scope, targetYear);
  const reviewRow = published ? getReviewByYear(db, scope, targetYear) : null;
  const view = reviewRow ? getReviewView(db, scope, reviewRow.id, today) : null;

  return {
    view,
    current,
    facts: {
      today,
      targetYear,
      contractYear,
      published,
      review: view ? reviewFacts(db, scope, view, today) : null,
      personsWithoutContract: current.filter((c) => c.monthlyRp === null).map(({ personId, firstName }) => ({ personId, firstName })),
      accountSecured: hasStrongFactor(db, scope.userId),
    },
  };
}

function reviewFacts(db: Db, scope: Scope, view: ReviewView, today: IsoDate): HomeFacts["review"] {
  const involved = new Set(view.lines.filter((p) => needsLetter(p.line.decision)).map((p) => p.person.id));
  const requests = listOfferRequests(db, scope, view.review.id);
  return {
    closed: view.review.status === "CLOSED",
    preferencesSaved: view.review.needsConfirmedAt !== null,
    lines: view.lines.map((p) => ({ lineId: p.line.id, firstName: p.person.firstName, decision: p.line.decision, renewalStatus: p.line.renewalStatus })),
    unsentDocuments: [
      ...requests.filter((r) => !r.sentAt).map((r) => ({ kind: "REQUEST" as const, insurerName: r.insurerName })),
      ...view.letters.filter((l) => !l.sentAt || pingenFailed(l.pingenStatus)).map((l) => ({ kind: l.kind, insurerName: l.insurerName })),
    ],
    unsignedSigners: involved.size
      ? listSignatures(db, scope)
          .filter((s) => involved.has(s.personId) && !s.dataUrl && !isMinorOn(s.birthDate, today))
          .map((s) => s.firstName)
      : [],
  };
}
