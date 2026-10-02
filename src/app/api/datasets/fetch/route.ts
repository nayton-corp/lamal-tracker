import { revalidatePath } from "next/cache";
import { fetchTariffsFromOpenData } from "@/application/jobs";
import { reviewTargetYear } from "@/domain/deadlines";
import { app } from "@/server/app";

export const maxDuration = 900;

/** Lance tout de suite la recherche et l'import des primes sur opendata.swiss (au lieu d'attendre la tâche du jour). */
export async function POST(request: Request) {
  const ctx = app();
  const body = (await request.json().catch(() => ({}))) as { year?: unknown };
  const year = typeof body.year === "number" && Number.isInteger(body.year) ? body.year : reviewTargetYear(ctx.clock.today());
  const outcome = await fetchTariffsFromOpenData(ctx, year);
  revalidatePath("/", "layout");
  return Response.json(outcome, { status: outcome.status === "error" ? 502 : 200 });
}
