import { UserPlus } from "lucide-react";
import Link from "next/link";
import { describeInvitation } from "@/application/invitations";
import { redirectIfSignedIn } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { Alert } from "@/ui/alert";
import { AuthShell } from "@/ui/auth-shell";
import { SignUpForm } from "./signup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Créer un compte" };

/** Inscription sur invitation : le code arrive par le lien partagé, ou se saisit à la main. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await redirectIfSignedIn();
  const code = (await searchParams).code?.trim() ?? "";
  const invite = code ? describeInvitation(db(), code, nowIso()) : null;
  return (
    <AuthShell
      icon={UserPlus}
      title="Créer un compte"
      subtitle="L'accès se fait sur invitation."
      footer={
        <p className="text-muted">
          Déjà un compte ? <Link href="/login" className="font-medium text-primary underline">Se connecter</Link>
        </p>
      }
    >
      {code && !invite && <Alert tone="danger">Ce lien d&apos;invitation n&apos;est plus valable (expiré, déjà utilisé ou révoqué). Demandez-en un nouveau.</Alert>}
      {invite?.kind === "HOUSEHOLD" && (
        <Alert tone="info" title="Vous rejoignez un foyer">
          {invite.inviter ? `${invite.inviter} vous invite` : "Vous êtes invité"} à partager son foyer : vous verrez les mêmes contrats et préparerez les démarches ensemble.
        </Alert>
      )}
      <SignUpForm code={code} />
    </AuthShell>
  );
}
