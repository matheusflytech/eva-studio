"use client";

import * as React from "react";
import { Ellipsis, Plus, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MAX_FLUXOS } from "@/lib/subfluxos";
import type { Subfluxo } from "@/lib/data/flows";

/**
 * Abas dos fluxos do bot (S4): o Principal e os extras. No fluxo extra
 * aberto, as palavras-chave que levam a conversa até ele, de qualquer ponto.
 */
export function BarraDeFluxos({
  fluxos,
  atual,
  ocupado,
  onTrocar,
  onCriar,
  onRenomear,
  onPalavras,
  onApagar,
}: {
  fluxos: Subfluxo[];
  /** null = Principal. */
  atual: string | null;
  ocupado: boolean;
  onTrocar: (id: string | null) => void;
  onCriar: (nome: string) => void;
  onRenomear: (id: string, nome: string) => void;
  onPalavras: (id: string, palavras: string[]) => void;
  onApagar: (id: string) => void;
}) {
  const [criando, setCriando] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const aberto = fluxos.find((f) => f.id === atual) ?? null;

  const aba = (id: string | null, rotulo: string) => (
    <button
      key={id ?? "main"}
      type="button"
      role="tab"
      aria-selected={atual === id}
      disabled={ocupado}
      onClick={() => onTrocar(id)}
      className={cn(
        "h-8 shrink-0 rounded-full px-3.5 text-small font-medium transition-colors duration-150 disabled:opacity-60",
        atual === id ? "bg-inverse text-inverse-fg" : "text-text-secondary hover:bg-hover hover:text-text-primary"
      )}
    >
      {rotulo}
    </button>
  );

  function criar() {
    const n = nome.trim();
    if (n) onCriar(n);
    setNome("");
    setCriando(false);
  }


  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div role="tablist" aria-label="Fluxos do bot" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-border-subtle bg-panel p-1">
        {aba(null, "Principal")}
        {fluxos.map((f) => aba(f.id, f.name))}
        {criando ? (
          <Input
            autoFocus
            aria-label="Nome do fluxo novo"
            placeholder="Ex.: Vendas"
            value={nome}
            maxLength={60}
            onChange={(e) => setNome(e.target.value)}
            onBlur={criar}
            onKeyDown={(e) => {
              if (e.key === "Enter") criar();
              if (e.key === "Escape") {
                setNome("");
                setCriando(false);
              }
            }}
            className="h-8 w-40"
          />
        ) : (
          <button
            type="button"
            disabled={ocupado || fluxos.length >= MAX_FLUXOS}
            onClick={() => setCriando(true)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-small font-medium text-accent-fg hover:bg-accent-subtle disabled:opacity-40"
          >
            <Plus size={14} aria-hidden="true" /> Novo fluxo
          </button>
        )}
      </div>

      {aberto && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Tag size={14} className="shrink-0 text-text-tertiary" aria-hidden="true" />
          {/* key: trocar de fluxo (ou salvar) recomeça o campo com as palavras de lá. */}
          <PalavrasDoFluxo key={`${aberto.id}|${aberto.keywords.join(",")}`} fluxo={aberto} onSalvar={(l) => onPalavras(aberto.id, l)} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label={`Mais opções do fluxo ${aberto.name}`} variant="ghost">
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  const n = window.prompt("Novo nome do fluxo", aberto.name)?.trim();
                  if (n && n !== aberto.name) onRenomear(aberto.id, n);
                }}
              >
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-danger"
                onSelect={() => {
                  if (confirm(`Apagar o fluxo "${aberto.name}"? Conversas que estão nele voltam para o Principal.`)) onApagar(aberto.id);
                }}
              >
                Apagar fluxo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

function PalavrasDoFluxo({ fluxo, onSalvar }: { fluxo: Subfluxo; onSalvar: (palavras: string[]) => void }) {
  const [texto, setTexto] = React.useState(fluxo.keywords.join(", "));
  function salvar() {
    const lista = texto.split(",").map((p) => p.trim()).filter(Boolean);
    if (lista.join(",") !== fluxo.keywords.join(",")) onSalvar(lista);
  }
  return (
    <Input
      aria-label={`Palavras-chave do fluxo ${fluxo.name}`}
      title="Se o cliente mandar exatamente uma destas palavras, a conversa vem para este fluxo, de qualquer ponto."
      placeholder="Palavras-chave que abrem este fluxo (ex.: orçamento, preço)"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => e.key === "Enter" && salvar()}
      className="h-8 min-w-0 max-w-md flex-1"
    />
  );
}
