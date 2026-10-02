import { eq } from "drizzle-orm";
import { getOfferRequest } from "@/application/offers";
import { insurerLabel } from "@/infrastructure/db/queries";
import { insurer, review } from "@/infrastructure/db/schema";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";
import { signaturesByName } from "@/application/signatures";
import { db } from "@/server/context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const req = getOfferRequest(db(), Number((await params).id));
  if (!req) return new Response("Demande introuvable", { status: 404 });
  const ins = db().select().from(insurer).where(eq(insurer.id, req.insurerId)).get()!;
  const r = db().select().from(review).where(eq(review.id, req.reviewId)).get()!;
  const pdf = await renderLetterPdf(req.content, signaturesByName(db()));
  const slug = insurerLabel(ins).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="demande-offre-${slug}-${r.targetYear}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
