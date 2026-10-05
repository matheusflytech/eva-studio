"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Check } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { KnowledgeBaseUploader } from "./knowledge-base-uploader";
import { SemanticSearchConfig } from "./semantic-search-config";
import { SkillsPicker } from "./skills-picker";
import { ToolsPicker } from "./tools-picker";
import { VariablesEditor } from "./variables-editor";
import { MessageTemplatesEditor } from "./message-templates-editor";
import { WebhookConfig } from "./webhook-config";
import { WhatsAppConnect } from "./whatsapp-connect";
import { MetaWhatsAppConnect } from "./meta-whatsapp-connect";
import { InstagramConnect } from "./instagram-connect";
import { TelegramConnect } from "./telegram-connect";
import { MessengerConnect, TikTokConnect } from "./channel-connect";
import { CommentAutomationsEditor } from "./comment-automations-editor";
import { WidgetConnect } from "./widget-connect";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { generateId, buildInboundWebhookUrl } from "@/lib/utils";
import { AGENT_LANGUAGES } from "@/lib/data/types";
import { CHANNELS } from "@/lib/data/channels";
import type { Agent, AgentVariable, KnowledgeDoc } from "@/lib/data/types";

export type AbaDoAgente = "resumo" | "comportamento" | "canais" | "avancado";

/**
 * Uma seção do formulário. Fica sempre montada e só some da tela quando não é a
 * aba ativa: o que a pessoa digitou em "Comportamento" não pode se perder ao
 * olhar "Canais", e um só botão Salvar vale para todas as abas.
 */
function Secao({ id, aba, children }: { id: AbaDoAgente; aba?: AbaDoAgente; children: React.ReactNode }) {
  return <div className={aba && aba !== id ? "hidden" : undefined}>{children}</div>;
}

export function AgentForm({ agent, aba }: { agent?: Agent; aba?: AbaDoAgente }) {
  const router = useRouter();
  const { create, update, remove } = useAgentsStore();
  const isEdit = Boolean(agent);

  const agentId = React.useMemo(() => agent?.id ?? generateId(), [agent]);

  const [name, setName] = React.useState(agent?.name ?? "");
  const [description, setDescription] = React.useState(agent?.description ?? "");
  const [tone, setTone] = React.useState(agent?.tone ?? "");
  const [language, setLanguage] = React.useState(agent?.language ?? AGENT_LANGUAGES[0]);
  const [primaryChannel, setPrimaryChannel] = React.useState(agent?.primaryChannel ?? CHANNELS[0].name);
  const [instructions, setInstructions] = React.useState(agent?.instructions ?? "");
  const [guidelines, setGuidelines] = React.useState(agent?.guidelines ?? "");
  const [knowledgeBase, setKnowledgeBase] = React.useState<KnowledgeDoc[]>(agent?.knowledgeBase ?? []);
  const [skills, setSkills] = React.useState<string[]>(agent?.skills ?? []);
  const [tools, setTools] = React.useState<string[]>(agent?.tools ?? []);
  const [variables, setVariables] = React.useState<AgentVariable[]>(agent?.variables ?? []);
  const [outboundUrl, setOutboundUrl] = React.useState(agent?.webhook.outboundUrl ?? "");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [salvo, setSalvo] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Dê um nome para o agente.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const input = {
      name: name.trim(),
      description: description.trim(),
      tone: tone.trim(),
      language,
      primaryChannel,
      instructions: instructions.trim(),
      guidelines: guidelines.trim(),
      knowledgeBase,
      skills,
      tools,
      variables,
      outboundUrl: outboundUrl.trim(),
    };
    try {
      if (isEdit) {
        await update(agentId, input);
        // Na tela com abas a pessoa continua onde estava; só a criação volta à lista.
        if (aba) {
          setSalvo(true);
          setTimeout(() => setSalvo(false), 2500);
        } else {
          router.push("/agent-studio");
        }
      } else {
        await create(agentId, input);
        router.push("/agent-studio");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!agent) return;
    if (!confirm(`Excluir o agente "${agent.name}"? Essa ação não pode ser desfeita.`)) return;
    await remove(agent.id);
    router.push("/agent-studio");
  }

  // Canais se salvam sozinhos, cada um no seu cartão: botão Salvar ali só confundiria.
  const mostrarBarra = !aba || aba === "comportamento" || aba === "avancado";

  return (
    <form onSubmit={handleSubmit} className={aba ? "flex flex-col gap-5 pb-10" : "mx-auto flex max-w-2xl flex-col gap-5 pb-10"}>
      <Secao id="comportamento" aba={aba}>
        <Card>
          <CardHeader>
            <CardTitle>Quem é este agente</CardTitle>
            <CardDescription>Como ele se apresenta e em que língua fala.</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="agent-name">Nome do agente</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Assistente de Vendas"
              />
            </div>
            <div>
              <Label htmlFor="agent-tone">Tom de voz</Label>
              <Input
                id="agent-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="Ex: Consultivo, direto e acolhedor"
              />
            </div>
            <div>
              <Label htmlFor="agent-desc">Resumo curto</Label>
              <Input
                id="agent-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Uma frase que aparece na lista de agentes."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="agent-language">Idioma principal</Label>
                <Select id="agent-language" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
                  {AGENT_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="agent-channel">Canal principal</Label>
                <Select id="agent-channel" value={primaryChannel} onChange={(e) => setPrimaryChannel(e.target.value)}>
                  {CHANNELS.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </Card>
      </Secao>

      <Secao id="comportamento" aba={aba}>
        <Card>
          <CardHeader>
            <CardTitle>O que ele deve fazer</CardTitle>
            <CardDescription>
              Escreva como se estivesse treinando uma pessoa nova. O agente de IA lê isto em toda conversa.
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="agent-instructions">Instruções</Label>
              <Textarea
                id="agent-instructions"
                rows={10}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Qual é o papel dele, o que a sua empresa vende, que perguntas fazer ao cliente e quando chamar uma pessoa. Quanto mais completo, melhor."
              />
            </div>
            <div>
              <Label htmlFor="agent-guidelines">O que ele nunca deve fazer</Label>
              <Textarea
                id="agent-guidelines"
                rows={5}
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
                placeholder="Ex: nunca citar concorrentes, sempre confirmar antes de agendar, chamar uma pessoa se o cliente pedir."
              />
            </div>
          </div>
        </Card>
      </Secao>

      <Secao id="comportamento" aba={aba}>
        <Card>
          <CardHeader>
            <CardTitle>Base de conhecimento</CardTitle>
            <CardDescription>Documentos que ele consulta para responder (preços, regras, perguntas frequentes).</CardDescription>
          </CardHeader>
          {isEdit ? (
            <KnowledgeBaseUploader agentId={agentId} docs={knowledgeBase} onChange={setKnowledgeBase} />
          ) : (
            <p className="text-[13px] text-text-tertiary">Crie o agente primeiro pra poder anexar documentos.</p>
          )}
        </Card>
      </Secao>

      {isEdit && (
        <Secao id="comportamento" aba={aba}>
          <SemanticSearchConfig agentId={agentId} />
        </Secao>
      )}

      <Secao id="avancado" aba={aba}>
        <Card>
          <CardHeader>
            <CardTitle>Habilidades</CardTitle>
            <CardDescription>
              Etiquetas que descrevem o que o agente sabe fazer. Vão junto da mensagem quando você usa um fluxo seu no n8n.
            </CardDescription>
          </CardHeader>
          <SkillsPicker skills={skills} onChange={setSkills} />
        </Card>
      </Secao>

      <Secao id="avancado" aba={aba}>
        <Card>
          <CardHeader>
            <CardTitle>Ferramentas do n8n</CardTitle>
            <CardDescription>
              Só para quem usa um fluxo no n8n. O agente de IA do Builder usa as ferramentas que você liga a ele lá.
            </CardDescription>
          </CardHeader>
          <ToolsPicker tools={tools} onChange={setTools} />
        </Card>
      </Secao>

      <Secao id="avancado" aba={aba}>
        <Card>
          <CardHeader>
            <CardTitle>Variáveis</CardTitle>
            <CardDescription>Métricas desse agente para acompanhar no Dashboard.</CardDescription>
          </CardHeader>
          <VariablesEditor variables={variables} onChange={setVariables} />
        </Card>
      </Secao>

      <Secao id="avancado" aba={aba}>
        <Card>
          <CardHeader>
            <CardTitle>Ligar a um fluxo do n8n</CardTitle>
            <CardDescription>Opcional. Use se a resposta vem de um workflow seu em vez do Builder.</CardDescription>
          </CardHeader>
          <WebhookConfig
            inboundUrl={buildInboundWebhookUrl(agentId)}
            outboundUrl={outboundUrl}
            onOutboundChange={setOutboundUrl}
          />
        </Card>
      </Secao>

      {isEdit && (
        <Secao id="canais" aba={aba}>
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp oficial (Meta)</CardTitle>
              <CardDescription>O canal para clientes de verdade: estável, com selo e sem risco de bloqueio.</CardDescription>
            </CardHeader>
            <MetaWhatsAppConnect agentId={agentId} />
          </Card>
        </Secao>
      )}

      {isEdit && (
        <Secao id="canais" aba={aba}>
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp por QR code</CardTitle>
              <CardDescription>Conecte o número que você já usa, lendo um QR. Bom para testar; para volume alto, prefira o oficial.</CardDescription>
            </CardHeader>
            <WhatsAppConnect agentId={agentId} />
          </Card>
        </Secao>
      )}

      {isEdit && (
        <Secao id="canais" aba={aba}>
          <Card>
            <CardHeader>
              <CardTitle>Instagram</CardTitle>
              <CardDescription>Mensagens diretas do Instagram, pela mesma conta Business ou Creator.</CardDescription>
            </CardHeader>
            <InstagramConnect agentId={agentId} />
          </Card>
        </Secao>
      )}

      {isEdit && (
        <Secao id="canais" aba={aba}>
          <TelegramConnect agentId={agentId} />
        </Secao>
      )}

      {isEdit && (
        <Secao id="canais" aba={aba}>
          <MessengerConnect agentId={agentId} />
        </Secao>
      )}

      {isEdit && (
        <Secao id="canais" aba={aba}>
          <TikTokConnect agentId={agentId} />
        </Secao>
      )}

      {isEdit && (
        <Secao id="canais" aba={aba}>
          <Card>
            <CardHeader>
              <CardTitle>Chat no seu site</CardTitle>
              <CardDescription>Um chat que puxa assunto sozinho no seu site e manda os contatos para a página Leads.</CardDescription>
            </CardHeader>
            <WidgetConnect agentId={agentId} />
          </Card>
        </Secao>
      )}

      {isEdit && (
        <Secao id="canais" aba={aba}>
          <Card>
            <CardHeader>
              <CardTitle>Modelos de mensagem</CardTitle>
              <CardDescription>Textos aprovados pela Meta, para falar com o cliente depois das 24 horas sem resposta.</CardDescription>
            </CardHeader>
            <MessageTemplatesEditor agentId={agentId} />
          </Card>
        </Secao>
      )}

      {isEdit && (
        <Secao id="canais" aba={aba}>
          <Card>
            <CardHeader>
              <CardTitle>Respostas automáticas a comentários (Instagram)</CardTitle>
              <CardDescription>Quando alguém comenta uma palavra no seu post, recebe uma mensagem direta.</CardDescription>
            </CardHeader>
            <CommentAutomationsEditor agentId={agentId} />
          </Card>
        </Secao>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {mostrarBarra && (
        <div className="sticky bottom-0 mt-2 flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-2/95 p-3 backdrop-blur">
          {isEdit ? (
            <Button type="button" variant="danger" size="md" onClick={handleDelete}>
              <Trash2 size={15} /> Excluir agente
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="md" onClick={() => router.push("/agent-studio")}>
              Cancelar
            </Button>
          )}
          <div className="flex items-center gap-3">
            {salvo && (
              <span className="inline-flex items-center gap-1 text-[12.5px] text-emerald-400">
                <Check size={14} /> Salvo
              </span>
            )}
            <Button type="submit" size="md" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar agente"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
