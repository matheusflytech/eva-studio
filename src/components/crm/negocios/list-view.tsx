"use client";

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { corDaEtapa } from "@/lib/custom-fields";
import { Avatar } from "./deal-card";
import { dinheiro, diasParado, estaParado, type EtapaKanban, type NegocioKanban } from "./modelo";

type Coluna = "nome" | "valor" | "chance" | "parado" | "fechamento";

interface Linha {
  deal: NegocioKanban;
  etapa: EtapaKanban;
}

function chave(l: Linha, c: Coluna, agora: Date): number | string {
  switch (c) {
    case "nome":
      return l.deal.name.toLowerCase();
    case "valor":
      return l.deal.amountCents;
    case "chance":
      return l.deal.probability;
    case "parado":
      return l.etapa.type === "open" ? diasParado(l.deal, agora) : -1;
    case "fechamento":
      return l.deal.expectedClosingAt ? new Date(l.deal.expectedClosingAt).getTime() : Number.MAX_SAFE_INTEGER;
  }
}

function Cabecalho({
  coluna,
  ordem,
  onOrdenar,
  alinhar,
  children,
}: {
  coluna: Coluna;
  ordem: { coluna: Coluna; desc: boolean };
  onOrdenar: (c: Coluna) => void;
  alinhar?: "right";
  children: React.ReactNode;
}) {
  const ativa = ordem.coluna === coluna;
  return (
    <th
      scope="col"
      aria-sort={ativa ? (ordem.desc ? "descending" : "ascending") : "none"}
      className={cn("px-3 py-2.5 font-medium", alinhar === "right" && "text-right")}
    >
      <button
        type="button"
        onClick={() => onOrdenar(coluna)}
        className={cn(
          "inline-flex items-center gap-1 rounded outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60",
          ativa && "text-text-primary"
        )}
      >
        {children}
        {ativa && (ordem.desc ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />)}
      </button>
    </th>
  );
}

/** Visão em lista: para quem prefere ordenar e comparar em vez de arrastar. */
export function ListView({ etapas, agora, onAbrir }: { etapas: EtapaKanban[]; agora: Date; onAbrir: (d: NegocioKanban) => void }) {
  const [ordem, setOrdem] = React.useState<{ coluna: Coluna; desc: boolean }>({ coluna: "valor", desc: true });
  const linhas = React.useMemo(() => {
    const todas: Linha[] = etapas.flatMap((etapa) => etapa.deals.map((deal) => ({ deal, etapa })));
    return todas.sort((a, b) => {
      const x = chave(a, ordem.coluna, agora);
      const y = chave(b, ordem.coluna, agora);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return ordem.desc ? -r : r;
    });
  }, [etapas, ordem, agora]);

  const ordenar = (coluna: Coluna) => setOrdem((o) => ({ coluna, desc: o.coluna === coluna ? !o.desc : true }));
  const cab = (coluna: Coluna, texto: string, alinhar?: "right") => (
    <Cabecalho coluna={coluna} ordem={ordem} onOrdenar={ordenar} alinhar={alinhar}>
      {texto}
    </Cabecalho>
  );

  if (linhas.length === 0) {
    return <p className="rounded-2xl bg-surface-1/70 px-4 py-10 text-center text-[13px] text-text-tertiary ring-1 ring-border-subtle">Nenhum negócio com esses filtros.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-surface-1/70 ring-1 ring-border-subtle">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border-subtle text-left text-[11.5px] uppercase tracking-wide text-text-tertiary">
            {cab("nome", "Negócio")}
            <th scope="col" className="px-3 py-2.5 font-medium">Etapa</th>
            {cab("valor", "Valor", "right")}
            {cab("chance", "Chance", "right")}
            <th scope="col" className="px-3 py-2.5 font-medium">Responsável</th>
            {cab("parado", "Na etapa", "right")}
            {cab("fechamento", "Previsão")}
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ deal, etapa }) => {
            const cor = corDaEtapa(etapa.color, etapa.type);
            const parado = estaParado(deal, etapa.type, agora);
            const atrasado = etapa.type === "open" && deal.expectedClosingAt && new Date(deal.expectedClosingAt) < agora;
            return (
              <tr
                key={deal.id}
                tabIndex={0}
                onClick={() => onAbrir(deal)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onAbrir(deal);
                  }
                }}
                className="cursor-pointer border-b border-border-subtle outline-none transition-colors last:border-0 hover:bg-surface-2/70 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/60"
              >
                <td className="max-w-[280px] px-3 py-3">
                  <p className="truncate font-medium text-text-primary">{deal.name}</p>
                  {deal.company && <p className="truncate text-[11.5px] text-text-tertiary">{deal.company.name}</p>}
                </td>
                <td className="px-3 py-3">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium", cor.fundo, cor.texto)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", cor.ponto)} aria-hidden />
                    {etapa.name}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-text-primary">
                  {deal.amountCents > 0 ? dinheiro(deal.amountCents) : "—"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-text-secondary">{deal.probability}%</td>
                <td className="px-3 py-3">
                  {deal.owner ? (
                    <span className="inline-flex items-center gap-2 text-text-secondary">
                      <Avatar nome={deal.owner.name || "Sem nome"} />
                      <span className="truncate">{deal.owner.name}</span>
                    </span>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
                <td className={cn("px-3 py-3 text-right tabular-nums", parado ? "font-medium text-amber-300" : "text-text-tertiary")}>
                  {etapa.type === "open" ? `${diasParado(deal, agora)}d` : "—"}
                </td>
                <td className={cn("px-3 py-3 tabular-nums", atrasado ? "font-medium text-danger" : "text-text-secondary")}>
                  {deal.expectedClosingAt ? new Date(deal.expectedClosingAt).toLocaleDateString("pt-BR") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
