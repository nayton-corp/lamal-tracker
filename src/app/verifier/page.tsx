import { MailCheck } from "lucide-react";
import Link from "next/link";
import { verificationPending } from "@/application/account";
import { ConfirmEmailForm } from "@/app/inscription/signup-form";
import { db, nowIso } from "@/server/context";
import { Alert } from "@/ui/alert";
import { AuthShell } from "@/ui/auth-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirmer l'adresse" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t ?? "";
  const valid = verificationPending(db(), token, nowIso());
  return (
    <AuthShell icon={MailCheck} title="Confirmer l'adresse" footer={<Link href="/login" className="text-primary underline">Revenir à la connexion</Link>}>
      {valid ? (
        <ConfirmEmailForm token={token} />
      ) : (
        <Alert tone="danger">Ce lien n&apos;est plus valable (expiré ou déjà utilisé). Connectez-vous pour en recevoir un nouveau.</Alert>
      )}
    </AuthShell>
  );
}
