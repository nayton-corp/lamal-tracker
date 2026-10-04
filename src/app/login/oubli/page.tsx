import { Mail } from "lucide-react";
import Link from "next/link";
import { mailDeps } from "@/server/accounts";
import { redirectIfSignedIn } from "@/server/auth";
import { Alert } from "@/ui/alert";
import { AuthShell } from "@/ui/auth-shell";
import { ForgotPasswordForm } from "../login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mot de passe oublié" };

export default async function ForgotPasswordPage() {
  await redirectIfSignedIn();
  return (
    <AuthShell icon={Mail} title="Mot de passe oublié" subtitle="Recevez un lien pour en choisir un nouveau." footer={<Link href="/login" className="text-primary underline">Revenir à la connexion</Link>}>
      {mailDeps() ? (
        <ForgotPasswordForm />
      ) : (
        <Alert tone="info">Cette instance n&apos;envoie pas de courriels. L&apos;administrateur peut réinitialiser votre accès (procédure décrite dans le README).</Alert>
      )}
    </AuthShell>
  );
}
