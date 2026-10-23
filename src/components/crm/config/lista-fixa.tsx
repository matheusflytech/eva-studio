"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { ListaOrdenavel } from "@/components/crm/config/lista-ordenavel";

/** Lista de opções fixas: liga/desliga e, as ligadas, em ordem de arrastar. */
export function ListaFixa<T extends string>({
  titulo,
  descricao,
  todas,
  rotulo,
  escolhidas,
  minimo = 0,
  podeEditar,
  onChange,
}: {
  titulo: string;
  descricao: string;
  todas: readonly T[];
  rotulo: (v: T) => string;
  escolhidas: T[];
  minimo?: number;
  podeEditar: boolean;
  onChange: (v: T[]) => void;
}) {
  const desligadas = todas.filter((t) => !escolhidas.includes(t));
  const linha = (v: T, ligada: boolean, alca: React.ReactNode | null) => (
    <div className="flex items-center gap-2 rounded-[14px] bg-raised py-1.5 pl-1.5 pr-2.5 ring-1 ring-border-subtle">
      {alca ?? <span className="w-6" aria-hidden />}
      <span className={ligada ? "min-w-0 flex-1 truncate text-small font-medium text-text-primary" : "min-w-0 flex-1 truncate text-small text-text-tertiary"}>{rotulo(v)}</span>
      <Switch
        checked={ligada}
        disabled={!podeEditar || (ligada && escolhidas.length <= minimo)}
        onCheckedChange={(c) => onChange(c ? [...escolhidas, v] : escolhidas.filter((x) => x !== v))}
        aria-label={`${ligada ? "Desligar" : "Ligar"} ${rotulo(v)}`}
      />
    </div>
  );
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-panel/70 p-4 ring-1 ring-border-subtle">
      <div>
        <h3 className="text-body font-semibold text-text-primary">{titulo}</h3>
        <p className="mt-0.5 text-small text-text-tertiary">{descricao}</p>
      </div>
      {podeEditar ? (
        <ListaOrdenavel itens={escolhidas.map((id) => ({ id }))} onReordenar={(nova) => onChange(nova.map((i) => i.id as T))}>
          {(item, alca) => linha(item.id as T, true, alca)}
        </ListaOrdenavel>
      ) : (
        <div className="flex flex-col gap-2">
          {escolhidas.map((v) => (
            <React.Fragment key={v}>{linha(v, true, null)}</React.Fragment>
          ))}
        </div>
      )}
      {desligadas.length > 0 && (
        <div className="flex flex-col gap-2">
          {desligadas.map((v) => (
            <React.Fragment key={v}>{linha(v, false, null)}</React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
