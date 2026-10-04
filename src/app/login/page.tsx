import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { legacyAdminId } from "@/application/auth";
import { mailDeps } from "@/server/accounts";
import { redirectIfSignedIn, safeNext } from "@/server/auth";
import { db } from "@/server/context";
import { Alert } from "@/ui/alert";
import { AuthShell } from "@/ui/auth-shell";
import { ClearCaches } from "@/ui/service-worker";
import { LoginForm } from "./login-form";
import { PasskeyLoginButton } from "./passkey-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reinitialise?: string; confirme?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  await redirectIfSignedIn(next);
  return (
    <AuthShell
      icon={ShieldCheck}
      title="Primes LAMal"
      subtitle="Connectez-vous à votre compte."
      footer={
        <>
          {mailDeps() && (
            <p>
              <Link href="/login/oubli" className="font-medium text-primary underline">Mot de passe oublié ?</Link>
            </p>
          )}
          <p className="text-muted">
            Pas encore de compte ? <Link href="/inscription" className="font-medium text-primary underline">J&apos;ai une invitation</Link>
          </p>
        </>
      }
    >
      {params.reinitialise && <Alert tone="success">Mot de passe changé : connectez-vous avec le nouveau.</Alert>}
      {params.confirme && <Alert tone="success">Adresse confirmée : connectez-vous.</Alert>}
      <PasskeyLoginButton next={next} />
      <LoginForm next={next} legacy={legacyAdminId(db()) !== null} />
      <ClearCaches />
    </AuthShell>
  );
}
