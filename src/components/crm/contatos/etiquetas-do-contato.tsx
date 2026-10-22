"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/design-system/format";
import { pulsar, avisarNaIlha } from "@/lib/fundo/eventos";
import { focusRing } from "@/components/ui/styles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { nomeDoContato, type Contact, type ContactTag, type TagRow } from "./tipos";

/**
 * Aplicar e tirar etiqueta do contato (PATCH addTagId/removeTagId, o mesmo de
 * sempre). Ao aplicar, a etiqueta pulsa no fundo vivo e a ilha avisa com
 * "Desfazer", que tira a etiqueta de novo.
 */
export function useEtiquetasDoContato(contact: Contact, onChanged: (c: Contact) => void) {
  const [erro, setErro] = React.useState<string | null>(null);
  // O Desfazer pode chegar depois de outra mudança: sempre com o onChanged atual.
  const aoMudar = React.useRef(onChanged);
  React.useEffect(() => {
    aoMudar.current = onChanged;
  }, [onChanged]);

  const patch = React.useCallback(
    async (body: Record<string, unknown>): Promise<Contact | null> => {
      setErro(null);
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Não foi possível salvar.");
        return null;
      }
      if (data.contact) aoMudar.current(data.contact as Contact);
      return (data.contact as Contact) ?? null;
    },
    [contact.id]
  );

  const remover = React.useCallback((tag: ContactTag) => patch({ removeTagId: tag.id }), [patch]);

  const aplicar = React.useCallback(
    async (tag: ContactTag, origem?: Element | null) => {
      const novo = await patch({ addTagId: tag.id });
      if (!novo) return;
      const nome = nomeDoContato(novo);
      // A etiqueta nova só existe na tela depois do próximo quadro.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const chip = document.querySelector(`[data-etiqueta="${contact.id}:${tag.id}"]`);
          pulsar(chip ?? origem ?? null, 1.4);
        })
      );
      avisarNaIlha({
        titulo: `${nome} agora é ${tag.name}`,
        avatar: initials(nome),
        acao: { rotulo: "Desfazer", aoClicar: () => void remover(tag) },
      });
    },
    [patch, remover, contact.id]
  );

  return { aplicar, remover, erro };
}

/** Etiquetas em cápsula, com "x" para tirar e "+ Etiqueta" para aplicar. */
export function EtiquetasDoContato({
  contact,
  tags,
  onChanged,
  className,
}: {
  contact: Contact;
  tags: TagRow[];
  onChanged: (c: Contact) => void;
  className?: string;
}) {
  const { aplicar, remover, erro } = useEtiquetasDoContato(contact, onChanged);
  const disponiveis = tags.filter((t) => !contact.tags.some((ct) => ct.id === t.id));
  const botaoMais = React.useRef<HTMLButtonElement>(null);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {contact.tags.map((t) => (
          <span
            key={t.id}
            data-etiqueta={`${contact.id}:${t.id}`}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-raised pl-2.5 pr-1 text-caption font-medium text-text-secondary ring-1 ring-border-subtle"
          >
            {t.name}
            <button
              type="button"
              onClick={() => void remover(t)}
              aria-label={`Tirar a etiqueta ${t.name}`}
              className={cn("grid size-4 place-items-center rounded-full text-text-tertiary hover:bg-hover hover:text-danger", focusRing)}
            >
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              ref={botaoMais}
              type="button"
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border-default px-2.5 text-caption font-medium text-text-secondary hover:border-border-strong hover:text-text-primary",
                focusRing
              )}
            >
              <Plus size={11} aria-hidden="true" />
              Etiqueta
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
            <DropdownMenuLabel>Aplicar etiqueta</DropdownMenuLabel>
            {disponiveis.length === 0 ? (
              <p className="px-2 py-1.5 text-small text-text-tertiary">
                {tags.length === 0 ? "Nenhuma etiqueta criada ainda. Crie na aba Etiquetas." : "Já tem todas as etiquetas."}
              </p>
            ) : (
              disponiveis.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => void aplicar(t, botaoMais.current)}>
                  {t.name}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <p className="px-2 pb-1 text-caption text-text-tertiary">Aplicar uma etiqueta pode inscrever o contato numa sequência, se houver alguma com esse gatilho.</p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {erro && <p className="text-caption text-danger">{erro}</p>}
    </div>
  );
}
