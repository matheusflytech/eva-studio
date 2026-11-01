"use client";

import * as React from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Contador } from "@/components/layout/cabecalho-de-tela";
import { formatMoney } from "@/lib/design-system/format";

export interface NegocioDoContato {
  id: string;
  name: string;
  amountCents: number;
  probability: number;
  stage: string;
  stageType: string;
  pipeline: string;
}

const COR_DO_TIPO: Record<string, string> = { open: "bg-accent-solid", won: "bg-success", lost: "bg-danger-solid" };

/**
 * Os negócios do contato por etapa, em faixas de vidro, com o total em cima.
 * "Total" soma o valor cheio; "Ponderado" multiplica cada negócio pela
 * probabilidade dele (só os abertos entram: ganho e perdido já se decidiram).
 */
export function FunilDoContato({ negocios }: { negocios: NegocioDoContato[] }) {
  const [modo, setModo] = React.useState<"ponderado" | "total">("total");
  const abertos = negocios.filter((n) => n.stageType === "open");
  if (abertos.length === 0) return null;
  const valor = (n: NegocioDoContato) => (modo === "total" ? n.amountCents : Math.round((n.amountCents * n.probability) / 100));
  const etapas = [...new Set(abertos.map((n) => `${n.pipeline} · ${n.stage}`))].map((chave) => {
    const doGrupo = abertos.filter((n) => `${n.pipeline} · ${n.stage}` === chave);
    return { chave, tipo: doGrupo[0].stageType, qtd: doGrupo.length, soma: doGrupo.reduce((s, n) => s + valor(n), 0) };
  });
  const total = etapas.reduce((s, e) => s + e.soma, 0);
  return (
    <section aria-label="Funil do contato" className="vidro relative flex flex-col gap-3 rounded-[20px] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-title font-semibold leading-none tracking-tight text-text-primary">
            <Contador valor={total} formatar={(n) => formatMoney(n / 100)} />
          </p>
          <p className="mt-1 text-caption text-text-tertiary">{modo === "total" ? "em aberto, valor cheio" : "em aberto, ponderado pela probabilidade"}</p>
        </div>
        <SegmentedControl
          label="Valor do funil"
          value={modo}
          onChange={setModo}
          options={[
            { value: "ponderado", label: "Ponderado" },
            { value: "total", label: "Total" },
          ]}
        />
      </div>
      <ul className="flex flex-col gap-2">
        {etapas.map((e) => (
          <li key={e.chave} className="flex items-center gap-3 rounded-full border border-border-subtle bg-raised/60 px-4 py-2.5">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${COR_DO_TIPO[e.tipo] ?? "bg-text-tertiary"}`} />
            <span className="min-w-0 flex-1 truncate text-small text-text-secondary">
              {e.chave} <span className="text-text-tertiary">· {e.qtd}</span>
            </span>
            <span className="font-mono text-small font-semibold tabular-nums text-text-primary">{formatMoney(e.soma / 100)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
