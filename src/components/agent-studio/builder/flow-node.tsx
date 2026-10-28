"use client";

import * as React from "react";
import { Handle, Position, useNodeConnections, useNodesData, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";
import { IconeDoBloco } from "./icone-do-bloco";
import { BLOCK_CATEGORY } from "./block-styles";
import { validateNode } from "./block-validation";
import { ehFerramenta, saidasDoBloco, type Saida } from "./saidas";
import { fonteDaIa } from "./fonte-da-ia";
import { ESTILO_DA_SAIDA } from "./saida-estilo";
import { MOLA } from "@/lib/design-system/movimento";
import { MenuDeBlocos } from "./menu-de-blocos";

export interface MenuOption {
  id: string;
  label: string;
}

export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

/** Campo que a IA preenche ao sair por uma saída; vira a variável `key`. */
export interface AiExitField {
  id: string;
  key: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

/** Um item do conteúdo do Bloco, mandado na ordem da lista. */
export interface BlockContent {
  id: string;
  /** "typing" mostra "digitando…" antes da próxima mensagem (no WhatsApp). */
  type: "text" | "typing" | "media" | "link" | "location" | "carousel";
  /** Texto; legenda na mídia; título no link; nome do lugar na localização. */
  text?: string;
  seconds?: number;
  /** Mídia e link: endereço público (aceita {variavel}). */
  url?: string;
  /** Mídia enviada pelo Studio: caminho no storage privado; sai com link assinado. */
  path?: string;
  mediaType?: "image" | "video" | "audio" | "document" | "sticker";
  fileName?: string;
  /** Localização: endereço e/ou coordenadas. */
  address?: string;
  latitude?: number;
  longitude?: number;
  /** Carrossel: cards com imagem, título, descrição e botões de link. */
  cards?: BlockCard[];
}

export interface BlockCard {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  buttons?: { id: string; label: string; url: string }[];
}

/** Ação do Bloco: os mesmos dados de um bloco de ação (variável, CRM, HTTP, e-mail). */
export interface BlockAction {
  id: string;
  data: FlowNodeData;
}

/** Saída por condição do Bloco: a primeira verdadeira (e ligada) ganha. */
export interface BlockCondition {
  id: string;
  label: string;
  expression: string;
}

/** Saída por intenção do bloco de IA: a IA escolhe por qual sair. */
export interface AiExit {
  id: string;
  name: string;
  /** Quando usar esta saída (vai para a IA). */
  description: string;
  fields?: AiExitField[];
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
  captureField?: "text" | "name" | "email" | "phone" | "custom" | "location";
  captureCustomKey?: string; // chave do CustomField de contato quando captureField = "custom"
  captureRequired?: boolean; // false = aceita "pular"
  captureMaxRetries?: number; // novas tentativas antes de desistir (padrão 2)
  captureErrorMessage?: string; // vazio = mensagem padrão do tipo
  variableExpression?: string;
  // Ação "Registrar evento" (relatório do Studio): categoria e ação obrigatórias, valor opcional; aceitam {variavel}.
  eventCategory?: string;
  eventAction?: string;
  eventValue?: string;
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
  // Temperatura do modelo (0 a 1). Vazio = 0,4. Não vale para OpenAI e Anthropic.
  aiTemperature?: number;
  // Quantas mensagens anteriores da conversa entram no contexto (janela
  // deslizante, sem sumarização — ver runAiAgent em flow-engine.ts).
  aiMemoryWindow?: number;
  // No WhatsApp, a resposta longa sai em até 3 balões com "digitando…" entre
  // eles. Vazio = ligado; false = uma mensagem só.
  aiBaloes?: boolean;
  // De onde vem a IA: "conexao" = Central de IA do contrato (ordem + reserva);
  // "bloco" = provedor/credencial/modelo deste bloco. Vazio = ver fonte-da-ia.ts.
  aiFonte?: "conexao" | "bloco";
  // Cada linha = uma variável que o agente tenta extrair da conversa (chave =
  // nome da variável, valor = descrição/como reconhecer) — reaproveita
  // KeyValueRow em vez de um tipo novo.
  collectVars?: KeyValueRow[];
  // Modelos reserva (mesma credencial) usados quando o principal bate no limite de
  // tokens por minuto do provedor.
  aiFallbackModels?: string[];
  // Limite de tokens da resposta. Vazio = padrão do provedor (llm.ts).
  aiMaxTokens?: number;
  // false = a resposta não vai para o cliente, só para aiResponseVariable
  // (IA que classifica ou resume). Vazio = envia.
  aiSendToCustomer?: boolean;
  aiResponseVariable?: string;
  // Saídas por intenção, além de Terminou/Erro (ver saidasDoBloco).
  aiExits?: AiExit[];
  // ── Bloco do Studio ("studio-block") ───────────────────────────────────
  // Ordem no motor: ações de entrada, conteúdo, espera a resposta (se
  // waitForReply), ações de saída, saída. A pergunta usa os mesmos campos da
  // Captura (options, captureField, variableName...).
  blockContents?: BlockContent[];
  entryActions?: BlockAction[];
  exitActions?: BlockAction[];
  exitConditions?: BlockCondition[];
  waitForReply?: boolean;
  // Sem resposta nesse tempo, segue pela saída "Não respondeu" (o relógio
  // retoma a conversa como faz com o "Esperar"). Vazio = espera para sempre.
  replyTimeoutMinutes?: number;
  /** "Ir para fluxo": id do fluxo extra (AgentSubflow) ou "main" para o principal. */
  targetFlowId?: string;
  // Bloco Ferramenta: MCP — aponta pra um servidor cadastrado na org e, se
  // mcpTools tiver itens, expõe só essas ferramentas ao agente (vazio = todas).
  mcpServerId?: string;
  mcpTools?: string[];
  // Ferramenta: Base de conhecimento — só estes documentos (vazio = todos).
  knowledgeDocIds?: string[];
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
  crmToolFields?: string[];      // campos que a IA lê e preenche; ausente = todos (blocos antigos)
  [key: string]: unknown;
}


/**
 * O que a última execução fez neste bloco.
 *
 * Fluxo que não mostra o que rodou obriga a pessoa a ler log noutra aba e
 * casar id de nó na mão. Com a borda e o marcador no próprio bloco, "onde
 * quebrou" é uma olhada, não uma investigação.
 */
export interface NodeRunState {
  ok: boolean;
  ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Visual v6 (o mesmo do fluxograma de automações, components/automacoes/
// canvas.tsx): quadrado escuro de 88px com o ícone grande na cor da categoria,
// nome e uma linha de resumo embaixo, fora da caixa. Nada de texto longo no
// nó: o prompt da IA, a mensagem inteira e a configuração ficam no painel.
//
// Diferente do canvas de automações, aqui o nome fica DENTRO da caixa que o
// React Flow mede (só fora do quadrado): o auto-layout (auto-layout.ts) usa a
// altura medida, e assim um bloco nunca cai em cima do nome do outro.
// ---------------------------------------------------------------------------

/** Lado do quadrado. Cresce na altura só quando há muitas saídas (menu). */
export const LADO_DO_NO = 88;
const PASSO_DA_SAIDA = 24;

export function alturaDoQuadrado(saidas: number): number {
  return Math.max(LADO_DO_NO, saidas * PASSO_DA_SAIDA + 16);
}

// Mola curta e firme (mesma do canvas de automações). Só transform/opacity.

// Luz fraca vinda de cima: o quadrado parece elevado sem sombra em repouso.
const LUZ_DE_CIMA = "linear-gradient(180deg, color-mix(in srgb, var(--text-primary) 6%, transparent), transparent 62%)";

const BRILHO_SELECIONADO =
  "border-accent-solid shadow-[0_0_0_1px_var(--accent-solid),0_0_24px_-6px_color-mix(in_srgb,var(--accent-solid)_50%,transparent)]";
const BRILHO_FALHOU =
  "border-danger shadow-[0_0_0_1px_var(--danger-solid),0_0_20px_-6px_color-mix(in_srgb,var(--danger-solid)_55%,transparent)]";

// Ponto de ligação: pequeno, com um anel na cor do fundo para descolar do
// quadrado. Arrastável (é por ele que se liga o fio à mão).
const ALCA = "!h-2.5 !w-2.5 !min-h-0 !min-w-0 !rounded-full !border-2 !border-page";
const ALCA_PADRAO = "!bg-border-strong";
const ALCA_ACESA = "!bg-accent-solid";
const ALCA_DA_IA = "!bg-cat-indigo-solid";

/** Uma linha de resumo do bloco, para baixo do nome. Nunca o texto inteiro. */
export function resumoDoBloco(data: FlowNodeData): { texto: string; mono: boolean } {
  const primeiraLinha = (t?: string) => (t ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const k = data.iconKey;
  if ((k === "http" || k === "tool-http" || k === "webhook") && (data.httpUrl || data.webhookUrl)) {
    const url = data.httpUrl || data.webhookUrl;
    return { texto: k === "webhook" ? `${url}` : `${data.httpMethod ?? "POST"} ${url}`, mono: true };
  }
  if (k === "wait" && data.waitDuration) return { texto: `Espera ${data.waitDuration} ${data.waitUnit ?? "minutos"}`, mono: false };
  if (k === "condition" && data.conditionExpression) return { texto: primeiraLinha(data.conditionExpression), mono: true };
  if (k === "variable" && data.variableName) return { texto: `→ {${data.variableName}}`, mono: true };
  if (k === "email" && data.emailTo) return { texto: `para: ${data.emailTo}`, mono: true };
  if (k === "ai-agent") {
    const coleta = (data.collectVars ?? []).filter((v) => v.key.trim()).length;
    const fonte = fonteDaIa(data) === "conexao" ? "Central de IA" : data.aiModel || "modelo não escolhido";
    return { texto: coleta > 0 ? `${fonte} · coleta ${coleta} dado${coleta === 1 ? "" : "s"}` : fonte, mono: false };
  }
  if (k === "tool-mcp") {
    const n = (data.mcpTools ?? []).length;
    return { texto: n > 0 ? `${n} ferramenta${n === 1 ? "" : "s"}` : "Todas as ferramentas", mono: false };
  }
  if (k === "tool-knowledge") return { texto: "Busca nos documentos", mono: false };
  if (k === "studio-block") {
    const fala = primeiraLinha((data.blockContents ?? []).find((c) => c.type === "text" && c.text?.trim())?.text);
    if (fala) return { texto: fala, mono: false };
  }
  // Mensagem e pergunta: o começo do que o agente diz é o melhor resumo.
  if (k === "message" || k === "capture") {
    const fala = primeiraLinha(data.detail);
    if (fala) return { texto: fala, mono: false };
  }
  if (k === "capture" && data.variableName) return { texto: `→ {${data.variableName}}`, mono: true };
  return { texto: data.kind ?? "", mono: false };
}

// Pulso do fio, brilho do caminho ativo e foco do nó. <style> local porque o
// CSS global é de outro dono; tudo com prefixo "fluxo-agente".
// pathLength=100 no traço: o pulso leva o mesmo tempo em fio curto ou longo.
export const CSS_DO_FLUXO_DO_AGENTE = `
@keyframes fluxo-agente-pulso { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -100; } }
.fluxo-agente .fluxo-agente-brilho { filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent-solid) 75%, transparent)); }
.fluxo-agente .fluxo-agente-pulso { stroke-dasharray: 9 91; animation: fluxo-agente-pulso 1.8s linear infinite; }
@media (prefers-reduced-motion: reduce) { .fluxo-agente .fluxo-agente-pulso { animation-duration: 5.4s; } }
.fluxo-agente .react-flow__node:focus-visible { outline: none; }
.fluxo-agente .react-flow__node:focus-visible .fluxo-agente-quadrado { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
.fluxo-agente .react-flow__connection-path { stroke: var(--accent-solid); stroke-width: 1.75px; }
`;

/**
 * Dados que o canvas inteiro compartilha com os nós: a última execução e a
 * cascata de entrada. Ficam num contexto (e não num nodeTypes recriado) para
 * os nós não serem desmontados quando a execução chega.
 */
export interface CanvasDoAgente {
  execucao?: Record<string, NodeRunState>;
  /** Primeiros instantes do canvas: os nós entram em cascata da esquerda. */
  abrindo: boolean;
  xInicial: number;
  /** "+" de uma saída livre: cria o bloco já ligado nela. */
  adicionarNaSaida?: (noId: string, saida: string | null, iconKey: IconKey) => void;
  /** "+ ferramenta" do card da IA. */
  adicionarFerramenta?: (iaId: string, iconKey: IconKey) => void;
}

export const CanvasDoAgenteContext = React.createContext<CanvasDoAgente>({ abrindo: false, xInicial: 0 });

/**
 * Saída do bloco, na lateral direita do quadrado. Quando há mais de uma e a
 * saída ainda não tem fio, o nome dela aparece ao lado do ponto (com fio, o
 * nome já está no meio da ligação).
 */
function PontoDeSaida({ noId, saida, topo, aceso, mostrarNome }: { noId?: string; saida: Saida; topo: number; aceso: boolean; mostrarNome: boolean }) {
  const estilo = ESTILO_DA_SAIDA[saida.tipo];
  const { adicionarNaSaida } = React.useContext(CanvasDoAgenteContext);
  const ligacoes = useNodeConnections({ handleType: "source", handleId: saida.id ?? undefined });
  // Saída padrão de um bloco que também tem nomeadas: o hook sem handleId
  // traria todas; filtra pela saída sem id.
  const livre = !ligacoes.some((l) => (l.sourceHandle ?? null) === saida.id);
  return (
    <>
      <Handle
        id={saida.id ?? undefined}
        type="source"
        position={Position.Right}
        aria-label={saida.rotulo ? `Saída: ${saida.rotulo}` : "Saída"}
        style={{ top: topo }}
        className={cn(ALCA, aceso ? ALCA_ACESA : saida.tipo === "padrao" ? ALCA_PADRAO : estilo.ponto)}
      />
      {/* Saída sem fio: "+" que cria o próximo bloco já ligado aqui. */}
      {livre && noId && adicionarNaSaida && (
        <span style={{ top: topo }} className="absolute left-[calc(100%+8px)] z-10 -translate-y-1/2">
          <MenuDeBlocos
            ferramentas={false}
            rotulo={saida.rotulo ? `Adicionar depois de "${saida.rotulo}"` : "Adicionar o próximo bloco"}
            escolher={(k) => adicionarNaSaida(noId, saida.id ?? null, k)}
            className="h-5 w-5"
          />
        </span>
      )}
      {mostrarNome && saida.rotulo && livre && (
        <span
          aria-hidden="true"
          style={{ top: topo }}
          className={cn(
            "pointer-events-none absolute max-w-[104px] -translate-y-1/2 truncate font-mono text-caption leading-4",
            noId && adicionarNaSaida ? "left-[calc(100%+32px)]" : "left-[calc(100%+10px)]",
            estilo.texto
          )}
        >
          {saida.rotulo}
        </span>
      )}
    </>
  );
}

export function FlowNode({
  id,
  data,
  selected,
  run,
  atraso = 0,
}: {
  /** id do nó no canvas: com ele, o React Flow remede os pontos quando as saídas mudam. */
  id?: string;
  data: FlowNodeData;
  selected?: boolean;
  run?: NodeRunState;
  /** Atraso da entrada em cascata (s); só na abertura do canvas. */
  atraso?: number;
}) {
  const calmo = useReducedMotion();
  const cor = CATEGORY_CLASSES[BLOCK_CATEGORY[data.iconKey as IconKey] ?? "blue"];
  const isAiAgent = data.iconKey === "ai-agent";
  const isTool = ehFerramenta(data.iconKey);
  const inicio = data.iconKey === "start";
  const fim = data.iconKey === "end";
  // Motivo pelo qual o bloco não vai funcionar, se houver: marcador no canto
  // e o texto ao passar o mouse.
  const problema = validateNode(data);
  const saidas = saidasDoBloco(data);
  const altura = alturaDoQuadrado(saidas.length);
  const varias = saidas.length > 1 || saidas.some((s) => s.rotulo);
  const resumo = resumoDoBloco(data);
  const aceso = !!run?.ok;
  const falhou = !!run && !run.ok;

  // Opção de menu criada/apagada ou condição trocada: os pontos mudam de
  // lugar e o React Flow precisa medir de novo, senão a ligação sai do lugar
  // antigo.
  const updateNodeInternals = useUpdateNodeInternals();
  const assinaturaDasSaidas = saidas.map((s) => s.id ?? "-").join("|");
  React.useEffect(() => {
    if (id) updateNodeInternals(id);
  }, [id, assinaturaDasSaidas, updateNodeInternals]);

  const entrada = { ...MOLA, delay: atraso };
  const dica = [data.label, problema].filter(Boolean).join(" · ");

  return (
    // A caixa medida pelo React Flow: o quadrado em cima e o nome embaixo.
    // A escala da entrada/hover vive numa camada de dentro do quadrado, para
    // não mexer nos pontos de ligação nem nos fios.
    <div className={cn("relative flex flex-col items-center", isAiAgent && "pb-5")} style={{ width: LADO_DO_NO }}>
      <div className="relative" style={{ width: LADO_DO_NO, height: altura }}>
        {!isTool && data.hasTarget !== false && (
          <Handle
            type="target"
            position={Position.Left}
            aria-label="Entrada"
            style={{ top: LADO_DO_NO / 2 }}
            className={cn(ALCA, aceso ? ALCA_ACESA : ALCA_PADRAO)}
          />
        )}

        <motion.div
          initial={calmo ? { opacity: 0 } : { opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={calmo ? undefined : { scale: 1.04 }}
          whileTap={calmo ? undefined : { scale: 0.97 }}
          transition={entrada}
          title={dica}
          style={{ backgroundImage: LUZ_DE_CIMA }}
          className={cn(
            "fluxo-agente-quadrado absolute inset-0 flex items-center justify-center border bg-panel transition-[border-color,box-shadow] duration-200",
            // Início com a frente redonda (é por onde a conversa começa),
            // Encerrar com o fim redondo; ferramenta é redonda: fica pendurada
            // no bloco de IA, não no caminho da conversa.
            isTool ? "rounded-full" : inicio ? "rounded-[20px] rounded-l-[44px]" : fim ? "rounded-[20px] rounded-r-[44px]" : "rounded-[20px]",
            selected
              ? BRILHO_SELECIONADO
              : falhou
                ? BRILHO_FALHOU
                : aceso
                  ? "border-[color-mix(in_srgb,var(--accent-solid)_60%,transparent)]"
                  : "border-border-default hover:border-border-strong"
          )}
        >
          <IconeDoBloco iconKey={data.iconKey} reserva={ICON_REGISTRY.message} size={30} strokeWidth={1.6} className={cor.fg} />

          {/* Canto: X se falhou na última execução, marcador se falta algo,
              check discreto se está pronto. */}
          {falhou ? (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger-solid text-text-on-danger"
              title={run?.error ?? "Falhou na última execução"}
            >
              <X size={11} aria-hidden="true" />
            </span>
          ) : problema ? (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-warning/50 bg-warning-subtle text-warning"
              title={problema}
              aria-label={problema}
            >
              <AlertCircle size={11} aria-hidden="true" />
            </span>
          ) : !fim && !isTool ? (
            <Check
              size={12}
              strokeWidth={2.4}
              aria-label="Configurado"
              className={cn("absolute right-2.5 top-2.5", aceso ? "text-accent-fg" : "text-text-tertiary opacity-70")}
            />
          ) : null}

          {run && (
            <span
              title={run.error ?? `Rodou em ${run.ms} ms na última execução`}
              className={cn(
                "absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border bg-raised px-1.5 font-mono text-caption leading-4 tabular-nums",
                run.ok ? "border-border-subtle text-text-secondary" : "border-danger/40 text-danger"
              )}
            >
              {run.ok ? `${run.ms} ms` : "erro"}
            </span>
          )}
        </motion.div>

        {saidas.map((s, i) => (
          <PontoDeSaida
            key={s.id ?? "padrao"}
            noId={id}
            saida={s}
            topo={saidas.length === 1 ? LADO_DO_NO / 2 : ((i + 1) / (saidas.length + 1)) * altura}
            aceso={aceso && saidas.length === 1}
            mostrarNome={varias}
          />
        ))}

        {isTool && (
          <Handle
            type="source"
            position={Position.Top}
            aria-label="Ligar a um bloco de IA"
            className={cn(ALCA, ALCA_DA_IA)}
          />
        )}
      </div>

      {/* Nome e resumo embaixo do quadrado: uma linha cada, cortadas. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: atraso + 0.08 }}
        className="mt-3 flex w-[176px] flex-col items-center gap-0.5 text-center"
      >
        <p className={cn("max-w-full truncate text-small font-medium leading-tight", selected ? "text-accent-fg" : "text-text-primary")}>
          {data.label}
        </p>
        {resumo.texto && (
          <p className={cn("max-w-full truncate text-caption leading-tight text-text-tertiary", resumo.mono && "font-mono")}>{resumo.texto}</p>
        )}
        {isAiAgent && id && <FerramentasDaIa iaId={id} />}
      </motion.div>

      {/* Porta de ferramentas do bloco de IA: embaixo, depois do nome (o fio
          da ferramenta sobe sem passar por cima do texto). Só ferramenta liga
          aqui (ver isValidConnection no builder). */}
      {isAiAgent && (
        <>
          <Handle id="tools" type="target" position={Position.Bottom} aria-label="Ferramentas" className={cn(ALCA, ALCA_DA_IA)} />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-[calc(50%+10px)] translate-y-1/2 font-mono text-caption leading-4 text-text-tertiary">
            ferramentas
          </span>
        </>
      )}
    </div>
  );
}

/**
 * O que a IA pode usar, escrito no próprio card ("usa: Buscar na base ·
 * Registrar lead") com "+ ferramenta". Antes só havia blocos redondos
 * pendurados embaixo, e não dava para saber qual IA usava o quê.
 */
function FerramentasDaIa({ iaId }: { iaId: string }) {
  const { adicionarFerramenta } = React.useContext(CanvasDoAgenteContext);
  const ligacoes = useNodeConnections({ id: iaId, handleType: "target", handleId: "tools" });
  const dados = useNodesData<Node<FlowNodeData>>(ligacoes.map((l) => l.source));
  const nomes = dados.map((d) => d.data.label).filter(Boolean);
  return (
    <div className="pointer-events-auto mt-1 flex max-w-full items-center justify-center gap-1">
      <span className="max-w-[140px] truncate text-caption leading-tight text-text-tertiary" title={nomes.join(", ")}>
        {nomes.length ? `usa: ${nomes.join(" · ")}` : "sem ferramentas"}
      </span>
      {adicionarFerramenta && (
        <MenuDeBlocos
          ferramentas
          rotulo="Dar uma ferramenta a esta IA"
          escolher={(k) => adicionarFerramenta(iaId, k)}
          className="h-5 shrink-0 gap-0.5 px-1.5 text-caption"
        >
          + ferramenta
        </MenuDeBlocos>
      )}
    </div>
  );
}

/** O nó do React Flow: lê a execução e a cascata do contexto do canvas. */
export const NoDoFluxo = React.memo(function NoDoFluxo({ id, data, selected, positionAbsoluteX }: NodeProps<Node<FlowNodeData>>) {
  const canvas = React.useContext(CanvasDoAgenteContext);
  // A cascata é decidida na montagem: bloco novo depois entra na hora.
  const [atraso] = React.useState(() =>
    canvas.abrindo ? Math.min(Math.max(0, Math.round((positionAbsoluteX - canvas.xInicial) / 320)), 8) * 0.07 : 0
  );
  return <FlowNode id={id} data={data} selected={selected} run={canvas.execucao?.[id]} atraso={atraso} />;
});
