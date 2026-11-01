"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { cn } from "@/lib/utils";
import { Modal, ModalContent } from "@/components/ui/modal";
import { NAV_AVANCADO } from "./navegacao";

/** Janela de vidro com todas as ferramentas fora das abas, em grupos de cartões. */
export function LancadorDeFerramentas({ open, onOpenChange, pathname }: { open: boolean; onOpenChange: (v: boolean) => void; pathname: string }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title="Ferramentas" description="Tudo o que não cabe nas abas do topo." size="lg">
        <div className="flex flex-col gap-5">
          {NAV_AVANCADO.map((grupo) => (
            <section key={grupo.label} aria-label={grupo.label ?? undefined}>
              <h3 className="mb-2 text-caption font-medium uppercase tracking-wide text-text-tertiary">{grupo.label}</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {grupo.items.map((item) => {
                  const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => onOpenChange(false)}
                        aria-current={ativo ? "page" : undefined}
                        className={cn(
                          "flex h-[72px] flex-col justify-between rounded-2xl bg-hover/60 p-3 text-small text-text-primary transition-[background-color,scale] duration-150",
                          "hover:bg-hover active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                          ativo && "bg-hover ring-1 ring-border-default"
                        )}
                      >
                        <item.icon size={18} aria-hidden className="text-text-secondary" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </ModalContent>
    </Modal>
  );
}
