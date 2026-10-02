import { app } from "@/server/app";

export function GET() {
  try {
    const ctx = app();
    ctx.db.$client.prepare("SELECT 1").get();
    return Response.json({ ok: true, activeYears: ctx.tariffs.activeYears(), today: ctx.clock.today() });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
