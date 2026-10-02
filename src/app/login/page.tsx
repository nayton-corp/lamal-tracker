import { ShieldCheck } from "lucide-react";
import { Card } from "@/ui/card";
import { Page } from "@/ui/page";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <Page className="flex min-h-[80dvh] flex-col justify-center">
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck aria-hidden className="size-8 text-primary" />
          <h1 className="text-xl font-bold">Primes LAMal</h1>
        </div>
        <LoginForm next={next ?? "/"} />
      </Card>
    </Page>
  );
}
