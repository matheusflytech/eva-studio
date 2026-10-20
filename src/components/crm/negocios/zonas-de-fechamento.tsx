"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export const ZONA_GANHO = "zona:ganho";
export const ZONA_PERDIDO = "zona:perdido";

function Zona({ id, tom, children }: { id: string; tom: "ok" | "bad"; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-12 flex-1 items-center justify-center gap-2 rounded-md border border-dashed text-body font-medium transition-colors duration-120",
        tom === "ok" ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger",
        isOver ? "border-current" : "border-border-default"
      )}
    >
      {children}
    </div>
  );
}

/**
 * Aparecem no rodapé só enquanto um cartão é arrastado: fechar como ganho ou
 * perdido sem precisar achar a coluna no fim do quadro.
 */
export function ZonasDeFechamento({ visivel, temGanho, temPerdido }: { visivel: boolean; temGanho: boolean; temPerdido: boolean }) {
  if (!visivel || (!temGanho && !temPerdido)) return null;
  return (
    <div
      className="pointer-events-auto sticky bottom-3 z-20 mx-auto flex w-full max-w-xl gap-2 rounded-lg border border-border-default bg-overlay p-2 shadow-overlay"
      aria-live="polite"
    >
      {temGanho && (
        <Zona id={ZONA_GANHO} tom="ok">
          <CheckCircle2 size={16} aria-hidden /> Ganho
        </Zona>
      )}
      {temPerdido && (
        <Zona id={ZONA_PERDIDO} tom="bad">
          <XCircle size={16} aria-hidden /> Perdido
        </Zona>
      )}
    </div>
  );
}
