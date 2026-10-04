import { KeyRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pendingMfaLogin } from "@/application/mfa";
import { readCookie } from "@/server/accounts";
import { safeNext } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { AuthShell } from "@/ui/auth-shell";
import { MfaForm } from "../login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Double facteur" };

/** Deuxième étape de la connexion, quand le double facteur est actif. */
export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (!pendingMfaLogin(db(), await readCookie("lamal_mfa"), nowIso())) redirect("/login");
  return (
    <AuthShell icon={KeyRound} title="Double facteur" subtitle="Encore une étape pour protéger vos données." footer={<Link href="/login" className="text-primary underline">Annuler</Link>}>
      <MfaForm next={next} />
    </AuthShell>
  );
}
