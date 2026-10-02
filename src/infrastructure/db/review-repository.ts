import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { annualReview, reviewLine, terminationLetter, terminationLetterLine } from "./schema";

export type ReviewRow = typeof annualReview.$inferSelect;
export type ReviewLineRow = typeof reviewLine.$inferSelect;
export type LetterRow = typeof terminationLetter.$inferSelect;

export class ReviewRepository {
  constructor(private readonly db: Db) {}

  review(id: number): ReviewRow | undefined {
    return this.db.select().from(annualReview).where(eq(annualReview.id, id)).get();
  }

  reviewFor(householdId: number, targetYear: number): ReviewRow | undefined {
    return this.db
      .select()
      .from(annualReview)
      .where(and(eq(annualReview.householdId, householdId), eq(annualReview.targetYear, targetYear)))
      .get();
  }

  reviews(householdId: number): ReviewRow[] {
    return this.db.select().from(annualReview).where(eq(annualReview.householdId, householdId)).orderBy(desc(annualReview.targetYear)).all();
  }

  openReviews(): ReviewRow[] {
    return this.db
      .select()
      .from(annualReview)
      .where(inArray(annualReview.status, ["DRAFT", "DECIDED", "LETTERS_SENT", "CONFIRMED"]))
      .all();
  }

  createReview(input: Omit<ReviewRow, "id" | "openedAt" | "closedAt">, lines: Omit<ReviewLineRow, "id" | "reviewId">[]): number {
    return this.db.transaction((tx) => {
      const id = tx.insert(annualReview).values(input).returning({ id: annualReview.id }).get().id;
      for (const line of lines) tx.insert(reviewLine).values({ ...line, reviewId: id }).run();
      return id;
    });
  }

  updateReview(id: number, input: Partial<Omit<ReviewRow, "id">>): void {
    this.db.update(annualReview).set(input).where(eq(annualReview.id, id)).run();
  }

  deleteReview(id: number): void {
    this.db.delete(annualReview).where(eq(annualReview.id, id)).run();
  }

  lines(reviewId: number): ReviewLineRow[] {
    return this.db.select().from(reviewLine).where(eq(reviewLine.reviewId, reviewId)).orderBy(asc(reviewLine.id)).all();
  }

  line(id: number): ReviewLineRow | undefined {
    return this.db.select().from(reviewLine).where(eq(reviewLine.id, id)).get();
  }

  addLine(reviewId: number, line: Omit<ReviewLineRow, "id" | "reviewId">): number {
    return this.db.insert(reviewLine).values({ ...line, reviewId }).returning({ id: reviewLine.id }).get().id;
  }

  updateLine(id: number, input: Partial<Omit<ReviewLineRow, "id" | "reviewId">>): void {
    this.db.update(reviewLine).set(input).where(eq(reviewLine.id, id)).run();
  }

  letters(reviewId: number): (LetterRow & { lineIds: number[] })[] {
    const letters = this.db
      .select()
      .from(terminationLetter)
      .where(eq(terminationLetter.reviewId, reviewId))
      .orderBy(asc(terminationLetter.id))
      .all();
    return letters.map((l) => ({ ...l, lineIds: this.letterLineIds(l.id) }));
  }

  letter(id: number): (LetterRow & { lineIds: number[] }) | undefined {
    const l = this.db.select().from(terminationLetter).where(eq(terminationLetter.id, id)).get();
    return l ? { ...l, lineIds: this.letterLineIds(l.id) } : undefined;
  }

  letterForLine(lineId: number): LetterRow | undefined {
    const link = this.db.select().from(terminationLetterLine).where(eq(terminationLetterLine.reviewLineId, lineId)).get();
    return link ? this.db.select().from(terminationLetter).where(eq(terminationLetter.id, link.letterId)).get() : undefined;
  }

  private letterLineIds(letterId: number): number[] {
    return this.db
      .select()
      .from(terminationLetterLine)
      .where(eq(terminationLetterLine.letterId, letterId))
      .all()
      .map((r) => r.reviewLineId);
  }

  /** Crée la lettre et ses liens ; le trigger SQL refuse toute ligne sans SWITCH ni garde-fou LCA. */
  createLetter(input: Omit<LetterRow, "id" | "generatedAt" | "sentAt" | "trackingNo" | "insurerAckAt">, lineIds: number[]): number {
    return this.db.transaction((tx) => {
      const id = tx.insert(terminationLetter).values(input).returning({ id: terminationLetter.id }).get().id;
      for (const lineId of lineIds) tx.insert(terminationLetterLine).values({ letterId: id, reviewLineId: lineId }).run();
      return id;
    });
  }

  updateLetter(id: number, input: Partial<Pick<LetterRow, "sentAt" | "trackingNo" | "insurerAckAt" | "pdfPath" | "pdfSha256">>): void {
    this.db.update(terminationLetter).set(input).where(eq(terminationLetter.id, id)).run();
  }

  deleteLetter(id: number): void {
    this.db.delete(terminationLetter).where(eq(terminationLetter.id, id)).run();
  }
}
