"use client";

import * as React from "react";
import { Handle, Position } from "@xyflow/react";
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
  // Bloco Agente de IA nativo (via credencial Groq) — "detail" é reaproveitado
  // como o system prompt/instruções.
  aiCredentialId?: string;
  aiModel?: string;
  // Quantas mensagens anteriores da conversa entram no contexto (janela
  // deslizante, sem sumarização — ver runAiAgent em flow-engine.ts).
  aiMemoryWindow?: number;
  // Cada linha = uma variável que o agente tenta extrair da conversa (chave =
  // nome da variável, valor = descrição/como reconhecer) — reaproveita
  // KeyValueRow em vez de um tipo novo.
  collectVars?: KeyValueRow[];
  [key: string]: unknown;
}

function ConfigPreview({ data }: { data: FlowNodeData }) {
  if ((data.iconKey === "webhook" || data.iconKey === "http" || data.iconKey === "tool-http") && (data.webhookUrl || data.httpUrl)) {
    const url = data.httpUrl || data.webhookUrl;
    const method = data.httpMethod ?? "POST";
    return (
      <p className="mt-2 truncate rounded-lg bg-surface-3 px-2 py-1 font-mono text-[10.5px] text-text-tertiary">
        {data.iconKey !== "webhook" && <span className="font-semibold text-teal-400">{method}</span>} {url}
      </p>
    );
  }
  if (data.iconKey === "wait" && data.waitDuration) {
    return <p className="mt-2 text-[11px] text-text-tertiary">Espera {data.waitDuration} {data.waitUnit ?? "minutos"}</p>;
  }
  if ((data.iconKey === "variable" || data.iconKey === "capture") && data.variableName) {
    return (
      <p className="mt-2 truncate rounded-lg bg-surface-3 px-2 py-1 font-mono text-[10.5px] text-text-tertiary">
        <span className="text-text-tertiary/70">→ salva em</span> {"{" + data.variableName + "}"}
      </p>
    );
  }
  if (data.iconKey === "condition" && data.conditionExpression) {
    return (
      <p className="mt-2 truncate rounded-lg bg-surface-3 px-2 py-1 font-mono text-[10.5px] text-text-tertiary">
        {data.conditionExpression}
      </p>
    );
  }
  if (data.iconKey === "email" && data.emailTo) {
    return <p className="mt-2 truncate rounded-lg bg-surface-3 px-2 py-1 font-mono text-[10.5px] text-text-tertiary">para: {data.emailTo}</p>;
  }
  if (data.iconKey === "ai-agent") {
    const varCount = (data.collectVars ?? []).filter((v) => v.key.trim()).length;
    return (
      <p className="mt-2 truncate rounded-lg bg-surface-3 px-2 py-1 font-mono text-[10.5px] text-text-tertiary">
        {data.aiModel || "modelo não escolhido"}
        {varCount > 0 && ` · coleta ${varCount} dado${varCount === 1 ? "" : "s"}`}
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
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="nodrag mt-2.5 w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[12px] leading-relaxed text-text-secondary outline-none transition-colors hover:border-border-subtle focus:border-accent-500/50 focus:bg-surface-3"
    />
  );
}

const HANDLE_DOT = "!h-2.5 !w-2.5 !border-2 !border-surface-1 !bg-border-strong";

export function FlowNode({
  data,
  selected,
  onDetailChange,
}: {
  data: FlowNodeData;
  selected?: boolean;
  onDetailChange?: (text: string) => void;
}) {
  const Icon = ICON_REGISTRY[data.iconKey] ?? ICON_REGISTRY.message;
  const style = BLOCK_STYLES[data.iconKey] ?? BLOCK_STYLES.message;
  const isCondition = data.iconKey === "condition";
  const isAiAgent = data.iconKey === "ai-agent";
  const isTool = data.iconKey === "tool-http" || data.iconKey === "tool-knowledge";
  const options = data.iconKey === "capture" ? data.options ?? [] : [];
  const isMenu = options.length > 0;
  const editableDetail = onDetailChange && data.iconKey !== "condition" && data.iconKey !== "start";

  return (
    <div
      className={cn(
        "glass-card w-[230px] cursor-pointer rounded-2xl border-l-[3px] p-3.5 transition-colors",
        style.border,
        selected ? "border-border-strong ring-1 ring-white/15" : "border-border-subtle"
      )}
    >
      {/* Fluxo principal: horizontal (esquerda→direita), igual n8n. Ferramentas
          de um Agente de IA são a exceção — continuam verticais (porta embaixo),
          mesma convenção do n8n pros sub-inputs de IA (modelo/ferramenta/memória). */}
      {!isTool && data.hasTarget !== false && (
        <Handle type="target" position={Position.Left} className={cn(HANDLE_DOT, "!left-0")} />
      )}
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", style.badgeBg, style.badgeText)}>
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text-primary">{data.label}</p>
          {data.kind && <p className="truncate text-[11px] text-text-tertiary">{data.kind}</p>}
        </div>
      </div>

      {editableDetail ? (
        <AutoTextarea value={data.detail ?? ""} onCommit={(text) => onDetailChange!(text)} />
      ) : (
        data.detail && <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">{data.detail}</p>
      )}

      <ConfigPreview data={data} />

      {isMenu && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {options.map((opt, i) => (
            <div
              key={opt.id}
              className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-3 px-2 py-1.5 text-[11px] text-text-secondary"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-[9px] font-semibold text-accent-400">
                {i + 1}
              </span>
              <span className="truncate">{opt.label || "(sem texto)"}</span>
            </div>
          ))}
        </div>
      )}

      {isCondition ? (
        <>
          <div className="pointer-events-none mt-3 flex flex-col gap-4 text-[10px] font-medium">
            <span className="text-emerald-400">Sim</span>
            <span className="text-danger">Não</span>
          </div>
          <Handle id="true" type="source" position={Position.Right} style={{ top: "30%" }} className={cn(HANDLE_DOT, "!bg-emerald-400")} />
          <Handle id="false" type="source" position={Position.Right} style={{ top: "70%" }} className={cn(HANDLE_DOT, "!bg-danger")} />
        </>
      ) : isMenu ? (
        options.map((opt, i) => (
          <Handle
            key={opt.id}
            id={opt.id}
            type="source"
            position={Position.Right}
            style={{ top: `${((i + 1) / (options.length + 1)) * 100}%` }}
            className={cn(HANDLE_DOT, "!bg-accent-500")}
          />
        ))
      ) : (
        !isTool &&
        data.hasSource !== false && <Handle type="source" position={Position.Right} className={cn(HANDLE_DOT, "!right-0")} />
      )}

      {/* Porta de ferramentas do Agente de IA — tracejada, embaixo, igual n8n. */}
      {isAiAgent && (
        <Handle
          id="tools"
          type="target"
          position={Position.Bottom}
          className={cn(HANDLE_DOT, "!bottom-0 !bg-purple-400")}
        />
      )}
      {isTool && <Handle type="source" position={Position.Top} className={cn(HANDLE_DOT, "!top-0 !bg-purple-400")} />}
    </div>
  );
}
