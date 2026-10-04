import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/ui/button";
import { EmptyState, Page } from "@/ui/page";

export const metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <Page>
      <EmptyState
        icon={<SearchX aria-hidden />}
        title="Page introuvable"
        level={1}
        action={
          <Button asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        }
      >
        Cette adresse ne mène nulle part : le lien est peut-être incomplet, ou la page a été supprimée.
      </EmptyState>
    </Page>
  );
}
