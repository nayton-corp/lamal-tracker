"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "./button";
import { Sheet } from "./sheet";

/**
 * Bouton d'action irréversible : ouvre une fenêtre qui explique ce qui va se passer,
 * puis envoie le formulaire parent seulement si l'on confirme.
 */
export function ConfirmButton({ message, details, confirmLabel = "Confirmer", confirmVariant = "danger", children, ...props }: ButtonProps & {
  /** Question posée (« Supprimer ce contrat ? »). */
  message: string;
  /** Conséquences, en langage simple. */
  details?: ReactNode;
  confirmLabel?: string;
  /** « danger » pour une perte de données, « primary » pour un retour en arrière sans perte. */
  confirmVariant?: "danger" | "primary";
  children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button ref={trigger} type="button" {...props} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={message}>
        <div className="space-y-5">
          {details && <div className="space-y-2 text-muted">{details}</div>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              variant={confirmVariant}
              onClick={() => {
                setOpen(false);
                trigger.current?.form?.requestSubmit();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
