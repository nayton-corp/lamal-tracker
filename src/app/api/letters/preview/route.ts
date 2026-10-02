import type { NextRequest } from "next/server";
import { letterContent } from "@/application/letters";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";
import { app } from "@/server/app";

/** Aperçu PDF non enregistré (aucune trace en base). */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  try {
    const content = letterContent(app(), Number(q.get("review")), Number(q.get("insurer")));
    const pdf = await renderLetterPdf(content);
    return new Response(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="apercu-resiliation.pdf"', "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
