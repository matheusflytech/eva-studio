"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Imagem em tela cheia por cima do app: abre na hora, fecha com Esc, clique
 * fora ou no X. Clique na imagem amplia (tamanho real, arrasta a rolagem).
 * Nada de abrir aba nova com o link do storage.
 */
export function VisualizadorDeImagem({
  src, alt, children,
}: {
  src: string;
  alt: string;
  /** O que abre o visualizador (a miniatura). */
  children: React.ReactNode;
}) {
  const [ampliada, setAmpliada] = React.useState(false);
  return (
    <Dialog.Root onOpenChange={(o) => !o && setAmpliada(false)}>
      <Dialog.Trigger asChild>
        <button type="button" className="block cursor-zoom-in rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring" aria-label={`Ver ${alt}`}>
          {children}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85 data-[state=open]:animate-[ds-fade-in_var(--dur-fast)_var(--ease-out)] data-[state=closed]:animate-[ds-fade-out_var(--dur-fast)_var(--ease-in)]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex outline-none data-[state=open]:animate-[ds-modal-in_var(--dur-base)_var(--ease-out)] data-[state=closed]:animate-[ds-fade-out_var(--dur-fast)_var(--ease-in)]"
        >
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          {/* Clique no fundo fecha; na imagem, amplia. */}
          <Dialog.Close asChild>
            <div className={cn("flex size-full overflow-auto overscroll-contain", ampliada ? "items-start justify-start" : "items-center justify-center p-4 sm:p-10")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                onClick={(e) => {
                  e.stopPropagation();
                  setAmpliada((v) => !v);
                }}
                className={cn(
                  "select-none rounded-lg shadow-2xl",
                  ampliada ? "m-auto max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"
                )}
              />
            </div>
          </Dialog.Close>
          <Dialog.Close
            className="fixed right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label="Fechar imagem"
          >
            <X size={18} aria-hidden />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
