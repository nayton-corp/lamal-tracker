import { MailCheck } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/ui/auth-shell";

export const metadata = { title: "Vérifiez vos courriels" };

export default function SignUpSentPage() {
  return (
    <AuthShell icon={MailCheck} title="Vérifiez vos courriels" footer={<Link href="/login" className="text-primary underline">Revenir à la connexion</Link>}>
      <p>Un lien de confirmation vient de partir vers votre adresse. Ouvrez-le dans les 24 heures pour activer votre compte.</p>
      <p className="text-sm text-muted">Rien reçu ? Regardez dans les courriels indésirables. En vous connectant, un nouveau lien vous est renvoyé.</p>
    </AuthShell>
  );
}
