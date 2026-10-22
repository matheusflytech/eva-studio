"use client";

import * as React from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type AbaDeContatos = "contatos" | "etiquetas" | "segmentos";

const ABAS: { value: AbaDeContatos; label: string }[] = [
  { value: "contatos", label: "Contatos" },
  { value: "etiquetas", label: "Etiquetas" },
  { value: "segmentos", label: "Segmentos" },
];

/**
 * Cabeçalho da tela: número de apoio em mono acima do título, as três seções
 * num controle compacto ao lado e uma ação principal ("Novo contato"). O resto
 * (importar, exportar, colunas) mora no "…".
 */
export function CabecalhoDeContatos({
  rotulo,
  aba,
  onAba,
  onNovo,
  menu,
}: {
  /** Ex.: "1.284 no total". */
  rotulo?: string;
  aba: AbaDeContatos;
  onAba: (a: AbaDeContatos) => void;
  onNovo: () => void;
  /** Itens do "…" (DropdownMenuItem). */
  menu?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <div className="min-w-0">
        <p className="h-4 font-mono text-caption uppercase tracking-wider text-text-tertiary tabular-nums">{rotulo ?? ""}</p>
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Contatos</h1>
      </div>
      <SegmentedControl label="Seções de contatos" options={ABAS} value={aba} onChange={onAba} className="mb-0.5" />
      <div className="ml-auto flex items-center gap-2">
        <Button variant="primary" onClick={onNovo}>
          <Plus size={14} aria-hidden="true" />
          Novo contato
        </Button>
        {menu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Mais ações de contatos" variant="secondary">
                <MoreHorizontal aria-hidden="true" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {menu}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
