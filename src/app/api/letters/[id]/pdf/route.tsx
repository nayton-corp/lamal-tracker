import { letterDocument } from "@/application/letters";
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
  const letter = letterDocument(db(), scope, Number((await params).id));
  if (!letter) return new Response("Lettre introuvable", { status: 404 });
  const search = new URL(request.url).searchParams;
  // ?layout=pingen : la mise en page transmise à Pingen (aperçu, contrôle).
  const pdf = await renderLetterPdf(letter.content, signaturesByName(db(), scope), search.get("layout") === "pingen" ? "pingen" : "print");
  const prefix = letter.kind === "TERMINATION" ? "resiliation-lamal" : "changement-lamal";
  return pdfResponse(pdf, `${prefix}-${slugify(letter.insurerName)}-${letter.targetYear}.pdf`, search.has("download"));
}
