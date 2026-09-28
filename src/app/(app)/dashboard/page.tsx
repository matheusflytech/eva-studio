"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShoppingCart, DollarSign, TrendingUp, CalendarDays, Wallet, Percent,
  RefreshCw, Search, ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { AreaChart } from "@/components/charts/area-chart";
import { cn, formatRelativeDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Dashboard de vendas.
//
// A estrutura veio do dashboard antigo do usuário (filtros de período, seis
// indicadores, gráfico do período, dois recortes e a tabela do que fechou),
// que é um bom layout e ele já conhece de cor. O que mudou foi a fonte: lá os
// números vinham de uma plataforma de checkout, aqui vêm do CRM. Negócio
// ganho é venda, valor do negócio é receita.
//
// Onde o painel antigo tinha coisa que não existe neste produto (SCK,
// produto), o espaço foi ocupado por algo que existe e responde a mesma
// pergunta: por qual canal a pessoa chegou, e em que etapa o dinheiro parou.
// ---------------------------------------------------------------------------

const PERIODOS = [
  { label: "Hoje", dias: 1 },
  { label: "7 dias", dias: 7 },
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
  { label: "6 meses", dias: 180 },
];

interface Kpis {
  vendas: number;
  receitaCents: number;
  ticketMedioCents: number;
  vendasHoje: number;
  receitaHojeCents: number;
  conversao: number | null;
  criados: number;
  emAbertoCents: number;
  emAbertoPonderadoCents: number;
}

interface Recorte { label: string; value: number; total?: number; valorCents?: number }

interface Venda {
  id: string;
  nome: string;
  quando: string | null;
  contato: string;
  funil: string;
  etapa: string;
  responsavel: string;
  valorCents: number;
}

interface Payload {
  kpis: Kpis;
  serie: { label: string; value: number }[];
  porEtapa: Recorte[];
  porCanal: Recorte[];
  recentes: Venda[];
}

const CANAL_LABEL: Record<string, string> = {
  whatsapp_meta: "WhatsApp oficial",
  whatsapp_qr: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
  webchat: "Site",
  website: "Site",
  "sem canal": "Sem canal",
};

function dinheiro(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DashboardPage() {
  const [dias, setDias] = React.useState(30);
  const [busca, setBusca] = React.useState("");
  const [dados, setDados] = React.useState<Payload | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [atualizadoEm, setAtualizadoEm] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/analytics/vendas?dias=${dias}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setDados(d);
      setAtualizadoEm(new Date().toLocaleTimeString("pt-BR"));
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  React.useEffect(() => { carregar(); }, [carregar]);

  const recentesFiltradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo || !dados) return dados?.recentes ?? [];
    return dados.recentes.filter((v) =>
      `${v.nome} ${v.contato} ${v.funil} ${v.etapa} ${v.responsavel}`.toLowerCase().includes(termo)
    );
  }, [busca, dados]);

  const k = dados?.kpis;

  return (
    <div className="flex-1 p-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-[14px] text-text-secondary">
            O que o CRM fechou — negócio ganho é venda, valor do negócio é receita.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {atualizadoEm && (
            <span className="text-[12px] text-text-tertiary">Atualizado: {atualizadoEm}</span>
          )}
          <button
            type="button"
            onClick={carregar}
            className="inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <RefreshCw size={14} className={cn(carregando && "animate-spin")} /> Atualizar
          </button>
        </div>
      </header>

      {/* Barra de filtro, igual à do dashboard antigo. */}
      <div className="glass-card mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <span className="text-[12.5px] text-text-tertiary">Filtrar por:</span>
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                dias === p.dias
                  ? "bg-ice text-bg-base"
                  : "bg-surface-2 text-text-secondary hover:text-text-primary"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Buscar nas vendas recentes..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          icon={<ShoppingCart size={15} />}
          rotulo="Total de vendas"
          valor={k ? String(k.vendas) : "—"}
          nota="negócios ganhos no período"
        />
        <Kpi
          icon={<DollarSign size={15} />}
          rotulo="Receita total"
          valor={k ? dinheiro(k.receitaCents) : "—"}
          nota="faturamento"
          destaque
        />
        <Kpi
          icon={<TrendingUp size={15} />}
          rotulo="Ticket médio"
          valor={k ? dinheiro(k.ticketMedioCents) : "—"}
          nota="por venda"
        />
        <Kpi
          icon={<CalendarDays size={15} />}
          rotulo="Vendas hoje"
          valor={k ? String(k.vendasHoje) : "—"}
          nota="fechadas hoje"
        />
        <Kpi
          icon={<Wallet size={15} />}
          rotulo="Receita hoje"
          valor={k ? dinheiro(k.receitaHojeCents) : "—"}
          nota="faturamento do dia"
        />
        <Kpi
          icon={<Percent size={15} />}
          rotulo="Taxa de conversão"
          valor={k ? (k.conversao === null ? "—" : `${(k.conversao * 100).toFixed(1)}%`) : "—"}
          // Número de conversão sem o denominador à vista é o jeito mais fácil
          // de alguém comemorar 100% em cima de um negócio só.
          nota={k ? `${k.vendas} de ${k.criados} negócios criados` : "abertos → ganhos"}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="glass-card rounded-3xl p-5">
          <h2 className="mb-1 font-display text-[15px] font-semibold text-text-primary">
            Receita dos últimos {dias === 1 ? "1 dia" : `${dias} dias`}
          </h2>
          <p className="mb-4 text-[11.5px] text-text-tertiary">Em reais, por dia de fechamento.</p>
          {dados && dados.serie.some((p) => p.value > 0) ? (
            <AreaChart data={dados.serie} height={220} />
          ) : (
            <Vazio texto="Nenhum negócio ganho neste período." />
          )}
        </section>

        <section className="glass-card rounded-3xl p-5">
          <h2 className="mb-1 font-display text-[15px] font-semibold text-text-primary">Onde o dinheiro está parado</h2>
          <p className="mb-4 text-[11.5px] text-text-tertiary">
            Negócios ainda abertos, por etapa.{" "}
            {k && k.emAbertoCents > 0 && (
              <span className="text-text-secondary">
                {dinheiro(k.emAbertoCents)} no total, {dinheiro(k.emAbertoPonderadoCents)} ponderado pela chance.
              </span>
            )}
          </p>
          <Barras itens={dados?.porEtapa ?? []} vazio="Nenhum negócio aberto." sufixo={(i) => `${i.total} neg.`} />
        </section>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <section className="glass-card rounded-3xl p-5">
          <h2 className="mb-1 font-display text-[15px] font-semibold text-text-primary">De onde vieram</h2>
          <p className="mb-4 text-[11.5px] text-text-tertiary">Canal do contato nos negócios ganhos.</p>
          <Barras
            itens={(dados?.porCanal ?? []).map((c) => ({ ...c, label: CANAL_LABEL[c.label] ?? c.label }))}
            vazio="Sem vendas com canal registrado."
            sufixo={(i) => (i.valorCents ? dinheiro(i.valorCents) : `${i.value}`)}
          />
        </section>

        <section className="glass-card flex flex-col rounded-3xl p-5">
          <h2 className="mb-1 font-display text-[15px] font-semibold text-text-primary">Vendas recentes</h2>
          <p className="mb-4 text-[11.5px] text-text-tertiary">Os últimos negócios marcados como ganhos.</p>

          {recentesFiltradas.length === 0 ? (
            <Vazio texto={busca ? "Nada com esse termo." : "Nenhuma venda no período."} />
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-text-tertiary">
                    <th className="px-2 pb-2 font-medium">Quando</th>
                    <th className="px-2 pb-2 font-medium">Negócio</th>
                    <th className="px-2 pb-2 font-medium">Contato</th>
                    <th className="px-2 pb-2 font-medium">Responsável</th>
                    <th className="px-2 pb-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {recentesFiltradas.map((v) => (
                    <tr key={v.id} className="border-t border-border-subtle text-[12.5px]">
                      <td className="whitespace-nowrap px-2 py-2.5 text-text-tertiary">
                        {v.quando ? formatRelativeDate(v.quando) : "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-2 py-2.5 text-text-primary">{v.nome}</td>
                      <td className="max-w-[140px] truncate px-2 py-2.5 text-text-secondary">{v.contato}</td>
                      <td className="max-w-[120px] truncate px-2 py-2.5 text-text-tertiary">{v.responsavel}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold text-text-primary">
                        {dinheiro(v.valorCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Link
            href="/negocios"
            className="mt-4 inline-flex items-center gap-1.5 self-start text-[12.5px] font-medium text-accent-400 hover:text-accent-300"
          >
            Abrir o funil <ArrowRight size={13} />
          </Link>
        </section>
      </div>
    </div>
  );
}

function Kpi({
  icon, rotulo, valor, nota, destaque,
}: {
  icon: React.ReactNode;
  rotulo: string;
  valor: string;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <div className="glass-card flex items-start justify-between gap-3 rounded-2xl px-4 py-4">
      <div className="min-w-0">
        <p className="text-[11.5px] text-text-tertiary">{rotulo}</p>
        <p
          className={cn(
            "mt-1.5 truncate font-display text-[22px] font-semibold tabular-nums",
            destaque ? "text-emerald-400" : "text-text-primary"
          )}
        >
          {valor}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{nota}</p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
        {icon}
      </span>
    </div>
  );
}

/** Barras horizontais. Escala pelo maior item, sempre — barra sem escala mente. */
function Barras({
  itens, vazio, sufixo,
}: {
  itens: Recorte[];
  vazio: string;
  sufixo: (i: Recorte) => string;
}) {
  if (itens.length === 0) return <Vazio texto={vazio} />;
  const maior = Math.max(1, ...itens.map((i) => i.value));

  return (
    <div className="flex flex-col gap-2.5">
      {itens.map((i) => (
        <div key={i.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[12.5px]">
            <span className="truncate text-text-secondary">{i.label}</span>
            <span className="shrink-0 tabular-nums text-text-tertiary">{sufixo(i)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div
              className="h-1.5 rounded-full bg-accent-500/70"
              style={{ width: `${Math.max(2, (i.value / maior) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-2xl bg-surface-2 px-4 py-8 text-center text-[12.5px] text-text-tertiary">
      {texto}
    </p>
  );
}
