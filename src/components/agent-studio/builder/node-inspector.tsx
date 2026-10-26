"use client";

import * as React from "react";
import { Trash2, X, CheckCircle2, AlertTriangle, Maximize2, Plus } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Node } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { VariablePicker } from "./variable-picker";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";
import { CredentialSelect } from "./credential-select";
import { ModeloSelect } from "./modelo-select";
import { fonteDaIa } from "./fonte-da-ia";
import { fonteDoEmail } from "./fonte-do-email";
import { EmailDoContrato } from "./email-do-contrato";
import { Notice } from "@/components/ui/notice";
import { KeyValueList } from "./key-value-list";
import { McpToolPicker } from "./mcp-tool-picker";
import { CrmBlockFields } from "./crm-block-fields";
import { CaptureConfig } from "./capture-config";
import { SaidasDaIa } from "./saidas-da-ia";
import { PainelDoBloco, type AbaDoBloco } from "./bloco-do-studio";
import { MenuDeBlocos } from "./menu-de-blocos";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Checkbox } from "@/components/ui/checkbox";
import type { IconKey } from "./icon-registry";
import type { KnowledgeDoc } from "@/lib/data/types";

import { LLM_PROVIDERS, getProvider } from "@/lib/llm-providers";
import { IconeDoBloco, seloDoBloco } from "./icone-do-bloco";
import { PALETTE_GROUPS } from "./palette-groups";
import { validateNode } from "./block-validation";
import { cn } from "@/lib/utils";
import { FLUXO_PRINCIPAL } from "@/lib/subfluxos";

// Acima disso a IA começa a esquecer partes do prompt (plano v7, A6).
const LIMITE_DO_PROMPT = 3000;

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
      <p className="mb-1.5 text-caption uppercase tracking-wide text-white/30">o cliente vê</p>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#202c33] px-3 py-2">
        <p className="whitespace-pre-wrap text-small leading-snug text-white/90">
          {texto.trim() || "…"}
        </p>
      </div>
      {(opcoes ?? []).length > 0 && (
        <div className="mt-1.5 flex max-w-[85%] flex-wrap gap-1">
          {opcoes!.map((o) => (
            <span
              key={o.id}
              className="rounded-full border border-white/20 px-2 py-0.5 text-caption text-white/70"
            >
              {o.label || "opção"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Grupo de campos com título: separa o que é modelo, resposta e coleta. */
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{titulo}</h3>
      {children}
    </section>
  );
}

/** Quais documentos da base esta ferramenta consulta; nenhum marcado = todos. */
function DocumentosDaBase({
  documentos,
  escolhidos,
  onChange,
}: {
  documentos: KnowledgeDoc[];
  escolhidos: string[];
  onChange: (ids: string[]) => void;
}) {
  if (documentos.length === 0) {
    return (
      <p className="text-caption text-text-tertiary">
        O agente ainda não tem documentos. Envie na tela do agente, em Base de conhecimento; esta ferramenta passa a
        buscar neles.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label className="mb-0">Documentos que esta IA consulta</Label>
      <p className="text-caption text-text-tertiary">
        {escolhidos.length === 0 ? "Nenhum marcado: busca em todos." : `Busca só em ${escolhidos.length} de ${documentos.length}.`}
      </p>
      <ul className="flex flex-col gap-1">
        {documentos.map((d) => (
          <li key={d.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-hover">
              <Checkbox
                checked={escolhidos.includes(d.id)}
                onCheckedChange={(v) => onChange(v === true ? [...escolhidos, d.id] : escolhidos.filter((id) => id !== d.id))}
                aria-label={d.fileName}
              />
              <span className="min-w-0 truncate text-small text-text-primary">{d.fileName}</span>
            </label>
          </li>
        ))}
      </ul>
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
      <p className="mt-1.5 text-caption text-text-tertiary">
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
  ferramentas = [],
  aoAdicionarFerramenta,
  aoAbrirBloco,
  documentos = [],
  embutido = false,
  fluxos = [],
}: {
  node: Node<FlowNodeData>;
  agentId: string;
  variables: string[];
  onChange: (data: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
  /** Ferramentas ligadas na porta da IA selecionada (aba Ferramentas). */
  ferramentas?: { id: string; label: string; iconKey: IconKey }[];
  aoAdicionarFerramenta?: (iconKey: IconKey) => void;
  aoAbrirBloco?: (id: string) => void;
  /** Base de conhecimento do agente (a Ferramenta: Base escolhe quais usar). */
  documentos?: KnowledgeDoc[];
  /** Dentro do painel de outro bloco (ação do Bloco): cartão, sem coluna própria. */
  embutido?: boolean;
  /** Fluxos extras do bot (bloco "Ir para fluxo"). */
  fluxos?: { id: string; name: string }[];
}) {
  const { iconKey } = node.data;
  const detailRef = React.useRef<HTMLTextAreaElement>(null);
  const conditionRef = React.useRef<HTMLTextAreaElement>(null);
  const variableExpressionRef = React.useRef<HTMLTextAreaElement>(null);

  const doDicionario = DICIONARIO.get(iconKey);
  // O que impede este bloco de funcionar — a mesma regra do aviso no canvas,
  // dita aqui dentro, onde tem o campo pra resolver.
  const pendencia = validateNode(node.data);
  const daConversa = iconKey === "message" || iconKey === "capture";
  const ehIa = iconKey === "ai-agent";
  const [textoAberto, setTextoAberto] = React.useState(false);
  // Abas só no bloco de IA: é o bloco com mais coisa para configurar.
  const [abaIa, setAbaIa] = React.useState<"instrucoes" | "saidas" | "ferramentas" | "configurar">("instrucoes");
  const ehBloco = iconKey === "studio-block";
  const [abaBloco, setAbaBloco] = React.useState<AbaDoBloco>("conteudo");
  // Nome do bloco: na primeira aba da IA e do Bloco; nos outros, sempre.
  const mostraNome = ehIa ? abaIa === "instrucoes" : ehBloco ? abaBloco === "conteudo" : true;

  return (
    <div
      className={
        embutido
          ? "flex flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-panel"
          : "flex h-full w-[clamp(340px,26vw,520px)] shrink-0 flex-col overflow-hidden rounded-[18px] border border-border-subtle bg-panel max-xl:absolute max-xl:inset-y-2 max-xl:right-2 max-xl:z-20 max-xl:h-auto max-xl:shadow-overlay"
      }
    >
      {/* Cabeçalho: o tipo do bloco primeiro. "Bloco selecionado" não dizia
          nada — a pessoa já sabe que selecionou; o que ela não sabe é o que
          este bloco faz e se está pronto. */}
      <header className="flex items-start gap-3 border-b border-border-subtle p-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]",
            seloDoBloco(iconKey)
          )}
        >
          <IconeDoBloco iconKey={iconKey} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-text-primary">
            {doDicionario?.label ?? iconKey}
          </p>
          <p className="truncate text-caption text-text-tertiary">{doDicionario?.hint ?? ""}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="-mr-1.5 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-tertiary transition-colors hover:bg-hover hover:text-text-primary"
        >
          <X size={15} />
        </button>
      </header>

      <div
        className={cn(
          "flex items-start gap-2 px-4 py-2.5 text-caption",
          pendencia ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success"
        )}
      >
        {pendencia ? (
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
        )}
        <span>{pendencia ?? "Pronto pra rodar."}</span>
      </div>

      {ehIa && (
        <div className="border-b border-border-subtle px-4 py-2.5">
          <SegmentedControl
            label="Partes do bloco de IA"
            value={abaIa}
            onChange={setAbaIa}
            // Quatro abas no painel mais estreito (340px): dividem a largura e encolhem a letra.
            className="flex w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-1 [&>button]:text-caption"
            options={[
              { value: "instrucoes", label: "Instruções" },
              { value: "saidas", label: "Saídas" },
              { value: "ferramentas", label: "Ferramentas" },
              { value: "configurar", label: "Configurar" },
            ]}
          />
        </div>
      )}

      {ehBloco && (
        <div className="border-b border-border-subtle px-4 py-2.5">
          <SegmentedControl
            label="Partes do bloco"
            value={abaBloco}
            onChange={setAbaBloco}
            className="flex w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-1 [&>button]:text-caption"
            options={[
              { value: "conteudo", label: "Conteúdo" },
              { value: "saidas", label: "Saídas" },
              { value: "acoes", label: "Ações" },
            ]}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
        {daConversa && (
          <PreviaDaBolha
            texto={node.data.detail ?? ""}
            opcoes={iconKey === "capture" ? node.data.options : undefined}
          />
        )}

        {mostraNome && (
        <>
        <div>
          <Label htmlFor="node-label">Nome do bloco</Label>
          <Input id="node-label" value={node.data.label} onChange={(e) => onChange({ label: e.target.value })} />
          <p className="mt-1 text-caption text-text-tertiary">
            Só aparece no canvas, pra você achar o bloco. O cliente não vê.
          </p>
        </div>
        {!ehBloco && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <Label className="mb-0" htmlFor="node-detail">
              {ehIa ? "Instruções desta IA" : daConversa ? "Mensagem" : "Detalhe"}
            </Label>
            <div className="flex items-center gap-1">
              {ehIa && (
                <button
                  type="button"
                  onClick={() => setTextoAberto(true)}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-caption text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
                >
                  <Maximize2 size={12} aria-hidden="true" /> Expandir
                </button>
              )}
              <VariablePicker
                variables={variables}
                targetRef={detailRef}
                value={node.data.detail ?? ""}
                onChange={(next) => onChange({ detail: next })}
              />
            </div>
          </div>
          <Textarea
            id="node-detail"
            ref={detailRef}
            rows={ehIa ? 12 : 4}
            className={ehIa ? "text-small leading-relaxed" : undefined}
            value={node.data.detail ?? ""}
            onChange={(e) => onChange({ detail: e.target.value })}
          />
          {ehIa && (
            <p className="mt-1 text-caption text-text-tertiary">
              Tudo o que esta IA precisa: papel, tom, regras e o que nunca fazer. Cada IA do fluxo tem o seu.
            </p>
          )}
          {ehIa && (node.data.detail ?? "").length > LIMITE_DO_PROMPT && (
            <p className="mt-1 text-caption text-warning">
              {(node.data.detail ?? "").length.toLocaleString("pt-BR")} caracteres. Acima de uns 3 mil a IA começa a
              esquecer partes do texto: corte o que se repete ou divida a conversa em mais de uma IA.
            </p>
          )}
        </div>
        )}
        </>
        )}

        {ehBloco && (
          <PainelDoBloco
            data={node.data}
            aba={abaBloco}
            onChange={onChange}
            inspetorDaAcao={(p) => (
              <NodeInspector {...p} embutido agentId={agentId} variables={variables} documentos={documentos} />
            )}
          />
        )}

        {ehIa && abaIa === "saidas" && (
          <SaidasDaIa saidas={node.data.aiExits ?? []} onChange={(aiExits) => onChange({ aiExits })} />
        )}

        {ehIa && abaIa === "ferramentas" && (
          <Secao titulo="Ferramentas">
            <p className="text-caption text-text-tertiary">
              A IA decide sozinha quando usar cada uma. Clique numa para configurar.
            </p>
            {ferramentas.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {ferramentas.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => aoAbrirBloco?.(f.id)}
                      className="flex w-full items-center gap-2.5 rounded-[12px] bg-raised px-3 py-2 text-left transition-colors hover:bg-hover"
                    >
                      <IconeDoBloco iconKey={f.iconKey} size={15} className="shrink-0 text-text-secondary" />
                      <span className="min-w-0 flex-1 truncate text-small text-text-primary">{f.label}</span>
                      <span className="shrink-0 text-caption text-text-tertiary">{DICIONARIO.get(f.iconKey)?.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {aoAdicionarFerramenta && (
              <MenuDeBlocos
                ferramentas
                escolher={aoAdicionarFerramenta}
                rotulo="Adicionar ferramenta"
                className="h-9 w-full gap-1.5 border-dashed text-small font-medium"
              >
                <Plus size={14} aria-hidden="true" /> Adicionar ferramenta
              </MenuDeBlocos>
            )}
          </Secao>
        )}

        {ehIa && (
          <>
            <Modal open={textoAberto} onOpenChange={setTextoAberto}>
              <ModalContent
                size="lg"
                className="max-w-4xl"
                title="Instruções desta IA"
                description={node.data.label}
              >
                <Textarea
                  aria-label="Instruções desta IA"
                  rows={24}
                  className="text-body leading-relaxed"
                  value={node.data.detail ?? ""}
                  onChange={(e) => onChange({ detail: e.target.value })}
                />
                <p className="mt-1.5 text-caption text-text-tertiary">
                  {(node.data.detail ?? "").length.toLocaleString("pt-BR")} caracteres · salva junto com o fluxo.
                </p>
              </ModalContent>
            </Modal>
          </>
        )}

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
            <p className="mt-1.5 text-caption text-text-tertiary">
              Conecte a saída <span className="text-success">Sim</span> e a saída <span className="text-danger">Não</span> a blocos diferentes.
              Aceita <code>==</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code> contra texto entre aspas ou número.
            </p>
          </div>
        )}

        {iconKey === "capture" && <CaptureConfig data={node.data} onChange={onChange} />}

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
              <p className="mt-1.5 text-caption text-text-tertiary">
                Vazio: só garante que a variável existe. Com soma/subtração de dois números, calcula; qualquer outro
                texto, concatena as variáveis interpoladas (ex: juntar nome + sobrenome).
              </p>
            </div>
          </div>
        )}

        {iconKey === "track-event" && (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="node-event-category">Categoria</Label>
              <Input
                id="node-event-category"
                placeholder="ex: vendas"
                maxLength={100}
                value={node.data.eventCategory ?? ""}
                onChange={(e) => onChange({ eventCategory: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="node-event-action">Ação</Label>
              <Input
                id="node-event-action"
                placeholder="ex: pediu orçamento"
                maxLength={100}
                value={node.data.eventAction ?? ""}
                onChange={(e) => onChange({ eventAction: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="node-event-value">Valor (opcional)</Label>
              <Input
                id="node-event-value"
                placeholder="ex: {plano}"
                maxLength={500}
                value={node.data.eventValue ?? ""}
                onChange={(e) => onChange({ eventValue: e.target.value })}
              />
            </div>
            <p className="text-caption text-text-tertiary">
              Conta no relatório do Studio cada vez que a conversa passa por aqui. Aceita {"{variavel}"} nos três campos.
            </p>
          </div>
        )}

        {iconKey === "webhook" && (
          <div>
            <Label htmlFor="node-webhook">URL do webhook</Label>
            <Input
              id="node-webhook"
              placeholder="https://seu-n8n.com/webhook/…"
              className="font-mono text-small"
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
              <p className="text-caption text-text-tertiary">
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
                  className="font-mono text-small"
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
                  className="mt-1.5 font-mono text-small"
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
                className="font-mono text-caption"
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

        {iconKey === "email" && fonteDoEmail(node.data) === "contrato" && (
          <EmailDoContrato data={node.data} onChange={onChange} />
        )}

        {iconKey === "email" && fonteDoEmail(node.data) === "credencial" && (
          <div className="flex flex-col gap-3">
            <Notice tone="info">
              Este bloco usa uma chave Resend própria (jeito antigo).{" "}
              <button type="button" className="underline" onClick={() => onChange({ emailModo: "contrato" })}>
                Passar a enviar pelo domínio do contrato
              </button>
            </Notice>
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

        {ehIa && abaIa === "configurar" && (
          <Secao titulo="Modelo">
            <div>
              <Label htmlFor="node-ai-fonte">De onde vem a IA</Label>
              <Select
                id="node-ai-fonte"
                value={fonteDaIa(node.data)}
                onChange={(e) => onChange({ aiFonte: e.target.value as "conexao" | "bloco" })}
              >
                <option value="conexao">Central de IA do contrato (com reserva automática)</option>
                <option value="bloco">Escolher chave e modelo só para este bloco</option>
              </Select>
              {fonteDaIa(node.data) === "conexao" && (
                <p className="mt-1 text-caption text-text-tertiary">
                  Usa a ordem de chaves e modelos de Integrações → Central de IA. Se a primeira falhar, a próxima responde.
                </p>
              )}
            </div>
            {fonteDaIa(node.data) === "bloco" && (
              <>
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
                <ModeloSelect
                  provider={node.data.aiProvider}
                  credentialId={node.data.aiCredentialId}
                  value={node.data.aiModel}
                  onChange={(id) => onChange({ aiModel: id })}
                />
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
              </>
            )}
            <div>
              <Label htmlFor="node-ai-max-tokens">Limite de tokens da resposta</Label>
              <Input
                id="node-ai-max-tokens"
                type="number"
                min={1}
                placeholder="padrão do provedor"
                value={node.data.aiMaxTokens ?? ""}
                onChange={(e) => onChange({ aiMaxTokens: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })}
              />
              <p className="mt-1 text-caption text-text-tertiary">Corta respostas longas demais (e o custo). Vazio = padrão.</p>
            </div>
          </Secao>
        )}

        {ehIa && abaIa === "configurar" && (
          <Secao titulo="Resposta">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] bg-raised px-3 py-2.5">
              <span>
                <span className="block text-small font-medium text-text-primary">Enviar para o cliente</span>
                <span className="block text-caption text-text-tertiary">
                  {node.data.aiSendToCustomer === false
                    ? "A resposta não vai para a conversa: fica numa variável e o fluxo segue."
                    : "A resposta da IA aparece na conversa."}
                </span>
              </span>
              <Switch
                checked={node.data.aiSendToCustomer !== false}
                onCheckedChange={(v) => onChange({ aiSendToCustomer: v ? undefined : false })}
                aria-label="Enviar para o cliente"
              />
            </label>
            {node.data.aiSendToCustomer === false && (
              <div>
                <Label htmlFor="node-ai-resposta-var">Guardar a resposta na variável</Label>
                <Input
                  id="node-ai-resposta-var"
                  placeholder="ex: resumo"
                  value={node.data.aiResponseVariable ?? ""}
                  onChange={(e) => onChange({ aiResponseVariable: e.target.value.replace(/\s+/g, "_") || undefined })}
                />
                <p className="mt-1 text-caption text-text-tertiary">Use depois como {"{variavel}"} em outros blocos.</p>
              </div>
            )}
          </Secao>
        )}

        {ehIa && abaIa === "configurar" && (
          <Secao titulo="Como responde">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] bg-raised px-3 py-2.5">
              <span>
                <span className="block text-small font-medium text-text-primary">Balões no WhatsApp</span>
                <span className="block text-caption text-text-tertiary">
                  {node.data.aiBaloes === false
                    ? "A resposta sai numa mensagem só."
                    : "Resposta longa sai em até 3 mensagens, com “digitando…” entre elas."}
                </span>
              </span>
              <Switch
                checked={node.data.aiBaloes !== false}
                onCheckedChange={(v) => onChange({ aiBaloes: v })}
                aria-label="Balões no WhatsApp"
              />
            </label>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-start gap-3">
            <div>
              <Label htmlFor="node-ai-temperatura">Criatividade</Label>
              <Input
                id="node-ai-temperatura"
                type="number"
                min={0}
                max={1}
                step={0.1}
                placeholder="0,4"
                value={node.data.aiTemperature ?? ""}
                onChange={(e) => onChange({ aiTemperature: e.target.value ? Math.min(1, Math.max(0, Number(e.target.value))) : undefined })}
              />
              <p className="mt-1 text-caption text-text-tertiary">
                0 responde sempre igual; 1 varia mais. Vazio = 0,4. Não vale para OpenAI e Anthropic.
              </p>
            </div>
            <div>
              <Label htmlFor="node-ai-memory">Memória</Label>
              <Input
                id="node-ai-memory"
                type="number"
                min={0}
                placeholder="20"
                value={node.data.aiMemoryWindow ?? ""}
                onChange={(e) => onChange({ aiMemoryWindow: e.target.value ? Number(e.target.value) : undefined })}
              />
              <p className="mt-1 text-caption text-text-tertiary">Mensagens anteriores que a IA relê. Vazio = 20.</p>
            </div>
            </div>
          </Secao>
        )}

        {ehIa && abaIa === "ferramentas" && (
          <Secao titulo="Definir variáveis">
            <KeyValueList
              label="Variáveis"
              rows={node.data.collectVars ?? []}
              onChange={(rows) => onChange({ collectVars: rows })}
              keyPlaceholder="nome_variavel"
              valuePlaceholder="descrição — o que é e como reconhecer"
            />
            <p className="text-caption text-text-tertiary">
              Cada linha é um dado que a IA tira da conversa, grava na variável e pergunta se ainda faltar.
            </p>
          </Secao>
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
            <p className="text-caption text-text-tertiary">
              Conecte este bloco na porta roxa embaixo de um Agente de IA. O agente lê a descrição de cada
              ferramenta que o servidor anuncia e decide sozinho quando chamar cada uma — você não precisa
              configurar parâmetro nenhum aqui.
            </p>
          </div>
        )}

        {iconKey === "tool-knowledge" && (
          <DocumentosDaBase
            documentos={documentos}
            escolhidos={node.data.knowledgeDocIds ?? []}
            onChange={(ids) => onChange({ knowledgeDocIds: ids.length ? ids : undefined })}
          />
        )}

        {iconKey === "go-to-flow" && (
          <div>
            <Label htmlFor="node-target-flow">Fluxo de destino</Label>
            <Select id="node-target-flow" value={node.data.targetFlowId ?? ""} onChange={(e) => onChange({ targetFlowId: e.target.value })}>
              <option value="">Escolha...</option>
              <option value={FLUXO_PRINCIPAL}>Principal</option>
              {fluxos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-caption text-text-tertiary">
              A conversa vai para o começo desse fluxo e continua de lá. Crie fluxos nas abas acima do canvas.
            </p>
          </div>
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
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full px-3 text-small font-medium text-text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger"
        >
          <Trash2 size={13} /> {embutido ? "Remover ação" : "Excluir bloco"}
        </button>
      </footer>
    </div>
  );
}
