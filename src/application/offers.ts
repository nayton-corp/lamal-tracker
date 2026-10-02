import { and, asc, eq, isNull } from "drizzle-orm";
import type { IsoDate } from "@/domain/dates";
import { LCA_GUARANTEE_KEYS, guaranteeInfo, type LcaGuarantee } from "@/domain/lca";
import { MODEL_LABEL, displayTariffLabel, type ModelType } from "@/domain/lamal";
import { buildOfferRequest, letterPlainText, type LetterContent } from "@/domain/letter";
import { formatChf } from "@/domain/money";
import type { Db } from "@/infrastructure/db/client";
import { insurerLabel, insurerRecipient } from "@/infrastructure/db/queries";
import { insurer, lcaPolicy, offerRequest, reviewLine } from "@/infrastructure/db/schema";
import { getHousehold } from "./household";
import { getReviewView, UserError } from "./review";

/** Complémentaires à demander pour une ligne : celles choisies, sinon celles en cours. */
export function lcaWishesFor(db: Db, line: { personId: number; lcaWishes: string[] | null }): LcaGuarantee[] {
  if (line.lcaWishes) return line.lcaWishes.filter((k): k is LcaGuarantee => (LCA_GUARANTEE_KEYS as string[]).includes(k));
  const active = db
    .select({ guarantee: lcaPolicy.guarantee })
    .from(lcaPolicy)
    .where(and(eq(lcaPolicy.personId, line.personId), eq(lcaPolicy.active, true)))
    .all();
  return [...new Set(active.map((a) => a.guarantee).filter((g): g is LcaGuarantee => (LCA_GUARANTEE_KEYS as string[]).includes(g ?? "")))];
}

export function setLcaWishes(db: Db, lineId: number, keys: string[]) {
  const valid = keys.filter((k) => (LCA_GUARANTEE_KEYS as string[]).includes(k));
  db.update(reviewLine).set({ lcaWishes: valid }).where(eq(reviewLine.id, lineId)).run();
}

/**
 * Prépare une demande d'offre par nouvelle caisse choisie (décision « changer de caisse »),
 * pour toutes les personnes qui la rejoignent. Les demandes non envoyées sont refaites.
 */
export function generateOfferRequests(db: Db, reviewId: number, today: IsoDate): number[] {
  const view = getReviewView(db, reviewId, today);
  const h = getHousehold(db);
  if (!h) throw new UserError("Foyer non configuré.");
  const sent = new Set(listOfferRequests(db, reviewId).filter((o) => o.sentAt).flatMap((o) => o.lineIds));
  const groups = new Map<number, typeof view.persons>();
  for (const pr of view.persons) {
    if (pr.line.decision !== "SWITCH" || !pr.line.chosenInsurerId || sent.has(pr.line.id)) continue;
    groups.set(pr.line.chosenInsurerId, [...(groups.get(pr.line.chosenInsurerId) ?? []), pr]);
  }

  const wishes = new Map(view.persons.map((pr) => [pr.line.id, lcaWishesFor(db, pr.line)]));
  const created: number[] = [];
  db.transaction((tx) => {
    for (const [insurerId, members] of groups) {
      const ins = tx.select().from(insurer).where(eq(insurer.id, insurerId)).get()!;
      const adults = members.filter((m) => m.line.targetAgeClass !== "KID");
      const sender = adults[0]?.person ?? members[0]!.person;
      const content = buildOfferRequest({
        senderLines: [`${sender.firstName} ${sender.lastName}`, h.street, `${h.postalCode} ${h.city}`].filter((l) => l.trim()),
        insurerLines: insurerRecipient(ins),
        place: h.city || "",
        date: today,
        targetYear: view.review.targetYear,
        domicile: `à ${[h.street, `${h.postalCode} ${h.city}`].filter((l) => l.trim()).join(", ")}`,
        persons: members.map((m) => {
          const model = (m.line.chosenModelType ?? "OTHER") as ModelType;
          const wish = [
            `modèle « ${m.line.chosenLabel ? displayTariffLabel(m.line.chosenLabel, model) : MODEL_LABEL[model]} »`,
            `franchise CHF ${m.line.chosenFranchiseChf}`,
            m.line.accident ? "avec couverture accident" : "sans couverture accident",
            ...(m.line.chosenMonthlyRp ? [`prime publiée par l'OFSP ${formatChf(m.line.chosenMonthlyRp)} par mois`] : []),
          ].join(", ");
          return {
            fullName: `${m.person.firstName} ${m.person.lastName}`,
            birthDate: m.person.birthDate,
            policyNumber: null,
            isMinor: view.review.targetYear - 1 - Number(m.person.birthDate.slice(0, 4)) < 18,
            wish,
            lca: (wishes.get(m.line.id) ?? []).map((k) => guaranteeInfo(k)!.label.toLowerCase()),
          };
        }),
      });
      tx.delete(offerRequest).where(and(eq(offerRequest.reviewId, reviewId), eq(offerRequest.insurerId, insurerId), isNull(offerRequest.sentAt))).run();
      created.push(tx.insert(offerRequest).values({ reviewId, insurerId, lineIds: members.map((m) => m.line.id), content }).returning().get().id);
    }
  });
  return created;
}

export function listOfferRequests(db: Db, reviewId: number) {
  return db
    .select({ request: offerRequest, insurer })
    .from(offerRequest)
    .innerJoin(insurer, eq(insurer.id, offerRequest.insurerId))
    .where(eq(offerRequest.reviewId, reviewId))
    .orderBy(asc(offerRequest.id))
    .all()
    .map(({ request, insurer: ins }) => {
      const content = request.content as LetterContent;
      return {
        ...request,
        content,
        insurerName: insurerLabel(ins),
        email: ins.email,
        website: ins.website,
        mailto: ins.email ? `mailto:${ins.email}?subject=${encodeURIComponent(content.subject)}&body=${encodeURIComponent(letterPlainText(content))}` : null,
      };
    });
}

export function getOfferRequest(db: Db, id: number) {
  const row = db.select().from(offerRequest).where(eq(offerRequest.id, id)).get();
  return row ? { ...row, content: row.content as LetterContent } : null;
}

/** Envoi de la demande : vaut demande d'affiliation pour les personnes concernées. */
export function markOfferRequestSent(db: Db, id: number, at: IsoDate | null) {
  const row = getOfferRequest(db, id);
  if (!row) throw new UserError("Demande introuvable.");
  db.transaction((tx) => {
    tx.update(offerRequest).set({ sentAt: at, answeredAt: at ? row.answeredAt : null }).where(eq(offerRequest.id, id)).run();
    for (const lineId of row.lineIds) {
      const line = tx.select().from(reviewLine).where(eq(reviewLine.id, lineId)).get();
      if (!line) continue;
      if (at && !line.affiliationRequestedAt) tx.update(reviewLine).set({ affiliationRequestedAt: at }).where(eq(reviewLine.id, lineId)).run();
    }
  });
}

/** Réponse de la caisse (confirmation d'affiliation) : l'ancienne caisse pourra libérer la personne. */
export function markOfferRequestAnswered(db: Db, id: number, at: IsoDate | null) {
  const row = getOfferRequest(db, id);
  if (!row) throw new UserError("Demande introuvable.");
  db.transaction((tx) => {
    tx.update(offerRequest).set({ answeredAt: at }).where(eq(offerRequest.id, id)).run();
    for (const lineId of row.lineIds) tx.update(reviewLine).set({ affiliationConfirmedAt: at }).where(eq(reviewLine.id, lineId)).run();
  });
}

export function deleteOfferRequest(db: Db, id: number) {
  db.delete(offerRequest).where(and(eq(offerRequest.id, id), isNull(offerRequest.sentAt))).run();
}
