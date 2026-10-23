"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ACOES_ROTULO, MODULOS } from "@/lib/permissoes/catalogo";
import { cn } from "@/lib/utils";

// Matriz módulo × ação do catálogo. A mesma usada em papéis e em grupos;
// somente leitura para os papéis de sistema.
const ACOES = Object.keys(ACOES_ROTULO);

export function MatrizDePermissoes({
  valor,
  onChange,
  somenteLeitura,
}: {
  valor: readonly string[];
  onChange?: (novo: string[]) => void;
  somenteLeitura?: boolean;
}) {
  const marcadas = new Set(valor);
  // Só as colunas que algum módulo usa, na ordem do rótulo.
  const colunas = ACOES.filter((a) => MODULOS.some((m) => (m.acoes as readonly string[]).includes(a)));

  function alternar(p: string) {
    if (somenteLeitura || !onChange) return;
    const novo = new Set(marcadas);
    if (novo.has(p)) novo.delete(p);
    else novo.add(p);
    onChange([...novo].sort());
  }

  function alternarModulo(id: string, acoes: readonly string[]) {
    if (somenteLeitura || !onChange) return;
    const todas = acoes.every((a) => marcadas.has(`${id}:${a}`));
    const novo = new Set(marcadas);
    for (const a of acoes) {
      if (todas) novo.delete(`${id}:${a}`);
      else novo.add(`${id}:${a}`);
    }
    onChange([...novo].sort());
  }

  return (
    <div className="overflow-x-auto rounded-[14px] border border-border-subtle">
      <table className="w-full text-small">
        <thead className="bg-raised font-mono text-caption text-text-tertiary">
          <tr>
            <th className="sticky left-0 bg-raised px-3 py-2 text-left font-normal">Módulo</th>
            {colunas.map((a) => (
              <th key={a} className="px-2 py-2 font-normal">
                {ACOES_ROTULO[a]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULOS.map((m) => (
            <tr key={m.id} className="border-t border-border-subtle">
              <td className="sticky left-0 bg-overlay px-3 py-2">
                <button
                  type="button"
                  disabled={somenteLeitura}
                  onClick={() => alternarModulo(m.id, m.acoes)}
                  className={cn("text-left text-text-secondary", !somenteLeitura && "hover:text-text-primary")}
                  title={somenteLeitura ? undefined : "Marcar ou desmarcar o módulo inteiro"}
                >
                  {m.nome}
                </button>
              </td>
              {colunas.map((a) => {
                const existe = (m.acoes as readonly string[]).includes(a);
                const p = `${m.id}:${a}`;
                return (
                  <td key={a} className="px-2 py-2 text-center">
                    {existe ? (
                      <Checkbox
                        className="mx-auto"
                        checked={marcadas.has(p)}
                        disabled={somenteLeitura}
                        onCheckedChange={() => alternar(p)}
                        aria-label={`${m.nome}: ${ACOES_ROTULO[a]}`}
                      />
                    ) : (
                      <span className="text-text-tertiary/40">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
