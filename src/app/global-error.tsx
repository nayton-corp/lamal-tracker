"use client";

import "./globals.css";

/** Erreur dans la mise en page elle-même : page autonome, sans navigation. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr-CH">
      <body className="antialiased">
        <main id="contenu" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-2xl font-bold">Le service ne répond pas correctement</h1>
          <p className="text-muted">Rien de ce que vous aviez enregistré n&apos;est perdu. Réessayez dans un instant.</p>
          {error.digest && <p className="text-xs text-muted">Référence : {error.digest}</p>}
          <button type="button" onClick={reset} className="min-h-12 rounded-xl bg-primary px-5 font-medium text-on-primary">
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
