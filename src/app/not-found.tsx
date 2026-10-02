import Link from "next/link";
import { Button } from "@/ui/button";
import { EmptyState, Page } from "@/ui/page";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <Page>
      <EmptyState icon={<SearchX aria-hidden />} title="Page introuvable" action={<Button asChild><Link href="/">Accueil</Link></Button>} />
    </Page>
  );
}
