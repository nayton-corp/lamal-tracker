"use client";

import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./button";

/** Bouton de formulaire destructif : demande confirmation avant d'envoyer. */
export function ConfirmButton({ message, children, ...props }: ButtonProps & { message: string; children: ReactNode }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
