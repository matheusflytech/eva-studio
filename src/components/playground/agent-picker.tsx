"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrbeDoAgente } from "@/components/agent-studio/orbe-do-agente";
import type { Agent } from "@/lib/data/types";

// Seletor de agente na barra do Playground (v5). A coluna com todos os agentes
// e descrições saiu da frente: a descrição aparece dentro do menu.
export function AgentPicker({
  agents,
  activeId,
  onSelect,
}: {
  agents: Agent[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const ativo = agents.find((a) => a.id === activeId) ?? agents[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" aria-label={`Agente: ${ativo?.name ?? ""}. Trocar de agente`} className="max-w-[220px] pl-1.5 pr-2.5">
          {ativo && <OrbeDoAgente agenteId={ativo.id} tamanho={20} leve />}
          <span className="min-w-0 truncate">{ativo?.name ?? "Agente"}</span>
          <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-text-tertiary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Testar com</DropdownMenuLabel>
        {agents.map((agent) => {
          const isActive = agent.id === ativo?.id;
          return (
            <DropdownMenuItem key={agent.id} onSelect={() => onSelect(agent.id)} className="items-start py-1.5">
              <OrbeDoAgente agenteId={agent.id} tamanho={24} leve className="mt-0.5" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-text-primary">{agent.name}</span>
                <span className="line-clamp-2 text-caption text-text-tertiary">{agent.description || "Sem descrição."}</span>
              </span>
              {isActive && <Check size={14} aria-hidden="true" className="mt-1 shrink-0 !text-accent-fg" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
