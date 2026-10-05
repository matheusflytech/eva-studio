"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X } from "lucide-react";
import { TIPO_POR_ID, type DefinicaoDeCampo } from "@/lib/custom-fields";
import type { FlowNodeData } from "./flow-node";

// ---------------------------------------------------------------------------
// Configuração dos blocos de CRM no Inspector.
//
// Funil, etapa, etiqueta e responsável vêm sempre de seletor, nunca de campo
// de texto: guardar nome de etapa como string quebra no dia em que alguém
// renomeia a coluna, e id digitado à mão é erro garantido.
// ---------------------------------------------------------------------------

interface Stage {
  id: string;
  name: string;
  type: string;
  probability: number;
}
interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
}
interface Tag {
  id: string;
  name: string;
}
interface Member {
  id: string;
  name: string;
}

/** Carrega uma vez e compartilha entre os blocos abertos no Inspector. */
function useCrmOptions() {
  const [pipelines, setPipelines] = React.useState<Pipeline[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [members, setMembers] = React.useState<Member[]>([]);

  React.useEffect(() => {
    Promise.all([
      fetch("/api/pipelines").then((r) => r.json()).catch(() => ({})),
      fetch("/api/tags").then((r) => r.json()).catch(() => ({})),
      fetch("/api/members").then((r) => r.json()).catch(() => ({})),
    ]).then(([p, t, m]) => {
      setPipelines(p.pipelines ?? []);
      setTags(t.tags ?? []);
      setMembers(m.members ?? []);
    });
  }, []);

  return { pipelines, tags, members };
}

function StagePicker({
  pipelines,
  pipelineId,
  stageId,
  onChange,
  label = "Etapa",
}: {
  pipelines: Pipeline[];
  pipelineId?: string;
  stageId?: string;
  onChange: (patch: Partial<FlowNodeData>) => void;
  label?: string;
}) {
  const selected = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  return (
    <>
      <div>
        <Label htmlFor="node-crm-pipeline">Funil</Label>
        <Select
          id="node-crm-pipeline"
          value={pipelineId ?? selected?.id ?? ""}
          onChange={(e) => onChange({ crmPipelineId: e.target.value, crmStageId: "" })}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="node-crm-stage">{label}</Label>
        <Select
          id="node-crm-stage"
          value={stageId ?? ""}
          onChange={(e) => onChange({ crmStageId: e.target.value })}
        >
          <option value="">Primeira etapa aberta do funil</option>
          {(selected?.stages ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.probability}%)
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}

/**
 * Liga o que o cliente responde aos campos que o negócio criou. O jeito mais
 * simples: dar à pergunta o mesmo nome do campo e deixar o preenchimento
 * automático ligado. O mapa abaixo serve para o resto: valor fixo, ou uma
 * variável de nome diferente.
 */
function MapaDeCampos({
  entidade,
  pipelineId,
  data,
  onChange,
}: {
  entidade: "deal" | "contact";
  pipelineId?: string;
  data: FlowNodeData;
  onChange: (patch: Partial<FlowNodeData>) => void;
}) {
  const [defs, setDefs] = React.useState<DefinicaoDeCampo[] | null>(null);

  React.useEffect(() => {
    const q = entidade === "deal" && pipelineId ? `&pipelineId=${pipelineId}` : "";
    fetch(`/api/custom-fields?entity=${entidade}${q}`)
      .then((r) => r.json())
      .then((d) => setDefs(d.fields ?? []))
      .catch(() => setDefs([]));
  }, [entidade, pipelineId]);

  const mapa = data.crmFieldMap ?? [];
  const set = (novo: { key: string; value: string }[]) => onChange({ crmFieldMap: novo });

  if (defs === null) return null;

  if (defs.length === 0) {
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[11.5px] text-text-tertiary">
        Você ainda não criou campos {entidade === "deal" ? "do negócio" : "do contato"}.{" "}
        <a href="/negocios/configurar" className="text-accent-400 hover:underline">Criar campos</a> para o agente poder preenchê-los.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px]">
        <Checkbox checked={data.crmAutoFill !== false} onCheckedChange={(v) => onChange({ crmAutoFill: v === true })} />
        <span className="min-w-0">
          <span className="block font-medium text-text-primary">Preencher pelo nome da variável</span>
          <span className="block text-[11.5px] text-text-tertiary">
            Se uma pergunta guarda a resposta numa variável com o mesmo nome de um campo, o valor vai direto para o campo.
          </span>
        </span>
      </label>
      <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-[11.5px] text-text-tertiary">
        Nomes dos campos:{" "}
        {defs.map((d) => (
          <span key={d.id} className="mr-1.5 inline-block font-mono text-text-secondary" title={`${d.label} (${TIPO_POR_ID.get(d.type)?.rotulo})`}>
            {d.key}
          </span>
        ))}
      </div>
      <div>
        <Label>Valores definidos por você</Label>
        <div className="mt-1.5 flex flex-col gap-2">
          {mapa.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Select
                value={m.key}
                aria-label="Campo"
                className="h-9"
                onChange={(e) => set(mapa.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
              >
                <option value="">Campo...</option>
                {defs.map((d) => (
                  <option key={d.id} value={d.key}>{d.label}</option>
                ))}
              </Select>
              <Input
                value={m.value}
                aria-label="Valor"
                className="h-9"
                placeholder="{variavel} ou valor"
                onChange={(e) => set(mapa.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              />
              <button type="button" aria-label="Remover" onClick={() => set(mapa.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-text-tertiary hover:text-danger">
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set([...mapa, { key: "", value: "" }])}
            className="inline-flex w-fit items-center gap-1.5 text-[12px] text-accent-400 hover:underline"
          >
            <Plus size={13} /> Adicionar valor
          </button>
        </div>
      </div>
    </div>
  );
}

export function CrmBlockFields({
  iconKey,
  data,
  onChange,
}: {
  iconKey: string;
  data: FlowNodeData;
  onChange: (patch: Partial<FlowNodeData>) => void;
}) {
  const { pipelines, tags, members } = useCrmOptions();

  if (iconKey === "crm-deal") {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="node-deal-name">Nome do negócio</Label>
          <Input
            id="node-deal-name"
            value={data.crmDealName ?? ""}
            onChange={(e) => onChange({ crmDealName: e.target.value })}
            placeholder="Negócio de {nome}"
          />
        </div>
        <StagePicker
          pipelines={pipelines}
          pipelineId={data.crmPipelineId}
          stageId={data.crmStageId}
          onChange={onChange}
          label="Etapa de entrada"
        />
        <div>
          <Label htmlFor="node-deal-amount">Valor</Label>
          <Input
            id="node-deal-amount"
            value={data.crmDealAmount ?? ""}
            onChange={(e) => onChange({ crmDealAmount: e.target.value })}
            placeholder="{orcamento} ou 1500,00"
          />
          <p className="mt-1.5 text-[11.5px] text-text-tertiary">
            Aceita variável. Entende vírgula decimal e ponto de milhar.
          </p>
        </div>
        <div>
          <Label htmlFor="node-deal-var">Guardar o id do negócio em</Label>
          <Input
            id="node-deal-var"
            value={data.variableName ?? ""}
            onChange={(e) => onChange({ variableName: e.target.value })}
            placeholder="negocio_id"
          />
        </div>
        <div>
          <Label>Campos do negócio</Label>
          <MapaDeCampos entidade="deal" pipelineId={data.crmPipelineId ?? pipelines[0]?.id} data={data} onChange={onChange} />
        </div>
        <p className="text-[11.5px] text-text-tertiary">
          O contato da conversa é vinculado ao negócio automaticamente. A probabilidade vem da etapa escolhida.
        </p>
      </div>
    );
  }

  if (iconKey === "crm-update") {
    const alvo = data.crmUpdateTarget ?? "deal";
    return (
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="node-update-target">Atualizar</Label>
          <Select
            id="node-update-target"
            value={alvo}
            onChange={(e) => onChange({ crmUpdateTarget: e.target.value as "deal" | "contact" })}
          >
            <option value="deal">O negócio aberto do contato</option>
            <option value="contact">O contato</option>
          </Select>
        </div>
        <MapaDeCampos entidade={alvo} data={data} onChange={onChange} />
        <p className="text-[11.5px] text-text-tertiary">
          Valor vazio é ignorado: se o cliente ainda não respondeu, o que já está no campo não é apagado. Resposta que
          não combina com o tipo do campo (texto num campo de número) é descartada e aparece na aba Execuções.
        </p>
      </div>
    );
  }

  if (iconKey === "crm-stage") {
    return (
      <div className="flex flex-col gap-3">
        <StagePicker
          pipelines={pipelines}
          pipelineId={data.crmPipelineId}
          stageId={data.crmStageId}
          onChange={onChange}
          label="Mover para"
        />
        <div>
          <Label htmlFor="node-lost-reason">Motivo da perda (só se a etapa for de perda)</Label>
          <Input
            id="node-lost-reason"
            value={data.crmLostReason ?? ""}
            onChange={(e) => onChange({ crmLostReason: e.target.value })}
            placeholder="Preço, prazo, sumiu..."
          />
        </div>
        <p className="text-[11.5px] text-text-tertiary">
          Age no negócio aberto mais recente do contato. Se ele não tiver negócio aberto, o bloco registra o erro
          na aba Execuções e o fluxo continua.
        </p>
      </div>
    );
  }

  if (iconKey === "crm-task") {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="node-task-type">Tipo</Label>
            <Select
              id="node-task-type"
              value={data.crmTaskType ?? "ligar"}
              onChange={(e) => onChange({ crmTaskType: e.target.value })}
            >
              <option value="ligar">Ligar</option>
              <option value="email">E-mail</option>
              <option value="reuniao">Reunião</option>
              <option value="outro">Outro</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="node-task-due">Prazo</Label>
            <Input
              id="node-task-due"
              value={data.crmTaskDue ?? ""}
              onChange={(e) => onChange({ crmTaskDue: e.target.value })}
              placeholder="+1 dia"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="node-task-text">O que fazer</Label>
          <Textarea
            id="node-task-text"
            rows={2}
            value={data.crmTaskText ?? ""}
            onChange={(e) => onChange({ crmTaskText: e.target.value })}
            placeholder="Retornar contato de {nome}"
          />
        </div>
        <div>
          <Label htmlFor="node-task-owner">Responsável</Label>
          <Select
            id="node-task-owner"
            value={data.crmTaskAssigneeId ?? ""}
            onChange={(e) => onChange({ crmTaskAssigneeId: e.target.value })}
          >
            <option value="">Ninguém (fica na fila)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>
        <p className="text-[11.5px] text-text-tertiary">
          Prazo é relativo de propósito: numa automação, data fixa nunca serve. Aceita &quot;+2 dias&quot;,
          &quot;3h&quot;, &quot;30m&quot;.
        </p>
      </div>
    );
  }

  if (iconKey === "crm-tag") {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="node-tag-action">Ação</Label>
          <Select
            id="node-tag-action"
            value={data.crmTagAction ?? "add"}
            onChange={(e) => onChange({ crmTagAction: e.target.value as "add" | "remove" })}
          >
            <option value="add">Aplicar etiqueta</option>
            <option value="remove">Remover etiqueta</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="node-tag-id">Etiqueta</Label>
          <Select
            id="node-tag-id"
            value={data.crmTagId ?? ""}
            onChange={(e) => onChange({ crmTagId: e.target.value })}
          >
            <option value="">Selecione...</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          {tags.length === 0 && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-text-tertiary">
              Nenhuma etiqueta ainda. Crie em{" "}
              <a href="/contatos" className="inline-flex items-center gap-1 text-accent-400 hover:underline">
                Contatos <ExternalLink size={11} />
              </a>
            </p>
          )}
        </div>
        <p className="text-[11.5px] text-text-tertiary">
          Aplicar uma etiqueta pode inscrever o contato numa sequência, se houver alguma com esse gatilho. É a ponte
          entre o fluxo e a régua de acompanhamento.
        </p>
      </div>
    );
  }

  if (iconKey === "crm-note") {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="node-note-text">Nota</Label>
          <Textarea
            id="node-note-text"
            rows={3}
            value={data.crmNoteText ?? ""}
            onChange={(e) => onChange({ crmNoteText: e.target.value })}
            placeholder="Cliente pediu orçamento de {produto} pelo WhatsApp."
          />
        </div>
        <p className="text-[11.5px] text-text-tertiary">
          Aceita variáveis. Aparece na linha do tempo do contato e, se houver negócio aberto, também nele.
        </p>
      </div>
    );
  }

  if (iconKey === "crm-lookup") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11.5px] text-text-tertiary">Sem configuração. Preenche estas variáveis:</p>
        <ul className="flex flex-col gap-1 rounded-xl bg-surface-2 px-3 py-2.5 font-mono text-[11.5px] text-text-secondary">
          <li>{"{crm_empresa}"}</li>
          <li>{"{crm_tem_negocio}"} — &quot;sim&quot; ou &quot;nao&quot;</li>
          <li>{"{crm_negocio_id}"}</li>
          <li>{"{crm_negocio_etapa}"}</li>
          <li>{"{crm_negocio_valor}"}</li>
          <li>{"{crm_tarefas_abertas}"}</li>
          <li>{"{crm_etiquetas}"}</li>
        </ul>
        <p className="text-[11.5px] text-text-tertiary">
          Ligue um bloco de Condição depois deste para ramificar. Ex:{" "}
          <span className="font-mono">{'{crm_tem_negocio} == "sim"'}</span>
        </p>
      </div>
    );
  }

  if (iconKey === "tool-crm") {
    const actions = data.crmToolActions ?? [];
    const allowedStages = data.crmAllowedStageIds ?? [];
    const allStages = pipelines.flatMap((p) => p.stages.map((s) => ({ ...s, pipeline: p.name })));

    const ACTIONS: { id: string; label: string; hint: string }[] = [
      { id: "buscar", label: "Consultar CRM", hint: "Só leitura. Seguro deixar sempre ligado." },
      { id: "criar_negocio", label: "Criar negócio", hint: "A IA decide quando há intenção de compra." },
      { id: "mover_etapa", label: "Mover etapa", hint: "Limitado às etapas liberadas abaixo." },
      { id: "atualizar_campos", label: "Salvar dados do cliente", hint: "A IA preenche os campos que você criou (consumo, tipo de imóvel...)." },
      { id: "criar_tarefa", label: "Criar tarefa", hint: "Gera trabalho pra equipe, não altera o funil." },
      { id: "etiquetar", label: "Etiquetar", hint: "Pode iniciar uma sequência automaticamente." },
      { id: "nota", label: "Registrar nota", hint: "Só escreve na linha do tempo." },
    ];

    return (
      <div className="flex flex-col gap-4">
        <div>
          <Label>Ações liberadas</Label>
          <div className="mt-1.5 flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
            {ACTIONS.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-start gap-2.5 text-[12.5px]">
                <Checkbox
                  checked={actions.includes(a.id)}
                  onCheckedChange={(v) =>
                    onChange({
                      crmToolActions: v ? [...actions, a.id] : actions.filter((x) => x !== a.id),
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block font-medium text-text-primary">{a.label}</span>
                  <span className="block text-[11.5px] text-text-tertiary">{a.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {actions.includes("mover_etapa") && (
          <div>
            <Label>Etapas que a IA pode usar</Label>
            <div className="mt-1.5 flex max-h-[180px] flex-col gap-1.5 overflow-y-auto rounded-xl bg-surface-2 p-3">
              {allStages.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5 text-[12.5px]">
                  <Checkbox
                    checked={allowedStages.includes(s.id)}
                    onCheckedChange={(v) =>
                      onChange({
                        crmAllowedStageIds: v
                          ? [...allowedStages, s.id]
                          : allowedStages.filter((x) => x !== s.id),
                      })
                    }
                  />
                  <span className="text-text-primary">
                    {s.name}
                    <span className="ml-1.5 text-text-tertiary">
                      {s.pipeline}
                      {s.type === "won" ? " · ganho" : s.type === "lost" ? " · perda" : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Nenhuma marcada significa nenhuma, não todas. Pense duas vezes antes de liberar as etapas de ganho e
              perda: uma conversa simpática é motivo suficiente pro modelo querer marcar Ganho.
            </p>
          </div>
        )}

        {actions.includes("criar_negocio") && (
          <div>
            <Label htmlFor="node-crm-ceiling">Teto de valor</Label>
            <Input
              id="node-crm-ceiling"
              value={data.crmMaxAmount ?? ""}
              onChange={(e) => onChange({ crmMaxAmount: e.target.value })}
              placeholder="10000"
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Acima disso o negócio é criado mesmo assim (perder a oportunidade seria pior), mas já nasce com uma
              tarefa de revisão humana. Vazio = sem teto.
            </p>
          </div>
        )}

        <p className="text-[11.5px] text-text-tertiary">
          Conecte este bloco na porta roxa embaixo de um Agente de IA. Diferente dos blocos de CRM comuns, aqui quem
          decide quando agir é o modelo, a partir da conversa.
        </p>
      </div>
    );
  }

  return null;
}
