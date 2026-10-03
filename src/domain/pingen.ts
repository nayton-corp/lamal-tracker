import type { LetterContent } from "./letter";

/**
 * Envoi d'une lettre par Pingen (impression et recommandé par la Poste suisse).
 * Règles indépendantes de l'API : avancement d'un statut, conditions avant l'envoi.
 */

/** Statut enregistré quand Pingen n'a pas confirmé la création (réseau coupé en chemin). */
export const PINGEN_UNKNOWN = "unknown";

export type PingenPhase = "UNCONFIRMED" | "PENDING" | "IN_TRANSIT" | "DELIVERED" | "FAILED";

const FAILED = new Set(["action_required", "invalid", "cancelled", "canceled", "undeliverable", "expired", "failed"]);

/** Où en est la lettre ; un statut inconnu de cette version reste « en cours » (jamais « échoué »). */
export function pingenPhase(status: string): PingenPhase {
  if (status === PINGEN_UNKNOWN) return "UNCONFIRMED";
  if (FAILED.has(status)) return "FAILED";
  if (status === "delivered") return "DELIVERED";
  if (status === "sent") return "IN_TRANSIT";
  return "PENDING";
}

export const PINGEN_PHASE_LABEL: Record<PingenPhase, string> = {
  UNCONFIRMED: "Envoi non confirmé par Pingen",
  PENDING: "En préparation chez Pingen",
  IN_TRANSIT: "Remise à la Poste par Pingen",
  DELIVERED: "Distribuée",
  FAILED: "Refusée ou non distribuée",
};

/** Lettre refusée ou non distribuée par Pingen : elle est à reprendre, pas envoyée. */
export function pingenFailed(status: string | null): boolean {
  return status !== null && pingenPhase(status) === "FAILED";
}

/** Une lettre dont l'avancement peut encore changer chez Pingen. */
export function pingenNeedsSync(status: string | null): boolean {
  if (status === null) return false;
  const phase = pingenPhase(status);
  return phase !== "DELIVERED" && phase !== "FAILED";
}

/**
 * Hauteur de la zone d'adresse imposée par Pingen (25,5 mm) : six lignes au plus
 * dans la taille de caractère utilisée pour l'envoi.
 */
export const PINGEN_MAX_ADDRESS_LINES = 6;

/**
 * Ce qui empêche de confier la lettre à Pingen. Pingen imprime la lettre telle quelle :
 * chaque signataire doit avoir signé à l'écran, et l'adresse doit tenir dans la fenêtre.
 */
export function pingenBlockers(content: Pick<LetterContent, "signatures" | "insurerLines">, signedNames: Iterable<string>): string[] {
  const signed = new Set(signedNames);
  const blockers: string[] = [];
  const missing = content.signatures.filter((name) => !signed.has(name));
  if (missing.length) blockers.push(`Signature à l'écran manquante : ${missing.join(", ")}.`);
  if (content.insurerLines.length > PINGEN_MAX_ADDRESS_LINES) {
    blockers.push(`L'adresse de la caisse compte ${content.insurerLines.length} lignes ; la fenêtre de l'enveloppe en accepte ${PINGEN_MAX_ADDRESS_LINES}.`);
  }
  return blockers;
}
