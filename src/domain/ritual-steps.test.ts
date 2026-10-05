import { describe, expect, it } from "vitest";
import { isRitualComplete, isStepDone, ritualSteps, type RitualLineFacts } from "./ritual-steps";

const line = (over: Partial<RitualLineFacts> = {}): RitualLineFacts => ({
  decision: "UNDECIDED",
  renewalKnown: true,
  affiliationRequested: false,
  letterSent: false,
  ...over,
});
const facts = { strategyChosen: false, needsConfirmed: false };

describe("étapes du rituel", () => {
  it("ne coche rien après une étape manquante", () => {
    const steps = ritualSteps({ ...facts, strategyChosen: false, needsConfirmed: true, lines: [line()] });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ["renewal", true],
      ["strategy", false],
      ["needs", false],
      ["decide", false],
      ["procedures", false],
    ]);
  });

  it("tout décidé : stratégie et besoins ne bloquent plus", () => {
    const steps = ritualSteps({ ...facts, lines: [line({ decision: "KEEP" })] });
    expect(isStepDone(steps, "decide")).toBe(true);
    // Garder sa caisse ne demande aucune démarche : le rituel est terminé.
    expect(isRitualComplete(steps)).toBe(true);
  });

  it("changement de caisse : terminé quand la demande et la résiliation sont envoyées", () => {
    const switching = line({ decision: "SWITCH", affiliationRequested: true, letterSent: false });
    expect(isRitualComplete(ritualSteps({ ...facts, lines: [switching] }))).toBe(false);
    expect(isRitualComplete(ritualSteps({ ...facts, lines: [{ ...switching, affiliationRequested: false, letterSent: true }] }))).toBe(false);
    expect(isRitualComplete(ritualSteps({ ...facts, lines: [{ ...switching, letterSent: true }] }))).toBe(true);
  });

  it("une personne encore indécise empêche la fin", () => {
    const keep = line({ decision: "KEEP" });
    expect(isRitualComplete(ritualSteps({ ...facts, lines: [keep, line()] }))).toBe(false);
  });
});
