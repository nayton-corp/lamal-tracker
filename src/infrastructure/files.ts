import fs from "node:fs";
import path from "node:path";
import type { FileStore } from "@/application/context";

/** Stockage de fichiers sous un répertoire racine ; refuse tout chemin qui en sortirait. */
export function diskFileStore(root: string): FileStore {
  const resolve = (relativePath: string) => {
    const full = path.resolve(/*turbopackIgnore: true*/ root, relativePath);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(`Chemin refusé : ${relativePath}`);
    return full;
  };
  return {
    write(relativePath, bytes) {
      const full = resolve(relativePath);
      fs.mkdirSync(path.dirname(/*turbopackIgnore: true*/ full), { recursive: true });
      fs.writeFileSync(full, bytes);
      return relativePath;
    },
    read(relativePath) {
      return new Uint8Array(fs.readFileSync(resolve(relativePath)));
    },
    exists(relativePath) {
      return fs.existsSync(resolve(relativePath));
    },
    remove(relativePath) {
      fs.rmSync(resolve(relativePath), { force: true });
    },
  };
}

export function memoryFileStore(): FileStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    write(p, bytes) {
      files.set(p, bytes);
      return p;
    },
    read(p) {
      const f = files.get(p);
      if (!f) throw new Error(`Fichier introuvable : ${p}`);
      return f;
    },
    exists: (p) => files.has(p),
    remove: (p) => void files.delete(p),
  };
}
