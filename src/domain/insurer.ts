/** Affichage d'une caisse LAMal : nom court, adresse de résiliation, destinataire des lettres. */

/** Nom affiché : le nom usuel choisi (« Helsana »), sinon la raison sociale de l'OFSP. */
export function insurerLabel(row: { name: string; displayName: string | null }): string {
  return row.displayName || row.name;
}

type InsurerAddressRow = { name: string; legalNameFr?: string | null; terminationAddress: string | null; officialAddress?: string | null };

/** Adresse de résiliation : celle saisie par l'utilisateur, sinon celle de l'annuaire officiel. */
export function insurerAddressLines(row: InsurerAddressRow): string[] {
  const raw = row.terminationAddress?.trim() ? row.terminationAddress : (row.officialAddress ?? "");
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Destinataire complet d'une lettre en français : raison sociale puis adresse. */
export function insurerRecipient(row: InsurerAddressRow): string[] {
  return [row.legalNameFr || row.name, ...insurerAddressLines(row)];
}
