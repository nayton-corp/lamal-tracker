import { describe, expect, it } from "vitest";
import { homeTasks, yearCardState, yearCardTask, type HomeFacts, type HomeLineFacts, type HomeReviewFacts } from "./home";

const line = (over: Partial<HomeLineFacts> = {}): HomeLineFacts => ({ lineId: 1, firstName: "Léa", decision: "UNDECIDED", renewalStatus: "MATCHED", ...over });
const review = (over: Partial<HomeReviewFacts> = {}): HomeReviewFacts => ({
  closed: false,
  preferencesSaved: false,
  lines: [line()],
  unsentDocuments: [],
  unsignedSigners: [],
  ...over,
});
const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  today: "2026-10-10",
  targetYear: 2027,
  contractYear: 2026,
  published: true,
  review: review(),
  personsWithoutContract: [],
  accountSecured: true,
  ...over,
});
const keys = (f: HomeFacts) => homeTasks(f).map((t) => t.key);

describe("carte de l'année", () => {
  it("suit l'avancement du bilan", () => {
    expect(yearCardState(facts({ published: false, review: null }))).toBe("NOT_PUBLISHED");
    expect(yearCardState(facts())).toBe("NOT_STARTED");
    expect(yearCardState(facts({ review: null }))).toBe("NOT_STARTED");
    expect(yearCardState(facts({ review: review({ preferencesSaved: true }) }))).toBe("CHOOSING");
    expect(yearCardState(facts({ review: review({ lines: [line({ decision: "SWITCH" })] }) }))).toBe("TO_SEND");
    expect(yearCardState(facts({ review: review({ closed: true, lines: [line({ decision: "KEEP" })] }) }))).toBe("DONE");
    // Le 30 novembre 2026 tombe un lundi : le lendemain, c'est trop tard.
    expect(yearCardState(facts({ today: "2026-12-01", review: review({ preferencesSaved: true }) }))).toBe("MISSED");
    expect(yearCardState(facts({ today: "2026-12-01", review: review({ closed: true }) }))).toBe("DONE");
  });

  it("porte un seul bouton, la tâche la plus utile", () => {
    expect(yearCardTask(facts({ published: false }))).toBeNull();
    expect(yearCardTask(facts())?.label).toBe("Commencer le bilan");
    expect(yearCardTask(facts({ review: null, personsWithoutContract: [{ personId: 4, firstName: "Marc" }] }))?.label).toBe("Indiquer le contrat 2026 de Marc");
    const choosing = facts({ review: review({ lines: [line({ decision: "KEEP" }), line({ lineId: 2, firstName: "Noa" })] }) });
    expect(yearCardTask(choosing)).toEqual({ key: "choose-2", label: "Choisir pour Noa", target: { to: "compare", lineId: 2 } });
    expect(yearCardTask(facts({ review: review({ lines: [line({ decision: "SWITCH" })] }) }))?.label).toBe("Envoyer les courriers");
    expect(yearCardTask(facts({ review: review({ closed: true }) }))).toBeNull();
  });
});

describe("tâches de l'accueil", () => {
  it("ne répète pas la tâche du bouton de la carte", () => {
    expect(keys(facts())).toEqual([]);
    const sending = facts({
      review: review({
        lines: [line({ decision: "SWITCH" })],
        unsentDocuments: [{ kind: "TERMINATION", insurerName: "Helsana" }],
        unsignedSigners: ["Léa"],
      }),
      accountSecured: false,
    });
    // Courriers et signature mènent au même écran que le bouton « Envoyer les courriers ».
    expect(keys(sending)).toEqual(["secure"]);
  });

  it("classe les courriers avant les choix, puis contrats et compte", () => {
    const f = facts({
      review: review({
        lines: [line({ decision: "SWITCH" }), line({ lineId: 2, firstName: "Noa" }), line({ lineId: 3, firstName: "Marc", renewalStatus: "AMBIGUOUS" })],
        unsentDocuments: [{ kind: "REQUEST", insurerName: "Assura" }, { kind: "TERMINATION", insurerName: "Helsana" }],
      }),
      personsWithoutContract: [{ personId: 9, firstName: "Zoé" }],
      accountSecured: false,
    });
    expect(homeTasks(f).map((t) => t.label)).toEqual([
      "Envoyer la demande à Assura",
      "Envoyer la résiliation à Helsana avant le 23 novembre 2026",
      // « Choisir pour Noa » est sur la carte.
      "Choisir une offre pour Marc",
      "Préciser le produit de la caisse de Marc",
      "Indiquer le contrat 2026 de Zoé",
      "Sécuriser votre compte",
    ]);
  });

  it("délai passé ou bilan terminé : plus de tâche du bilan", () => {
    const late = facts({ today: "2026-12-01", review: review({ preferencesSaved: true, unsentDocuments: [{ kind: "CHANGE", insurerName: "CSS" }] }) });
    expect(keys(late)).toEqual([]);
    expect(keys(facts({ review: review({ closed: true }), accountSecured: false }))).toEqual(["secure"]);
  });
});
