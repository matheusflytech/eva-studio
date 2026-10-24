"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { useDevolverFoco } from "./devolver-foco";

/*
 * Modal: decisão curta que bloqueia a tela (confirmar, criar com poucos
 * campos). Formulário longo ou detalhe de registro vai em Drawer.
 * Foco preso e Esc para fechar vêm do Radix.
 */
export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

const larguras = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" } as const;

export function ModalContent({
  className,
  children,
  title,
  description,
  footer,
  size = "md",
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  description?: string;
  /** Ações (Cancelar à esquerda do primário), alinhadas à direita. */
  footer?: React.ReactNode;
  size?: keyof typeof larguras;
}) {
  const foco = useDevolverFoco();
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-backdrop backdrop-blur-sm data-[state=open]:animate-[ds-fade-in_var(--dur-fast)_var(--ease-out)] data-[state=closed]:animate-[ds-fade-out_var(--dur-fast)_var(--ease-in)]" />
      <Dialog.Content
        onOpenAutoFocus={foco.onOpenAutoFocus}
        onCloseAutoFocus={foco.onCloseAutoFocus}
        // Sem description o Radix avisa no console; o undefined explícito diz
        // que a ausência é intencional.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-[22px] border border-border-subtle bg-overlay text-text-primary shadow-overlay outline-none",
          "data-[state=open]:animate-[ds-modal-in_var(--dur-slow)_var(--ease-out)] data-[state=closed]:animate-[ds-modal-out_var(--dur-fast)_var(--ease-in)]",
          larguras[size],
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0">
            {title ? (
              <Dialog.Title className="text-title-sm text-text-primary">{title}</Dialog.Title>
            ) : (
              <Dialog.Title className="sr-only">Janela</Dialog.Title>
            )}
            {description && (
              <Dialog.Description className="mt-0.5 text-body text-text-secondary">{description}</Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <IconButton aria-label="Fechar" size="sm" className="-mr-1">
              <X />
            </IconButton>
          </Dialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">{footer}</div>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
