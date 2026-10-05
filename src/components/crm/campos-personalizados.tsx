"use client";

import * as React from "react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  formatarValor,
  valorParaFormulario,
  type DefinicaoDeCampo,
} from "@/lib/custom-fields";

// Editor e exibição dos campos que o cliente criou. Os mesmos componentes
// servem o negócio, o contato, o cartão do kanban e o painel da conversa.

/** O que o formulário guarda enquanto a pessoa digita. */
export type Rascunho = Record<string, string | boolean | string[]>;

export function rascunhoInicial(defs: DefinicaoDeCampo[], guardados: Record<string, unknown> | undefined): Rascunho {
  const r: Rascunho = {};
  for (const d of defs) {
    const v = guardados?.[d.key];
    if (d.type === "checkbox") r[d.key] = v === true;
    else if (d.type === "multiselect") r[d.key] = Array.isArray(v) ? v.map(String) : [];
    else r[d.key] = valorParaFormulario(d, v);
  }
  return r;
}

/** Rascunho -> o que mandar pra API. Vazio vira null (limpa o campo). */
export function rascunhoParaEnvio(defs: DefinicaoDeCampo[], r: Rascunho): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const d of defs) {
    const v = r[d.key];
    if (d.type === "checkbox") saida[d.key] = v === true ? true : null;
    else if (Array.isArray(v)) saida[d.key] = v.length > 0 ? v : null;
    else saida[d.key] = typeof v === "string" && v.trim() ? v : null;
  }
  return saida;
}

export function CampoEditor({
  def,
  valor,
  onChange,
  id,
}: {
  def: DefinicaoDeCampo;
  valor: string | boolean | string[] | undefined;
  onChange: (v: string | boolean | string[]) => void;
  id: string;
}) {
  switch (def.type) {
    case "longtext":
      return <Textarea id={id} rows={3} value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} />;

    case "number":
      return <Input id={id} inputMode="decimal" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="0" />;

    case "currency":
      return (
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">R$</span>
          <Input id={id} inputMode="decimal" className="pl-10" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="0,00" />
        </div>
      );

    case "date":
      return <Input id={id} type="date" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} />;

    case "select":
      return (
        <Select id={id} value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">Escolha...</option>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      );

    case "multiselect": {
      const marcados = Array.isArray(valor) ? valor : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {def.options.map((o) => {
            const ligado = marcados.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={ligado}
                onClick={() => onChange(ligado ? marcados.filter((m) => m !== o.value) : [...marcados, o.value])}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12.5px] ring-1 transition-colors",
                  ligado ? "bg-accent-500/15 text-text-primary ring-accent-500/50" : "bg-surface-2 text-text-secondary ring-border-subtle hover:text-text-primary"
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }

    case "checkbox":
      return (
        <label className="flex h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-border-default bg-surface-2 px-3.5 text-sm text-text-primary">
          <input id={id} type="checkbox" checked={valor === true} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent-500,#6366f1)]" />
          {valor === true ? "Sim" : "Não"}
        </label>
      );

    case "url":
      return <Input id={id} type="url" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="https://" />;
    case "email":
      return <Input id={id} type="email" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="nome@empresa.com" />;
    case "phone":
      return <Input id={id} type="tel" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="(00) 00000-0000" />;
    default:
      return <Input id={id} value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Todos os campos de uma lista, com rótulo, ajuda e asterisco de obrigatório. */
export function CamposDoFormulario({
  defs,
  rascunho,
  onChange,
  prefixo = "cf",
  colunas = 1,
}: {
  defs: DefinicaoDeCampo[];
  rascunho: Rascunho;
  onChange: (key: string, v: string | boolean | string[]) => void;
  prefixo?: string;
  colunas?: 1 | 2;
}) {
  if (defs.length === 0) return null;
  return (
    <div className={cn("grid gap-4", colunas === 2 && "sm:grid-cols-2")}>
      {defs.map((d) => (
        <div key={d.id} className={cn((d.type === "longtext" || d.type === "multiselect") && colunas === 2 && "sm:col-span-2")}>
          <Label htmlFor={`${prefixo}-${d.key}`}>
            {d.label}
            {d.required && <span className="ml-1 text-danger">*</span>}
          </Label>
          <CampoEditor id={`${prefixo}-${d.key}`} def={d} valor={rascunho[d.key]} onChange={(v) => onChange(d.key, v)} />
          {d.helpText && <p className="mt-1.5 text-[12px] text-text-tertiary">{d.helpText}</p>}
        </div>
      ))}
    </div>
  );
}

/** Etiquetas dos campos marcados "mostrar no cartão". */
export function ChipsDeCampos({ defs, valores }: { defs: DefinicaoDeCampo[]; valores: Record<string, unknown> | undefined }) {
  const itens = defs
    .filter((d) => d.showOnCard)
    .map((d) => ({ d, texto: formatarValor(d, valores?.[d.key]) }))
    .filter((i) => i.texto);
  if (itens.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {itens.map(({ d, texto }) => (
        <span
          key={d.id}
          title={d.label}
          className="max-w-full truncate rounded-md bg-surface-3/70 px-1.5 py-0.5 text-[11px] text-text-secondary"
        >
          {d.type === "checkbox" ? d.label : ["select", "multiselect", "text"].includes(d.type) ? texto : `${d.label}: ${texto}`}
        </span>
      ))}
    </div>
  );
}

/** Lista "rótulo: valor" só dos campos preenchidos (visão de leitura). */
export function ValoresDeCampos({ defs, valores }: { defs: DefinicaoDeCampo[]; valores: Record<string, unknown> | undefined }) {
  const itens = defs
    .map((d) => ({ d, texto: formatarValor(d, valores?.[d.key]) }))
    .filter((i) => i.texto);
  if (itens.length === 0) return null;
  return (
    <dl className="flex flex-col gap-1.5">
      {itens.map(({ d, texto }) => (
        <div key={d.id} className="flex items-baseline justify-between gap-3 text-[13px]">
          <dt className="shrink-0 text-text-tertiary">{d.label}</dt>
          <dd className="min-w-0 break-words text-right text-text-primary">{texto}</dd>
        </div>
      ))}
    </dl>
  );
}
