"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { RotateCcw, Clock, Zap, Tag as TagIcon } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { MarcaEva } from "@/components/layout/marca-eva";
import type { MessageTemplate } from "@/lib/data/templates";

// ---------------------------------------------------------------------------
// "Criar com IA" das Sequências: a pessoa descreve a régua, a IA devolve um
// rascunho já validado no servidor e a tela mostra como linha do tempo.
// "Usar este rascunho" só carrega no editor; quem salva é o botão Salvar.
// ---------------------------------------------------------------------------

export interface RascunhoSequencia {
  name: string;
  channel: string;
  trigger: string;
  triggerTagId: string | null;
  triggerSegmentId: string | null;
  triggerStageId: string | null;
  triggerStageDays: number;
  stopOnReply: boolean;
  allowReentry: boolean;
  steps: { order: number; delayMinutes: number; text: string; templateId: string | null; applyTagId: string | null }[];
}

interface Catalogo {
  tags: { id: string; name: string }[];
  segments: { id: string; name: string }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  templates: MessageTemplate[];
}

const CANAL: Record<string, string> = {
  whatsapp_meta: "WhatsApp oficial",
  whatsapp_qr: "WhatsApp (QR)",
  telegram: "Telegram",
  instagram: "Instagram",
};

const EXEMPLOS = [
  "Quando o negócio entrar em Proposta no funil B2B, mandar WhatsApp lembrando da proposta em 2 dias e, se não responder, outro em 5 dias.",
  "Quem receber a etiqueta Orçamento pedido ganha uma mensagem em 1 hora, outra no dia seguinte e uma última em 3 dias.",
  "Negócio parado há 7 dias em Negociação recebe uma mensagem perguntando se ainda faz sentido conversar.",
];

/** "2 dias", "3 horas", "15 minutos": como a pessoa fala. */
export function tempoHumano(min: number): string {
  if (min <= 0) return "na hora";
  if (min % 1440 === 0) return `${min / 1440} dia${min === 1440 ? "" : "s"}`;
  if (min % 60 === 0) return `${min / 60} hora${min === 60 ? "" : "s"}`;
  if (min > 1440) return `${(min / 1440).toFixed(1).replace(".", ",")} dias`;
  return `${min} minuto${min === 1 ? "" : "s"}`;
}

function descreverGatilho(r: RascunhoSequencia, cat: Catalogo): string {
  if (r.trigger === "tag") {
    const t = cat.tags.find((x) => x.id === r.triggerTagId);
    return `Quando o contato receber a etiqueta “${t?.name ?? "?"}”`;
  }
  if (r.trigger === "segment") {
    const s = cat.segments.find((x) => x.id === r.triggerSegmentId);
    return `Quando o contato entrar no segmento “${s?.name ?? "?"}”`;
  }
  if (r.trigger === "stage") {
    const p = cat.pipelines.find((x) => x.stages.some((s) => s.id === r.triggerStageId));
    const s = p?.stages.find((x) => x.id === r.triggerStageId);
    const quando = r.triggerStageDays > 0 ? `estiver parado há ${r.triggerStageDays} dia${r.triggerStageDays === 1 ? "" : "s"} em` : "entrar em";
    return `Quando o negócio ${quando} “${s?.name ?? "?"}”${p ? ` no funil ${p.name}` : ""}`;
  }
  return "Só quando alguém inscrever o contato à mão";
}

export function AssistenteIaSequencia({
  agentId,
  catalogo,
  atual,
  onUsar,
  onClose,
}: {
  agentId: string;
  catalogo: Catalogo;
  /** Régua que está no editor; com ela, o primeiro pedido já é um ajuste. */
  atual?: RascunhoSequencia | null;
  onUsar: (r: RascunhoSequencia) => void;
  onClose: () => void;
}) {
  const [pedido, setPedido] = React.useState("");
  const [ajuste, setAjuste] = React.useState("");
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<{ msg: string; semChave: boolean } | null>(null);
  const [resultado, setResultado] = React.useState<{ sequencia: RascunhoSequencia; explicacao: string; avisos: string[] } | null>(null);

  async function gerar(texto: string, base?: RascunhoSequencia | null) {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/sequences/ia/rascunho`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido: texto, ...(base ? { atual: base } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro({ msg: data.error ?? "Não deu para montar o rascunho agora.", semChave: data.codigo === "sem_chave" });
        return;
      }
      setResultado({ sequencia: data.sequencia, explicacao: data.explicacao ?? "", avisos: data.avisos ?? [] });
      setAjuste("");
    } catch {
      setErro({ msg: "Sem conexão com o servidor. Tenta de novo.", semChave: false });
    } finally {
      setCarregando(false);
    }
  }

  const r = resultado?.sequencia;
  // Tempo desde a entrada até cada passo (a espera é relativa ao anterior).
  const acumulados = (r?.steps ?? []).map((_, i, arr) => arr.slice(0, i + 1).reduce((t, s) => t + s.delayMinutes, 0));

  return (
    <Modal open onOpenChange={(o) => !o && !carregando && onClose()}>
      <ModalContent
        size="lg"
        title={atual ? "Ajustar régua com IA" : "Criar régua com IA"}
        description="Descreve com suas palavras. A Eva monta um rascunho e nada é salvo até você clicar em Salvar no editor."
        footer={
          !r ? (
            <>
              <Button variant="ghost" onClick={onClose} disabled={carregando}>Cancelar</Button>
              <Button variant="primary" onClick={() => gerar(pedido.trim(), atual)} disabled={carregando || pedido.trim().length < 5} loading={carregando}>
                {!carregando && <MarcaEva size={14} className="shrink-0" />}
                {carregando ? "Montando o rascunho..." : "Montar rascunho"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="mr-auto" onClick={() => setResultado(null)} disabled={carregando}>
                <RotateCcw size={14} aria-hidden="true" /> Começar de novo
              </Button>
              <Button variant="primary" onClick={() => onUsar(r)} disabled={carregando}>
                Usar este rascunho
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-4">
          {!r ? (
            <>
              <div>
                <Label htmlFor="ia-seq-pedido">
                  {atual ? "O que você quer mudar nessa régua?" : "Me conta o que essa régua deve fazer"}
                </Label>
                <Textarea
                  id="ia-seq-pedido"
                  rows={4}
                  maxLength={800}
                  value={pedido}
                  onChange={(e) => setPedido(e.target.value)}
                  placeholder={
                    atual
                      ? "Ex.: acrescenta um terceiro lembrete em 10 dias, mais curto."
                      : "Ex.: quem pediu orçamento e não respondeu recebe uma lembrança em 1 dia e outra em 3."
                  }
                />
                <p className="mt-1 text-right font-mono text-caption tabular-nums text-text-tertiary">{pedido.length}/800</p>
              </div>
              {!atual && (
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-caption text-text-tertiary">Ou comece por um exemplo</span>
                  {EXEMPLOS.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setPedido(ex)}
                      className="rounded-[14px] border border-border-subtle bg-raised px-3 py-2 text-left text-small text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <h3 className="text-title-sm font-semibold tracking-tight text-text-primary">{r.name}</h3>
                <p className="text-small text-text-tertiary">
                  {CANAL[r.channel] ?? r.channel}
                  {r.stopOnReply ? " · sai da régua quando responder" : " · continua mesmo se responder"}
                  {r.allowReentry ? " · pode entrar de novo" : ""}
                </p>
              </div>

              {resultado.explicacao && (
                <div className="flex gap-2.5 rounded-[14px] bg-raised px-4 py-3 text-small text-text-primary">
                  <MarcaEva size={14} className="shrink-0 mt-0.5 text-accent-fg" />
                  <span>
                    <span className="block font-mono text-caption text-text-tertiary">Eva</span>
                    {resultado.explicacao}
                  </span>
                </div>
              )}

              <ol className="relative flex flex-col gap-3 border-l border-border-subtle pl-5">
                <li className="relative">
                  <span className="absolute -left-[29px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent-solid text-text-on-accent">
                    <Zap size={10} />
                  </span>
                  <p className="text-small font-medium text-text-primary">{descreverGatilho(r, catalogo)}</p>
                  <p className="text-caption text-text-tertiary">o contato entra na régua</p>
                </li>
                {r.steps.map((s, i) => {
                  const modelo = catalogo.templates.find((t) => t.id === s.templateId);
                  const tag = catalogo.tags.find((t) => t.id === s.applyTagId);
                  return (
                    <li key={s.order} className="relative">
                      <span className="absolute -left-[29px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-hover font-mono text-caption text-text-secondary">
                        {s.order}
                      </span>
                      <p className="flex items-center gap-1.5 text-caption text-text-tertiary">
                        <Clock size={11} />
                        {s.order === 1 ? `Espera ${tempoHumano(s.delayMinutes)}` : `Mais ${tempoHumano(s.delayMinutes)} depois`}
                        {s.order > 1 && ` (${tempoHumano(acumulados[i])} desde a entrada)`}
                      </p>
                      <div className="mt-1 rounded-[14px] bg-raised px-3.5 py-2.5 text-small text-text-primary">{s.text}</div>
                      {(modelo || tag) && (
                        <p className="mt-1 flex flex-wrap gap-3 text-caption text-text-tertiary">
                          {modelo && <span>Fora da janela usa o modelo “{modelo.name}”</span>}
                          {tag && (
                            <span className="flex items-center gap-1">
                              <TagIcon size={11} /> etiqueta “{tag.name}” ao entregar
                            </span>
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>

              {resultado.avisos.length > 0 && (
                <Notice tone="warning">
                  <span className="block font-medium">Vale conferir</span>
                  {resultado.avisos.map((a) => (
                    <span key={a} className="block">{a}</span>
                  ))}
                </Notice>
              )}

              <div>
                <Label htmlFor="ia-seq-ajuste">Quer mudar alguma coisa?</Label>
                <div className="flex gap-2">
                  <Textarea
                    id="ia-seq-ajuste"
                    rows={2}
                    maxLength={800}
                    value={ajuste}
                    onChange={(e) => setAjuste(e.target.value)}
                    placeholder="Ex.: o segundo lembrete vai em 3 dias e mais curtinho."
                  />
                  <Button
                    variant="secondary"
                    className="self-end"
                    disabled={carregando || ajuste.trim().length < 5}
                    loading={carregando}
                    onClick={() => gerar(ajuste.trim(), r)}
                  >
                    {!carregando && <MarcaEva size={14} className="shrink-0" />} Ajustar
                  </Button>
                </div>
              </div>
            </>
          )}

          {erro && (
            <Notice tone="danger">
              {erro.msg}
              {erro.semChave && (
                <Link href="/integrations" className="ml-1 font-medium underline">
                  Abrir Integrações
                </Link>
              )}
            </Notice>
          )}
        </div>

      </ModalContent>
    </Modal>
  );
}
