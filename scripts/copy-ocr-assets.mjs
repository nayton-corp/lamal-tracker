// Copie dans public/ocr les fichiers de lecture de texte (OCR) servis par l'app elle-même :
// aucune photo ni aucun téléchargement ne passe par un service externe.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dir = (pkg) => path.dirname(require.resolve(`${pkg}/package.json`));
const out = path.resolve("public/ocr");

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "core"), { recursive: true });
mkdirSync(path.join(out, "lang"), { recursive: true });

const tesseract = dir("tesseract.js");
cpSync(path.join(tesseract, "dist/worker.min.js"), path.join(out, "worker.min.js"));
const core = path.dirname(require.resolve("tesseract.js-core/package.json", { paths: [tesseract] }));
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
  cpSync(path.join(core, f), path.join(out, "core", f));
}
for (const lang of ["fra", "deu"]) {
  cpSync(path.join(dir(`@tesseract.js-data/${lang}`), "4.0.0_best_int", `${lang}.traineddata.gz`), path.join(out, "lang", `${lang}.traineddata.gz`));
}
console.log("OCR : fichiers copiés dans public/ocr");
