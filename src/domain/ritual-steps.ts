import type { Decision } from "./review";

/*
 * Étapes du rituel d'automne, affichées en frise sur la page du rituel :
 *
 *   Hausse → Stratégie → Besoins → Choix → Envoi
 *
 * « Hausse » (la nouvelle prime de chaque personne est connue) est indépendante. Les suivantes
 * s'enchaînent : une étape n'est cochée que si toutes les précédentes le sont, pour ne jamais
 * afficher de coche « vide » (des démarches faites avant toute décision, par exemple).
 */

export type RitualStepKey = "renewal" | "strategy" | "needs" | "decide" | "procedures";

export const RITUAL_STEP_LABEL: Record<RitualStepKey, string> = {
  renewal: "Hausse",
  strategy: "Stratégie",
  needs: "Besoins",
  decide: "Choix",
  procedures: "Envoi",
};

export interface RitualStep {
  key: RitualStepKey;
  label: string;
  done: boolean;
}

/** Ce qu'il faut savoir d'une personne du rituel pour cocher les étapes. */
export interface RitualLineFacts {
  decision: Decision;
  /** Nouvelle prime de la caisse actuelle connue. */
  renewalKnown: boolean;
  /** Affiliation demandée à la nouvelle caisse (demande marquée envoyée). */
  affiliationRequested: boolean;
  /** Une lettre la concernant est partie (et n'a pas été refusée par Pingen). */
  letterSent: boolean;
}

export interface RitualFacts {
  lines: readonly RitualLineFacts[];
  strategyChosen: boolean;
  needsConfirmed: boolean;
}

/** Une décision demande-t-elle un courrier ? Changer de caisse (résiliation) ou de franchise/modèle. */
export const needsLetter = (decision: Decision) => decision === "SWITCH" || decision === "ADJUST";

/** Frise des cinq étapes, cochées d'après l'état des lignes et chaînées (voir l'en-tête). */
export function ritualSteps(facts: RitualFacts): RitualStep[] {
  const { lines } = facts;
  const switching = lines.filter((l) => l.decision === "SWITCH");
  const allDecided = lines.length > 0 && lines.every((l) => l.decision !== "UNDECIDED");
  const done: Record<RitualStepKey, boolean> = {
    renewal: lines.length > 0 && lines.every((l) => l.renewalKnown),
    // Tout décidé sans passer par la stratégie ou les besoins : ces étapes ne bloquent pas la suite.
    strategy: facts.strategyChosen || allDecided,
    needs: facts.needsConfirmed || allDecided,
    decide: allDecided,
    procedures: switching.every((l) => l.affiliationRequested) && lines.filter((l) => needsLetter(l.decision)).every((l) => l.letterSent),
  };
  return chainStepsAfterFirst((Object.keys(RITUAL_STEP_LABEL) as RitualStepKey[]).map((key) => ({ key, label: RITUAL_STEP_LABEL[key], done: done[key] })));
}

/** La première étape compte seule ; chaque suivante n'est faite que si toutes les précédentes (sauf la première) le sont. */
function chainStepsAfterFirst(steps: RitualStep[]): RitualStep[] {
  let previousDone = true;
  return steps.map((step, i) => {
    if (i === 0) return step;
    previousDone = previousDone && step.done;
    return { ...step, done: previousDone };
  });
}

export function isStepDone(steps: readonly RitualStep[], key: RitualStepKey): boolean {
  return steps.find((s) => s.key === key)?.done ?? false;
}

/**
 * Rituel terminé : tout le monde a décidé et chaque courrier nécessaire est envoyé (aucun pour qui
 * garde son contrat). Le rituel se clôt alors tout seul.
 */
export function isRitualComplete(steps: readonly RitualStep[]): boolean {
  return isStepDone(steps, "procedures");
}
