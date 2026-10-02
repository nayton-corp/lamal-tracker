/**
 * Lecture du texte d'une photo (police, carte d'assuré) directement dans le navigateur, avec
 * Tesseract (français et allemand). Les fichiers du moteur sont servis par l'app (public/ocr) :
 * la photo ne quitte jamais l'appareil, seul le texte lu est envoyé au Raspberry Pi.
 */

export type OcrProgress = { label: string; percent: number };

const MAX_SIDE = 2400;

/** Redresse (EXIF), réduit et passe en niveaux de gris pour une lecture plus rapide et plus sûre. */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.filter = "grayscale(1) contrast(1.25)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function readImageText(file: File, onProgress: (p: OcrProgress) => void): Promise<string> {
  onProgress({ label: "Préparation de la photo", percent: 0 });
  const image = await prepare(file);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["fra", "deu"], 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress({ label: "Lecture du texte", percent: Math.round(m.progress * 100) });
      else if (/loading|initializ/.test(m.status)) onProgress({ label: "Chargement du lecteur (une seule fois)", percent: Math.round(m.progress * 100) });
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
