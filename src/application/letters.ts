import { createHash } from "node:crypto";
import { ageClassFor } from "@/domain/age-class";
import { isIsoDate } from "@/domain/calendar";
import { buildTerminationLetter, type LetterContent } from "@/domain/termination-letter";
import type { AppContext } from "./context";
import { requireHousehold } from "./household";
import { letterGroups, ReviewError, syncStatus } from "./review";

export type PdfRenderer = (content: LetterContent) => Promise<Uint8Array>;

/** Construit le contenu de la lettre pour une caisse quittée, sans l'enregistrer (aperçu). */
export function letterContent(ctx: AppContext, reviewId: number, insurerId: number, date = ctx.clock.today()): LetterContent {
  const review = ctx.reviews.review(reviewId);
  if (!review) throw new ReviewError("Rituel introuvable.");
  const group = letterGroups(ctx, reviewId).find((g) => g.insurerId === insurerId);
  if (!group) throw new ReviewError("Aucun changement de caisse pour cet assureur.");
  if (!group.check.ok) throw new ReviewError(group.check.reasons.join(" "));
  const h = requireHousehold(ctx);
  const persons = ctx.household.persons(h.id);
  const representative =
    persons.find((p) => p.id === h.representativePersonId) ??
    persons.find((p) => ageClassFor(p.birthDate, review.targetYear - 1) !== "KID") ??
    persons[0]!;
  const newInsurers = [...new Set(group.lines.map((l) => l.line.chosenInsurerId!))];
  const newInsurerName = newInsurers.length === 1 ? ctx.tariffs.insurerName(newInsurers[0]!) : null;
  return buildTerminationLetter({
    sender: {
      name: `${representative.firstName} ${representative.lastName}`,
      addressLines: [h.street, `${h.npa} ${h.locality}`.trim()].filter(Boolean),
    },
    recipient: { name: group.address!.recipientName, addressLines: group.address!.addressLines },
    place: h.locality || "",
    date,
    targetYear: review.targetYear,
    persons: group.lines.map(({ person, policy }) => ({
      firstName: person.firstName,
      lastName: person.lastName,
      birthDate: person.birthDate,
      policyNumber: policy!.policyNumber,
      // Mineur à la date de la lettre : 18 ans révolus pas encore atteints.
      isMinor: `${Number(person.birthDate.slice(0, 4)) + 18}${person.birthDate.slice(4)}` > date,
    })),
    newInsurerName,
    legalRepresentativeName: `${representative.firstName} ${representative.lastName}`,
  });
}

/**
 * Génère (ou régénère, tant qu'elle n'est pas envoyée) la lettre PDF pour une caisse quittée.
 * Le trigger SQL refuse en dernier recours toute ligne qui ne serait pas un changement validé.
 */
export async function generateLetter(ctx: AppContext, reviewId: number, insurerId: number, render: PdfRenderer): Promise<number> {
  const review = ctx.reviews.review(reviewId);
  if (!review) throw new ReviewError("Rituel introuvable.");
  if (review.status === "CLOSED") throw new ReviewError("Ce rituel est clôturé.");
  const group = letterGroups(ctx, reviewId).find((g) => g.insurerId === insurerId);
  if (!group) throw new ReviewError("Aucun changement de caisse pour cet assureur.");
  if (group.letter?.sentAt) throw new ReviewError("Cette lettre a déjà été envoyée : elle ne peut plus être régénérée.");
  const content = letterContent(ctx, reviewId, insurerId);
  const pdf = await render(content);
  const sha = createHash("sha256").update(pdf).digest("hex");
  const path = `letters/${review.targetYear}/resiliation-${insurerId}-${sha.slice(0, 12)}.pdf`;
  ctx.files.write(path, pdf);
  if (group.letter) {
    ctx.reviews.deleteLetter(group.letter.id);
    if (group.letter.pdfPath !== path) ctx.files.remove(group.letter.pdfPath);
  }
  return ctx.reviews.createLetter(
    { reviewId, insurerId, pdfSha256: sha, pdfPath: path },
    group.lines.map((l) => l.line.id),
  );
}

export function deleteLetter(ctx: AppContext, letterId: number): void {
  const letter = ctx.reviews.letter(letterId);
  if (!letter) throw new ReviewError("Lettre introuvable.");
  if (letter.sentAt) throw new ReviewError("Une lettre envoyée ne se supprime pas : annule d'abord l'envoi.");
  ctx.reviews.deleteLetter(letterId);
  ctx.files.remove(letter.pdfPath);
  syncStatus(ctx, letter.reviewId);
}

export function markLetterSent(ctx: AppContext, letterId: number, input: { sentOn: string | null; trackingNo: string | null }): void {
  const letter = ctx.reviews.letter(letterId);
  if (!letter) throw new ReviewError("Lettre introuvable.");
  if (input.sentOn !== null && !isIsoDate(input.sentOn)) throw new ReviewError("Date d'envoi invalide.");
  const trackingNo = input.trackingNo?.replace(/\s+/g, "").toUpperCase() || null;
  ctx.reviews.updateLetter(letterId, {
    sentAt: input.sentOn,
    trackingNo,
    insurerAckAt: input.sentOn === null ? null : letter.insurerAckAt,
  });
  syncStatus(ctx, letter.reviewId);
}

export function markInsurerAck(ctx: AppContext, letterId: number, ackOn: string | null): void {
  const letter = ctx.reviews.letter(letterId);
  if (!letter) throw new ReviewError("Lettre introuvable.");
  if (!letter.sentAt && ackOn) throw new ReviewError("Indique d'abord la date d'envoi.");
  if (ackOn !== null && !isIsoDate(ackOn)) throw new ReviewError("Date invalide.");
  ctx.reviews.updateLetter(letterId, { insurerAckAt: ackOn });
  syncStatus(ctx, letter.reviewId);
}

export function letterPdf(ctx: AppContext, letterId: number): { bytes: Uint8Array; fileName: string } {
  const letter = ctx.reviews.letter(letterId);
  if (!letter) throw new ReviewError("Lettre introuvable.");
  const name = ctx.tariffs.insurerName(letter.insurerId).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return { bytes: ctx.files.read(letter.pdfPath), fileName: `resiliation-lamal-${name}.pdf` };
}
