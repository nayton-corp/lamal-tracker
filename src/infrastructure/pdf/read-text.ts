import { extractText, getDocumentProxy } from "unpdf";

/** Une police d'assurance tient en quelques pages ; au-delà, ce n'en est pas une (et l'analyse coûte cher). */
export const MAX_PDF_PAGES = 30;

/** Texte d'un PDF (toutes pages), lignes conservées ; vide pour un document scanné. */
export async function readPdfText(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buf);
  if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDF de ${pdf.numPages} pages`);
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).join("\n");
}
