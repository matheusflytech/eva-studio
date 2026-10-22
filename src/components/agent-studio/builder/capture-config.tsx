"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Plus, Trash2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { generateId } from "@/lib/utils";
import { CAPTURE_FIELDS, MENSAGEM_DE_ERRO, variavelDaCaptura, type CaptureField } from "@/lib/capture-validation";
import type { FlowNodeData, MenuOption } from "./flow-node";

interface CampoDoContato {
  key: string;
  label: string;
}

// Lista dos campos personalizados de contato, carregada uma vez por sessão do
// Builder (todos os blocos de Captura usam a mesma).
let cacheCampos: Promise<CampoDoContato[]> | null = null;
function carregarCamposDoContato(): Promise<CampoDoContato[]> {
  cacheCampos ??= fetch("/api/custom-fields?entity=contact")
    .then((r) => (r.ok ? r.json() : { fields: [] }))
    .then((d: { fields?: CampoDoContato[] }) => (d.fields ?? []).map((f) => ({ key: f.key, label: f.label })))
    .catch(() => {
      cacheCampos = null;
      return [];
    });
  return cacheCampos;
}

/** Configuração do bloco Captura: o que a resposta é, se é obrigatória e o que fazer quando não serve. */
export function CaptureConfig({ data, onChange }: { data: FlowNodeData; onChange: (patch: Partial<FlowNodeData>) => void }) {
  const campo: CaptureField = data.captureField ?? "text";
  const [campos, setCampos] = React.useState<CampoDoContato[] | null>(null);

  React.useEffect(() => {
    if (campo !== "custom") return;
    let vivo = true;
    carregarCamposDoContato().then((lista) => vivo && setCampos(lista));
    return () => {
      vivo = false;
    };
  }, [campo]);

  function trocarTipo(novo: CaptureField) {
    // Botões e validação não combinam: quem toca um botão já respondeu certo.
    onChange(novo === "text" ? { captureField: novo } : { captureField: novo, options: [] });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="node-capture-field">A resposta é</Label>
        <Select id="node-capture-field" value={campo} onChange={(e) => trocarTipo(e.target.value as CaptureField)}>
          {CAPTURE_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>

      {campo === "text" && <TextoLivre data={data} onChange={onChange} />}

      {campo === "custom" && (
        <div>
          <Label htmlFor="node-capture-custom">Campo do contato</Label>
          {campos === null ? (
            <p className="text-[12px] text-text-tertiary">Carregando campos…</p>
          ) : campos.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-text-tertiary">
              Nenhum campo de contato criado ainda.{" "}
              <Link href="/negocios/configurar" className="text-accent-400 underline-offset-2 hover:underline">
                Criar campos
              </Link>
            </p>
          ) : (
            <Select
              id="node-capture-custom"
              value={data.captureCustomKey ?? ""}
              onChange={(e) => onChange({ captureCustomKey: e.target.value || undefined })}
            >
              <option value="">Escolha um campo</option>
              {campos.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {(campo === "name" || campo === "email" || campo === "phone") && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-text-tertiary">
          Guarda em <code className="text-text-secondary">{`{${variavelDaCaptura(data)}}`}</code> e preenche a ficha do contato.
          {campo === "phone" && " O número é salvo no formato +55 com DDD."}
        </p>
      )}

      {campo !== "text" && (
        <>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
            <span>
              <span className="block text-[12.5px] font-medium text-text-primary">Obrigatório</span>
              <span className="block text-[11px] text-text-tertiary">
                {data.captureRequired === false ? "A pessoa pode responder “pular”." : "Só segue com uma resposta válida."}
              </span>
            </span>
            <Switch
              checked={data.captureRequired !== false}
              onCheckedChange={(v) => onChange({ captureRequired: v })}
              aria-label="Resposta obrigatória"
            />
          </label>

          <div>
            <Label htmlFor="node-capture-retries">Pedir de novo</Label>
            <Select
              id="node-capture-retries"
              value={String(data.captureMaxRetries ?? 2)}
              onChange={(e) => onChange({ captureMaxRetries: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Não pedir de novo" : `${n} ${n === 1 ? "vez" : "vezes"}`}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="node-capture-error">Mensagem quando a resposta não serve</Label>
            <Input
              id="node-capture-error"
              value={data.captureErrorMessage ?? ""}
              placeholder={MENSAGEM_DE_ERRO[campo]}
              onChange={(e) => onChange({ captureErrorMessage: e.target.value || undefined })}
            />
          </div>

          <p className="text-[11.5px] leading-relaxed text-text-tertiary">
            Se não acertar depois das tentativas, segue pela saída <span className="text-warning">Não respondeu certo</span>. Sem
            ela ligada, segue pela saída normal, sem guardar nada.
          </p>
        </>
      )}
    </div>
  );
}

/** Texto livre: variável escolhida à mão e botões opcionais (comportamento de antes). */
function TextoLivre({ data, onChange }: { data: FlowNodeData; onChange: (patch: Partial<FlowNodeData>) => void }) {
  return (
    <>
      <div>
        <Label htmlFor="node-capture-var">Guardar resposta na variável</Label>
        <Input
          id="node-capture-var"
          placeholder="ex: opcao_escolhida"
          value={data.variableName ?? ""}
          onChange={(e) => onChange({ variableName: e.target.value })}
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="mb-0">Botões (opcional)</Label>
          <button
            type="button"
            onClick={() => onChange({ options: [...(data.options ?? []), { id: generateId(), label: "" }] })}
            className="flex items-center gap-1 text-[11.5px] font-medium text-accent-400 hover:text-accent-500"
          >
            <Plus size={12} /> Adicionar
          </button>
        </div>
        <p className="mb-2 text-[11.5px] text-text-tertiary">
          Se tiver botões, o WhatsApp manda como toque (não texto livre) e cada um vira uma saída própria no canvas.
        </p>
        <div className="flex flex-col gap-1.5">
          {(data.options ?? []).map((opt: MenuOption, i: number) => (
            <div key={opt.id} className="flex items-center gap-1.5">
              <Input
                value={opt.label}
                placeholder={`Opção ${i + 1}`}
                onChange={(e) => {
                  const next = [...(data.options ?? [])];
                  next[i] = { ...next[i], label: e.target.value };
                  onChange({ options: next });
                }}
              />
              <button
                type="button"
                aria-label={`Remover opção ${i + 1}`}
                onClick={() => onChange({ options: (data.options ?? []).filter((_: MenuOption, idx: number) => idx !== i) })}
                className="shrink-0 rounded-lg p-2 text-text-tertiary hover:bg-surface-3 hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
