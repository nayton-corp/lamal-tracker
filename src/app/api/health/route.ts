import { db } from "@/server/context";

export const dynamic = "force-dynamic";

export function GET() {
  db().$client.prepare("select 1").get();
  return Response.json({ ok: true });
}
