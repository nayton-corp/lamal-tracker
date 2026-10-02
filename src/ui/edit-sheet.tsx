"use client";

import { Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Sheet } from "./sheet";

/**
 * Données déjà saisies : on affiche un résumé, et le formulaire ne s'ouvre que sur demande
 * (bouton crayon), dans un panneau du bas qui se ferme après l'enregistrement.
 */
export function EditSheet({ title, description, label, children }: {
  title: string;
  description?: string;
  /** Nom accessible du bouton (« Modifier le foyer »). */
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      trigger={
        <Button size="icon" variant="ghost" aria-label={label} className="shrink-0">
          <Pencil aria-hidden className="size-5" />
        </Button>
      }
    >
      {children(() => setOpen(false))}
    </Sheet>
  );
}
