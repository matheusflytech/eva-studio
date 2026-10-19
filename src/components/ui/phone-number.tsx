import * as React from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarTelefone } from "@/lib/telefone";

/*
 * Telefone com a bandeira do país (pelo DDI) e formatado: "+55 21 98171-0669".
 * A bandeira é um SVG local (public/bandeiras); DDI sem bandeira mostra um
 * globo neutro. Sem telefone, mostra o traço da tabela.
 */
export function PhoneNumber({ value, className }: { value: string | null | undefined; className?: string }) {
  const t = formatarTelefone(value);
  if (!t) return <span className={cn("text-text-tertiary", className)}>—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      {t.pais ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/bandeiras/${t.pais.iso}.svg`}
          alt={t.pais.nome}
          title={t.pais.nome}
          width={16}
          height={12}
          className="h-3 w-4 shrink-0 rounded-xs ring-1 ring-border-subtle"
        />
      ) : (
        <Globe size={14} aria-hidden="true" className="shrink-0 text-text-tertiary" />
      )}
      {t.texto}
    </span>
  );
}
