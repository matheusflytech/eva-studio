"use client";

import * as React from "react";
import { Search, ChevronDown, X, CornerDownRight, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";
import { BLOCK_STYLES } from "./block-styles";
import { PALETTE_GROUPS, searchable, type PaletteItem } from "./palette-groups";
import { cn } from "@/lib/utils";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function ItemButton({ item, onAdd }: { item: PaletteItem; onAdd: (key: IconKey) => void }) {
  const Icon = ICON_REGISTRY[item.key];
  const style = BLOCK_STYLES[item.key];

  return (
    <button
      type="button"
      onClick={() => onAdd(item.key)}
      title={item.hint}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
        "hover:bg-surface-2",
        // Ferramenta recuada: a própria indentação ensina que ela pertence ao
        // bloco de IA acima, em vez de um parágrafo explicando isso.
        item.tool && "ml-2 border-l border-border-subtle pl-3"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          style.badgeBg,
          style.badgeText
        )}
      >
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-text-secondary transition-colors group-hover:text-text-primary">
          {item.label}
        </span>
        <span className="block truncate text-[11px] text-text-tertiary">{item.hint}</span>
      </span>
    </button>
  );
}

export function BlockPalette({
  onAdd,
  ancora,
  recolhida,
  onToggle,
}: {
  onAdd: (iconKey: IconKey) => void;
  /** Nome do bloco em que o próximo vai se pendurar. null = começo do fluxo. */
  ancora: string | null;
  recolhida: boolean;
  onToggle: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [fechados, setFechados] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(PALETTE_GROUPS.filter((g) => g.collapsed).map((g) => [g.id, true]))
  );

  const termo = normalize(query.trim());

  // Buscando, os grupos abrem sozinhos e os vazios somem: procurar e ainda
  // ter que abrir seção é o tipo de atrito que faz a busca não valer nada.
  const grupos = React.useMemo(() => {
    if (!termo) return PALETTE_GROUPS.map((g) => ({ ...g, aberto: !fechados[g.id] }));
    return PALETTE_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => searchable(i).includes(termo)),
      aberto: true,
    })).filter((g) => g.items.length > 0);
  }, [termo, fechados]);

  const totalEncontrado = grupos.reduce((n, g) => n + g.items.length, 0);

  // Recolhida vira uma faixa estreita: o canvas ganha o espaço inteiro e o
  // caminho de volta continua à vista.
  if (recolhida) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Mostrar blocos"
        className="glass-card glass-card-solid flex w-11 shrink-0 flex-col items-center gap-2 rounded-3xl py-3 text-text-tertiary transition-colors hover:text-text-primary"
      >
        <PanelLeftOpen size={16} />
        <span className="[writing-mode:vertical-rl] text-[11px] font-semibold uppercase tracking-wide">
          Blocos
        </span>
      </button>
    );
  }

  return (
    <div className="glass-card glass-card-solid flex w-[250px] shrink-0 flex-col overflow-hidden rounded-3xl">
      <div className="border-b border-border-subtle p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            Blocos
          </p>
          <button
            type="button"
            onClick={onToggle}
            title="Recolher"
            className="text-text-tertiary transition-colors hover:text-text-primary"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        {/* Dizer onde o bloco vai cair é o que transforma "clicou e apareceu um
            retângulo solto no canto" em "clicou e o fluxo continuou". */}
        <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-[11px] text-text-tertiary">
          <Plus size={11} className="shrink-0 text-accent-400" />
          <span className="min-w-0 truncate">
            {ancora ? (
              <>entra depois de <span className="text-text-secondary">{ancora}</span></>
            ) : (
              "começa o fluxo"
            )}
          </span>
        </p>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar bloco..."
            className={cn(
              "w-full rounded-xl bg-surface-2 py-2 pl-8 pr-7 text-[12.5px] text-text-primary outline-none",
              "placeholder:text-text-tertiary focus:ring-1 focus:ring-accent-500/40"
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {totalEncontrado === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-text-tertiary">
            Nenhum bloco com “{query}”.
          </p>
        ) : (
          grupos.map((grupo) => (
            <div key={grupo.id} className="mb-1 last:mb-0">
              <button
                type="button"
                onClick={() => setFechados((f) => ({ ...f, [grupo.id]: !f[grupo.id] }))}
                disabled={!!termo}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide",
                  "text-text-tertiary transition-colors",
                  !termo && "hover:text-text-secondary"
                )}
              >
                <ChevronDown
                  size={12}
                  className={cn("transition-transform", !grupo.aberto && "-rotate-90")}
                />
                {grupo.label}
                <span className="ml-auto font-normal normal-case tracking-normal">
                  {grupo.items.length}
                </span>
              </button>

              {grupo.aberto && (
                <div className="flex flex-col gap-0.5">
                  {grupo.items.map((item, i) => {
                    const primeiraFerramenta = item.tool && !grupo.items[i - 1]?.tool;
                    return (
                      <React.Fragment key={item.key}>
                        {primeiraFerramenta && (
                          <p className="mb-0.5 mt-1.5 flex items-center gap-1.5 px-2.5 text-[10.5px] text-text-tertiary">
                            <CornerDownRight size={11} />
                            dão ferramentas à IA acima
                          </p>
                        )}
                        <ItemButton item={item} onAdd={onAdd} />
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
