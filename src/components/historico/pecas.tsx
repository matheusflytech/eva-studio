import * as React from "react";
import { Bot, Cog, Plug, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { MudancaLegivel, TipoDoAtor } from "@/lib/historico/tipos";

// Peças do histórico usadas na ficha (linha do tempo, bloco da empresa) e na
// auditoria: quem fez (iniciais da pessoa ou ícone do robô) e a lista
// "Campo: de → para".

const ICONE_DO_ATOR: Record<Exclude<TipoDoAtor, "usuario">, LucideIcon> = {
  agente: Sparkles,
  automacao: Zap,
  api: Plug,
  integracao: Bot,
  sistema: Cog,
};

export function IconeDoAtor({ tipo, nome, tamanho = "md" }: { tipo: TipoDoAtor; nome: string; tamanho?: "sm" | "md" }) {
  if (tipo === "usuario") return <Avatar name={nome} size={tamanho} />;
  const Icone = ICONE_DO_ATOR[tipo] ?? Cog;
  return (
    <span
      title={nome}
      className={cn("grid shrink-0 place-items-center rounded-full bg-raised text-text-secondary", tamanho === "md" ? "size-8" : "size-6")}
    >
      <Icone size={tamanho === "md" ? 15 : 12} aria-hidden />
      <span className="sr-only">{nome}</span>
    </span>
  );
}

/** "Valor  R$ 5.000,00 → R$ 8.000,00". Lista (etiquetas, permissões): só o que entrou e saiu. */
export function ListaDeMudancas({ mudancas, className }: { mudancas: MudancaLegivel[]; className?: string }) {
  if (mudancas.length === 0) return null;
  return (
    <dl className={cn("grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption", className)}>
      {mudancas.map((m) => (
        <React.Fragment key={m.campo}>
          <dt className="truncate text-text-tertiary">{m.rotulo}</dt>
          <dd className="min-w-0 break-words text-text-secondary">
            {m.de === "" ? (
              <span className="text-text-primary">{m.para}</span>
            ) : (
              <>
                <span className={cn(m.de === "vazio" && "italic text-text-tertiary", m.de !== "vazio" && "line-through decoration-text-tertiary/60")}>{m.de}</span>
                <span aria-label="para" className="mx-1.5 text-text-tertiary">
                  →
                </span>
                <span className={cn("text-text-primary", m.para === "vazio" && "italic text-text-tertiary")}>{m.para}</span>
              </>
            )}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
