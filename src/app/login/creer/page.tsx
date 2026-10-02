import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { passwordDefined } from "@/server/auth";
import { Card } from "@/ui/card";
import { Page } from "@/ui/page";
import { CreatePasswordForm } from "../login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mot de passe" };

/** Premier démarrage : l'app n'est utilisable qu'après le choix d'un mot de passe. */
export default function CreatePasswordPage() {
  if (passwordDefined()) redirect("/login");
  return (
    <Page className="flex min-h-[80dvh] flex-col justify-center">
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <LockKeyhole aria-hidden className="size-8 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Bienvenue</h1>
            <p className="text-sm text-muted">Choisissez le mot de passe de l&apos;app.</p>
          </div>
        </div>
        <CreatePasswordForm />
      </Card>
    </Page>
  );
}
