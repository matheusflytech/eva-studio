"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

/*
 * Gaveta lateral (direita): detalhe de registro, formulário longo, filtros
 * avançados. Mesma acessibilidade do Modal (foco preso, Esc fecha).
 */
export const Drawer = Dialog.Root;
export const DrawerTrigger = Dialog.Trigger;
export const DrawerClose = Dialog.Close;

const larguras = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" } as const;

export function DrawerContent({
  className,
  children,
  title,
  description,
  footer,
  size = "md",
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  size?: keyof typeof larguras;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-backdrop data-[state=open]:animate-[ds-fade-in_160ms_var(--ease-standard)]" />
      <Dialog.Content
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border-default bg-overlay text-text-primary shadow-overlay outline-none",
          "data-[state=open]:animate-[ds-slide-in-right_200ms_var(--ease-standard)]",
          larguras[size],
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-3.5">
          <div className="min-w-0">
            <Dialog.Title className="truncate text-title-sm text-text-primary">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="mt-0.5 text-small text-text-secondary">{description}</Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <IconButton aria-label="Fechar" size="sm" className="-mr-1">
              <X />
            </IconButton>
          </Dialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">{footer}</div>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
