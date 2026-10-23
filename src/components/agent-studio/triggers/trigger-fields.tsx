"use client";

import * as React from "react";
import { Check, ImageOff, X } from "lucide-react";
import { LogoOficial, marcaDoCanal } from "@/components/ui/logo-oficial";
import { cn } from "@/lib/utils";
import { normalizeText, TRIGGER_LIMITS } from "@/lib/server/triggers";
import type { StoryOption } from "./trigger-kinds";

/** Rótulo + controle + ajuda/erro ligados por aria, no mesmo bloco. */
export function Field({
  id,
  label,
  hint,
  error,
  aside,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-small font-medium text-text-secondary">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-erro`} role="alert" className="mt-1.5 text-small text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-ajuda`} className="mt-1.5 text-caption leading-relaxed text-text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string | null, hint?: unknown) {
  return error ? `${id}-erro` : hint ? `${id}-ajuda` : undefined;
}

/** Escolha única em pílulas — mais rápido de ler que um select de três opções. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
      {options.map((o) => {
        const ativo = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 rounded-xl px-3.5 py-2.5 text-left ring-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
              ativo
                ? "bg-accent-subtle text-text-primary ring-accent-solid/50"
                : "bg-raised text-text-secondary ring-border-subtle hover:text-text-primary hover:ring-border-default"
            )}
          >
            <span className="flex items-center gap-1.5 text-small font-medium">
              {ativo && <Check size={13} className="text-accent-fg" aria-hidden />}
              {o.label}
            </span>
            <span className="mt-0.5 block text-caption leading-snug text-text-tertiary">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Palavras como fichas: Enter ou vírgula confirma, Backspace no campo vazio
 * apaga a última. Repetida (mesmo com acento/caixa diferente) não entra — o
 * motor trataria as duas como a mesma palavra.
 */
export function KeywordInput({
  id,
  value,
  onChange,
  invalid,
  describedById,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  invalid?: boolean;
  describedById?: string;
}) {
  const [texto, setTexto] = React.useState("");
  const [aviso, setAviso] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function adicionar(bruto: string) {
    const partes = bruto.split(",").map((p) => p.trim()).filter(Boolean);
    if (partes.length === 0) return;
    const proximas = [...value];
    for (const p of partes) {
      if (p.length > TRIGGER_LIMITS.keyword) {
        setAviso(`Cada palavra pode ter até ${TRIGGER_LIMITS.keyword} caracteres.`);
        continue;
      }
      if (proximas.some((k) => normalizeText(k) === normalizeText(p))) {
        setAviso(`"${p}" já está na lista.`);
        continue;
      }
      if (proximas.length >= TRIGGER_LIMITS.keywords) {
        setAviso(`Máximo de ${TRIGGER_LIMITS.keywords} palavras por gatilho.`);
        break;
      }
      proximas.push(p);
    }
    onChange(proximas);
    setTexto("");
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-11 w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border bg-raised px-2 py-1.5 transition-colors",
          "focus-within:border-focus focus-within:ring-2 focus-within:ring-focus",
          invalid ? "border-danger/60" : "border-border-default"
        )}
      >
        {value.map((k) => (
          <span
            key={k}
            className="inline-flex max-w-full items-center gap-1 rounded-lg bg-accent-subtle py-1 pl-2.5 pr-1 text-small font-medium text-accent-fg"
          >
            <span className="truncate">{k}</span>
            <button
              type="button"
              aria-label={`Remover ${k}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((x) => x !== k));
              }}
              className="grid h-5 w-5 place-items-center rounded-md text-accent-fg/80 outline-none hover:bg-accent-subtle hover:text-accent-fg focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={texto}
          aria-invalid={invalid || undefined}
          aria-describedby={describedById}
          placeholder={value.length === 0 ? "Digite e aperte Enter — ex.: promo" : "Adicionar outra…"}
          onChange={(e) => {
            setAviso(null);
            if (e.target.value.includes(",")) adicionar(e.target.value);
            else setTexto(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar(texto);
            } else if (e.key === "Backspace" && !texto && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => adicionar(texto)}
          className="h-8 min-w-[10ch] flex-1 bg-transparent px-1.5 text-body text-text-primary outline-none placeholder:text-text-tertiary"
        />
      </div>
      <p aria-live="polite" className={cn("mt-1.5 text-caption", aviso ? "text-text-secondary" : "sr-only")}>
        {aviso ?? `${value.length} de ${TRIGGER_LIMITS.keywords} palavras`}
      </p>
    </div>
  );
}

export function ChannelChips({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: { id: string; label: string }[];
  onChange: (v: string[]) => void;
}) {
  const todos = value.length === 0;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Canais">
      <button
        type="button"
        aria-pressed={todos}
        onClick={() => onChange([])}
        className={chip(todos)}
      >
        {todos && <Check size={13} aria-hidden />} Todos os canais
      </button>
      {options.map((c) => {
        const on = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}
            className={chip(on)}
          >
            {on && <Check size={13} aria-hidden />}
            {marcaDoCanal(c.id) && <LogoOficial marca={marcaDoCanal(c.id)!} tamanho={13} />} {c.label}
          </button>
        );
      })}
    </div>
  );
}

function chip(on: boolean) {
  return cn(
    "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-small font-medium ring-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
    on
      ? "bg-accent-subtle text-accent-fg ring-accent-solid/50"
      : "bg-raised text-text-secondary ring-border-subtle hover:text-text-primary hover:ring-border-default"
  );
}

/** Stories ativos como miniaturas; sem lista da Meta, fica só o ID manual. */
export function StoryPicker({
  stories,
  loading,
  reason,
  value,
  onChange,
  error,
}: {
  stories: StoryOption[];
  loading: boolean;
  reason: string | null;
  value: string;
  onChange: (id: string) => void;
  error?: string | null;
}) {
  const manual = !!value && !stories.some((s) => s.id === value);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Story">
        <button type="button" role="radio" aria-checked={!value} onClick={() => onChange("")} className={storyTile(!value)}>
          <span className="text-small font-medium text-text-primary">Qualquer</span>
          <span className="text-caption text-text-tertiary">story</span>
        </button>
        {loading &&
          Array.from({ length: 3 }, (_, i) => (
            <span key={i} aria-hidden className="h-[104px] w-[64px] shrink-0 animate-pulse rounded-xl bg-hover" />
          ))}
        {stories.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={value === s.id}
            aria-label={`Story de ${s.postedAt ? new Date(s.postedAt).toLocaleString("pt-BR") : s.id}`}
            onClick={() => onChange(s.id)}
            className={cn(storyTile(value === s.id), "overflow-hidden p-0")}
          >
            {s.preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- CDN da Meta muda a cada story; next/image exigiria liberar o domínio
              <img src={s.preview} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <ImageOff size={16} className="text-text-tertiary" aria-hidden />
            )}
          </button>
        ))}
      </div>
      {!loading && reason && <p className="text-caption text-text-tertiary">{reason} Você ainda pode informar o ID do story.</p>}
      <div>
        <label htmlFor="gatilho-story-id" className="sr-only">
          ID do story
        </label>
        <input
          id="gatilho-story-id"
          value={manual ? value : ""}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="Ou cole o ID do story"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "gatilho-story-id-erro" : undefined}
          className={cn(
            "h-10 w-full rounded-xl border bg-raised px-3.5 font-mono text-small text-text-primary outline-none placeholder:font-sans placeholder:text-text-tertiary",
            "focus:border-focus focus:ring-2 focus:ring-focus",
            error ? "border-danger/60" : "border-border-default"
          )}
        />
        {error && (
          <p id="gatilho-story-id-erro" role="alert" className="mt-1.5 text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function storyTile(on: boolean) {
  return cn(
    "relative grid h-[104px] w-[64px] shrink-0 place-items-center content-center rounded-xl ring-1 transition outline-none focus-visible:ring-2 focus-visible:ring-focus",
    on ? "bg-accent-subtle ring-2 ring-accent-solid" : "bg-raised ring-border-subtle hover:ring-border-strong"
  );
}

/** Como a pessoa vai ver a resposta: um balão de conversa, não um textarea. */
export function ReplyPreview({ text, kind }: { text: string; kind: string }) {
  const entrada = kind === "story_mention" ? "Mencionou você no story" : kind === "story_reply" ? "Respondeu seu story" : "promo";
  return (
    <div aria-hidden className="rounded-2xl bg-page/60 p-4 ring-1 ring-border-subtle">
      <p className="mb-3 font-mono text-caption text-text-tertiary">Prévia</p>
      <div className="flex flex-col gap-2">
        <span className="max-w-[80%] self-start rounded-2xl rounded-bl-md bg-hover px-3.5 py-2 text-small text-text-secondary">
          {kind === "dm_keyword" ? entrada : <em className="not-italic text-text-tertiary">{entrada}</em>}
        </span>
        <span
          className={cn(
            "max-w-[85%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3.5 py-2 text-small",
            text ? "bg-accent-solid text-text-on-accent" : "border border-dashed border-border-default bg-raised text-text-tertiary"
          )}
        >
          {text || "Sua resposta aparece aqui"}
        </span>
      </div>
    </div>
  );
}
