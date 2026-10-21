"use client";

import * as React from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";
import { BLOCK_STYLES } from "./block-styles";

export interface MenuOption {
  id: string;
  label: string;
}

export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type HttpAuthType = "none" | "bearer" | "header";

export interface FlowNodeData {
  iconKey: IconKey;
  label: string;
  kind?: string;
  detail?: string;
  hasTarget?: boolean;
  hasSource?: boolean;
  webhookUrl?: string;
  waitDuration?: number;
  waitUnit?: "segundos" | "minutos" | "horas";
  variableName?: string;
  // Bloco Captura: o que a resposta é. "text" (ou vazio) = comportamento
  // antigo, guarda em variableName sem validar.
  captureField?: "text" | "name" | "email" | "phone" | "custom";
  captureCustomKey?: string; // chave do CustomField de contato quando captureField = "custom"
  captureRequired?: boolean; // false = aceita "pular"
  captureMaxRetries?: number; // novas tentativas antes de desistir (padrão 2)
  captureErrorMessage?: string; // vazio = mensagem padrão do tipo
  variableExpression?: string;
  conditionExpression?: string;
  options?: MenuOption[];
  // Modelo pra usar se essa mensagem sair fora da janela de 24h da Meta
  // (canal whatsapp_meta) — ver docs/CHATBOT_ENGINE.md.
  templateId?: string;
  // Bloco HTTP (e a variante tool-http, que reaproveita os mesmos campos) —
  // generaliza o antigo "webhook" (POST fixo).
  httpMethod?: HttpMethod;
  httpUrl?: string;
  httpAuthType?: HttpAuthType;
  httpAuthValue?: string;
  httpHeaders?: KeyValueRow[];
  httpQueryParams?: KeyValueRow[];
  httpBody?: string;
  // Bloco Enviar e-mail (via credencial Resend).
  emailCredentialId?: string;
  emailFrom?: string;
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;
  // "contrato" = domínio do contrato + modelo/texto (padrão novo);
  // "credencial" = chave Resend do bloco (antigo). Ver fonte-do-email.ts.
  emailModo?: "contrato" | "credencial";
  // Modelo da Biblioteca (só no modo contrato). Vazio = assunto/corpo do bloco.
  emailModeloId?: string;
  // Bloco Agente de IA nativo — "detail" é reaproveitado como o system
  // prompt/instruções. Provedor vazio = Groq, que era o único antes do
  // multi-LLM (mantém fluxo antigo funcionando sem migração).
  aiProvider?: string;
  aiCredentialId?: string;
  aiModel?: string;
  // Só a Anthropic expõe controle de esforço; os outros provedores ignoram.
  aiEffort?: "low" | "medium" | "high";
  // Quantas mensagens anteriores da conversa entram no contexto (janela
  // deslizante, sem sumarização — ver runAiAgent em flow-engine.ts).
  aiMemoryWindow?: number;
  // Junta ao prompt o cadastro do agente (instruções, tom, idioma, "nunca
  // fazer"). Vazio = ligado; false = só o texto do bloco, como era antes.
  aiUsarAgente?: boolean;
  // De onde vem a IA: "conexao" = Central de IA do contrato (ordem + reserva);
  // "bloco" = provedor/credencial/modelo deste bloco. Vazio = ver fonte-da-ia.ts.
  aiFonte?: "conexao" | "bloco";
  // Cada linha = uma variável que o agente tenta extrair da conversa (chave =
  // nome da variável, valor = descrição/como reconhecer) — reaproveita
  // KeyValueRow em vez de um tipo novo.
  collectVars?: KeyValueRow[];
  // Bloco Ferramenta: MCP — aponta pra um servidor cadastrado na org e, se
  // mcpTools tiver itens, expõe só essas ferramentas ao agente (vazio = todas).
  mcpServerId?: string;
  mcpTools?: string[];
  // ── Blocos de CRM ──────────────────────────────────────────────────────
  // Funil e etapa escolhidos em seletor, nunca digitados: id de etapa em
  // campo de texto é erro garantido depois que alguém renomeia a coluna.
  crmPipelineId?: string;
  crmStageId?: string;
  crmDealName?: string;
  crmDealAmount?: string; // aceita {variavel}, convertido em centavos no motor
  crmDealDescription?: string;
  crmTaskType?: string;
  crmTaskText?: string;
  crmTaskDue?: string; // prazo relativo: "+2 dias", "3h"
  crmTaskAssigneeId?: string;
  crmTagId?: string;
  crmTagAction?: "add" | "remove";
  crmNoteText?: string;
  crmLostReason?: string;
  // Bloco "Mover etapa": move mesmo sem os campos obrigatórios da etapa (e sem
  // motivo de perda). Flag explícita, registrada no histórico de etapas.
  crmIgnorarObrigatorios?: boolean;
  // Campos personalizados que o bloco grava: chave do campo -> valor ({variavel} ok).
  crmFieldMap?: { key: string; value: string }[];
  // Grava também as variáveis com o mesmo nome de um campo (padrão: ligado).
  crmAutoFill?: boolean;
  // Bloco "Atualizar dados": em qual registro grava.
  crmUpdateTarget?: "deal" | "contact";
  // ── Ferramenta de CRM para o Agente de IA ─────────────────────────────
  // Sem essas três travas, IA com permissão de escrita no CRM vira geradora
  // de lixo: fecha negócio como Ganho porque a conversa foi simpática.
  crmToolActions?: string[];     // verbos liberados
  crmAllowedStageIds?: string[]; // etapas para onde a IA pode mover
  crmMaxAmount?: string;         // teto de valor; acima disso, só cria marcado para revisão
  [key: string]: unknown;
}

function ConfigPreview({ data }: { data: FlowNodeData }) {
  if ((data.iconKey === "webhook" || data.iconKey === "http" || data.iconKey === "tool-http") && (data.webhookUrl || data.httpUrl)) {
    const url = data.httpUrl || data.webhookUrl;
    const method = data.httpMethod ?? "POST";
    return (
      <p className="mt-2 truncate rounded-lg bg-raised px-2 py-1 font-mono text-[10.5px] text-text-tertiary">
        {data.iconKey !== "webhook" && <span className="font-semibold text-cat-cyan">{method}</span>} {url}
      </p>
    );
  }
  if (data.iconKey === "wait" && data.waitDuration) {
    return <p className="mt-2 text-[11px] text-text-tertiary">Espera {data.waitDuration} {data.waitUnit ?? "minutos"}</p>;
  }
  if ((data.iconKey === "variable" || data.iconKey === "capture") && data.variableName) {
    return (
      <p className="mt-2 truncate rounded-lg bg-raised px-2 py-1 font-mono text-[10.5px] text-text-tertiary">
        <span>→ salva em</span> {"{" + data.variableName + "}"}
      </p>
    );
  }
  if (data.iconKey === "condition" && data.conditionExpression) {
    return (
      <p className="mt-2 truncate rounded-lg bg-raised px-2 py-1 font-mono text-[10.5px] text-text-tertiary">
        {data.conditionExpression}
      </p>
    );
  }
  if (data.iconKey === "email" && data.emailTo) {
    return <p className="mt-2 truncate rounded-lg bg-raised px-2 py-1 font-mono text-[10.5px] text-text-tertiary">para: {data.emailTo}</p>;
  }
  if (data.iconKey === "ai-agent") {
    const varCount = (data.collectVars ?? []).filter((v) => v.key.trim()).length;
    return (
      <p className="mt-2 truncate rounded-lg bg-raised px-2 py-1 font-mono text-[10.5px] text-text-tertiary">
        {fonteDaIa(data) === "conexao" ? "Central de IA" : data.aiModel || "modelo não escolhido"}
        {varCount > 0 && ` · coleta ${varCount} dado${varCount === 1 ? "" : "s"}`}
      </p>
    );
  }
  if (data.iconKey === "tool-mcp") {
    const count = (data.mcpTools ?? []).length;
    return (
      <p className="truncate text-[11px] text-text-tertiary">
        {count > 0 ? `${count} ferramenta(s) selecionada(s)` : "todas as ferramentas do servidor"}
      </p>
    );
  }

  if (data.iconKey === "tool-knowledge") {
    return <p className="mt-2 text-[11px] text-text-tertiary">Busca na base de conhecimento do agente</p>;
  }
  return null;
}

function AutoTextarea({ value, onCommit }: { value: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => setDraft(value), [value]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={1}
      placeholder="Digite o texto..."
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      // Sem stopPropagation no clique: o bloco precisa ficar selecionado
      // quando alguem clica no proprio texto dele. Antes o clique morria aqui,
      // o painel nao abria e parecia que o bloco nao respondia — o jeito mais
      // rapido de alguem concluir que a ferramenta esta quebrada.
      // No teclado ele continua: digitar espaco ou delete dentro do campo nao
      // pode acionar atalho do canvas.
      onKeyDown={(e) => e.stopPropagation()}
      className="nodrag mt-2.5 w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[12px] leading-relaxed text-text-secondary outline-none transition-colors hover:border-border-subtle focus:border-accent-500/50 focus:bg-surface-3"
    />
  );
}

import { validateNode } from "./block-validation";
import { ehFerramenta, saidasDoBloco, type Saida } from "./saidas";
import { fonteDaIa } from "./fonte-da-ia";
import { ESTILO_DA_SAIDA } from "./saida-estilo";

const HANDLE_DOT = "!h-2.5 !w-2.5 !border-2 !border-panel";

/**
 * O que a última execução fez neste bloco.
 *
 * Fluxo que não mostra o que rodou obriga a pessoa a ler log noutra aba e
 * casar id de nó na mão. Com o anel no próprio bloco, "onde quebrou" é uma
 * olhada, não uma investigação.
 */
export interface NodeRunState {
  ok: boolean;
  ms: number;
  error?: string;
}

/**
 * Uma linha por saída nomeada (Sim / Não, cada opção do menu, Respondeu /
 * Não respondeu certo), com o ponto de ligação NA linha: o ponto fica
 * alinhado ao texto que ele representa, em vez de espalhado pela altura do
 * cartão. A linha estica até a borda direita do cartão (-mr/pr do padding)
 * para o ponto cair em cima da borda.
 */
function LinhaDeSaida({ saida, indice, menu }: { saida: Saida; indice: number; menu: boolean }) {
  const estilo = ESTILO_DA_SAIDA[saida.tipo];
  return (
    <div className="relative -mr-3.5 pr-3.5">
      {menu ? (
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-raised px-2 py-1.5 text-caption text-text-secondary">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent-fg">
            {indice + 1}
          </span>
          <span className="truncate">{saida.rotulo}</span>
        </div>
      ) : (
        <p className={cn("py-1 text-right text-caption font-medium", estilo.texto)}>{saida.rotulo}</p>
      )}
      <Handle
        id={saida.id ?? undefined}
        type="source"
        position={Position.Right}
        aria-label={`Saída: ${saida.rotulo}`}
        className={cn(HANDLE_DOT, estilo.ponto)}
      />
    </div>
  );
}

export function FlowNode({
  id,
  data,
  selected,
  run,
  onDetailChange,
}: {
  /** id do nó no canvas: com ele, o React Flow remede os pontos quando as saídas mudam. */
  id?: string;
  data: FlowNodeData;
  selected?: boolean;
  run?: NodeRunState;
  onDetailChange?: (text: string) => void;
}) {
  const Icon = ICON_REGISTRY[data.iconKey] ?? ICON_REGISTRY.message;
  const style = BLOCK_STYLES[data.iconKey] ?? BLOCK_STYLES.message;
  const isAiAgent = data.iconKey === "ai-agent";
  const isTool = ehFerramenta(data.iconKey);
  // Motivo pelo qual o bloco não vai funcionar, se houver. Aparece como um
  // ponto de aviso no card e o texto ao passar o mouse.
  const problema = validateNode(data);
  const saidas = saidasDoBloco(data);
  const comRotulo = saidas.length > 1 || saidas.some((s) => s.rotulo);
  const isMenu = saidas.some((s) => s.tipo === "opcao");
  const editableDetail = onDetailChange && data.iconKey !== "condition" && data.iconKey !== "start";

  // Opção de menu criada/apagada ou condição trocada: os pontos mudam de
  // lugar e o React Flow precisa medir de novo, senão a ligação sai do lugar
  // antigo.
  const updateNodeInternals = useUpdateNodeInternals();
  const assinaturaDasSaidas = saidas.map((s) => s.id ?? "-").join("|");
  React.useEffect(() => {
    if (id) updateNodeInternals(id);
  }, [id, assinaturaDasSaidas, updateNodeInternals]);

  return (
    <div
      className={cn(
        "relative w-[230px] cursor-pointer rounded-lg border border-l-[3px] bg-panel p-3.5 transition-colors",
        style.border,
        selected ? "border-border-strong ring-2 ring-focus/40" : "border-border-subtle",
        problema && !selected && "ring-1 ring-warning/40",
        // A execução fala mais alto que o aviso de configuração: um bloco que
        // acabou de quebrar em produção importa mais que um campo em branco.
        run && !selected && (run.ok ? "ring-1 ring-success/50" : "ring-2 ring-danger/70")
      )}
    >
      {run && (
        <span
          title={run.error ?? `Rodou em ${run.ms} ms na última execução`}
          className={cn(
            "absolute -top-2 left-3 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
            run.ok ? "border-success/30 bg-success-subtle text-success" : "border-danger/30 bg-danger-subtle text-danger"
          )}
        >
          {run.ok ? `${run.ms} ms` : "erro"}
        </span>
      )}
      {problema && (
        <span
          title={problema}
          aria-label={problema}
          className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border border-warning/40 bg-warning-subtle text-[10px] font-semibold text-warning"
        >
          !
        </span>
      )}
      {/* Fluxo principal: horizontal (esquerda→direita), igual n8n. Ferramentas
          de um Agente de IA são a exceção — continuam verticais (porta embaixo),
          mesma convenção do n8n pros sub-inputs de IA (modelo/ferramenta/memória). */}
      {!isTool && data.hasTarget !== false && (
        <Handle type="target" position={Position.Left} aria-label="Entrada" className={cn(HANDLE_DOT, "!left-0")} />
      )}
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", style.badgeBg, style.badgeText)}>
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-small font-medium text-text-primary">{data.label}</p>
          {data.kind && <p className="truncate text-caption text-text-tertiary">{data.kind}</p>}
        </div>
      </div>

      {editableDetail ? (
        <AutoTextarea value={data.detail ?? ""} onCommit={(text) => onDetailChange!(text)} />
      ) : (
        data.detail && <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">{data.detail}</p>
      )}

      <ConfigPreview data={data} />

      {comRotulo ? (
        <div className={cn("mt-2.5 flex flex-col", isMenu ? "gap-1.5" : "gap-0.5")}>
          {saidas.map((s, i) => (
            <LinhaDeSaida key={s.id ?? "padrao"} saida={s} indice={i} menu={isMenu} />
          ))}
        </div>
      ) : (
        saidas.length === 1 && (
          <Handle type="source" position={Position.Right} aria-label="Saída" className={cn(HANDLE_DOT, "!right-0")} />
        )
      )}

      {/* Porta de ferramentas do Agente de IA — embaixo, igual n8n. Só
          ferramenta liga aqui (ver isValidConnection no builder). */}
      {isAiAgent && (
        <Handle
          id="tools"
          type="target"
          position={Position.Bottom}
          aria-label="Ferramentas"
          className={cn(HANDLE_DOT, "!bottom-0 !bg-cat-purple-solid")}
        />
      )}
      {isTool && (
        <Handle type="source" position={Position.Top} aria-label="Ligar a um bloco de IA" className={cn(HANDLE_DOT, "!top-0 !bg-cat-purple-solid")} />
      )}
    </div>
  );
}
