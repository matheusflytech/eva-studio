import * as React from "react";
import { AlertTriangle, CircleAlert, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

/*
 * Aviso em linha acima da tabela/quadro ("2 condições do filtro foram
 * ignoradas", "não foi possível mover"). Fundo sutil de status, sem borda
 * colorida; ícone e texto na cor do status. Opcionalmente dispensável.
 */
const tons = {
  info: { classe: "bg-info-subtle text-info", Icone: Info },
  warning: { classe: "bg-warning-subtle text-warning", Icone: AlertTriangle },
  danger: { classe: "bg-danger-subtle text-danger", Icone: CircleAlert },
} as const;

export function Notice({
  tone = "info",
  children,
  onDismiss,
  className,
}: {
  tone?: keyof typeof tons;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const { classe, Icone } = tons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-small", classe, className)}>
      <Icone size={16} aria-hidden="true" className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" aria-label="Fechar aviso" onClick={onDismiss} className={cn("-mr-1 rounded-sm p-0.5 opacity-80 hover:opacity-100", focusRing)}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
