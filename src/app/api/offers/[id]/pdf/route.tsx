import { offerDocument } from "@/application/offers";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";
import { signaturesByName } from "@/application/signatures";
import { db } from "@/server/context";
import { currentScope } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await currentScope();
  if (!scope) return new Response("Non autorisé", { status: 401 });
  const req = offerDocument(db(), scope, Number((await params).id));
  if (!req) return new Response("Demande introuvable", { status: 404 });
  const pdf = await renderLetterPdf(req.content, signaturesByName(db(), scope));
  const slug = req.insurerName.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="demande-offre-${slug}-${req.targetYear}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
