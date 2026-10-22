"use client";

import * as React from "react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { paraCampoSaoPaulo } from "@/lib/fuso-sp";
import { sugerirProximoPasso } from "@/lib/tarefas/conclusao";
import {
  INFO_DO_TIPO,
  RESULTADOS,
  ROTULO_DO_RESULTADO,
  TIPOS_DE_TAREFA,
  tipoParaExibir,
  type DecisaoDoProximoPasso,
  type ResultadoDaTarefa,
  type TipoDeTarefa,
} from "@/lib/tarefas/tipos";

// ---------------------------------------------------------------------------
// Diálogo de conclusão (skill crm-tasks-agenda): resultado + nota opcional +
// "Agendar próxima atividade?" já preenchido. Só conclui depois de escolher
// entre agendar e "Sem próximo passo" — o servidor exige o mesmo.
// Usado na tela de tarefas, Meu dia, fila, ficha do negócio, gaveta, contato
// e painel da conversa (useConcluirTarefa).
// ---------------------------------------------------------------------------

export interface TarefaParaConcluir {
  id: string;
  type: string;
  text: string;
}

export function DialogoDeConclusao({
  tarefa,
  onFechar,
  onConcluida,
}: {
  tarefa: TarefaParaConcluir;
  onFechar: () => void;
  onConcluida: (r: { proximaId: string | null }) => void;
}) {
  const toast = useToast();
  const [resultado, setResultado] = React.useState<ResultadoDaTarefa | null>(null);
  const [nota, setNota] = React.useState("");
  const [decisao, setDecisao] = React.useState<DecisaoDoProximoPasso | null>(null);
  const [tipo, setTipo] = React.useState<TipoDeTarefa>(tipoParaExibir(tarefa.type));
  const [texto, setTexto] = React.useState(tarefa.text);
  const [quando, setQuando] = React.useState("");
  const [mexeu, setMexeu] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // A sugestão acompanha o resultado até a pessoa editar algum campo.
  function escolherResultado(r: ResultadoDaTarefa) {
    setResultado(r);
    if (!mexeu) {
      const s = sugerirProximoPasso({ tipo: tarefa.type, texto: tarefa.text }, r, new Date());
      setTipo(s.tipo);
      setTexto(s.texto);
      setQuando(paraCampoSaoPaulo(s.dueAt));
    }
  }

  const prontoParaAgendar = decisao !== "agendou" || (texto.trim() && quando);
  const pode = !!resultado && !!decisao && !!prontoParaAgendar && !enviando;

  async function concluir() {
    if (!pode || !resultado || !decisao) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/tasks/${tarefa.id}/concluir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultado,
          nota,
          proximo: decisao === "agendou" ? { decisao, tipo, texto: texto.trim(), dueAt: quando } : { decisao },
        }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(dados.error ?? "Não foi possível concluir a tarefa.");
        return;
      }
      toast({
        title: "Tarefa concluída",
        description: decisao === "agendou" ? "Próxima atividade agendada." : "Registrado: sem próximo passo.",
        tone: "success",
      });
      onConcluida({ proximaId: dados.proximaId ?? null });
    } catch {
      setErro("Sem conexão. A tarefa não foi concluída.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal open onOpenChange={(aberto) => !aberto && onFechar()}>
      <ModalContent
        title="Concluir tarefa"
        description={tarefa.text}
        footer={
          <>
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={concluir} disabled={!pode} loading={enviando}>
              Concluir
            </Button>
          </>
        }
      >
        <div
          className="flex flex-col gap-4"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              concluir();
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-text-primary">Resultado</span>
            <SegmentedControl
              label="Resultado"
              value={resultado ?? ("" as ResultadoDaTarefa)}
              onChange={escolherResultado}
              options={RESULTADOS.map((r) => ({ value: r, label: ROTULO_DO_RESULTADO[r] }))}
              className="self-start"
            />
          </div>

          <Field label="Nota (opcional)">
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="O que foi combinado, objeções, contexto..." />
          </Field>

          <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
            <span className="text-small font-medium text-text-primary">Agendar próxima atividade?</span>
            <SegmentedControl
              label="Agendar próxima atividade?"
              value={decisao ?? ("" as DecisaoDoProximoPasso)}
              onChange={(d) => {
                setDecisao(d);
                if (d === "agendou" && !quando) {
                  const s = sugerirProximoPasso({ tipo: tarefa.type, texto: tarefa.text }, resultado ?? "outro", new Date());
                  setTipo(s.tipo);
                  setTexto(s.texto);
                  setQuando(paraCampoSaoPaulo(s.dueAt));
                }
              }}
              options={[
                { value: "agendou", label: "Agendar próxima" },
                { value: "sem_proximo", label: "Sem próximo passo" },
              ]}
              className="self-start"
            />
            {decisao === "agendou" && (
              <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                <Field label="Tipo">
                  <Select
                    value={tipo}
                    onChange={(e) => {
                      setMexeu(true);
                      setTipo(e.target.value as TipoDeTarefa);
                    }}
                  >
                    {TIPOS_DE_TAREFA.map((t) => (
                      <option key={t} value={t}>
                        {INFO_DO_TIPO[t].rotulo}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quando (horário de Brasília)">
                  <Input
                    type="datetime-local"
                    value={quando}
                    onChange={(e) => {
                      setMexeu(true);
                      setQuando(e.target.value);
                    }}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="O que fazer">
                    <Input
                      value={texto}
                      onChange={(e) => {
                        setMexeu(true);
                        setTexto(e.target.value);
                      }}
                    />
                  </Field>
                </div>
              </div>
            )}
            {decisao === "sem_proximo" && (
              <p className="text-small text-text-secondary">Fica registrado que esta tarefa terminou sem um próximo passo.</p>
            )}
          </div>

          {erro && (
            <p role="alert" className="text-small text-danger">
              {erro}
            </p>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}

/**
 * Atalho para qualquer tela: `abrir(tarefa)` mostra o diálogo; `dialogo` vai
 * no JSX. `aoConcluir` roda depois do sucesso (recarregar a lista, avançar a fila).
 */
export function useConcluirTarefa(aoConcluir?: (tarefa: TarefaParaConcluir, r: { proximaId: string | null }) => void) {
  const [tarefa, setTarefa] = React.useState<TarefaParaConcluir | null>(null);
  const ref = React.useRef(aoConcluir);
  React.useEffect(() => {
    ref.current = aoConcluir;
  });
  const dialogo = tarefa ? (
    <DialogoDeConclusao
      key={tarefa.id}
      tarefa={tarefa}
      onFechar={() => setTarefa(null)}
      onConcluida={(r) => {
        const t = tarefa;
        setTarefa(null);
        ref.current?.(t, r);
      }}
    />
  ) : null;
  return { abrir: setTarefa, dialogo };
}
