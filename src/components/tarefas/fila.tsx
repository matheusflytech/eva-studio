"use client";

import * as React from "react";
import { ArrowRight, CircleCheck, ExternalLink, MessagesSquare, SkipForward, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhoneNumber } from "@/components/ui/phone-number";
import { concluirEProximo, idAtual, iniciarFila, progressoDaFila, pular, type EstadoDaFila } from "@/lib/tarefas/fila";
import { textoDoPrazo } from "@/lib/tarefas/formato";
import { formatMoney } from "@/lib/design-system/format";
import type { ItemDoDiaDaTela } from "@/lib/tarefas/tela";
import { AcaoRapida, IconeDoTipo } from "./pecas";
import { useConcluirTarefa } from "./concluir";
import { QuickAdd } from "./quick-add";

// Modo fila: um registro por vez,
// com a ação de 1 clique, o contexto do negócio/contato ao lado e "Concluir e
// próximo" (o diálogo de conclusão de sempre; ao concluir, avança).
// Itens sintéticos: "Responder" e "Primeiro contato" avançam com "Feito,
// próximo"; "Definir próximo passo" agenda uma tarefa no negócio e avança.

export function FilaDeTrabalho({
  titulo,
  itens,
  onSair,
  onMudou,
}: {
  titulo: string;
  itens: ItemDoDiaDaTela[];
  onSair: () => void;
  onMudou: () => void;
}) {
  // A fila é uma foto da lista no momento em que começou (recarregar o Meu
  // dia não embaralha a ordem no meio do trabalho).
  const [porId] = React.useState(() => new Map(itens.map((i) => [i.id, i])));
  const [fila, setFila] = React.useState<EstadoDaFila>(() => iniciarFila(itens.map((i) => i.id)));
  const [agora] = React.useState(() => new Date());
  const { abrir, dialogo } = useConcluirTarefa(() => {
    setFila((f) => concluirEProximo(f));
    onMudou();
  });

  const id = idAtual(fila);
  const item = id ? porId.get(id) ?? null : null;
  const { feitos, total } = progressoDaFila(fila);

  React.useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector("[role='dialog']")) onSair();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onSair]);

  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-title-sm text-text-primary">{titulo}</h2>
          <p className="text-small text-text-secondary tabular-nums">
            {feitos} de {total} feitos{fila.pulados.length ? ` · ${fila.pulados.length} pulado${fila.pulados.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <Button variant="ghost" onClick={onSair}>
          <X size={14} aria-hidden /> Sair da fila
        </Button>
      </header>

      {!item ? (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CircleCheck size={20} aria-hidden className="text-success" />
            <p className="text-body text-text-primary">Fila terminada.</p>
            <Button variant="secondary" onClick={onSair}>
              Voltar ao Meu dia
            </Button>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <IconeDoTipo tipo={item.tipo} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="text-title-sm text-text-primary">{item.titulo}</p>
                  <p className="mt-0.5 text-small text-text-secondary">
                    {item.dueAt ? textoDoPrazo(item.dueAt, item.diaTodo, agora) : item.fonte === "responder" ? "Cliente esperando resposta" : "Sem prazo"}
                    {item.tarefa?.overdue && <span className="font-medium text-danger"> · atrasada</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AcaoRapida
                  tamanho="md"
                  tipo={item.tipo}
                  contato={item.contexto.contato ? { telefone: item.contexto.contato.telefone, email: item.contexto.contato.email, conversaId: item.contexto.conversaId } : null}
                />
                {item.tarefa ? (
                  <Button variant="primary" onClick={() => abrir(item.tarefa!)}>
                    <CircleCheck size={14} aria-hidden /> Concluir e próximo
                  </Button>
                ) : item.fonte !== "proximo_passo" ? (
                  <Button variant="primary" onClick={() => setFila((f) => concluirEProximo(f))}>
                    <ArrowRight size={14} aria-hidden /> Feito, próximo
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => setFila((f) => pular(f))}>
                  <SkipForward size={14} aria-hidden /> Pular
                </Button>
              </div>
              {item.fonte === "proximo_passo" && item.contexto.negocio && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-small font-medium text-text-primary">Próximo passo para {item.contexto.negocio.nome}</span>
                  <QuickAdd
                    dealId={item.contexto.negocio.id}
                    placeholder="ex.: whatsapp amanhã 10h"
                    onCriada={() => {
                      setFila((f) => concluirEProximo(f));
                      onMudou();
                    }}
                  />
                </div>
              )}
            </div>
          </Panel>
          <ContextoDoRegistro item={item} />
        </div>
      )}
      {dialogo}
    </section>
  );
}

function ContextoDoRegistro({ item }: { item: ItemDoDiaDaTela }) {
  const { contato, negocio, conversaId, ultimaMensagem } = item.contexto;
  return (
    <Panel title="Contexto" as="section" aria-label="Contexto do registro">
      <dl className="flex flex-col gap-3 text-small">
        {negocio && (
          <div>
            <dt className="text-caption text-text-tertiary">Negócio</dt>
            <dd className="mt-0.5 flex flex-col gap-0.5">
              <Link href={`/deals/${negocio.id}`} className="inline-flex items-center gap-1 font-medium text-text-primary hover:text-accent-fg hover:underline">
                {negocio.nome} <ExternalLink size={12} aria-hidden />
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-text-secondary">
                {negocio.etapa && <Badge variant="neutral">{negocio.etapa}</Badge>}
                <span className="tabular-nums">{formatMoney(negocio.valorCents / 100)}</span>
                {negocio.previsao && <span>previsão {negocio.previsao.slice(0, 10).split("-").reverse().join("/")}</span>}
              </span>
            </dd>
          </div>
        )}
        {contato && (
          <div>
            <dt className="text-caption text-text-tertiary">Contato</dt>
            <dd className="mt-0.5 flex flex-col gap-0.5">
              <Link href={`/contacts?open=${contato.id}`} className="font-medium text-text-primary hover:text-accent-fg hover:underline">
                {contato.nome || "Sem nome"}
              </Link>
              {contato.telefone && <PhoneNumber value={contato.telefone} whatsapp />}
              {contato.email && <span className="truncate text-text-secondary">{contato.email}</span>}
            </dd>
          </div>
        )}
        {ultimaMensagem && (
          <div>
            <dt className="text-caption text-text-tertiary">Última mensagem do cliente</dt>
            <dd className="mt-0.5 line-clamp-4 text-text-primary">{ultimaMensagem.texto || "(mídia)"}</dd>
          </div>
        )}
        {conversaId && (
          <div>
            <Link href={`/conversations?c=${conversaId}`} className="inline-flex items-center gap-1 text-accent-fg hover:underline">
              <MessagesSquare size={14} aria-hidden /> Abrir conversa
            </Link>
          </div>
        )}
        {!negocio && !contato && <p className="text-text-secondary">Sem negócio ou contato ligado.</p>}
      </dl>
    </Panel>
  );
}
