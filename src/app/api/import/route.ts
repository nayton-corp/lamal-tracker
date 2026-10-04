import { currentScope } from "@/server/auth";
import { importJob } from "@/server/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentScope())) return new Response("Non autorisé", { status: 401 });
  return Response.json(importJob());
}
