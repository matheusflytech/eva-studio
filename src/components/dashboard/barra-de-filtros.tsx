"use client";

import * as React from "react";
import { FilterX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SeletorMultiplo } from "@/components/dashboard/seletor-multiplo";
import type { OpcoesDoDashboard } from "@/components/dashboard/opcoes";
import { FILTROS_GLOBAIS_PADRAO, SEM_VALOR, diaLocal, janelaDoPainel, somarDias, type FiltrosGlobais } from "@/lib/consulta";
import { cn } from "@/lib/utils";
import { focusRing } from "@/components/ui/styles";

// ---------------------------------------------------------------------------
// Filtros do painel: período, funis e responsável valem pra todos os cartões
// de uma vez. O estado mora na URL (?from=&to=&pipelines=&owners=), então "olha o
// painel do funil B2B do mês passado" vira um link que se manda no chat. Não
// é salvo no layout: o painel é compartilhado, o recorte é de quem está olhando.
//
// v5: os períodos mais usados ficam em cápsula na barra da tela
// (SeletorDePeriodo); o resto (6 meses, intervalo, funis, responsáveis) mora
// no painel que o botão "Filtros" abre (PainelDeFiltros).
// ---------------------------------------------------------------------------

export const PERIODOS = [
  { label: "Hoje", dias: 1 },
  { label: "7 dias", dias: 7 },
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
  { label: "6 meses", dias: 180 },
  { label: "12 meses", dias: 365 },
];

/** Os que aparecem na barra; os outros ficam em Filtros. */
const NA_BARRA = [1, 7, 30, 90, 365];

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

/** Contador do botão "Filtros": o que está ligado e não aparece na barra. */
export function contarFiltros(g: FiltrosGlobais): number {
  const foraDaBarra = !!(g.de && g.ate) || !NA_BARRA.includes(g.dias);
  return (foraDaBarra ? 1 : 0) + (g.funis.length ? 1 : 0) + (g.donos.length ? 1 : 0);
}

/** "23/09 a 22/10" (o ano só aparece quando não é o atual). */
export function periodoCurto(globais: FiltrosGlobais, periodo?: { de: string; ate: string }): string {
  const j = periodo ?? janelaDoPainel(globais.dias, globais.de, globais.ate);
  const ano = diaLocal(new Date()).slice(0, 4);
  const curta = (dia: string) => {
    const [a, m, d] = dia.split("-");
    return a === ano ? `${d}/${m}` : `${d}/${m}/${a.slice(2)}`;
  };
  return j.de === j.ate ? curta(j.de) : `${curta(j.de)} a ${curta(j.ate)}`;
}

/**
 * Cápsulas de período na barra. Período que não está na cápsula (6 meses ou
 * intervalo) aparece como mais uma cápsula ativa, para não sumir da vista.
 */
export function SeletorDePeriodo({
  globais,
  aoMudar,
  aoPersonalizar,
  className,
}: {
  globais: FiltrosGlobais;
  aoMudar: (g: FiltrosGlobais) => void;
  /** Clique na cápsula do período fora da barra: abre os filtros. */
  aoPersonalizar: () => void;
  className?: string;
}) {
  const personalizado = !!(globais.de && globais.ate);
  const atual = personalizado ? "intervalo" : String(globais.dias);
  const opcoes = PERIODOS.filter((p) => NA_BARRA.includes(p.dias)).map((p) => ({ value: String(p.dias), label: p.label }));
  if (personalizado) {
    const j = janelaDoPainel(globais.dias, globais.de, globais.ate);
    opcoes.push({ value: "intervalo", label: `${dataCurta(j.de)} – ${dataCurta(j.ate)}` });
  } else if (!NA_BARRA.includes(globais.dias)) {
    opcoes.push({ value: atual, label: PERIODOS.find((p) => p.dias === globais.dias)?.label ?? `${globais.dias} dias` });
  }
  return (
    // O trilho rola dentro de si no celular, sem empurrar a página.
    <div className={cn("max-w-full overflow-x-auto [scrollbar-width:none]", className)}>
      <SegmentedControl
        label="Período do painel"
        value={atual}
        onChange={(v) => {
          if (v === "intervalo" || !NA_BARRA.includes(Number(v))) {
            aoPersonalizar();
            return;
          }
          aoMudar({ ...globais, dias: Number(v), de: undefined, ate: undefined });
        }}
        options={opcoes}
        className="shrink-0"
      />
    </div>
  );
}

/** Pílula de escolha única dentro do painel de filtros. */
function Pilula({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-small transition-colors",
        ativo ? "bg-inverse font-medium text-inverse-fg" : "border border-border-subtle bg-raised text-text-secondary hover:text-text-primary",
        focusRing
      )}
    >
      {children}
    </button>
  );
}

/** O que o botão "Filtros" abre: período completo, intervalo, funis e responsáveis. */
export function PainelDeFiltros({
  globais,
  aoMudar,
  opcoes,
}: {
  globais: FiltrosGlobais;
  aoMudar: (g: FiltrosGlobais) => void;
  opcoes: OpcoesDoDashboard;
}) {
  const personalizado = !!(globais.de && globais.ate);
  const [mostrarIntervalo, setMostrarIntervalo] = React.useState(personalizado);
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-caption text-text-tertiary">Período</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Período do painel">
          {PERIODOS.map((p) => (
            <Pilula
              key={p.dias}
              ativo={!personalizado && globais.dias === p.dias}
              onClick={() => {
                setMostrarIntervalo(false);
                aoMudar({ ...globais, dias: p.dias, de: undefined, ate: undefined });
              }}
            >
              {p.label}
            </Pilula>
          ))}
          <Pilula ativo={personalizado || mostrarIntervalo} onClick={abrirIntervalo}>
            {personalizado ? `${dataCurta(janela.de)} – ${dataCurta(janela.ate)}` : "Personalizado"}
          </Pilula>
        </div>
        {mostrarIntervalo && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              aria-label="Período de"
              className="w-[160px]"
              value={rascunho.de}
              max={rascunho.ate || undefined}
              onChange={(e) => aplicarIntervalo(e.target.value, rascunho.ate)}
            />
            <span className="text-small text-text-tertiary">até</span>
            <Input
              type="date"
              aria-label="Período até"
              className="w-[160px]"
              value={rascunho.ate}
              min={rascunho.de || undefined}
              onChange={(e) => aplicarIntervalo(rascunho.de, e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {ATALHOS.map((a) => (
                <Button
                  key={a.label}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const { de, ate } = a.faixa(diaLocal(new Date()));
                    aplicarIntervalo(de, ate);
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {opcoes.funis.length > 1 && (
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-mono text-caption text-text-tertiary">Funis</span>
            <SeletorMultiplo
              compacto
              rotulo="Filtrar o painel por funil"
              opcoes={opcoes.funis.map((f) => ({ id: f.id, label: f.name }))}
              valores={globais.funis}
              aoMudar={(funis) => aoMudar({ ...globais, funis })}
              placeholder="Todos os funis"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <span className="font-mono text-caption text-text-tertiary">Responsáveis</span>
          <SeletorMultiplo
            compacto
            rotulo="Filtrar o painel por responsável"
            opcoes={[{ id: SEM_VALOR, label: "Sem responsável" }, ...opcoes.membros.map((m) => ({ id: m.id, label: m.name }))]}
            valores={globais.donos}
            aoMudar={(donos) => aoMudar({ ...globais, donos })}
            placeholder="Todos os responsáveis"
          />
        </div>
      </div>

      {filtrosGlobaisAtivos(globais) && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            setMostrarIntervalo(false);
            aoMudar(FILTROS_GLOBAIS_PADRAO);
          }}
        >
          <FilterX size={14} aria-hidden="true" /> Limpar filtros
        </Button>
      )}
    </div>
  );
}
