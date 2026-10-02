import { addDays, compareIsoDate, isoDate, type IsoDate } from "./calendar";
import type { Rappen } from "./money";

export const LCA_CATEGORIES = ["HOSPITAL", "AMBULATORY", "DENTAL", "OTHER"] as const;
export type LcaCategory = (typeof LCA_CATEGORIES)[number];

export const LCA_CATEGORY_LABEL: Record<LcaCategory, string> = {
  HOSPITAL: "Hospitalisation",
  AMBULATORY: "Ambulatoire / médecines complémentaires",
  DENTAL: "Dentaire",
  OTHER: "Autre",
};

export interface LcaPolicy {
  id: number;
  personId: number;
  insurerId: number;
  productName: string;
  category: LcaCategory;
  policyNumber: string;
  startDate: IsoDate | null;
  /** Fin de la durée minimale du contrat (souvent plusieurs années). */
  minTermEnd: IsoDate | null;
  noticeMonths: number;
  /** Rabais accordé parce que la LAMal est chez le même assureur. */
  bundledDiscount: boolean;
  status: "ACTIVE" | "TERMINATED";
  monthlyPremiumRp: Rappen | null;
}

export interface LcaWarning {
  policy: LcaPolicy;
  messages: string[];
}

/**
 * Complémentaires concernées par un changement de LAMal : celles de la personne chez sa caisse actuelle.
 * Elles restent actives ; le garde-fou rappelle pourquoi il ne faut rien résilier par réflexe.
 */
export function lcaWarningsForSwitch(policies: readonly LcaPolicy[], personId: number, currentInsurerId: number): LcaWarning[] {
  return policies
    .filter((p) => p.personId === personId && p.insurerId === currentInsurerId && p.status === "ACTIVE")
    .map((policy) => {
      const messages = ["Cette complémentaire reste active : la lettre ne la résilie pas."];
      if (policy.bundledDiscount) {
        messages.push("Le rabais lié à la LAMal chez le même assureur peut disparaître : la prime LCA peut augmenter.");
      }
      if (policy.category === "HOSPITAL" || policy.category === "AMBULATORY") {
        messages.push(
          "Ne la résilie jamais avant qu'une nouvelle complémentaire t'ait accepté après questionnaire de santé : une réserve ou un refus est possible.",
        );
      }
      return { policy, messages };
    });
}

/**
 * Date de résiliation la plus proche possible pour une LCA (fin d'année civile après le préavis,
 * pas avant la fin de la durée minimale). Indicatif : les conditions générales font foi.
 */
export function earliestLcaTermination(policy: LcaPolicy, today: IsoDate): IsoDate {
  let year = Number(today.slice(0, 4));
  for (;;) {
    const end = isoDate(year, 12, 31);
    const noticeBy = addDays(isoDate(year, 12 - policy.noticeMonths + 1, 1), -1);
    const afterMinTerm = !policy.minTermEnd || compareIsoDate(end, policy.minTermEnd) >= 0;
    if (afterMinTerm && compareIsoDate(today, noticeBy) <= 0) return end;
    year += 1;
  }
}
