/** Domicile au 1er janvier de l'année cible, par personne : un déménagement change les primes. */
import { eq } from "drizzle-orm";
import { domicileLabel, sameDomicile, type Domicile } from "@/domain/domicile";
import type { Db } from "@/infrastructure/db/client";
import { lamalPolicy, person, reviewLine } from "@/infrastructure/db/schema";
import { UserError } from "../errors";
import { ownedReview, type Scope } from "../scope";
import { linesWithSentLetter, renewalFor, type LineRow } from "./lines";

/** Décision remise à zéro : l'offre choisie était calculée pour l'ancien domicile. */
const NO_DECISION = {
  decision: "UNDECIDED",
  chosenInsurerId: null,
  chosenTariffCode: null,
  chosenLabel: null,
  chosenModelType: null,
  chosenFranchiseChf: null,
  chosenMonthlyRp: null,
  chosenTotalRp: null,
  decidedAt: null,
} as const;

export interface DomicileChange {
  /** Personnes dont le domicile a changé. */
  updated: string[];
  /** Personnes dont la lettre est déjà envoyée : rien n'a changé pour elles. */
  locked: string[];
}

/**
 * Change le domicile au 1er janvier de l'année cible de certaines personnes (toutes si
 * `personIds` est null). Leur prime reconduite est recalculée et leur choix remis à zéro, sauf
 * pour celles dont la lettre est déjà partie. `only` : ne touche que les lignes qui avaient ce
 * domicile (suivre un déménagement du foyer sans écraser un domicile indiqué à part).
 */
export function setLineDomiciles(db: Db, scope: Scope, reviewId: number, personIds: number[] | null, domicile: Domicile, only?: Domicile): DomicileChange {
  const r = ownedReview(db, scope, reviewId);
  if (r.status === "CLOSED") throw new UserError("Ce bilan est clôturé.");
  const sent = linesWithSentLetter(db, reviewId);
  const result: DomicileChange = { updated: [], locked: [] };
  const lines = db.select().from(reviewLine).where(eq(reviewLine.reviewId, reviewId)).all();
  db.transaction(() => {
    for (const line of lines) {
      if (personIds && !personIds.includes(line.personId)) continue;
      if (only && !sameDomicile(line, only)) continue;
      if (sameDomicile(line, domicile)) continue;
      const p = db.select().from(person).where(eq(person.id, line.personId)).get()!;
      const name = `${p.firstName} ${p.lastName}`;
      if (sent.has(line.id)) {
        result.locked.push(name);
        continue;
      }
      const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
      db.update(reviewLine)
        .set({ ...renewalFor(db, r, p, policy, domicile), ...NO_DECISION })
        .where(eq(reviewLine.id, line.id))
        .run();
      result.updated.push(name);
    }
  });
  return result;
}

/** Domiciles des lignes d'un bilan, regroupés : « Sion (VS) » pour qui. */
export function domicileGroups(lines: Pick<LineRow, "commune" | "bfsNumber" | "canton" | "region" | "personId">[]) {
  const groups: { domicile: Domicile; label: string; personIds: number[] }[] = [];
  for (const l of lines) {
    const g = groups.find((x) => sameDomicile(x.domicile, l));
    if (g) g.personIds.push(l.personId);
    else groups.push({ domicile: { commune: l.commune, bfsNumber: l.bfsNumber, canton: l.canton, region: l.region }, label: domicileLabel(l), personIds: [l.personId] });
  }
  return groups;
}
