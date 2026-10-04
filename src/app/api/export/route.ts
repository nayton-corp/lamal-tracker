import { exportForUser } from "@/application/data-rights";
import { exportReport } from "@/application/export-report";
import { UserError } from "@/application/errors";
import { renderReportPdf } from "@/infrastructure/pdf/report-pdf";
import { currentScope } from "@/server/auth";
import { db, nowIso, today } from "@/server/context";

export const dynamic = "force-dynamic";

/**
 * Copie des données du compte et de son foyer (droit d'accès) : `?format=json` (complète,
 * réutilisable) ou `?format=pdf` (récapitulatif lisible). Identité confirmée dans les 10 minutes.
 */
export async function GET(request: Request) {
  const scope = await currentScope();
  if (!scope) return new Response("Non autorisé", { status: 401 });
  const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "json";
  let data;
  try {
    data = exportForUser(db(), scope, scope.sessionId, nowIso());
  } catch (e) {
    if (e instanceof UserError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const name = `primes-lamal-mes-donnees-${today()}`;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (format === "pdf") {
    const pdf = await renderReportPdf(exportReport(data));
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` } });
  }
  return new Response(JSON.stringify(data, null, 2), {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.json"` },
  });
}
