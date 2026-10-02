import { extractText, getDocumentProxy } from "unpdf";

/** Texte d'un PDF (toutes pages), lignes conservées ; vide pour un document scanné. */
export async function readPdfText(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).join("\n");
}
