"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CabecalhoDeTela } from "@/components/layout/cabecalho-de-tela";
import { ConteudoDaVisao, curva, reais, ROTULO_DO_GRUPO, type Visao } from "@/components/dashboard/cartoes-da-visao";
import { DonutChart, type DonutSegment } from "@/components/charts/donut-chart";

export interface PendenciaDaFila {
  id: string;
  tipo: "urgente" | "atencao" | "config";
  titulo: string;
  detalhe: string;
  href: string;
  quantidade?: number;
}

function Painel({ titulo, nota, className, children }: { titulo: string; nota?: string; className?: string; children: React.ReactNode }) {
  return (
    <article className={cn("vidro relative flex flex-col gap-3 rounded-[22px] p-5", className)}>
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-body font-semibold text-text-primary">{titulo}</h2>
        {nota && <span className="text-caption text-text-tertiary">{nota}</span>}
      </header>
      {children}
    </article>
  );
}

/** Receita por dia do período: linha suave com área, o último dia marcado. */
function ReceitaDoPeriodo({ visao }: { visao: Visao }) {
  const dias = visao.receita.porDia;
  const W = 640, H = 190, topo = 14, base = 24;
  const max = Math.max(1, ...dias);
  const pts = dias.map((v, i) => [(i / Math.max(1, dias.length - 1)) * W, topo + (1 - v / max) * (H - topo - base)] as const);
  const d = curva(pts);
  const ultimo = pts[pts.length - 1];
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <b className="text-[40px] font-medium leading-none tracking-[-0.035em] tabular-nums text-text-primary">{reais(visao.receita.atual)}</b>
        <span className="text-small text-text-tertiary">nos últimos {dias.length} dias</span>
      </div>
      {dias.length > 1 ? (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Receita por dia" className="h-44 w-full">
          <defs>
            <linearGradient id="inicio-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent-fg, #4a9dff)" stopOpacity=".34" />
              <stop offset="1" stopColor="var(--accent-fg, #4a9dff)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${W},${H - base} L0,${H - base} Z`} fill="url(#inicio-area)" />
          <path d={d} fill="none" stroke="var(--accent-fg, #4a9dff)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx={ultimo[0]} cy={ultimo[1]} r="4.5" fill="var(--accent-fg, #4a9dff)" />
        </svg>
      ) : (
        <p className="text-small text-text-tertiary">Sem dias suficientes para a linha.</p>
      )}
    </>
  );
}

function Fila({ pendencias }: { pendencias: PendenciaDaFila[] }) {
  if (pendencias.length === 0) return <p className="text-small text-text-secondary">Tudo em dia. Nada pedindo você agora.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {pendencias.map((p) => (
        <li key={p.id}>
          <Link
            href={p.href}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3.5 py-3 transition-[background-color,scale] duration-150 active:scale-[0.98]",
              p.tipo === "urgente" ? "bg-danger/10 hover:bg-danger/15" : "bg-hover/60 hover:bg-hover"
            )}
          >
            <span className="min-w-0 flex-1">
              <b className="block truncate text-small font-semibold text-text-primary">{p.titulo}</b>
              <span className="mt-0.5 line-clamp-2 text-caption text-text-secondary">{p.detalhe}</span>
            </span>
            {p.quantidade !== undefined && <b className={cn("tabular-nums", p.tipo === "urgente" ? "text-danger" : "text-text-primary")}>{p.quantidade}</b>}
            <ChevronRight size={14} aria-hidden className="shrink-0 text-text-tertiary" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const CANAL: Record<string, string> = { whatsapp_meta: "whatsapp", whatsapp_qr: "whatsapp" };
const rotuloDoCanal = (c: string) => ROTULO_DO_GRUPO[CANAL[c] ?? c] ?? c;

/** Conversas por canal, juntando as duas formas de WhatsApp. */
function OrigemDasConversas({ canais }: { canais: DonutSegment[] }) {
  const juntos = new Map<string, number>();
  for (const c of canais) juntos.set(rotuloDoCanal(c.label), (juntos.get(rotuloDoCanal(c.label)) ?? 0) + c.value);
  const segmentos = [...juntos].map(([label, value]) => ({ label, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  if (segmentos.length === 0) return <p className="text-small text-text-tertiary">Sem conversas no período.</p>;
  return <DonutChart segments={segmentos} size={150} />;
}

/** "Visão de hoje": números do topo e quatro painéis de vidro, tudo do banco do contrato. */
export function VisaoDeHoje({ pendencias, escuro }: { pendencias: PendenciaDaFila[]; escuro: boolean }) {
  const [visao, setVisao] = React.useState<Visao | null>(null);
  const [erro, setErro] = React.useState(false);
  const [canais, setCanais] = React.useState<DonutSegment[] | null>(null);

  React.useEffect(() => {
    fetch("/api/dashboard/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setVisao)
      .catch(() => setErro(true));
  }, []);

  React.useEffect(() => {
    fetch("/api/analytics/fontes")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { quebras?: { porCanalConversas?: DonutSegment[] } }) => setCanais(d.quebras?.porCanalConversas ?? []))
      .catch(() => setCanais([]));
  }, []);

  if (erro) return null;
  const taxa = visao?.conversao.atual ?? null;
  return (
    <section aria-label="Visão de hoje" className="flex flex-col gap-4 px-6">
      <CabecalhoDeTela
        titulo="Visão de hoje"
        numeros={
          visao
            ? [
                { rotulo: "receita em 30 dias", valor: visao.receita.atual / 100, formatar: (n) => reais(n * 100) },
                { rotulo: "conversas", valor: visao.conversas.atual },
                ...(taxa !== null ? [{ rotulo: "taxa de ganho", valor: Math.round(taxa * 1000) / 10, formatar: (n: number) => `${n.toLocaleString("pt-BR")}%` }] : []),
              ]
            : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-12">
        <Painel titulo="Receita" nota="por dia" className="lg:col-span-7">
          {visao ? <ReceitaDoPeriodo visao={visao} /> : <p className="text-small text-text-tertiary">Carregando…</p>}
        </Painel>
        <Painel titulo="Na fila" nota={`${pendencias.length} em aberto`} className="lg:col-span-5">
          <Fila pendencias={pendencias} />
        </Painel>
        <Painel titulo="Receita por mês" nota="recebido, em reais" className="lg:col-span-7">
          {visao && <ConteudoDaVisao fonte="receitaPorMes" visao={visao} escuro={escuro} />}
        </Painel>
        <Painel titulo="Ritmo" nota="contra a média dos 3 períodos anteriores" className="lg:col-span-5">
          {visao && <ConteudoDaVisao fonte="ritmo" visao={visao} escuro={escuro} />}
        </Painel>
        <Painel titulo="Quando falam com você" nota="mensagens por dia e hora" className="lg:col-span-7">
          {visao && <ConteudoDaVisao fonte="mapaDeHorarios" visao={visao} escuro={escuro} />}
        </Painel>
        <Painel titulo="Origem das conversas" nota="por canal" className="lg:col-span-5">
          {canais ? <OrigemDasConversas canais={canais} /> : <p className="text-small text-text-tertiary">Carregando…</p>}
        </Painel>
      </div>
    </section>
  );
}
