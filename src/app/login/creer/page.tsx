import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { hasAnyUser } from "@/application/auth";
import { setupToken, setupTokenMissing } from "@/server/accounts";
import { accountExists } from "@/server/auth";
import { db } from "@/server/context";
import { Alert } from "@/ui/alert";
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
      {setupTokenMissing() ? (
        <Alert tone="danger" title="Code d'installation à définir">
          Cette instance est publiée sur Internet : définissez SETUP_TOKEN dans la configuration du serveur, redémarrez l&apos;app, puis revenez sur cette page.
        </Alert>
      ) : (
        <CreatePasswordForm askEmail={fresh} askSetupCode={setupToken() !== null} />
      )}
    </AuthShell>
  );
}
