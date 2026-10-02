import { importJob } from "@/server/jobs";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(importJob());
}
