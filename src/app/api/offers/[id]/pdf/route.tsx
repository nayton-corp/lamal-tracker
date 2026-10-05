import { offerDocument } from "@/application/offers";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";
import { signaturesByName } from "@/application/signatures";
import { db } from "@/server/context";
import { currentScope } from "@/server/auth";
import { pdfResponse } from "@/server/pdf-response";
import { slugify } from "@/domain/text";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await currentScope();
  if (!scope) return new Response("Non autorisé", { status: 401 });
  const req = offerDocument(db(), scope, Number((await params).id));
  if (!req) return new Response("Demande introuvable", { status: 404 });
  const pdf = await renderLetterPdf(req.content, signaturesByName(db(), scope));
  const download = new URL(request.url).searchParams.has("download");
  return pdfResponse(pdf, `demande-offre-${slugify(req.insurerName)}-${req.targetYear}.pdf`, download);
}
