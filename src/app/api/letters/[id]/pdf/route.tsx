import { letterDocument } from "@/application/letters";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";
import { signaturesByName } from "@/application/signatures";
import { db } from "@/server/context";
import { currentScope } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await currentScope();
  if (!scope) return new Response("Non autorisé", { status: 401 });
  const letter = letterDocument(db(), scope, Number((await params).id));
  if (!letter) return new Response("Lettre introuvable", { status: 404 });
  const search = new URL(request.url).searchParams;
  // ?layout=pingen : la mise en page transmise à Pingen (aperçu, contrôle).
  const pdf = await renderLetterPdf(letter.content, signaturesByName(db(), scope), search.get("layout") === "pingen" ? "pingen" : "print");
  const slug = letter.insurerName.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const name = `${letter.kind === "TERMINATION" ? "resiliation-lamal" : "changement-lamal"}-${slug}-${letter.targetYear}.pdf`;
  const download = search.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
