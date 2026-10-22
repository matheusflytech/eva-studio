"use client";

import * as React from "react";
import { CalendarRange, FilterX, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SeletorMultiplo } from "@/components/dashboard/seletor-multiplo";
import type { OpcoesDoDashboard } from "@/components/dashboard/opcoes";
import { PainelFiltrarComIa } from "@/components/dashboard/ia-filtrar";
import type { ResultadoDoConstrutor } from "@/components/dashboard/construtor-de-consulta";
import { FILTROS_GLOBAIS_PADRAO, SEM_VALOR, diaLocal, janelaDoPainel, somarDias, type FiltrosGlobais } from "@/lib/consulta";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Barra de filtros do painel: período, funis e responsável valem pra todos os
// cartões de uma vez. O estado mora na URL (?de=&ate=&funis=&donos=), então
// "olha o painel do funil B2B do mês passado" vira um link que se manda no
// chat. Não é salvo no layout: o painel é compartilhado, o recorte é de quem
// está olhando.
// ---------------------------------------------------------------------------

export const PERIODOS = [
  { label: "Hoje", dias: 1 },
  { label: "7 dias", dias: 7 },
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
  { label: "6 meses", dias: 180 },
  { label: "12 meses", dias: 365 },
];

function dataCurta(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

/** Atalhos do intervalo personalizado. A data de hoje é lida no clique, não na renderização. */
const ATALHOS: { label: string; faixa: (hoje: string) => { de: string; ate: string } }[] = [
  { label: "Este mês", faixa: (hoje) => ({ de: `${hoje.slice(0, 7)}-01`, ate: hoje }) },
  {
    label: "Mês passado",
    faixa: (hoje) => {
      const ate = somarDias(`${hoje.slice(0, 7)}-01`, -1);
      return { de: `${ate.slice(0, 7)}-01`, ate };
    },
  },
  { label: "Este ano", faixa: (hoje) => ({ de: `${hoje.slice(0, 4)}-01-01`, ate: hoje }) },
];

export function filtrosGlobaisAtivos(g: FiltrosGlobais): boolean {
  return !!(g.de && g.ate) || g.dias !== FILTROS_GLOBAIS_PADRAO.dias || g.funis.length > 0 || g.donos.length > 0;
}

export function BarraDeFiltros({
  globais,
  aoMudar,
  opcoes,
  aoSalvarCartao,
}: {
  globais: FiltrosGlobais;
  aoMudar: (g: FiltrosGlobais) => void;
  opcoes: OpcoesDoDashboard;
  /**
   * Opcional: recebe o cartão que a pessoa montou a partir do "Filtrar com IA"
   * (quando o pedido tinha condições que só cabem num cartão). Sem ele, a
   * barra só explica o que ficou de fora.
   */
  aoSalvarCartao?: (r: ResultadoDoConstrutor) => void;
}) {
  const personalizado = !!(globais.de && globais.ate);
  const [mostrarIntervalo, setMostrarIntervalo] = React.useState(personalizado);
  const [mostrarIa, setMostrarIa] = React.useState(false);
  const janela = janelaDoPainel(globais.dias, globais.de, globais.ate);
  const [rascunho, setRascunho] = React.useState(janela);

  function abrirIntervalo() {
    setRascunho(janela);
    setMostrarIntervalo(true);
  }

  function aplicarIntervalo(de: string, ate: string) {
    setRascunho({ de, ate });
    if (de && ate) aoMudar({ ...globais, de: de <= ate ? de : ate, ate: de <= ate ? ate : de });
  }


  return (
    <div className="glass-card mb-4 flex flex-col gap-3 rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12.5px] text-text-tertiary">Período:</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Período do painel">
          {PERIODOS.map((p) => {
            const ativo = !personalizado && globais.dias === p.dias;
            return (
              <button
                key={p.dias}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => {
                  setMostrarIntervalo(false);
                  aoMudar({ ...globais, dias: p.dias, de: undefined, ate: undefined });
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  ativo ? "bg-ice text-bg-base" : "bg-surface-2 text-text-secondary hover:text-text-primary"
                )}
              >
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={personalizado}
            onClick={abrirIntervalo}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              personalizado ? "bg-ice text-bg-base" : "bg-surface-2 text-text-secondary hover:text-text-primary"
            )}
          >
            <CalendarRange size={13} />
            {personalizado ? `${dataCurta(janela.de)} – ${dataCurta(janela.ate)}` : "Personalizado"}
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarIa((v) => !v)}
            aria-expanded={mostrarIa}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              mostrarIa ? "bg-accent-soft text-accent-400 ring-1 ring-accent-500/40" : "bg-surface-2 text-text-secondary hover:text-text-primary"
            )}
          >
            <Sparkles size={13} /> Filtrar com IA
          </button>
          {opcoes.funis.length > 1 && (
            <SeletorMultiplo
              compacto
              className="w-[220px]"
              rotulo="Filtrar o painel por funil"
              opcoes={opcoes.funis.map((f) => ({ id: f.id, label: f.name }))}
              valores={globais.funis}
              aoMudar={(funis) => aoMudar({ ...globais, funis })}
              placeholder="Todos os funis"
            />
          )}
          <SeletorMultiplo
            compacto
            className="w-[220px]"
            rotulo="Filtrar o painel por responsável"
            opcoes={[{ id: SEM_VALOR, label: "Sem responsável" }, ...opcoes.membros.map((m) => ({ id: m.id, label: m.name }))]}
            valores={globais.donos}
            aoMudar={(donos) => aoMudar({ ...globais, donos })}
            placeholder="Todos os responsáveis"
          />
          {filtrosGlobaisAtivos(globais) && (
            <button
              type="button"
              onClick={() => {
                setMostrarIntervalo(false);
                aoMudar(FILTROS_GLOBAIS_PADRAO);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <FilterX size={13} /> Limpar
            </button>
          )}
        </div>
      </div>

      {mostrarIntervalo && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
          <Input
            type="date"
            aria-label="Período de"
            className="h-9 w-[160px] text-[13px]"
            value={rascunho.de}
            max={rascunho.ate || undefined}
            onChange={(e) => aplicarIntervalo(e.target.value, rascunho.ate)}
          />
          <span className="text-[12px] text-text-tertiary">até</span>
          <Input
            type="date"
            aria-label="Período até"
            className="h-9 w-[160px] text-[13px]"
            value={rascunho.ate}
            min={rascunho.de || undefined}
            onChange={(e) => aplicarIntervalo(rascunho.de, e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {ATALHOS.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  const { de, ate } = a.faixa(diaLocal(new Date()));
                  aplicarIntervalo(de, ate);
                }}
                className="rounded-lg px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mostrarIa && (
        <PainelFiltrarComIa
          globais={globais}
          opcoes={opcoes}
          aoMudar={(g) => {
            // Período que a IA mandou como intervalo abre a linha de datas, como no clique manual.
            setMostrarIntervalo(!!(g.de && g.ate));
            if (g.de && g.ate) setRascunho({ de: g.de, ate: g.ate });
            aoMudar(g);
          }}
          aoFechar={() => setMostrarIa(false)}
          aoSalvarCartao={aoSalvarCartao}
        />
      )}
    </div>
  );
}
