"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { reduzMovimento } from "@/components/crm/negocios/animacao/gsap";
import type { TabelaDoCartao } from "@/lib/exportar/cartao";
import type { Mes, VisaoGeral } from "@/lib/server/dashboard-overview";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Desenhos dos cartões da "Visão geral" (Receita, Vendas, Conversas,
// Conversão, Ritmo, Receita por mês, Mapa de horários). Os dados vêm de
// /api/dashboard/overview, já no período e nos filtros da barra; a moldura é
// a mesma de todos os cartões (cartao.tsx).
// ---------------------------------------------------------------------------

export type Visao = VisaoGeral;

export const ROTULO_DO_GRUPO: Record<string, string> = {
  whatsapp: "WhatsApp",
  website: "Site",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
};
const ROTULO_DO_CANAL: Record<string, string> = {
  whatsapp_meta: "O WhatsApp",
  whatsapp_qr: "O WhatsApp",
  website: "O site",
  instagram: "O Instagram",
  messenger: "O Messenger",
  telegram: "O Telegram",
};
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const reaisCurtos = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const dataBR = (dia: string) => dia.split("-").reverse().slice(0, 2).join("/");

function nomeDoMes(mes: string, curto = false) {
  const nome = MESES[Number(mes.slice(5, 7)) - 1];
  return curto ? nome : `${nome}/${mes.slice(2, 4)}`;
}

/**
 * O número conta do valor anterior até o novo (de zero na primeira vez).
 * Sem animação para quem pediu menos movimento.
 */
export function useContagem(valor: number | null): number | null {
  const [visto, setVisto] = React.useState<number | null>(valor === null ? null : 0);
  const anterior = React.useRef<number>(0);
  React.useEffect(() => {
    const de = anterior.current;
    if (valor !== null) anterior.current = valor;
    // Sem animação (nada a contar ou menos movimento): o valor entra direto, no próximo quadro.
    const direto = valor === null || de === valor || reduzMovimento();
    const inicio = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      if (direto) return setVisto(valor);
      const t = Math.min(1, (agora - inicio) / 600);
      setVisto(de + (valor - de) * (1 - (1 - t) ** 3));
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor]);
  return visto;
}

/** O número grande do cartão: um formato só no painel inteiro. */
export function NumeroGrande({ valor, formatar }: { valor: number | null; formatar: (v: number) => string }) {
  const visto = useContagem(valor);
  return (
    <p className="text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
      {visto === null ? "—" : formatar(visto)}
    </p>
  );
}

/** Variação contra o período anterior. Sem base para comparar, não mostra nada. */
function Variacao({ atual, anterior, pontos, escuro }: { atual: number; anterior: number; pontos?: boolean; escuro?: boolean }) {
  if (!pontos && anterior === 0) return null;
  const delta = pontos ? (atual - anterior) * 100 : ((atual - anterior) / anterior) * 100;
  const subiu = delta >= 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1.5 text-caption">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
          escuro ? "bg-inverse-fg/15" : subiu ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"
        )}
      >
        <Icone size={11} aria-hidden="true" />
        <span className="sr-only">{subiu ? "subiu" : "caiu"}</span>
        {Math.abs(delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        {pontos ? " pt" : "%"}
      </span>
      <span className={escuro ? "opacity-70" : "text-text-tertiary"}>vs período anterior</span>
    </span>
  );
}

/** Linha acumulada dia a dia; cada ponto tem a dica com o valor do dia. */
function Linha({ valores, dias, escuro }: { valores: number[]; dias: string[]; escuro?: boolean }) {
  const acumulado = valores.reduce<number[]>((a, v) => [...a, (a.at(-1) ?? 0) + v], []);
  const max = Math.max(1, ...acumulado);
  const n = Math.max(1, acumulado.length - 1);
  const pontos = acumulado.map((v, i) => [(i / n) * 76 + 2, 38 - (v / max) * 34] as const);
  return (
    <svg width="80" height="40" viewBox="0 0 80 40" role="img" aria-label="Receita acumulada no período">
      <polyline
        points={pontos.map((p) => p.join(",")).join(" ")}
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={escuro ? "stroke-inverse-fg" : "stroke-accent-solid"}
      />
      {pontos.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pontos.length - 1 ? 3.5 : 4} strokeWidth="2" className={i === pontos.length - 1 ? (escuro ? "fill-inverse stroke-inverse-fg" : "fill-panel stroke-accent-solid") : "fill-transparent stroke-transparent"}>
          <title>{`${dias[i] ? dataBR(dias[i]) : ""}: ${reais(valores[i])} (${reais(acumulado[i])} no acumulado)`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Barrinhas({ valores, rotulos, escuro }: { valores: number[]; rotulos: string[]; escuro?: boolean }) {
  const max = Math.max(1, ...valores);
  return (
    <div className="flex h-10 items-end gap-1">
      {valores.map((v, i) => (
        <span
          key={i}
          title={rotulos[i]}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          className={cn(
            "w-2.5 rounded-[4px]",
            i === valores.length - 1 ? (escuro ? "bg-inverse-fg" : "bg-accent-solid") : escuro ? "bg-inverse-fg/30" : "bg-text-tertiary/30"
          )}
        />
      ))}
    </div>
  );
}

/** Vendas por semana do período (ou por dia, se o período é de até 14 dias). */
function agruparVendas(porDia: number[], de: string): { valores: number[]; rotulos: string[] } {
  const dia = (i: number) => {
    const d = new Date(`${de}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  };
  if (porDia.length <= 14) return { valores: porDia, rotulos: porDia.map((v, i) => `${dataBR(dia(i))}: ${v} ${v === 1 ? "venda" : "vendas"}`) };
  const semanas: number[] = [];
  porDia.forEach((v, i) => (semanas[Math.floor(i / 7)] = (semanas[Math.floor(i / 7)] ?? 0) + v));
  const ultimas = semanas.slice(-12);
  const desloca = semanas.length - ultimas.length;
  return { valores: ultimas, rotulos: ultimas.map((v, i) => `Semana de ${dataBR(dia((i + desloca) * 7))}: ${v} ${v === 1 ? "venda" : "vendas"}`) };
}

function Anel({ parte }: { parte: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90" role="img" aria-label={`${pct(parte)} sem atendente`}>
      <title>{`${pct(parte)} terminaram sem atendente`}</title>
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" className="stroke-text-tertiary/20" />
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-accent-solid" strokeDasharray={`${c * parte} ${c}`} />
      <text x="22" y="22" transform="rotate(90 22 22)" textAnchor="middle" dominantBaseline="central" className="fill-current text-[10px] font-semibold">
        {Math.round(parte * 100)}%
      </text>
    </svg>
  );
}

/** Medidor em meia-lua com marcas, como um velocímetro. */
function Medidor({ pontos, escuro }: { pontos: number; escuro: boolean }) {
  const marcas = 25;
  const angulo = (p: number) => Math.PI * (1 - p / 100);
  const ponto = (p: number, raio: number) => [100 + raio * Math.cos(angulo(p)), 100 - raio * Math.sin(angulo(p))];
  const [kx, ky] = ponto(pontos, 78);
  const traco = escuro ? "stroke-inverse-fg" : "stroke-text-primary";
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[240px]" role="img" aria-label={`${pontos} de 100`}>
      <title>{`${pontos} de 100`}</title>
      {Array.from({ length: marcas }, (_, i) => {
        const p = (i / (marcas - 1)) * 100;
        const [x1, y1] = ponto(p, 92);
        const [x2, y2] = ponto(p, i % 4 === 0 ? 84 : 87);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="1.5" strokeLinecap="round" className={cn(traco, p > pontos && "opacity-30")} />;
      })}
      <path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" strokeWidth="14" strokeLinecap="round" className={cn(traco, "opacity-15")} />
      {pontos > 0 && <path d={`M 22 100 A 78 78 0 0 1 ${kx} ${ky}`} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-accent-solid" />}
      <circle cx={kx} cy={ky} r="9" strokeWidth="3" className={escuro ? "fill-inverse stroke-inverse-fg" : "fill-panel stroke-text-primary"} />
    </svg>
  );
}

function Ritmo({ v, escuro }: { v: Visao; escuro: boolean }) {
  const r = v.ritmo;
  const pontos = useContagem(r?.pontos ?? null);
  if (!r) {
    return <p className="mt-2 text-small opacity-75">O ritmo só vale para períodos que incluem hoje.</p>;
  }
  const canal = r.melhorCanal ? ROTULO_DO_CANAL[r.melhorCanal.canal] ?? r.melhorCanal.canal : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mx-auto mt-1 w-full max-w-[240px]">
        <Medidor pontos={r.pontos} escuro={escuro} />
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <p className="text-[28px] font-semibold leading-none tabular-nums">{Math.round(pontos ?? 0)}</p>
          <p className="mt-1 text-caption opacity-70">de 100</p>
        </div>
      </div>
      <p className="mt-3 text-body font-medium">{r.referencia === 0 ? (r.projetada > 0 ? "Primeiro período com vendas" : "Nenhuma venda ainda") : r.noRitmo ? "Acima do ritmo" : "Abaixo do ritmo"}</p>
      <p className="mt-1 text-small leading-snug opacity-75">
        {r.referencia > 0
          ? `No ritmo de hoje, o período fecha em ${reaisCurtos(r.projetada)}; a média dos 3 anteriores é ${reaisCurtos(r.referencia)}.`
          : "Sem vendas nos 3 períodos anteriores para comparar."}
        {canal && r.melhorCanal && ` ${canal} trouxe ${pct(r.melhorCanal.parte)} da receita.`}
      </p>
    </div>
  );
}

function ReceitaPorMes({ meses, periodo }: { meses: Mes[]; periodo: Visao["periodo"] }) {
  const anos = [...new Set(meses.map((m) => m.mes.slice(0, 4)))];
  const [ano, setAno] = React.useState(anos.at(-1) ?? "");
  const atual = meses.at(-1)?.mes ?? "";
  const doAno = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`).map(
    (mes) => meses.find((m) => m.mes === mes) ?? { mes, receita: 0, vendas: 0, criados: 0 }
  );
  const passados = doAno.filter((m) => m.mes <= atual);
  const max = Math.max(1, ...doAno.map((m) => m.receita));
  const media = passados.length ? passados.reduce((s, m) => s + m.receita, 0) / passados.length : 0;
  const total = passados.reduce((s, m) => s + m.receita, 0);
  const noPeriodo = (mes: string) => mes >= periodo.de.slice(0, 7) && mes <= periodo.ate.slice(0, 7);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-text-tertiary tabular-nums">{reais(total)} em {ano}</span>
        {anos.length > 1 && <SegmentedControl label="Ano" value={ano} onChange={setAno} options={anos.map((a) => ({ value: a, label: a }))} />}
      </div>
      <div className="relative mt-3 min-h-0 flex-1">
        {media > 0 && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-text-tertiary/50" style={{ bottom: `calc(${(media / max) * 80}% + 22px)` }}>
            <span className="absolute -top-2.5 right-0 rounded-full bg-raised px-1.5 text-caption text-text-tertiary">média {reaisCurtos(media)}</span>
          </div>
        )}
        <div className="flex h-full items-end gap-1.5 sm:gap-2.5">
          {doAno.map((m) => {
            const futuro = m.mes > atual;
            const ativo = noPeriodo(m.mes);
            const rotulo = futuro ? `${nomeDoMes(m.mes)}: ainda não chegou` : `${nomeDoMes(m.mes)}: ${reais(m.receita)}, ${m.vendas} ${m.vendas === 1 ? "venda" : "vendas"}`;
            return (
              <div key={m.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span
                  role="img"
                  aria-label={rotulo}
                  title={rotulo}
                  style={{ height: `${futuro ? 30 : Math.max(5, (m.receita / max) * 80)}%` }}
                  className={cn(
                    "w-full max-w-[40px] rounded-full transition-[height] duration-500 motion-reduce:transition-none",
                    futuro
                      ? "border border-dashed border-text-tertiary/50"
                      : ativo
                        ? "bg-gradient-to-b from-accent-solid to-accent-solid/60"
                        : "bg-[repeating-linear-gradient(135deg,var(--color-border-default)_0_2px,transparent_2px_6px)] outline outline-1 -outline-offset-1 outline-border-default"
                  )}
                />
                <span className={cn("text-caption", ativo ? "font-semibold text-text-primary" : "text-text-tertiary")}>{nomeDoMes(m.mes, true)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MapaDeCalor({ calor }: { calor: number[][] }) {
  const max = Math.max(1, ...calor.flat());
  const tom = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const classes = ["bg-raised", "bg-accent-solid/20", "bg-accent-solid/40", "bg-accent-solid/70", "bg-accent-solid"];
  // Segunda a domingo, como na agenda.
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-1 text-caption text-text-tertiary" aria-hidden="true">
        0 {classes.map((c) => <span key={c} className={cn("size-3 rounded-[4px]", c)} />)} {max}
      </div>
      <div className="mt-2 grid min-h-0 flex-1 grid-cols-[36px_repeat(7,minmax(0,1fr))] grid-rows-[auto_repeat(12,minmax(0,1fr))] gap-1 text-caption">
        <span />
        {ordem.map((d) => <span key={d} className="text-center text-text-tertiary">{DIAS[d]}</span>)}
        {Array.from({ length: 12 }, (_, b) => (
          <React.Fragment key={b}>
            <span className="pr-1 text-right leading-none text-text-tertiary">{String(b * 2).padStart(2, "0")}h</span>
            {ordem.map((d) => (
              <span key={d} title={`${DIAS[d]}, ${b * 2}h–${b * 2 + 2}h: ${calor[d][b]} mensagens`} className={cn("min-h-1.5 rounded-[4px]", classes[tom(calor[d][b])])} />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/** Os quatro números (Receita, Vendas, Conversas, Conversão): número, variação e um desenho pequeno. */
function Numero({ v, fonte, escuro }: { v: Visao; fonte: string; escuro: boolean }) {
  const dias = React.useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < v.receita.porDia.length; i += 1) {
      const d = new Date(`${v.periodo.de}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, [v.periodo.de, v.receita.porDia.length]);

  let valor: number | null = null;
  let formatar: (n: number) => string = (n) => Math.round(n).toLocaleString("pt-BR");
  let variacao: React.ReactNode = null;
  let desenho: React.ReactNode = null;
  if (fonte === "visaoReceita") {
    valor = v.receita.atual;
    formatar = reais;
    variacao = <Variacao atual={v.receita.atual} anterior={v.receita.anterior} escuro={escuro} />;
    desenho = <Linha valores={v.receita.porDia} dias={dias} escuro={escuro} />;
  } else if (fonte === "visaoVendas") {
    valor = v.vendas.atual;
    variacao = <Variacao atual={v.vendas.atual} anterior={v.vendas.anterior} escuro={escuro} />;
    const { valores, rotulos } = agruparVendas(v.vendas.porDia, v.periodo.de);
    desenho = <Barrinhas valores={valores} rotulos={rotulos} escuro={escuro} />;
  } else if (fonte === "visaoConversas") {
    valor = v.conversas.atual;
    variacao = <Variacao atual={v.conversas.atual} anterior={v.conversas.anterior} escuro={escuro} />;
    desenho = v.conversas.semAtendente !== null ? <Anel parte={v.conversas.semAtendente} /> : null;
  } else {
    valor = v.conversao.atual;
    formatar = pct;
    variacao =
      v.conversao.atual !== null && v.conversao.anterior !== null ? (
        <Variacao atual={v.conversao.atual} anterior={v.conversao.anterior} pontos escuro={escuro} />
      ) : null;
    desenho = (
      <Barrinhas
        valores={v.conversao.porMes.map((m) => m.valor ?? 0)}
        rotulos={v.conversao.porMes.map((m) => `${nomeDoMes(m.mes)}: ${m.valor === null ? "sem negócios" : pct(m.valor)}`)}
        escuro={escuro}
      />
    );
  }
  return (
    <div className="mt-auto flex items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <NumeroGrande valor={valor} formatar={formatar} />
        {variacao}
      </div>
      <div className="shrink-0">{desenho}</div>
    </div>
  );
}

export function ConteudoDaVisao({ fonte, visao, escuro }: { fonte: string; visao: Visao; escuro: boolean }) {
  if (fonte === "ritmo") return <Ritmo v={visao} escuro={escuro} />;
  if (fonte === "receitaPorMes") return <ReceitaPorMes key={visao.canal} meses={visao.meses} periodo={visao.periodo} />;
  if (fonte === "mapaDeHorarios") return <MapaDeCalor calor={visao.calor} />;
  return <Numero v={visao} fonte={fonte} escuro={escuro} />;
}

/** Os dados do cartão como tabela, para o CSV. */
export function tabelaDaVisao(fonte: string, v: Visao): TabelaDoCartao {
  const periodo = `${v.periodo.de} a ${v.periodo.ate}`;
  const anterior = `${v.periodo.anteriorDe} a ${v.periodo.anteriorAte}`;
  const comparar = (atual: number | null, ant: number | null, emReais = false): TabelaDoCartao => ({
    cabecalho: ["Período", "Valor"],
    linhas: [
      [periodo, atual === null ? "" : emReais ? atual / 100 : atual],
      [anterior, ant === null ? "" : emReais ? ant / 100 : ant],
    ],
  });
  switch (fonte) {
    case "visaoReceita":
      return comparar(v.receita.atual, v.receita.anterior, true);
    case "visaoVendas":
      return comparar(v.vendas.atual, v.vendas.anterior);
    case "visaoConversas":
      return comparar(v.conversas.atual, v.conversas.anterior);
    case "visaoConversao":
      return comparar(v.conversao.atual, v.conversao.anterior);
    case "ritmo":
      return v.ritmo
        ? {
            cabecalho: ["Pontos", "Projetada (R$)", "Média dos 3 anteriores (R$)"],
            linhas: [[v.ritmo.pontos, v.ritmo.projetada / 100, v.ritmo.referencia / 100]],
          }
        : { cabecalho: ["Aviso"], linhas: [["O ritmo só vale para períodos que incluem hoje."]] };
    case "receitaPorMes":
      return { cabecalho: ["Mês", "Receita (R$)", "Vendas"], linhas: v.meses.map((m) => [m.mes, m.receita / 100, m.vendas]) };
    default:
      return {
        cabecalho: ["Dia", ...Array.from({ length: 12 }, (_, b) => `${String(b * 2).padStart(2, "0")}h`)],
        linhas: v.calor.map((linha, d) => [DIAS[d], ...linha]),
      };
  }
}
