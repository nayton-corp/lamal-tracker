import { Fingerprint } from "lucide-react";
import { accountOverview } from "@/application/account";
import { isFreshSession } from "@/application/auth";
import { accountPageScope } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { AuthShell } from "@/ui/auth-shell";
import { PasskeyOffer } from "./passkey-offer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Passkey" };

/** Juste après l'inscription : la passkey est proposée avant l'accueil guidé. */
export default async function PasskeyOfferPage() {
  const scope = await accountPageScope();
  const next = scope.householdId === null ? "/bienvenue" : "/";
  const has = accountOverview(db(), scope.userId).passkeys.length > 0;
  return (
    <AuthShell icon={Fingerprint} title="Connexion en un geste" subtitle="Votre compte est prêt.">
      <p>Avec une passkey, vous vous connectez avec Face ID, Touch ID ou l&apos;empreinte de ce téléphone, sans mot de passe. C&apos;est aussi plus sûr.</p>
      <PasskeyOffer next={next} already={has} askPassword={!isFreshSession(db(), scope.sessionId, nowIso())} />
    </AuthShell>
  );
}
