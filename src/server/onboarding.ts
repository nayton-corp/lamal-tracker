import "server-only";
import { getHouseholdMode, type HouseholdMode } from "@/application/household";
import type { Scope } from "@/application/scope";
import { deleteCookie, readCookie, writeCookie } from "./accounts";
import { db } from "./context";
import { COOKIE } from "./cookie-names";

/*
 * « Pour moi seul·e » ou « pour mon foyer » se choisit avant que le foyer existe : le choix attend
 * dans un cookie, puis s'applique au foyer dès sa création.
 */

/** Garde le choix une semaine, le temps de créer le foyer. */
export async function rememberMode(mode: HouseholdMode) {
  await writeCookie(COOKIE.householdMode, mode, 60 * 60 * 24 * 7);
}

/** Mode du foyer, ou celui choisi en attendant sa création. */
export async function chosenMode(scope: Scope): Promise<HouseholdMode | null> {
  const stored = getHouseholdMode(db(), scope);
  if (stored) return stored;
  const pending = await readCookie(COOKIE.householdMode);
  return pending === "SOLO" || pending === "FAMILY" ? pending : null;
}

/** Remise à zéro : le choix sera reposé. */
export async function forgetMode() {
  await deleteCookie(COOKIE.householdMode);
}
