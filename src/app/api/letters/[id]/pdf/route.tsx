import { eq } from "drizzle-orm";
import { getLetter } from "@/application/letters";
import { insurerLabel } from "@/infrastructure/db/queries";
import { insurer, review } from "@/infrastructure/db/schema";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";
import { signaturesByName } from "@/application/signatures";
import { db } from "@/server/context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const letter = getLetter(db(), Number((await params).id));
  if (!letter) return new Response("Lettre introuvable", { status: 404 });
  const ins = db().select().from(insurer).where(eq(insurer.id, letter.insurerId)).get()!;
  const r = db().select().from(review).where(eq(review.id, letter.reviewId)).get()!;
  const pdf = await renderLetterPdf(letter.content, signaturesByName(db()));
  const slug = insurerLabel(ins).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const name = `${letter.kind === "TERMINATION" ? "resiliation-lamal" : "changement-lamal"}-${slug}-${r.targetYear}.pdf`;
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
