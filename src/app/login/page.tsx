import { ShieldCheck } from "lucide-react";
import { redirectIfSignedIn, safeNext } from "@/server/auth";
import { Card } from "@/ui/card";
import { Page } from "@/ui/page";
import { ClearCaches } from "@/ui/service-worker";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  await redirectIfSignedIn(next);
  return (
    <Page className="flex min-h-[80dvh] flex-col justify-center">
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck aria-hidden className="size-8 text-primary" />
          <h1 className="text-xl font-bold">Primes LAMal</h1>
        </div>
        <LoginForm next={next} />
        <ClearCaches />
      </Card>
    </Page>
  );
}
