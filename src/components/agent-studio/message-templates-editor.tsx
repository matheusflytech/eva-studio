"use client";

import * as React from "react";
import { Plus, Trash2, FileText } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type MessageTemplate,
  type MessageTemplateInput,
} from "@/lib/data/templates";

const CATEGORY_LABEL: Record<string, string> = {
  utility: "Utilidade",
  marketing: "Marketing",
  authentication: "Autenticação",
};

const EMPTY_DRAFT: MessageTemplateInput = {
  name: "",
  category: "utility",
  bodyText: "",
  metaTemplateName: "",
  metaLanguageCode: "pt_BR",
};

// CRUD dos modelos usados fora da janela de 24h do WhatsApp oficial (Meta).
// O texto e as variáveis aqui só servem pra pré-visualização e pra montar os
// parâmetros — a aprovação de verdade acontece no Meta Business Manager, e
// metaTemplateName/metaLanguageCode precisam bater exatamente com o que foi
// registrado lá (ver docs/CHATBOT_ENGINE.md).
export function MessageTemplatesEditor({ agentId }: { agentId: string }) {
  const [templates, setTemplates] = React.useState<MessageTemplate[] | null>(null);
  const [editingId, setEditingId] = React.useState<string | "new" | null>(null);
  const [draft, setDraft] = React.useState<MessageTemplateInput>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    listTemplates(agentId).then(setTemplates).catch(() => setTemplates([]));
  }, [agentId]);

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
    setError(null);
  }

  function startEdit(t: MessageTemplate) {
    setDraft({
      name: t.name,
      category: t.category,
      bodyText: t.bodyText,
      metaTemplateName: t.metaTemplateName,
      metaLanguageCode: t.metaLanguageCode,
    });
    setEditingId(t.id);
    setError(null);
  }

  async function handleSave() {
    if (!draft.name.trim() || !draft.bodyText.trim()) {
      setError("Nome e texto do modelo são obrigatórios.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (editingId === "new") {
        const created = await createTemplate(agentId, draft);
        setTemplates((prev) => [...(prev ?? []), created]);
      } else if (editingId) {
        const updated = await updateTemplate(agentId, editingId, draft);
        setTemplates((prev) => (prev ?? []).map((t) => (t.id === editingId ? updated : t)));
      }
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esse modelo?")) return;
    await deleteTemplate(agentId, id);
    setTemplates((prev) => (prev ?? []).filter((t) => t.id !== id));
  }

  if (templates === null) return <p className="text-[13px] text-text-tertiary">Carregando...</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-text-tertiary">
        Fora da janela de 24h, o WhatsApp oficial só aceita mensagens de modelo já aprovado no Meta Business Manager.
        Cadastre aqui o mesmo texto e nome que você registrou lá — o Builder vai deixar escolher um desses modelos em
        blocos de Mensagem, pra usar automaticamente quando a conversa estiver fora da janela.
      </p>

      {templates.length > 0 && (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText size={14} className="shrink-0 text-text-tertiary" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-text-primary">{t.name}</p>
                    <Badge variant="neutral">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                    {!t.metaTemplateName && <Badge variant="danger">sem nome Meta</Badge>}
                  </div>
                  <p className="truncate text-[11.5px] text-text-tertiary">{t.bodyText}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(t)}
                  className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id)}
                  className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-3 hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingId ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-2 p-3.5">
          <div>
            <Label htmlFor="tpl-name">Nome interno</Label>
            <Input
              id="tpl-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Ex: Confirmação de pedido"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tpl-category">Categoria</Label>
              <Select
                id="tpl-category"
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              >
                <option value="utility">Utilidade</option>
                <option value="marketing">Marketing</option>
                <option value="authentication">Autenticação</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="tpl-lang">Idioma (código Meta)</Label>
              <Input
                id="tpl-lang"
                value={draft.metaLanguageCode}
                onChange={(e) => setDraft((d) => ({ ...d, metaLanguageCode: e.target.value }))}
                placeholder="pt_BR"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="tpl-body">Texto (use {"{variavel}"} pra marcar cada parte dinâmica)</Label>
            <Textarea
              id="tpl-body"
              rows={3}
              value={draft.bodyText}
              onChange={(e) => setDraft((d) => ({ ...d, bodyText: e.target.value }))}
              placeholder="Ex: Olá {nome}, seu pedido {numero_pedido} foi confirmado."
            />
          </div>
          <div>
            <Label htmlFor="tpl-meta-name">Nome exato do template no Meta Business Manager</Label>
            <Input
              id="tpl-meta-name"
              className="font-mono text-[12.5px]"
              value={draft.metaTemplateName}
              onChange={(e) => setDraft((d) => ({ ...d, metaTemplateName: e.target.value }))}
              placeholder="ex: confirmacao_pedido"
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Precisa ser idêntico ao registrado na Meta — e as variáveis acima têm que estar na mesma ordem dos{" "}
              {"{{1}}"}, {"{{2}}"} do template aprovado lá. Sem isso preenchido, o modelo fica só de referência (o
              envio real fica bloqueado com aviso).
            </p>
          </div>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar modelo"}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startNew}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-default py-2.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          <Plus size={14} /> Novo modelo
        </button>
      )}
    </div>
  );
}
