import { KeyRound } from "lucide-react";
import Link from "next/link";
import { resetInfo } from "@/application/account";
import { db, nowIso } from "@/server/context";
import { Alert } from "@/ui/alert";
import { AuthShell } from "@/ui/auth-shell";
import { ResetPasswordForm } from "../login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouveau mot de passe" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t ?? "";
  const info = resetInfo(db(), token, nowIso());
  return (
    <AuthShell icon={KeyRound} title="Nouveau mot de passe" subtitle="Tous vos appareils seront déconnectés." footer={<Link href="/login" className="text-primary underline">Revenir à la connexion</Link>}>
      {info ? (
        <ResetPasswordForm token={token} needsCode={info.needsCode} />
      ) : (
        <Alert tone="danger">
          Ce lien n&apos;est plus valable (expiré ou déjà utilisé). <Link href="/login/oubli">Faire une nouvelle demande</Link>.
        </Alert>
      )}
    </AuthShell>
  );
}
