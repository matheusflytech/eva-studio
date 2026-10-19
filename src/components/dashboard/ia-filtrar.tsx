"use client";

import * as React from "react";
import { LayoutGrid, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConstrutorDeConsulta, type ResultadoDoConstrutor } from "@/components/dashboard/construtor-de-consulta";
import { CampoDePedido, EntendiAssim, pedirParaEva, type SugestaoDaIa } from "@/components/dashboard/ia-pergunte-a-eva";
import type { OpcoesDoDashboard } from "@/components/dashboard/opcoes";
import type { FiltrosGlobais } from "@/lib/consulta";

// ---------------------------------------------------------------------------
// "Filtrar com IA" na barra do painel. A frase vira período, funis e
// responsáveis — o que a barra sabe aplicar. O que só cabe num cartão (valor,
// etapa, campo personalizado, "por mês"...) aparece como sugestão de montar um
// cartão, que abre o montador já preenchido.
// ---------------------------------------------------------------------------

export const EXEMPLOS_DE_FILTRO = ["Mês passado no funil B2B", "Últimos 90 dias só dos negócios sem responsável", "Este ano"];

export function PainelFiltrarComIa({
  globais,
  opcoes,
  aoMudar,
  aoFechar,
  aoSalvarCartao,
}: {
  globais: FiltrosGlobais;
  opcoes: OpcoesDoDashboard;
  aoMudar: (g: FiltrosGlobais) => void;
  aoFechar: () => void;
  /** Sem ele, as sobras só são explicadas (não há botão para montar o cartão). */
  aoSalvarCartao?: (r: ResultadoDoConstrutor) => void;
}) {
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [resposta, setResposta] = React.useState<{ explicacao: string; avisos: string[]; sobras: string[]; cartao: SugestaoDaIa | null } | null>(null);
  const [anterior, setAnterior] = React.useState<FiltrosGlobais | null>(null);
  const [montando, setMontando] = React.useState<SugestaoDaIa | null>(null);

  async function enviar(pedido: string) {
    setCarregando(true);
    setErro(null);
    const r = await pedirParaEva("globais", pedido, { globaisAtuais: globais });
    setCarregando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    const d = r.dados;
    setAnterior(globais);
    aoMudar(d.globais);
    setResposta({
      explicacao: d.explicacao,
      avisos: d.avisos,
      sobras: d.sobras,
      cartao: d.cartao ? { ...d.cartao, explicacao: d.explicacao, avisos: d.avisos } : null,
    });
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-border-subtle pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] text-text-secondary">Me diz que recorte você quer ver no painel.</p>
        <div className="flex items-center gap-1">
          {anterior && (
            <button
              type="button"
              onClick={() => {
                aoMudar(anterior);
                setAnterior(null);
                setResposta(null);
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <Undo2 size={13} /> Desfazer
            </button>
          )}
          <button type="button" onClick={aoFechar} aria-label="Fechar filtro com IA" className="rounded-lg p-1 text-text-tertiary hover:text-text-primary">
            <X size={15} />
          </button>
        </div>
      </div>

      <CampoDePedido
        id="painel-ia"
        placeholder="Ex.: mês passado no funil B2B"
        exemplos={EXEMPLOS_DE_FILTRO}
        carregando={carregando}
        aoEnviar={enviar}
        autoFocus
      />

      {erro && (
        <p className="text-[12.5px] text-danger" role="alert">
          {erro}
        </p>
      )}

      {!erro && resposta && (
        <>
          <EntendiAssim explicacao={resposta.explicacao} avisos={resposta.avisos} />
          {resposta.sobras.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
              <p className="text-[12.5px] leading-relaxed text-text-secondary">
                O painel filtra só por período, funil e responsável. Isto aqui só cabe num cartão:{" "}
                <span className="text-text-primary">{resposta.sobras.join("; ")}</span>.
              </p>
              {aoSalvarCartao && resposta.cartao && (
                <Button size="sm" variant="secondary" onClick={() => setMontando(resposta.cartao)}>
                  <LayoutGrid size={13} /> Montar um cartão com isso
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {montando && aoSalvarCartao && (
        <ConstrutorDeConsulta
          globais={globais}
          opcoes={opcoes}
          sugestaoDaIa={montando}
          aoSalvar={(r) => {
            setMontando(null);
            aoSalvarCartao(r);
          }}
          aoFechar={() => setMontando(null)}
        />
      )}
    </div>
  );
}
