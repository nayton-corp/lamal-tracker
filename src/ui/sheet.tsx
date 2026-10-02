"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { useDesktop } from "./media";

interface SheetProps {
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Panneau de saisie : glissé depuis le bas sur téléphone, fenêtre centrée sur ordinateur.
 * Dans les deux cas : Échap, clic à l'extérieur ou bouton Fermer pour quitter.
 */
export function Sheet(props: SheetProps) {
  return useDesktop() ? <CenteredDialog {...props} /> : <BottomDrawer {...props} />;
}

function BottomDrawer({ trigger, title, description, children, open, onOpenChange }: SheetProps) {
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
            <Drawer.Close className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-medium text-primary">Fermer</Drawer.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function CenteredDialog({ trigger, title, description, children, open, onOpenChange }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 animate-fade" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-surface shadow-2xl outline-none animate-pop">
          <div className="flex items-start justify-between gap-3 border-b border-border px-6 pt-5 pb-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close aria-label="Fermer" className="-mr-2 flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
