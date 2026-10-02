import { describe, expect, it } from "vitest";
import { dueReminder, reviewDeadlines, urgency } from "./deadlines";
import { formatDateLong } from "./dates";

describe("échéances", () => {
  it("30 novembre 2026 est un lundi : échéance inchangée", () => {
    const d = reviewDeadlines(2027);
    expect(d.receiptDeadline).toBe("2026-11-30");
    expect(d.sendBy).toBe("2026-11-23");
    expect(d.effectiveEnd).toBe("2026-12-31");
    expect(formatDateLong(d.receiptDeadline, true)).toBe("lundi 30 novembre 2026");
  });

  it("30 novembre un dimanche : on vise le vendredi", () => {
    // 30.11.2025 est un dimanche
    expect(reviewDeadlines(2026).receiptDeadline).toBe("2025-11-28");
  });

  it("calcule l'urgence et les rappels", () => {
    const d = reviewDeadlines(2027);
    expect(urgency("2026-10-02", d)).toBe("calm");
    expect(urgency("2026-11-15", d)).toBe("soon");
    expect(urgency("2026-11-25", d)).toBe("urgent");
    expect(urgency("2026-12-01", d)).toBe("late");
    expect(dueReminder("2026-11-16", d)).toBe(7);
    expect(dueReminder("2026-11-17", d)).toBeNull();
  });
});
