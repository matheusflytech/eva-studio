"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;

export function ModalContent({
  className,
  children,
  title,
  description,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity" />
      <Dialog.Content
        className={cn(
          "glass-card fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface-1/90 p-7 shadow-2xl outline-none backdrop-blur-2xl",
          className
        )}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            {title && (
              <Dialog.Title className="font-display text-lg font-semibold text-text-primary">
                {title}
              </Dialog.Title>
            )}
            {description && (
              <Dialog.Description className="mt-1 text-sm text-text-secondary">
                {description}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary">
            <X size={18} />
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
