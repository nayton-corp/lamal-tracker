import { ImportError, importTariffFile } from "@/application/import-tariffs";
import { app } from "@/server/app";

/** Import d'un fichier de primes envoyé depuis l'interface (multipart). */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, message: "Envoi invalide." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ ok: false, message: "Choisis un fichier." }, { status: 400 });
  const yearHint = Number(form.get("year")) || null;
  try {
    const result = importTariffFile(app(), {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      sourceLabel: "Fichier importé",
      sourceUrl: null,
      yearHint,
    });
    return Response.json({ ok: true, datasetId: result.datasetId, duplicate: result.duplicateOf !== null, year: result.report.year });
  } catch (e) {
    if (e instanceof ImportError) return Response.json({ ok: false, message: e.message }, { status: 422 });
    console.error(e);
    return Response.json({ ok: false, message: "Erreur inattendue pendant l'import." }, { status: 500 });
  }
}
