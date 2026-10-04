import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { hasAnyUser } from "@/application/auth";
import { accountExists } from "@/server/auth";
import { db } from "@/server/context";
import { AuthShell } from "@/ui/auth-shell";
import { CreatePasswordForm } from "../login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mot de passe" };

/**
 * Premier démarrage : création du compte administrateur. Après la procédure « mot de passe
 * oublié » du README, seul un nouveau mot de passe est demandé.
 */
export default function CreatePasswordPage() {
  if (accountExists()) redirect("/login");
  const fresh = !hasAnyUser(db());
  return (
    <AuthShell icon={LockKeyhole} title="Bienvenue" subtitle={fresh ? "Créez le compte administrateur de l'app." : "Choisissez un nouveau mot de passe."}>
      <CreatePasswordForm askEmail={fresh} />
    </AuthShell>
  );
}
