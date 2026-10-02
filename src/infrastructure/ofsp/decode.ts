import { unzipSync } from "fflate";

/** Décode un fichier texte en détectant le BOM ; repli sur Windows-1252 si l'UTF-8 est invalide. */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8-bom" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

export interface ExtractedFile {
  name: string;
  bytes: Uint8Array;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export function isZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

/** Liste les fichiers CSV/TXT d'une archive ZIP (les sous-dossiers __MACOSX sont ignorés). */
export function extractCsvFiles(bytes: Uint8Array): ExtractedFile[] {
  const entries = unzipSync(bytes, {
    filter: (file) => /\.(csv|txt)$/i.test(file.name) && !file.name.startsWith("__MACOSX"),
  });
  return Object.entries(entries).map(([name, data]) => ({ name, bytes: data }));
}
