/**
 * Garanties complémentaires courantes (LCA). Les produits varient d'une caisse à l'autre, mais
 * ils se rangent tous dans ces familles : c'est ce qu'on demande à une caisse dans une demande
 * d'offre, et ce qu'on surveille lors d'un changement de LAMal.
 */
export type LcaCategory = "HOSPITAL" | "AMBULATORY" | "DENTAL" | "OTHER";

export type LcaGuarantee =
  | "HOSPITAL_GENERAL"
  | "HOSPITAL_SEMI_PRIVATE"
  | "HOSPITAL_PRIVATE"
  | "HOSPITAL_FLEX"
  | "AMBULATORY"
  | "ALTERNATIVE"
  | "DENTAL"
  | "TRAVEL"
  | "OTHER";

export interface LcaGuaranteeInfo {
  key: LcaGuarantee;
  category: LcaCategory;
  label: string;
  hint: string;
}

export const LCA_GUARANTEES: readonly LcaGuaranteeInfo[] = [
  { key: "HOSPITAL_GENERAL", category: "HOSPITAL", label: "Hospitalisation division commune, toute la Suisse", hint: "Libre choix de l'hôpital en Suisse, en chambre commune." },
  { key: "HOSPITAL_SEMI_PRIVATE", category: "HOSPITAL", label: "Hospitalisation demi-privée", hint: "Chambre à deux lits et libre choix du médecin." },
  { key: "HOSPITAL_PRIVATE", category: "HOSPITAL", label: "Hospitalisation privée", hint: "Chambre individuelle et libre choix du médecin." },
  { key: "HOSPITAL_FLEX", category: "HOSPITAL", label: "Hospitalisation flexible", hint: "Division choisie à l'admission, avec participation selon le choix." },
  { key: "AMBULATORY", category: "AMBULATORY", label: "Complémentaire ambulatoire", hint: "Lunettes, prévention, transports, médicaments hors liste." },
  { key: "ALTERNATIVE", category: "AMBULATORY", label: "Médecines complémentaires", hint: "Ostéopathie, naturopathie, acupuncture hors LAMal." },
  { key: "DENTAL", category: "DENTAL", label: "Soins dentaires", hint: "Contrôles, détartrage, traitements, orthodontie pour les enfants." },
  { key: "TRAVEL", category: "OTHER", label: "Voyages et urgences à l'étranger", hint: "Frais médicaux à l'étranger au-delà de la LAMal, rapatriement." },
  { key: "OTHER", category: "OTHER", label: "Autre complémentaire", hint: "Capital décès, perte de gain, etc." },
];

export const LCA_GUARANTEE_KEYS = LCA_GUARANTEES.map((g) => g.key) as [LcaGuarantee, ...LcaGuarantee[]];

export function guaranteeInfo(key: string | null | undefined): LcaGuaranteeInfo | null {
  return LCA_GUARANTEES.find((g) => g.key === key) ?? null;
}

/**
 * Nom d'usage de l'assureur complémentaire d'une caisse LAMal : les groupes logent leurs
 * complémentaires dans une société sœur, souvent « <groupe> Assurances complémentaires ».
 */
export function suggestedLcaInsurer(lamal: { name: string; groupName: string | null }): string {
  return lamal.groupName ?? lamal.name;
}
