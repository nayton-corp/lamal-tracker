import { letterPdf } from "@/application/letters";
import { app } from "@/server/app";

export function GET(_: Request, { params }: RouteContext<"/api/letters/[id]/pdf">) {
  return params.then(({ id }) => {
    try {
      const { bytes, fileName } = letterPdf(app(), Number(id));
      return new Response(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${fileName}"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      return new Response("Lettre introuvable", { status: 404 });
    }
  });
}
