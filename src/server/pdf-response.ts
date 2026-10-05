import "server-only";

/** Réponse HTTP d'un PDF : affiché dans le navigateur, ou téléchargé si `download`. Jamais mis en cache. */
export function pdfResponse(pdf: Uint8Array | Buffer, fileName: string, download: boolean): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
