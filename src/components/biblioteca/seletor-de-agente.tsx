"use client";

import * as React from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Agente escolhido ao lado do título (Biblioteca, Disparos): a inicial num
// quadradinho, o nome e o menu com os outros agentes. Substitui o <select>
// que ficava no meio do formulário.
// ---------------------------------------------------------------------------

export function SeletorDeAgente({
  agentes,
  agentId,
  onChange,
  rotulo = "Agente",
}: {
  agentes: { id: string; name: string }[];
  agentId: string | null;
  onChange: (id: string) => void;
  rotulo?: string;
}) {
  const atual = agentes.find((a) => a.id === agentId);
  if (!agentes.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={`${rotulo}: ${atual?.name ?? ""}. Trocar de agente`} className="min-w-0 max-w-[220px] gap-2 pl-1 pr-2 text-text-primary">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-inverse text-caption font-semibold text-inverse-fg"
          >
            {(atual?.name ?? "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{atual?.name ?? "Escolha"}</span>
          <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-text-tertiary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Agentes</DropdownMenuLabel>
        {agentes.map((a) => (
          <DropdownMenuCheckboxItem key={a.id} checked={a.id === agentId} onCheckedChange={() => a.id !== agentId && onChange(a.id)}>
            {a.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
