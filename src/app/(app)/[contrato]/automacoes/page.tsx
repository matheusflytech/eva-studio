"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useRouter } from "@/lib/contrato/navegacao";
import { Plus, Workflow } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { NOMES_DOS_OBJETOS } from "@/lib/automacoes/catalogo";
import { fraseDaAutomacao } from "@/lib/automacoes/frase";
import type { Definicao, Objeto } from "@/lib/automacoes/tipos";
import { Galeria } from "@/components/automacoes/galeria";
import { duracao, ICONE_DO_OBJETO, nomesDasOpcoes, quando, STATUS_DA_AUTOMACAO, useOpcoes } from "@/components/automacoes/comum";

// ---------------------------------------------------------------------------
// Automações: os números do dia no topo (no estilo da demo "Eva Automação")
// e a lista com a frase de cada uma. "Nova" abre a galeria de modelos.
// ---------------------------------------------------------------------------

interface ItemDaLista {
  id: string;
  nome: string;
  objeto: Objeto;
  status: string;
  origem: string;
  pausadaPor: string | null;
  rascunho: Definicao;
  versao: number | null;
  execucoes30d: number;
  erros30d: number;
  emAndamento: number;
  ultimaExecucao: string | null;
}

interface Dados {
  disponivel: boolean;
  aviso?: string;
  kpis: { execucoesHoje: number; errosHoje: number; tempoMedioMs: number | null; ativas: number } | null;
  automacoes: ItemDaLista[];
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: "erro" }) {
  return (
    <div className="min-w-[120px]">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-tertiary">{rotulo}</p>
      <p className={`mt-1 font-display text-[26px] font-semibold leading-none ${destaque === "erro" ? "text-danger" : "text-text-primary"}`}>{valor}</p>
    </div>
  );
}

export default function AutomacoesPage() {
  const router = useRouter();
  const opcoes = useOpcoes();
  const nomes = React.useMemo(() => nomesDasOpcoes(opcoes), [opcoes]);
  const [dados, setDados] = React.useState<Dados | null>(null);
  const [galeria, setGaleria] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/automacoes")
      .then((r) => r.json())
      .catch(() => ({ disponivel: false, kpis: null, automacoes: [] }))
      .then((d) => {
        if (vivo) setDados(d);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function criar(p: { modeloId?: string; objeto?: Objeto }) {
    const r = await fetch("/api/automacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "Não deu para criar.");
    router.push(`/automacoes/${d.id}`);
  }

  const k = dados?.kpis;
  return (
    <div className="flex-1 p-8">
      <PageHeader
        eyebrow="Automação"
        title="Automações"
        description="Quando algo acontece no CRM, a Eva faz o resto: move o negócio, cria a tarefa, avisa a equipe e fala com o cliente."
        actions={
          <Button type="button" onClick={() => setGaleria(true)} disabled={!dados?.disponivel}>
            <Plus size={14} /> Nova automação
          </Button>
        }
      />

      {dados && !dados.disponivel && <Notice tone="warning" className="mt-6">{dados.aviso ?? "As automações ainda não foram ativadas neste ambiente."}</Notice>}

      <section className="glass-card mt-6 rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[13px] font-medium text-text-primary">Eva Automação</p>
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> ao vivo
          </span>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Numero rotulo="Execuções hoje" valor={k ? String(k.execucoesHoje) : "—"} />
          <Numero rotulo="Tempo médio" valor={k ? duracao(k.tempoMedioMs) : "—"} />
          <Numero rotulo="Erros hoje" valor={k ? String(k.errosHoje) : "—"} destaque={k && k.errosHoje > 0 ? "erro" : undefined} />
          <Numero rotulo="Ligadas" valor={k ? String(k.ativas) : "—"} />
        </div>
      </section>

      <div className="mt-6 flex flex-col gap-2">
        {dados && dados.disponivel && dados.automacoes.length === 0 && (
          <EmptyState
            icon={<Workflow size={22} />}
            title="Nenhuma automação ainda"
            description="Comece por um modelo: lead novo no WhatsApp, proposta sem resposta, negócio parado..."
            action={<Button type="button" onClick={() => setGaleria(true)}><Plus size={14} /> Escolher um modelo</Button>}
          />
        )}
        {dados?.automacoes.map((a) => {
          const Icone = ICONE_DO_OBJETO[a.objeto] ?? Workflow;
          const s = STATUS_DA_AUTOMACAO[a.status] ?? STATUS_DA_AUTOMACAO.rascunho;
          return (
            <Link key={a.id} href={`/automacoes/${a.id}`} className="glass-card group flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors hover:border-border-strong">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
                <Icone size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[14px] font-medium text-text-primary">{a.nome}</p>
                  <Badge variant={s.variante}>{s.rotulo}</Badge>
                  {a.origem === "regra_rapida" && <Badge variant="accent">⚡ regra rápida</Badge>}
                  <span className="text-[11.5px] text-text-tertiary">{NOMES_DOS_OBJETOS[a.objeto]?.plural}</span>
                </div>
                <p className="mt-0.5 truncate text-[12.5px] text-text-secondary">{fraseDaAutomacao(a.rascunho, nomes)}</p>
                {a.pausadaPor && a.status === "pausada" && <p className="mt-0.5 truncate text-[12px] text-warning">{a.pausadaPor}</p>}
              </div>
              <div className="hidden shrink-0 gap-6 text-right sm:flex">
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{a.execucoes30d}</p>
                  <p className="text-[11px] text-text-tertiary">execuções 30d</p>
                </div>
                <div>
                  <p className={`text-[13px] font-medium ${a.erros30d ? "text-danger" : "text-text-primary"}`}>{a.erros30d}</p>
                  <p className="text-[11px] text-text-tertiary">erros</p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{quando(a.ultimaExecucao)}</p>
                  <p className="text-[11px] text-text-tertiary">última</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <Galeria aberta={galeria} fechar={() => setGaleria(false)} criar={criar} />
    </div>
  );
}
