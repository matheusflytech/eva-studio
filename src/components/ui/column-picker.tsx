"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Lock } from "lucide-react";
import { Drawer, DrawerContent } from "./drawer";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { IconButton } from "./icon-button";
import { alternarColuna, moverColuna } from "@/lib/listas/colunas";
import { filterOptions } from "@/lib/design-system/format";
import { Input } from "./input";

/*
 * "Editar colunas": gaveta com as colunas escolhidas (na ordem, com setas
 * para mover) e as disponíveis (com busca), em grupos. Coluna fixa (ex.:
 * Nome) não sai nem se move. Aplica ao salvar; Restaurar volta ao padrão.
 */

export interface ColumnOption {
  id: string;
  label: string;
  /** Grupo na lista de disponíveis ("Contato", "Campos personalizados"). */
  group?: string;
}

export function ColumnPicker({
  open,
  onOpenChange,
  options,
  value,
  defaultValue,
  fixed = [],
  onChange,
  title = "Editar colunas",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ColumnOption[];
  value: string[];
  defaultValue: string[];
  fixed?: string[];
  onChange: (ids: string[]) => void;
  title?: string;
}) {
  const [rascunho, setRascunho] = React.useState(value);
  const [busca, setBusca] = React.useState("");
  const [abertoAntes, setAbertoAntes] = React.useState(open);
  // Reabriu: começa do que está aplicado (padrão "ajustar estado ao mudar prop").
  if (open !== abertoAntes) {
    setAbertoAntes(open);
    if (open) {
      setRascunho(value);
      setBusca("");
    }
  }
  const porId = new Map(options.map((o) => [o.id, o]));
  const fora = filterOptions(
    options.filter((o) => !rascunho.includes(o.id)).map((o) => ({ value: o.id, label: o.label, hint: o.group })),
    busca
  );
  const grupos = [...new Set(fora.map((o) => o.hint ?? ""))];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={title}
        description="Escolha e ordene as colunas da tabela. Fica salvo para você neste navegador."
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="mr-auto" onClick={() => setRascunho(defaultValue)}>
              Restaurar padrão
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onChange(rascunho);
                onOpenChange(false);
              }}
            >
              Aplicar
            </Button>
          </>
        }
      >
        <section aria-label="Colunas visíveis">
          <h3 className="mb-1 text-small font-medium text-text-primary">Visíveis ({rascunho.length})</h3>
          <ul className="flex flex-col">
            {rascunho.map((id, i) => {
              const fixa = fixed.includes(id);
              const rotulo = porId.get(id)?.label ?? id;
              return (
                <li key={id} className="flex h-9 items-center gap-2 border-b border-border-subtle text-small">
                  {fixa ? (
                    <Lock size={14} aria-label="Coluna fixa" className="mx-0.5 shrink-0 text-text-tertiary" />
                  ) : (
                    <Checkbox
                      checked
                      aria-label={`Esconder ${rotulo}`}
                      onCheckedChange={() => setRascunho((r) => alternarColuna(r, id, false, fixed))}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-text-primary">{rotulo}</span>
                  {!fixa && (
                    <>
                      <IconButton
                        size="sm"
                        aria-label={`Mover ${rotulo} para cima`}
                        disabled={i === 0 || fixed.includes(rascunho[i - 1])}
                        onClick={() => setRascunho((r) => moverColuna(r, id, -1, fixed))}
                      >
                        <ArrowUp />
                      </IconButton>
                      <IconButton
                        size="sm"
                        aria-label={`Mover ${rotulo} para baixo`}
                        disabled={i === rascunho.length - 1}
                        onClick={() => setRascunho((r) => moverColuna(r, id, 1, fixed))}
                      >
                        <ArrowDown />
                      </IconButton>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Colunas disponíveis" className="mt-5">
          <h3 className="mb-2 text-small font-medium text-text-primary">Disponíveis</h3>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar coluna"
            aria-label="Buscar coluna"
            className="mb-2"
          />
          {fora.length === 0 ? (
            <p className="py-3 text-small text-text-tertiary">Nenhuma outra coluna.</p>
          ) : (
            grupos.map((g) => (
              <div key={g || "-"} className="mb-2">
                {g && <p className="px-0.5 pb-1 pt-1.5 text-caption font-medium text-text-tertiary">{g}</p>}
                <ul>
                  {fora
                    .filter((o) => (o.hint ?? "") === g)
                    .map((o) => (
                      <li key={o.value} className="flex h-8 items-center gap-2 text-small">
                        <Checkbox
                          id={`col-${o.value}`}
                          checked={false}
                          onCheckedChange={() => setRascunho((r) => alternarColuna(r, o.value, true, fixed))}
                        />
                        <label htmlFor={`col-${o.value}`} className="min-w-0 flex-1 cursor-pointer truncate text-text-secondary">
                          {o.label}
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </DrawerContent>
    </Drawer>
  );
}
