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
        "flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-dashed text-[13px] font-semibold transition-[background-color,border-color,transform] duration-150",
        tom === "ok" ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-400" : "border-rose-400/45 bg-danger/10 text-danger",
        isOver && (tom === "ok" ? "scale-[1.02] border-emerald-400 bg-emerald-400/20" : "scale-[1.02] border-rose-400 bg-danger/20")
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
      className="pointer-events-auto sticky bottom-3 z-20 mx-auto flex w-full max-w-[560px] gap-2.5 rounded-2xl border border-border-default bg-surface-1/95 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur"
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
