import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ageClassChange, ageClassFor } from "@/domain/age-class";
import { addDays, daysBetween, formatDateFr, isWeekend, lastWorkingDayOnOrBefore, parseIsoDate, subtractWorkingDays } from "@/domain/calendar";
import { countdown, isReviewSeason, midYearTermination, ordinaryTerminationDeadline, remindersDue, reviewTargetYear } from "@/domain/deadlines";

describe("calendrier", () => {
  it("refuse les dates inexistantes", () => {
    expect(() => parseIsoDate("2026-02-30")).toThrow();
    expect(() => parseIsoDate("30.11.2026")).toThrow();
  });

  it("additionne et soustrait des jours de façon cohérente", () => {
    fc.assert(
      fc.property(fc.integer({ min: -2000, max: 2000 }), (n) => {
        expect(daysBetween("2026-10-02", addDays("2026-10-02", n))).toBe(n);
      }),
    );
  });

  it("formate en français", () => {
    expect(formatDateFr("2026-11-30", true)).toBe("lundi 30 novembre 2026");
    expect(formatDateFr("2027-01-01")).toBe("1er janvier 2027");
  });

  it("recule sur les jours ouvrables", () => {
    expect(lastWorkingDayOnOrBefore("2025-11-30")).toBe("2025-11-28"); // dimanche → vendredi
    expect(subtractWorkingDays("2026-11-30", 4)).toBe("2026-11-24");
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3650 }), fc.integer({ min: 0, max: 30 }), (offset, n) => {
        const d = subtractWorkingDays(addDays("2020-01-01", offset), n);
        expect(isWeekend(d) && n > 0).toBe(false);
      }),
    );
  });
});

describe("échéance de résiliation", () => {
  it("2027 : réception au lundi 30 novembre 2026", () => {
    const d = ordinaryTerminationDeadline(2027);
    expect(d.legalReceiptDate).toBe("2026-11-30");
    expect(d.receiptByWorkingDay).toBe("2026-11-30");
    expect(d.recommendedSendBy).toBe("2026-11-24");
  });

  it("2026 : le 30 novembre 2025 tombe un dimanche", () => {
    const d = ordinaryTerminationDeadline(2026);
    expect(d.receiptByWorkingDay).toBe("2025-11-28");
    expect(d.recommendedSendBy).toBe("2025-11-24");
  });

  it("l'envoi recommandé précède toujours la réception légale", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2100 }), (year) => {
        const d = ordinaryTerminationDeadline(year);
        expect(d.recommendedSendBy < d.receiptByWorkingDay).toBe(true);
        expect(d.receiptByWorkingDay <= d.legalReceiptDate).toBe(true);
        expect(isWeekend(d.recommendedSendBy)).toBe(false);
      }),
    );
  });

  it("compte à rebours", () => {
    expect(countdown("2026-10-02", "2026-11-30")).toEqual({ daysLeft: 59, level: "calm" });
    expect(countdown("2026-11-20", "2026-11-24").level).toBe("urgent");
    expect(countdown("2026-11-25", "2026-11-24").level).toBe("overdue");
  });

  it("rappels J-30, J-14, J-7…", () => {
    const d = ordinaryTerminationDeadline(2027);
    expect(remindersDue("2026-10-25", d)).toEqual([30]);
    expect(remindersDue("2026-11-17", d)).toEqual([7]);
    expect(remindersDue("2026-11-24", d)).toEqual([0]);
    // Serveur éteint le jour J : le palier atteint reste dû (dédoublonné par la clé de notification)
    expect(remindersDue("2026-10-26", d)).toEqual([30]);
    expect(remindersDue("2026-10-24", d)).toEqual([]);
    expect(remindersDue("2026-11-27", d)).toEqual([0]);
    expect(remindersDue("2026-12-01", d)).toEqual([]);
  });

  it("résiliation au 30 juin seulement en assurance ordinaire", () => {
    expect(midYearTermination(2027, "STANDARD", 300, 300).eligible).toBe(true);
    expect(midYearTermination(2027, "STANDARD", 300, 300).legalReceiptDate).toBe("2027-03-31");
    expect(midYearTermination(2027, "STANDARD", 2500, 300).eligible).toBe(false);
    expect(midYearTermination(2027, "TELMED", 300, 300).eligible).toBe(false);
  });

  it("saison du rituel et année cible", () => {
    expect(isReviewSeason("2026-10-02")).toBe(true);
    expect(isReviewSeason("2026-09-01")).toBe(false);
    expect(reviewTargetYear("2026-10-02")).toBe(2027);
    expect(reviewTargetYear("2027-02-10")).toBe(2027);
  });
});

describe("classes d'âge", () => {
  it("se basent sur l'année de naissance", () => {
    expect(ageClassFor("2008-12-31", 2026)).toBe("KID"); // 18 ans en 2026
    expect(ageClassFor("2008-01-01", 2027)).toBe("YOUNG"); // 19 ans en 2027
    expect(ageClassFor("2001-06-15", 2026)).toBe("YOUNG"); // 25
    expect(ageClassFor("2001-06-15", 2027)).toBe("ADULT"); // 26
    expect(() => ageClassFor("2028-01-01", 2027)).toThrow();
  });

  it("signale le passage enfant → jeune adulte", () => {
    const change = ageClassChange("2008-03-10", 2026, 2027);
    expect(change).toMatchObject({ from: "KID", to: "YOUNG", changed: true });
    expect(change.warning).toContain("franchises enfant");
    expect(ageClassChange("1990-01-01", 2026, 2027).changed).toBe(false);
  });
});
