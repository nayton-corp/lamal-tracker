"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";

/** Panneau du bas (glisser vers le bas ou bouton Fermer pour quitter). */
export function Sheet({ trigger, title, description, children, open, onOpenChange }: {
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      {trigger && <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-xl flex-col rounded-t-3xl bg-surface outline-none">
          <div aria-hidden className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border" />
          <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-2">
            <div>
              <Drawer.Title className="text-lg font-semibold">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="text-sm text-muted">{description}</Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">{title}</Drawer.Description>
              )}
            </div>
            <Drawer.Close className="min-h-11 rounded-lg px-3 text-sm font-medium text-primary">Fermer</Drawer.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
