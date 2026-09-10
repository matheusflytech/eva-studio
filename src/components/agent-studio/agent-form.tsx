"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { KnowledgeBaseUploader } from "./knowledge-base-uploader";
import { SkillsPicker } from "./skills-picker";
import { ToolsPicker } from "./tools-picker";
import { VariablesEditor } from "./variables-editor";
import { MessageTemplatesEditor } from "./message-templates-editor";
import { WebhookConfig } from "./webhook-config";
import { WhatsAppConnect } from "./whatsapp-connect";
import { MetaWhatsAppConnect } from "./meta-whatsapp-connect";
import { InstagramConnect } from "./instagram-connect";
import { CommentAutomationsEditor } from "./comment-automations-editor";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { generateId, buildInboundWebhookUrl } from "@/lib/utils";
import { AGENT_LANGUAGES } from "@/lib/data/types";
import { CHANNELS } from "@/lib/data/channels";
import type { Agent, AgentVariable, KnowledgeDoc } from "@/lib/data/types";

export function AgentForm({ agent }: { agent?: Agent }) {
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
      } else {
        await create(agentId, input);
      }
      router.push("/agent-studio");
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

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl flex-col gap-5 pb-10">
      <Card>
        <CardHeader>
          <CardTitle>Identidade</CardTitle>
          <CardDescription>Como esse agente vai se apresentar.</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="agent-name">Nome do agente</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Assistente de Vendas"
              required
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
              placeholder="Uma frase — aparece nos cards de listagem."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
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

      <Card>
        <CardHeader>
          <CardTitle>Prompt e comportamento</CardTitle>
          <CardDescription>O contexto completo que vai junto de cada chamada ao seu workflow no n8n.</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="agent-instructions">Instruções do agente</Label>
            <Textarea
              id="agent-instructions"
              rows={10}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Descreva em detalhes o papel, os objetivos e o contexto de negócio desse agente. Quanto mais completo, melhor a qualidade das respostas — sem limite de tamanho."
            />
          </div>
          <div>
            <Label htmlFor="agent-guidelines">Diretrizes e restrições</Label>
            <Textarea
              id="agent-guidelines"
              rows={5}
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              placeholder="O que esse agente nunca deve fazer. Ex: nunca citar concorrentes, sempre confirmar antes de agendar, escalar para humano se o cliente pedir."
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Base de conhecimento</CardTitle>
          <CardDescription>Documentos que o agente vai usar como referência.</CardDescription>
        </CardHeader>
        {isEdit ? (
          <KnowledgeBaseUploader agentId={agentId} docs={knowledgeBase} onChange={setKnowledgeBase} />
        ) : (
          <p className="text-[13px] text-text-tertiary">Crie o agente primeiro pra poder anexar documentos.</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Habilidades</CardTitle>
          <CardDescription>O que esse agente sabe fazer.</CardDescription>
        </CardHeader>
        <SkillsPicker skills={skills} onChange={setSkills} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ferramentas</CardTitle>
          <CardDescription>Ações que esse agente pode executar durante a conversa.</CardDescription>
        </CardHeader>
        <ToolsPicker tools={tools} onChange={setTools} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variáveis</CardTitle>
          <CardDescription>Métricas desse agente para acompanhar no Dashboard.</CardDescription>
        </CardHeader>
        <VariablesEditor variables={variables} onChange={setVariables} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>Conecte esse agente ao seu workflow no n8n.</CardDescription>
        </CardHeader>
        <WebhookConfig
          inboundUrl={buildInboundWebhookUrl(agentId)}
          outboundUrl={outboundUrl}
          onOutboundChange={setOutboundUrl}
        />
      </Card>

      {isEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Modelos de mensagem</CardTitle>
            <CardDescription>Pra usar quando a conversa no WhatsApp oficial estiver fora da janela de 24h.</CardDescription>
          </CardHeader>
          <MessageTemplatesEditor agentId={agentId} />
        </Card>
      )}

      {isEdit && (
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp</CardTitle>
            <CardDescription>Conecte um número de WhatsApp direto a este agente, via QR code.</CardDescription>
          </CardHeader>
          <WhatsAppConnect agentId={agentId} />
        </Card>
      )}

      {isEdit && (
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp oficial (Meta)</CardTitle>
            <CardDescription>Canal oficial via Embedded Signup — recomendado pra alto volume e clientes de verdade.</CardDescription>
          </CardHeader>
          <MetaWhatsAppConnect agentId={agentId} />
        </Card>
      )}

      {isEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Instagram</CardTitle>
            <CardDescription>Direct messages do Instagram, pela mesma conta Business/Creator.</CardDescription>
          </CardHeader>
          <InstagramConnect agentId={agentId} />
        </Card>
      )}

      {isEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Automações de comentário (Instagram)</CardTitle>
            <CardDescription>Comente e receba DM — igual o recurso de comentário do ManyChat.</CardDescription>
          </CardHeader>
          <CommentAutomationsEditor agentId={agentId} />
        </Card>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="sticky bottom-0 mt-2 flex items-center justify-between rounded-2xl border border-border-default bg-surface-2/95 p-3 backdrop-blur">
        {isEdit ? (
          <Button type="button" variant="danger" size="md" onClick={handleDelete}>
            <Trash2 size={15} /> Excluir agente
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="md" onClick={() => router.push("/agent-studio")}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="md" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar agente"}
        </Button>
      </div>
    </form>
  );
}
