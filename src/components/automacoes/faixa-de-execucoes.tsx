"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { quando } from "./comum";

// ---------------------------------------------------------------------------
// Faixa embaixo do editor (v5): os últimos dez dias, um ponto por dia. Azul
// quando rodou, vermelho quando alguma falhou, apagado quando não rodou.
// Lê as execuções que a API já lista (as 100 mais recentes, sem os testes):
// é onde moram agora "execuções", "erros" e "última" que saíram da lista.
// ---------------------------------------------------------------------------

interface Execucao {
  id: string;
  status: string;
  erro: string | null;
  teste: boolean;
  createdAt: string;
}

const DIAS = 10;
const FUSO = "America/Sao_Paulo";
const diaDe = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: FUSO });

export function FaixaDeExecucoes({ automacaoId, versao }: { automacaoId: string; versao: unknown }) {
  const [execucoes, setExecucoes] = React.useState<Execucao[] | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void fetch(`/api/automacoes/${automacaoId}/execucoes`)
      .then((r) => (r.ok ? r.json() : { execucoes: [] }))
      .catch(() => ({ execucoes: [] }))
      .then((d) => vivo && setExecucoes(((d.execucoes ?? []) as Execucao[]).filter((e) => !e.teste)));
    return () => {
      vivo = false;
    };
  }, [automacaoId, versao]);

  // O relógio é lido junto com os dados (só muda quando as execuções chegam).
  const { dias, primeiro, ultimoDia } = React.useMemo(() => {
    const hoje = new Date();
    const lista = Array.from({ length: DIAS }, (_, i) => {
      const d = new Date(hoje.getTime() - (DIAS - 1 - i) * 86_400_000);
      const chave = diaDe(d);
      const doDia = (execucoes ?? []).filter((e) => diaDe(new Date(e.createdAt)) === chave);
      const falhas = doDia.filter((e) => e.status === "falhou");
      return {
        chave,
        rotulo: i === DIAS - 1 ? "hoje" : d.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit" }),
        total: doDia.length,
        falhas: falhas.length,
        erro: falhas[0]?.erro ?? null,
      };
    });
    return {
      dias: lista,
      primeiro: new Date(hoje.getTime() - (DIAS - 1) * 86_400_000).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "numeric" }),
      ultimoDia: hoje.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "numeric", month: "short" }),
    };
  }, [execucoes]);

  const total = dias.reduce((s, d) => s + d.total, 0);
  const falhas = dias.reduce((s, d) => s + d.falhas, 0);
  const ultima = execucoes?.[0]?.createdAt ?? null;

  return (
    <section aria-label="Execuções dos últimos dez dias" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] border border-border-subtle bg-panel px-4 py-2.5">
      <div className="flex min-w-[120px] flex-col">
        <span className="text-small font-medium text-text-primary">Execuções</span>
        <span className="font-mono text-caption text-text-tertiary">
          {primeiro} a {ultimoDia}
        </span>
      </div>
      <ol className="grid min-w-[240px] flex-1 grid-cols-10 items-center" aria-busy={!execucoes}>
        {dias.map((d) => (
          <li
            key={d.chave}
            className={cn("flex flex-col items-center gap-1.5 font-mono text-caption", d.rotulo === "hoje" ? "text-text-primary" : "text-text-tertiary")}
            title={d.total ? `${d.total} ${d.total === 1 ? "execução" : "execuções"}${d.falhas ? ` · ${d.falhas} com falha${d.erro ? `: ${d.erro}` : ""}` : ""}` : "Nenhuma execução"}
          >
            <span
              aria-hidden="true"
              className={cn("h-2 w-2 rounded-[3px]", !execucoes ? "animate-pulse bg-raised motion-reduce:animate-none" : d.falhas ? "bg-danger-solid" : d.total ? "bg-accent-solid" : "bg-border-strong")}
            />
            {d.rotulo}
          </li>
        ))}
      </ol>
      <p className="font-mono text-caption tabular-nums text-text-tertiary">
        <span className="text-text-primary">{total}</span> {total === 1 ? "execução" : "execuções"} ·{" "}
        <span className={falhas ? "text-danger" : "text-text-primary"}>{falhas}</span> {falhas === 1 ? "erro" : "erros"} · última {quando(ultima)}
      </p>
    </section>
  );
}
