import "server-only";
import { cookies } from "next/headers";
import { getHouseholdMode, type HouseholdMode } from "@/application/household";
import type { Scope } from "@/application/scope";
import { db } from "./context";

/*
 * « Pour moi seul·e » ou « pour mon foyer » se choisit avant que le foyer existe : le choix attend
 * dans un cookie, puis s'applique au foyer dès sa création.
 */
const MODE_COOKIE = "lamal_mode";

export async function rememberMode(mode: HouseholdMode) {
  (await cookies()).set(MODE_COOKIE, mode, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
}

/** Mode du foyer, ou celui choisi en attendant sa création. */
export async function chosenMode(scope: Scope): Promise<HouseholdMode | null> {
  const stored = getHouseholdMode(db(), scope);
  if (stored) return stored;
  const pending = (await cookies()).get(MODE_COOKIE)?.value;
  return pending === "SOLO" || pending === "FAMILY" ? pending : null;
}

/** Remise à zéro : le choix sera reposé. */
export async function forgetMode() {
  (await cookies()).delete(MODE_COOKIE);
}
