export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  bodyText: string;
  metaTemplateName: string;
  metaLanguageCode: string;
  variableOrder: string[];
}

export type MessageTemplateInput = Pick<
  MessageTemplate,
  "name" | "category" | "bodyText" | "metaTemplateName" | "metaLanguageCode"
>;

export async function listTemplates(agentId: string): Promise<MessageTemplate[]> {
  const res = await fetch(`/api/agents/${agentId}/templates`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
  return data.templates;
}

export async function createTemplate(agentId: string, input: MessageTemplateInput): Promise<MessageTemplate> {
  const res = await fetch(`/api/agents/${agentId}/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
  return data.template;
}

export async function updateTemplate(
  agentId: string,
  templateId: string,
  input: MessageTemplateInput
): Promise<MessageTemplate> {
  const res = await fetch(`/api/agents/${agentId}/templates/${templateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
  return data.template;
}

export async function deleteTemplate(agentId: string, templateId: string): Promise<void> {
  const res = await fetch(`/api/agents/${agentId}/templates/${templateId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Erro inesperado.");
  }
}
