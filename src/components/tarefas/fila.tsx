"use client";

import * as React from "react";
import { ArrowRight, CircleCheck, ExternalLink, MessagesSquare, SkipForward, Undo2, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhoneNumber } from "@/components/ui/phone-number";
import { concluirEProximo, idAtual, iniciarFila, progressoDaFila, pular, voltar, type EstadoDaFila } from "@/lib/tarefas/fila";
import { textoDoPrazo } from "@/lib/tarefas/formato";
import { formatMoney } from "@/lib/design-system/format";
import { cn } from "@/lib/utils";
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
  // Hora em que cada um foi concluído aqui, e o último (que entra com animação).
  const [concluidoEm, setConcluidoEm] = React.useState<Map<string, Date>>(() => new Map());
  const [recente, setRecente] = React.useState<string | null>(null);

  const id = idAtual(fila);
  const idRef = React.useRef(id);
  React.useEffect(() => {
    idRef.current = id;
  });

  const concluir = React.useCallback(() => {
    const atual = idRef.current;
    if (atual) {
      setConcluidoEm((m) => new Map(m).set(atual, new Date()));
      setRecente(atual);
    }
    setFila((f) => concluirEProximo(f));
  }, []);

  const { abrir, dialogo } = useConcluirTarefa(() => {
    concluir();
    onMudou();
  });

  const item = id ? porId.get(id) ?? null : null;
  const { feitos, total } = progressoDaFila(fila);
  const concluidos = new Set(fila.concluidos);
  const pulados = new Set(fila.pulados);

  React.useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector("[role='dialog']")) onSair();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onSair]);

  // A cada troca, o registro aberto (ou o fim da fila) entra na tela.
  const alvo = React.useRef<HTMLLIElement>(null);
  const primeira = React.useRef(true);
  React.useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    alvo.current?.scrollIntoView({ block: "nearest", behavior: suave ? "smooth" : "auto" });
  }, [fila.atual]);

  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-title-sm text-text-primary">{titulo}</h2>
          <p className="text-small text-text-secondary tabular-nums" aria-live="polite">
            {feitos} de {total} feitos{fila.pulados.length ? ` · ${fila.pulados.length} pulado${fila.pulados.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <Button variant="ghost" onClick={onSair}>
          <X size={14} aria-hidden /> Sair da fila
        </Button>
      </header>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ol className="flex min-w-0 flex-col gap-2">
          {fila.ids.map((rid) => {
            const r = porId.get(rid);
            if (!r) return null;
            if (concluidos.has(rid)) return <RegistroConcluido key={rid} item={r} em={concluidoEm.get(rid)} animar={rid === recente} />;
            if (pulados.has(rid)) return <RegistroPulado key={rid} item={r} onVoltar={() => setFila((f) => voltar(f, rid))} />;
            if (rid !== id) return <RegistroProximo key={rid} item={r} agora={agora} />;
            return (
              <li key={rid} ref={alvo} className="scroll-my-4">
                <Panel className="border-border-default">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <IconeDoTipo tipo={r.tipo} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <p className="text-title-sm text-text-primary">{r.titulo}</p>
                        <p className="mt-0.5 text-small text-text-secondary">
                          <Prazo item={r} agora={agora} />
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AcaoRapida
                        tamanho="md"
                        tipo={r.tipo}
                        contato={r.contexto.contato ? { telefone: r.contexto.contato.telefone, email: r.contexto.contato.email, conversaId: r.contexto.conversaId } : null}
                      />
                      {r.tarefa ? (
                        <Button variant="primary" onClick={() => abrir(r.tarefa!)}>
                          <CircleCheck size={14} aria-hidden /> Concluir e próximo
                        </Button>
                      ) : r.fonte !== "proximo_passo" ? (
                        <Button variant="primary" onClick={concluir}>
                          <ArrowRight size={14} aria-hidden /> Feito, próximo
                        </Button>
                      ) : null}
                      <Button variant="ghost" onClick={() => setFila((f) => pular(f))}>
                        <SkipForward size={14} aria-hidden /> Pular
                      </Button>
                      {fila.pulados.length > 0 && (
                        <Button variant="ghost" onClick={() => setFila((f) => voltar(f))}>
                          <Undo2 size={14} aria-hidden /> Voltar
                        </Button>
                      )}
                    </div>
                    {r.fonte === "proximo_passo" && r.contexto.negocio && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-small font-medium text-text-primary">Próximo passo para {r.contexto.negocio.nome}</span>
                        <QuickAdd
                          dealId={r.contexto.negocio.id}
                          placeholder="ex.: whatsapp amanhã 10h"
                          onCriada={() => {
                            concluir();
                            onMudou();
                          }}
                        />
                      </div>
                    )}
                  </div>
                </Panel>
              </li>
            );
          })}
          {!item && (
            <li ref={alvo} className="scroll-my-4">
              <Panel>
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <CircleCheck size={20} aria-hidden className="text-success" />
                  <p className="text-body text-text-primary">
                    Fila terminada · {feitos} concluída{feitos === 1 ? "" : "s"}
                    {fila.pulados.length ? ` · ${fila.pulados.length} pulada${fila.pulados.length === 1 ? "" : "s"}` : ""}
                  </p>
                  <Button variant="secondary" onClick={onSair}>
                    Voltar ao Meu dia
                  </Button>
                </div>
              </Panel>
            </li>
          )}
        </ol>
        {item && (
          <div className="lg:sticky lg:top-4">
            <ContextoDoRegistro item={item} />
          </div>
        )}
      </div>
      {dialogo}
    </section>
  );
}

function Prazo({ item, agora }: { item: ItemDoDiaDaTela; agora: Date }) {
  return (
    <>
      {item.dueAt ? textoDoPrazo(item.dueAt, item.diaTodo, agora) : item.fonte === "responder" ? "Cliente esperando resposta" : "Sem prazo"}
      {item.tarefa?.overdue && <span className="font-medium text-danger"> · atrasada</span>}
    </>
  );
}

function RegistroConcluido({ item, em, animar }: { item: ItemDoDiaDaTela; em?: Date; animar: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-[14px] border border-success/30 bg-success-subtle px-4 py-2.5",
        animar && "motion-safe:animate-[ds-done_var(--dur-slow)_var(--ease-out)]"
      )}
    >
      <CircleCheck
        size={18}
        aria-hidden
        className={cn("shrink-0 text-success", animar && "motion-safe:animate-[ds-check-pop_var(--dur-slow)_var(--ease-out)]")}
      />
      <span className="min-w-0 flex-1 truncate text-small text-text-primary">{item.titulo}</span>
      <span className="shrink-0 text-caption font-medium text-success">
        Concluído{em ? ` às ${em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </span>
    </li>
  );
}

function RegistroPulado({ item, onVoltar }: { item: ItemDoDiaDaTela; onVoltar: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-[14px] border border-border-subtle bg-panel px-4 py-1.5">
      <SkipForward size={16} aria-hidden className="shrink-0 text-text-tertiary" />
      <span className="min-w-0 flex-1 truncate text-small text-text-secondary">{item.titulo}</span>
      <span className="shrink-0 text-caption text-text-tertiary">Pulada</span>
      <Button variant="ghost" size="sm" onClick={onVoltar} aria-label={`Voltar para ${item.titulo}`}>
        <Undo2 size={14} aria-hidden /> Voltar
      </Button>
    </li>
  );
}

function RegistroProximo({ item, agora }: { item: ItemDoDiaDaTela; agora: Date }) {
  return (
    <li className="flex items-center gap-3 rounded-[14px] border border-border-subtle px-4 py-2.5">
      <IconeDoTipo tipo={item.tipo} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-small text-text-primary">{item.titulo}</span>
      <span className="shrink-0 text-caption text-text-tertiary">
        <Prazo item={item} agora={agora} />
      </span>
    </li>
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
