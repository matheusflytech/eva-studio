"use client";

import * as React from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import {
  ACOES_DO_CARTAO,
  MAX_CAMPOS_NA_PREVIA,
  MAX_CAMPOS_NO_CARTAO,
  ROTULO_DA_ACAO,
  ROTULO_DA_SECAO,
  SECOES_DO_PAINEL,
  type LayoutDoCartao,
} from "@/lib/cartao-layout";
import { ListaDeCampos, negocioDeExemplo } from "@/components/crm/config/cartao-editor";
import { ListaFixa } from "@/components/crm/config/lista-fixa";
import { camposDisponiveis, rotulosPersonalizados } from "./cartao";
import { DealCard } from "./deal-card";

// "Personalizar card / painel" (quadro v4): cada pessoa escolhe o que vê,
// partindo do layout do funil. Salva em /api/pipelines/[id]/cartao/meu; "Voltar
// ao padrão do funil" apaga a escolha. As animações não se configuram.

export type AbaDaPersonalizacao = "card" | "painel";

interface Resposta {
  layout: LayoutDoCartao;
  proprio: boolean;
  disponivel: boolean;
  doFunil: LayoutDoCartao;
}

export function PersonalizarQuadro({
  pipelineId,
  aba: abaInicial,
  defs,
  agora,
  onFechar,
  onSalvo,
}: {
  pipelineId: string;
  aba: AbaDaPersonalizacao;
  defs: DefinicaoDeCampo[];
  agora: Date;
  onFechar: () => void;
  /** O layout que vale agora (o novo, ou o do funil depois de voltar ao padrão). */
  onSalvo: (layout: LayoutDoCartao) => void;
}) {
  const toast = useToast();
  const [aba, setAba] = React.useState<AbaDaPersonalizacao>(abaInicial);
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [rascunho, setRascunho] = React.useState<LayoutDoCartao | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState<"salvar" | "padrao" | null>(null);
  const disponiveis = React.useMemo(() => camposDisponiveis(defs), [defs]);
  const rotulos = React.useMemo(() => rotulosPersonalizados(defs), [defs]);
  const exemplo = React.useMemo(() => negocioDeExemplo(defs, agora), [defs, agora]);

  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/pipelines/${pipelineId}/cartao/meu`)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok || !d) return setErro(d?.error ?? "Não foi possível carregar a sua personalização.");
        setDados(d);
        setRascunho(d.layout);
      })
      .catch(() => vivo && setErro("Sem conexão. Tente de novo."));
    return () => {
      vivo = false;
    };
  }, [pipelineId]);

  const mudar = (parcial: Partial<LayoutDoCartao>) => setRascunho((r) => (r ? { ...r, ...parcial } : r));
  const podeSalvar = !!dados?.disponivel && !!rascunho && !salvando;

  async function salvar() {
    if (!rascunho) return;
    setSalvando("salvar");
    setErro(null);
    const r = await fetch(`/api/pipelines/${pipelineId}/cartao/meu`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rascunho),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    setSalvando(null);
    if (!r?.ok) return setErro(d?.error ?? "Não foi possível salvar.");
    toast({ title: "Personalização salva", tone: "success" });
    onSalvo(d.layout);
    onFechar();
  }

  async function voltarAoPadrao() {
    if (!dados) return;
    setSalvando("padrao");
    setErro(null);
    const r = await fetch(`/api/pipelines/${pipelineId}/cartao/meu`, { method: "DELETE" }).catch(() => null);
    setSalvando(null);
    if (!r?.ok) return setErro("Não foi possível voltar ao padrão.");
    toast({ title: "Voltou ao padrão do funil" });
    onSalvo(dados.doFunil);
    onFechar();
  }

  return (
    <Drawer open onOpenChange={(v) => !v && onFechar()}>
      <DrawerContent
        size="md"
        title={aba === "card" ? "Personalizar card" : "Personalizar painel"}
        description="Só para você, neste funil. Quem configura o funil define o padrão de todos."
        footer={
          <>
            {dados?.proprio && (
              <Button variant="ghost" className="mr-auto" onClick={voltarAoPadrao} disabled={!!salvando}>
                {salvando === "padrao" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RotateCcw size={14} aria-hidden />} Voltar ao padrão do funil
              </Button>
            )}
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={!podeSalvar} loading={salvando === "salvar"}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <SegmentedControl
            label="O que personalizar"
            value={aba}
            onChange={setAba}
            options={[
              { value: "card", label: "Card" },
              { value: "painel", label: "Painel" },
            ]}
            className="self-start"
          />
          {erro && <Notice tone="danger">{erro}</Notice>}
          {dados && !dados.disponivel && (
            <Notice tone="warning">A personalização por pessoa ainda não foi ativada neste contrato. Por enquanto vale o padrão do funil.</Notice>
          )}
          {!rascunho ? (
            !erro && (
              <p className="inline-flex items-center gap-2 text-small text-text-tertiary">
                <Loader2 size={14} className="animate-spin" aria-hidden /> Carregando…
              </p>
            )
          ) : aba === "card" ? (
            <>
              <div className="rounded-[20px] bg-raised p-4">
                <p className="mb-2 text-caption font-medium text-text-tertiary">Prévia</p>
                <div className="mx-auto max-w-[17rem]">
                  <DealCard deal={exemplo} tipoDaEtapa="open" nomeDaEtapa="Proposta" defs={defs} agora={agora} layout={rascunho} />
                </div>
              </div>
              <ListaDeCampos
                id="pessoa-campos"
                titulo="Informações no card"
                descricao="O contato fica em cima; o resto aparece em pares de rótulo e valor, nesta ordem."
                itens={rascunho.campos}
                max={MAX_CAMPOS_NO_CARTAO}
                disponiveis={disponiveis}
                rotulos={rotulos}
                podeEditar={!!dados?.disponivel}
                onChange={(campos) => mudar({ campos })}
              />
              <ListaFixa
                titulo="Ações no rodapé"
                descricao="WhatsApp só aparece com conversa e Ligar só com telefone."
                todas={ACOES_DO_CARTAO}
                rotulo={(a) => ROTULO_DA_ACAO[a]}
                escolhidas={rascunho.acoes}
                podeEditar={!!dados?.disponivel}
                onChange={(acoes) => mudar({ acoes })}
              />
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-panel/70 p-4 ring-1 ring-border-subtle">
                <div>
                  <p className="text-body font-semibold text-text-primary">Densidade</p>
                  <p className="text-small text-text-tertiary">Compacto põe rótulo e valor na mesma linha.</p>
                </div>
                <SegmentedControl
                  label="Densidade do card"
                  value={rascunho.densidade}
                  onChange={(densidade) => mudar({ densidade })}
                  options={[
                    { value: "confortavel", label: "Confortável" },
                    { value: "compacto", label: "Compacto" },
                  ]}
                />
              </div>
            </>
          ) : (
            <>
              <ListaFixa
                titulo="Seções do painel"
                descricao="Ligue, desligue e arraste para mudar a ordem."
                todas={SECOES_DO_PAINEL}
                rotulo={(s) => ROTULO_DA_SECAO[s]}
                escolhidas={rascunho.secoes}
                minimo={1}
                podeEditar={!!dados?.disponivel}
                onChange={(secoes) => mudar({ secoes })}
              />
              <ListaDeCampos
                id="pessoa-detalhes"
                titulo="Campos em Detalhes"
                descricao="O que aparece na seção Detalhes do painel, nesta ordem."
                itens={rascunho.previa}
                max={MAX_CAMPOS_NA_PREVIA}
                disponiveis={disponiveis}
                rotulos={rotulos}
                podeEditar={!!dados?.disponivel}
                onChange={(previa) => mudar({ previa })}
              />
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
