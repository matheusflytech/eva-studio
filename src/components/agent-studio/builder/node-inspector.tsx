"use client";

import * as React from "react";
import { Trash2, X, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Node } from "@xyflow/react";
import type { FlowNodeData, MenuOption } from "./flow-node";
import { VariablePicker } from "./variable-picker";
import { generateId } from "@/lib/utils";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";
import { CredentialSelect } from "./credential-select";
import { KeyValueList } from "./key-value-list";
import { McpToolPicker } from "./mcp-tool-picker";
import { CrmBlockFields } from "./crm-block-fields";

import { LLM_PROVIDERS, getProvider } from "@/lib/llm-providers";
import { ICON_REGISTRY } from "./icon-registry";
import { BLOCK_STYLES } from "./block-styles";
import { PALETTE_GROUPS } from "./palette-groups";
import { validateNode } from "./block-validation";
import { cn } from "@/lib/utils";

/** Como o bloco se chama e o que ele faz, na linguagem da paleta. */
const DICIONARIO = new Map(
  PALETTE_GROUPS.flatMap((g) => g.items.map((i) => [i.key, { label: i.label, hint: i.hint }]))
);

/**
 * O que o cliente vê.
 *
 * Um painel de configuração mostra campos; ele não mostra o resultado. Para
 * bloco de conversa o resultado é uma bolha de mensagem, e ver a bolha ao lado
 * do campo é a diferença entre escrever no escuro e escrever olhando.
 */
function PreviaDaBolha({ texto, opcoes }: { texto: string; opcoes?: { id: string; label: string }[] }) {
  if (!texto.trim() && (opcoes ?? []).length === 0) return null;
  return (
    <div className="rounded-xl bg-[#0b141a] p-2.5">
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/30">o cliente vê</p>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#202c33] px-3 py-2">
        <p className="whitespace-pre-wrap text-[12.5px] leading-snug text-white/90">
          {texto.trim() || "..."}
        </p>
      </div>
      {(opcoes ?? []).length > 0 && (
        <div className="mt-1.5 flex max-w-[85%] flex-wrap gap-1">
          {opcoes!.map((o) => (
            <span
              key={o.id}
              className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] text-white/70"
            >
              {o.label || "opção"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateSelect({
  agentId,
  value,
  onChange,
}: {
  agentId: string;
  value: string | undefined;
  onChange: (templateId: string | undefined) => void;
}) {
  const [templates, setTemplates] = React.useState<MessageTemplate[] | null>(null);

  React.useEffect(() => {
    listTemplates(agentId).then(setTemplates).catch(() => setTemplates([]));
  }, [agentId]);

  return (
    <div>
      <Label htmlFor="node-template">Modelo fora da janela de 24h (WhatsApp oficial)</Label>
      <Select
        id="node-template"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        disabled={templates === null}
      >
        <option value="">Nenhum (tenta texto livre mesmo assim)</option>
        {(templates ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
      <p className="mt-1.5 text-[11.5px] text-text-tertiary">
        Se a conversa (no canal WhatsApp oficial) estiver fora da janela de 24h, esse modelo aprovado é usado em vez
        do texto acima. Cadastre modelos na aba do agente, em &quot;Modelos de mensagem&quot;.
      </p>
    </div>
  );
}

export function NodeInspector({
  node,
  agentId,
  variables,
  onChange,
  onDelete,
  onClose,
}: {
  node: Node<FlowNodeData>;
  agentId: string;
  variables: string[];
  onChange: (data: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { iconKey } = node.data;
  const detailRef = React.useRef<HTMLTextAreaElement>(null);
  const conditionRef = React.useRef<HTMLTextAreaElement>(null);
  const variableExpressionRef = React.useRef<HTMLTextAreaElement>(null);

  const Icone = ICON_REGISTRY[iconKey];
  const estilo = BLOCK_STYLES[iconKey];
  const doDicionario = DICIONARIO.get(iconKey);
  // O que impede este bloco de funcionar — a mesma regra do aviso no canvas,
  // dita aqui dentro, onde tem o campo pra resolver.
  const pendencia = validateNode(node.data);
  const daConversa = iconKey === "message" || iconKey === "capture";

  return (
    <div className="glass-card glass-card-solid flex max-h-[calc(100vh-190px)] w-[340px] flex-col overflow-hidden rounded-3xl">
      {/* Cabeçalho: o tipo do bloco primeiro. "Bloco selecionado" não dizia
          nada — a pessoa já sabe que selecionou; o que ela não sabe é o que
          este bloco faz e se está pronto. */}
      <header className="flex items-start gap-3 border-b border-border-subtle p-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            estilo?.badgeBg,
            estilo?.badgeText
          )}
        >
          <Icone size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-text-primary">
            {doDicionario?.label ?? iconKey}
          </p>
          <p className="truncate text-[11.5px] text-text-tertiary">{doDicionario?.hint ?? ""}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
        >
          <X size={15} />
        </button>
      </header>

      <div
        className={cn(
          "flex items-start gap-2 px-4 py-2.5 text-[12px]",
          pendencia ? "bg-amber-400/10 text-amber-300" : "bg-emerald-500/8 text-emerald-300"
        )}
      >
        {pendencia ? (
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
        )}
        <span>{pendencia ?? "Pronto pra rodar."}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {daConversa && (
          <PreviaDaBolha
            texto={node.data.detail ?? ""}
            opcoes={iconKey === "capture" ? node.data.options : undefined}
          />
        )}

        <div>
          <Label htmlFor="node-label">Nome do bloco</Label>
          <Input id="node-label" value={node.data.label} onChange={(e) => onChange({ label: e.target.value })} />
          <p className="mt-1 text-[11px] text-text-tertiary">
            Só aparece no canvas, pra você achar o bloco. O cliente não vê.
          </p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="mb-0" htmlFor="node-detail">Detalhe / mensagem</Label>
            <VariablePicker
              variables={variables}
              targetRef={detailRef}
              value={node.data.detail ?? ""}
              onChange={(next) => onChange({ detail: next })}
            />
          </div>
          <Textarea
            id="node-detail"
            ref={detailRef}
            rows={4}
            value={node.data.detail ?? ""}
            onChange={(e) => onChange({ detail: e.target.value })}
          />
        </div>

        {iconKey === "message" && (
          <TemplateSelect
            agentId={agentId}
            value={node.data.templateId}
            onChange={(templateId) => onChange({ templateId })}
          />
        )}

        {iconKey === "condition" && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0" htmlFor="node-condition">Condição</Label>
              <VariablePicker
                variables={variables}
                targetRef={conditionRef}
                value={node.data.conditionExpression ?? ""}
                onChange={(next) => onChange({ conditionExpression: next })}
              />
            </div>
            <Textarea
              id="node-condition"
              ref={conditionRef}
              rows={2}
              placeholder='ex: {opcao} == "comercial"'
              value={node.data.conditionExpression ?? ""}
              onChange={(e) => onChange({ conditionExpression: e.target.value })}
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Conecte a saída <span className="text-emerald-400">Sim</span> e a saída <span className="text-danger">Não</span> a blocos diferentes.
              Aceita <code>==</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code> contra texto entre aspas ou número.
            </p>
          </div>
        )}

        {iconKey === "capture" && (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="node-capture-var">Guardar resposta na variável</Label>
              <Input
                id="node-capture-var"
                placeholder="ex: opcao_escolhida"
                value={node.data.variableName ?? ""}
                onChange={(e) => onChange({ variableName: e.target.value })}
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="mb-0">Botões (opcional)</Label>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      options: [...(node.data.options ?? []), { id: generateId(), label: "" }],
                    })
                  }
                  className="flex items-center gap-1 text-[11.5px] font-medium text-accent-400 hover:text-accent-500"
                >
                  <Plus size={12} /> Adicionar
                </button>
              </div>
              <p className="mb-2 text-[11.5px] text-text-tertiary">
                Se tiver botões, o WhatsApp manda como toque (não texto livre) e cada um vira uma saída própria no canvas.
              </p>
              <div className="flex flex-col gap-1.5">
                {(node.data.options ?? []).map((opt: MenuOption, i: number) => (
                  <div key={opt.id} className="flex items-center gap-1.5">
                    <Input
                      value={opt.label}
                      placeholder={`Opção ${i + 1}`}
                      onChange={(e) => {
                        const next = [...(node.data.options ?? [])];
                        next[i] = { ...next[i], label: e.target.value };
                        onChange({ options: next });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = (node.data.options ?? []).filter((_: MenuOption, idx: number) => idx !== i);
                        onChange({ options: next });
                      }}
                      className="shrink-0 rounded-lg p-2 text-text-tertiary hover:bg-surface-3 hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {iconKey === "variable" && (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="node-variable">Nome da variável</Label>
              <Input
                id="node-variable"
                placeholder="ex: nome_cliente"
                value={node.data.variableName ?? ""}
                onChange={(e) => onChange({ variableName: e.target.value })}
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="mb-0" htmlFor="node-variable-expr">Expressão (opcional)</Label>
                <VariablePicker
                  variables={variables}
                  targetRef={variableExpressionRef}
                  value={node.data.variableExpression ?? ""}
                  onChange={(next) => onChange({ variableExpression: next })}
                />
              </div>
              <Textarea
                id="node-variable-expr"
                ref={variableExpressionRef}
                rows={2}
                placeholder='ex: {preco} + {frete}  ou  {nome} {sobrenome}'
                value={node.data.variableExpression ?? ""}
                onChange={(e) => onChange({ variableExpression: e.target.value })}
              />
              <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                Vazio: só garante que a variável existe. Com soma/subtração de dois números, calcula; qualquer outro
                texto, concatena as variáveis interpoladas (ex: juntar nome + sobrenome).
              </p>
            </div>
          </div>
        )}

        {iconKey === "webhook" && (
          <div>
            <Label htmlFor="node-webhook">URL do webhook</Label>
            <Input
              id="node-webhook"
              placeholder="https://seu-n8n.com/webhook/..."
              className="font-mono text-[12.5px]"
              value={node.data.webhookUrl ?? ""}
              onChange={(e) => onChange({ webhookUrl: e.target.value })}
            />
            <Label htmlFor="node-webhook-var" className="mt-3">Guardar resposta na variável</Label>
            <Input
              id="node-webhook-var"
              placeholder="ex: resposta_api"
              value={node.data.variableName ?? ""}
              onChange={(e) => onChange({ variableName: e.target.value })}
            />
          </div>
        )}

        {(iconKey === "http" || iconKey === "tool-http") && (
          <div className="flex flex-col gap-3">
            {iconKey === "tool-http" && (
              <p className="text-[11.5px] text-text-tertiary">
                Qualquer <code>{"{parametro}"}</code> usado abaixo que não seja uma variável já capturada vira algo
                que o próprio Agente de IA decide preencher na hora de chamar essa ferramenta.
              </p>
            )}
            <div className="flex gap-2">
              <div className="w-[100px] shrink-0">
                <Label htmlFor="node-http-method">Método</Label>
                <Select
                  id="node-http-method"
                  value={node.data.httpMethod ?? "GET"}
                  onChange={(e) => onChange({ httpMethod: e.target.value as FlowNodeData["httpMethod"] })}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </Select>
              </div>
              <div className="flex-1">
                <Label htmlFor="node-http-url">URL</Label>
                <Input
                  id="node-http-url"
                  placeholder="https://api.exemplo.com/recurso"
                  className="font-mono text-[12.5px]"
                  value={node.data.httpUrl ?? ""}
                  onChange={(e) => onChange({ httpUrl: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="node-http-auth">Autenticação</Label>
              <Select
                id="node-http-auth"
                value={node.data.httpAuthType ?? "none"}
                onChange={(e) => onChange({ httpAuthType: e.target.value as FlowNodeData["httpAuthType"] })}
              >
                <option value="none">Nenhuma</option>
                <option value="bearer">Bearer Token</option>
                <option value="header">Header customizado</option>
              </Select>
              {node.data.httpAuthType && node.data.httpAuthType !== "none" && (
                <Input
                  className="mt-1.5 font-mono text-[12.5px]"
                  placeholder={node.data.httpAuthType === "bearer" ? "token" : "Nome-do-Header: valor"}
                  value={node.data.httpAuthValue ?? ""}
                  onChange={(e) => onChange({ httpAuthValue: e.target.value })}
                />
              )}
            </div>

            <KeyValueList
              label="Headers"
              rows={node.data.httpHeaders ?? []}
              onChange={(rows) => onChange({ httpHeaders: rows })}
            />
            <KeyValueList
              label="Query params"
              rows={node.data.httpQueryParams ?? []}
              onChange={(rows) => onChange({ httpQueryParams: rows })}
            />

            <div>
              <Label htmlFor="node-http-body">Corpo (JSON)</Label>
              <Textarea
                id="node-http-body"
                rows={3}
                className="font-mono text-[12px]"
                placeholder='{"nome": "{nome_cliente}"}'
                value={node.data.httpBody ?? ""}
                onChange={(e) => onChange({ httpBody: e.target.value })}
              />
            </div>

            {iconKey === "http" && (
              <div>
                <Label htmlFor="node-http-var">Guardar resposta na variável</Label>
                <Input
                  id="node-http-var"
                  placeholder="ex: resposta_api"
                  value={node.data.variableName ?? ""}
                  onChange={(e) => onChange({ variableName: e.target.value })}
                />
              </div>
            )}
          </div>
        )}

        {iconKey === "email" && (
          <div className="flex flex-col gap-3">
            <CredentialSelect
              type="resend"
              label="Credencial Resend"
              value={node.data.emailCredentialId}
              onChange={(id) => onChange({ emailCredentialId: id })}
            />
            <div>
              <Label htmlFor="node-email-from">De</Label>
              <Input
                id="node-email-from"
                placeholder="contato@seudominio.com"
                value={node.data.emailFrom ?? ""}
                onChange={(e) => onChange({ emailFrom: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="node-email-to">Para</Label>
              <Input
                id="node-email-to"
                placeholder="{email_cliente}"
                value={node.data.emailTo ?? ""}
                onChange={(e) => onChange({ emailTo: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="node-email-subject">Assunto</Label>
              <Input
                id="node-email-subject"
                value={node.data.emailSubject ?? ""}
                onChange={(e) => onChange({ emailSubject: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="node-email-body">Corpo</Label>
              <Textarea
                id="node-email-body"
                rows={4}
                value={node.data.emailBody ?? ""}
                onChange={(e) => onChange({ emailBody: e.target.value })}
              />
            </div>
          </div>
        )}

        {iconKey === "ai-agent" && (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="node-ai-provider">Provedor</Label>
              <Select
                id="node-ai-provider"
                value={node.data.aiProvider ?? "groq"}
                onChange={(e) => {
                  // Trocar de provedor invalida modelo e credencial: o modelo
                  // não existe no outro, e a chave é de outro serviço.
                  const next = getProvider(e.target.value);
                  onChange({
                    aiProvider: next.id,
                    aiModel: next.models[0].id,
                    aiCredentialId: undefined,
                  });
                }}
              >
                {LLM_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </div>
            <CredentialSelect
              type={getProvider(node.data.aiProvider).credentialType}
              label={`Credencial ${getProvider(node.data.aiProvider).label}`}
              value={node.data.aiCredentialId}
              onChange={(id) => onChange({ aiCredentialId: id })}
            />
            <div>
              <Label htmlFor="node-ai-model">Modelo</Label>
              <Select
                id="node-ai-model"
                value={node.data.aiModel ?? getProvider(node.data.aiProvider).models[0].id}
                onChange={(e) => onChange({ aiModel: e.target.value })}
              >
                {getProvider(node.data.aiProvider).models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </Select>
            </div>
            {getProvider(node.data.aiProvider).format === "anthropic" && (
              <div>
                <Label htmlFor="node-ai-effort">Esforço de raciocínio</Label>
                <Select
                  id="node-ai-effort"
                  value={node.data.aiEffort ?? "low"}
                  onChange={(e) => onChange({ aiEffort: e.target.value as "low" | "medium" | "high" })}
                >
                  <option value="low">Baixo — resposta rápida (recomendado para chat)</option>
                  <option value="medium">Médio</option>
                  <option value="high">Alto — pensa mais, demora mais</option>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="node-ai-memory">Janela de memória (mensagens anteriores)</Label>
              <Input
                id="node-ai-memory"
                type="number"
                min={0}
                placeholder="20"
                value={node.data.aiMemoryWindow ?? ""}
                onChange={(e) => onChange({ aiMemoryWindow: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <KeyValueList
              label="Variáveis para coletar"
              rows={node.data.collectVars ?? []}
              onChange={(rows) => onChange({ collectVars: rows })}
              keyPlaceholder="nome_variavel"
              valuePlaceholder="descrição — o que é e como reconhecer"
            />
            <p className="text-[11.5px] text-text-tertiary">
              O texto em &quot;Detalhe / mensagem&quot; acima é o system prompt (instruções) do agente. Conecte blocos
              de Ferramenta na porta roxa embaixo desse card pra dar ferramentas a ele — ele decide sozinho quando
              usar cada uma. Nas &quot;Variáveis para coletar&quot;, cada linha vira um dado que o agente tenta
              extrair da conversa (o modelo chama uma ferramenta interna sempre que identifica um valor) e pergunta
              ativamente pelo que ainda falta.
            </p>
          </div>
        )}

        {(iconKey.startsWith("crm-") || iconKey === "tool-crm") && (
          <CrmBlockFields iconKey={iconKey} data={node.data} onChange={onChange} />
        )}

        {iconKey === "tool-mcp" && (
          <div className="flex flex-col gap-3">
            <McpToolPicker
              serverId={node.data.mcpServerId}
              selectedTools={node.data.mcpTools ?? []}
              onChange={onChange}
            />
            <p className="text-[11.5px] text-text-tertiary">
              Conecte este bloco na porta roxa embaixo de um Agente de IA. O agente lê a descrição de cada
              ferramenta que o servidor anuncia e decide sozinho quando chamar cada uma — você não precisa
              configurar parâmetro nenhum aqui.
            </p>
          </div>
        )}

        {iconKey === "tool-knowledge" && (
          <p className="text-[11.5px] text-text-tertiary">
            Sem configuração — quando conectado a um Agente de IA, ele pode buscar nos documentos já carregados na
            base de conhecimento desse agente sempre que achar relevante. A busca rankeia os trechos mais relevantes
            pra pergunta (não manda o documento inteiro), então funciona bem mesmo com bases maiores.
          </p>
        )}

        {iconKey === "wait" && (
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="node-wait-duration">Duração</Label>
              <Input
                id="node-wait-duration"
                type="number"
                min={1}
                value={node.data.waitDuration ?? 1}
                onChange={(e) => onChange({ waitDuration: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="node-wait-unit">Unidade</Label>
              <Select
                id="node-wait-unit"
                value={node.data.waitUnit ?? "minutos"}
                onChange={(e) => onChange({ waitUnit: e.target.value as FlowNodeData["waitUnit"] })}
              >
                <option value="segundos">segundos</option>
                <option value="minutos">minutos</option>
                <option value="horas">horas</option>
              </Select>
            </div>
          </div>
        )}

      </div>

      {/* Apagar é a única ação destrutiva da tela; fica no rodapé, separada,
          e discreta até o ponteiro chegar nela. */}
      <footer className="border-t border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={13} /> Excluir bloco
        </button>
      </footer>
    </div>
  );
}
