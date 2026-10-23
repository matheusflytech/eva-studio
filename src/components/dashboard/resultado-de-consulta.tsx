"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { AlertTriangle, ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { cn, formatRelativeDate } from "@/lib/utils";
import { formatarResultado, LIMITE_DE_NEGOCIOS, type Consulta, type FiltrosGlobais, type ResultadoDeConsulta, type TipoDeCartao } from "@/lib/consulta";

// Busca e desenha o resultado de um cartão montado pelo cliente.

/** Busca o resultado. Refaz quando a consulta, os filtros do painel ou o tipo (lista x número) mudam. */
export function useResultadoDeConsulta(consulta: Consulta, tipo: TipoDeCartao, globais: FiltrosGlobais, atraso = 0) {
  const [resultado, setResultado] = React.useState<ResultadoDeConsulta | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const chave = JSON.stringify({ consulta, tipo, globais });

  React.useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/analytics/consulta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consulta, ...globais, lista: tipo === "tabela" }),
        });
        const d = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (!res.ok) {
          setErro(d.error ?? "Não foi possível calcular.");
          setResultado(null);
        } else {
          setErro(null);
          setResultado(d.resultado);
        }
      } catch {
        if (!cancelado) setErro("Sem conexão.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }, atraso);
    return () => { cancelado = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, atraso]);

  return { resultado, erro, carregando };
}

function Vazio({ texto = "Sem dados com esses filtros." }: { texto?: string }) {
  return <p className="rounded-[14px] bg-raised px-4 py-7 text-center text-small text-text-tertiary">{texto}</p>;
}


export function ConteudoDeConsulta({
  consulta,
  tipo,
  globais,
}: {
  consulta: Consulta;
  tipo: TipoDeCartao;
  globais: FiltrosGlobais;
}) {
  const { resultado, erro, carregando } = useResultadoDeConsulta(consulta, tipo, globais);
  return <VisaoDoResultado resultado={resultado} erro={erro} carregando={carregando} tipo={tipo} />;
}

export function VisaoDoResultado({
  resultado,
  erro,
  carregando,
  tipo,
}: {
  resultado: ResultadoDeConsulta | null;
  erro: string | null;
  carregando: boolean;
  tipo: TipoDeCartao;
}) {
  if (erro) return <p className="text-small text-danger">{erro}</p>;
  if (!resultado) return <p className="text-small text-text-tertiary">{carregando ? "Carregando..." : "Sem dados."}</p>;
  return (
    <div className={cn("transition-opacity", carregando && "opacity-60")}>
      <Desenho resultado={resultado} tipo={tipo} />
      {resultado.truncado && (
        <p className="mt-2 flex items-start gap-1.5 rounded-[10px] bg-warning-subtle px-2.5 py-1.5 text-caption leading-snug text-warning">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Calculado sobre os {LIMITE_DE_NEGOCIOS.toLocaleString("pt-BR")} negócios mais recentes. Filtre mais para ver o número exato.
        </p>
      )}
    </div>
  );
}

/** "▲ 12% vs. período anterior". Subir é bom em quase tudo que se mede aqui. */
function Variacao({ variacao, anterior, formato }: { variacao: number | null | undefined; anterior: number | null | undefined; formato: Parameters<typeof formatarResultado>[1] }) {
  if (anterior === undefined) return null;
  const textoAnterior = `antes: ${formatarResultado(anterior ?? null, formato)}`;
  if (variacao === null || variacao === undefined) {
    return <p className="mt-1 text-caption text-text-tertiary">Sem base de comparação ({textoAnterior})</p>;
  }
  const sobe = variacao > 0;
  const igual = Math.abs(variacao) < 0.0005;
  const Icone = sobe ? TrendingUp : TrendingDown;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption">
      <span className={cn("inline-flex items-center gap-1 font-medium", igual ? "text-text-tertiary" : sobe ? "text-success" : "text-danger")}>
        {!igual && <Icone size={12} />}
        {igual ? "igual" : `${sobe ? "+" : "−"}${Math.abs(variacao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
      </span>
      <span className="text-text-tertiary">vs. período anterior · {textoAnterior}</span>
    </p>
  );
}

function Desenho({ resultado, tipo }: { resultado: ResultadoDeConsulta; tipo: TipoDeCartao }) {
  if (resultado.tipo === "numero") {
    return (
      <div>
        <p className="text-display font-light tracking-[-0.04em] tabular-nums text-text-primary">
          {formatarResultado(resultado.valor, resultado.formato)}
        </p>
        <Variacao variacao={resultado.variacao} anterior={resultado.anterior} formato={resultado.formato} />
        <p className="mt-0.5 text-caption text-text-tertiary">{resultado.negocios.toLocaleString("pt-BR")} negócio(s) considerados</p>
      </div>
    );
  }

  if (resultado.tipo === "tabela") {
    if (resultado.linhas.length === 0) return <Vazio />;
    return (
      <div className="-mx-2 overflow-x-auto pt-1">
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr className="text-left text-caption font-mono text-text-tertiary">
              <th className="px-2 pb-2 font-medium">Negócio</th>
              <th className="px-2 pb-2 font-medium">Etapa</th>
              <th className="px-2 pb-2 font-medium">Quando</th>
              <th className="px-2 pb-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {resultado.linhas.slice(0, 8).map((l) => (
              <tr key={l.id} className="border-t border-border-subtle text-small">
                <td className="max-w-[170px] truncate px-2 py-2 text-text-primary">{l.titulo}</td>
                <td className="max-w-[110px] truncate px-2 py-2 text-text-secondary">{l.etapa}</td>
                <td className="whitespace-nowrap px-2 py-2 text-text-tertiary">{l.quando ? formatRelativeDate(l.quando) : "—"}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-text-primary">
                  {(l.valorCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Link href="/negocios" className="mt-3 inline-flex items-center gap-1.5 px-2 text-caption font-medium text-accent-fg hover:text-accent-fg">
          Abrir o funil <ArrowRight size={12} />
        </Link>
      </div>
    );
  }

  const pontos = resultado.pontos;
  if (pontos.length === 0 || !pontos.some((p) => p.value > 0)) return <Vazio />;

  if (tipo === "linha") return <AreaChart data={pontos} height={190} formatarValor={(v) => formatarResultado(v, resultado.formato)} />;

  if (tipo === "pizza") {
    return <DonutChart segments={pontos.filter((p) => p.value > 0)} size={150} />;
  }

  const visiveis = pontos.filter((p) => p.value > 0).slice(0, 12);
  const maior = Math.max(...visiveis.map((p) => p.value));
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {visiveis.map((p) => (
        <div key={p.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-small">
            <span className="truncate text-text-secondary">{p.label}</span>
            <span className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">{formatarResultado(p.value, resultado.formato)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-hover">
            <div className="h-1.5 rounded-full bg-accent-solid" style={{ width: `${Math.max(2, (p.value / maior) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
