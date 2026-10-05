import { describe, expect, it } from "vitest";
import { isStepDone, ritualSteps, type RitualLineFacts } from "./ritual-steps";

const line = (over: Partial<RitualLineFacts> = {}): RitualLineFacts => ({
  decision: "UNDECIDED",
  renewalKnown: true,
  lcaConfirmed: false,
  affiliationRequested: false,
  affiliationConfirmed: false,
  letterSent: false,
  ...over,
});
const facts = { strategyChosen: false, needsConfirmed: false, terminationsAcknowledged: true };

describe("étapes du rituel", () => {
  it("ne coche rien après une étape manquante", () => {
    const steps = ritualSteps({ ...facts, strategyChosen: false, needsConfirmed: true, lines: [line()] });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ["renewal", true],
      ["strategy", false],
      ["needs", false],
      ["decide", false],
      ["procedures", false],
      ["confirmed", false],
    ]);
  });

  it("tout décidé : stratégie et besoins ne bloquent plus", () => {
    const steps = ritualSteps({ ...facts, lines: [line({ decision: "KEEP" })] });
    expect(isStepDone(steps, "decide")).toBe(true);
    // Garder sa caisse ne demande aucune démarche.
    expect(isStepDone(steps, "confirmed")).toBe(true);
  });

  it("changement de caisse : démarches puis confirmation", () => {
    const switching = line({ decision: "SWITCH", lcaConfirmed: true, affiliationRequested: true, letterSent: true });
    expect(isStepDone(ritualSteps({ ...facts, lines: [switching] }), "procedures")).toBe(true);
    expect(isStepDone(ritualSteps({ ...facts, lines: [switching] }), "confirmed")).toBe(false);
    expect(isStepDone(ritualSteps({ ...facts, lines: [{ ...switching, affiliationConfirmed: true }] }), "confirmed")).toBe(true);
  });
});
