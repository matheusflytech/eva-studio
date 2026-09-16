"use client";

import * as React from "react";
import { Trash2, X, Plus } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Node } from "@xyflow/react";
import type { FlowNodeData, MenuOption } from "./flow-node";
import { VariablePicker } from "./variable-picker";
import { generateId } from "@/lib/utils";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";
import { CredentialSelect } from "./credential-select";
import { KeyValueList } from "./key-value-list";

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "moonshotai/kimi-k2-instruct",
];

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

  return (
    <div className="glass-card glass-card-solid w-[260px] rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Bloco selecionado</p>
        <button type="button" onClick={onClose} className="text-text-tertiary transition-colors hover:text-text-primary">
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="node-label">Nome</Label>
          <Input id="node-label" value={node.data.label} onChange={(e) => onChange({ label: e.target.value })} />
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
            <CredentialSelect
              type="groq"
              label="Credencial Groq"
              value={node.data.aiCredentialId}
              onChange={(id) => onChange({ aiCredentialId: id })}
            />
            <div>
              <Label htmlFor="node-ai-model">Modelo</Label>
              <Select
                id="node-ai-model"
                value={node.data.aiModel ?? GROQ_MODELS[0]}
                onChange={(e) => onChange({ aiModel: e.target.value })}
              >
                {GROQ_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>
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

        <button
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger/20"
        >
          <Trash2 size={13} /> Excluir bloco
        </button>
      </div>
    </div>
  );
}
