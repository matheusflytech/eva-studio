"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterButton, type FilterOption } from "@/components/ui/filter-button";
import { DateFilterButton } from "@/components/ui/date-filter-button";
import { Toolbar, ToolbarSeparator } from "@/components/ui/toolbar";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { EditorDeFiltros, type CampoDoEditor, type OpcoesExtras } from "@/components/dashboard/editor-de-filtros";
import type { OpcoesDoDashboard } from "@/components/dashboard/opcoes";
import type { FiltrosDeConsulta } from "@/lib/consulta";
import { filtrandoAlgo, limparFiltros, totalAvancado, type EstadoDaLista, type FiltroDaBarra } from "@/lib/listas/estado-da-lista";

/**
 * Barra de filtros das listas do CRM: um FilterButton por filtro de lista,
 * um DateFilterButton por filtro de data, "Filtros avançados" (gaveta com o
 * editor de grupos do dashboard, no catálogo da lista) e "Limpar". Mexer em
 * qualquer filtro volta para a página 1. `end` vai à direita (busca, ações).
 */
export function BarraDeFiltros({
  rotulo,
  barra,
  estado,
  onEstado,
  opcoes,
  buscaDeOpcoes,
  editor,
  end,
}: {
  rotulo: string;
  barra: FiltroDaBarra[];
  estado: EstadoDaLista;
  onEstado: (e: EstadoDaLista) => void;
  /** Opções de cada filtro de lista, por campo. */
  opcoes: Record<string, FilterOption[]>;
  /** Filtros com busca no servidor (ex.: contatos), por campo. */
  buscaDeOpcoes?: Record<string, (q: string) => void>;
  editor: {
    catalogo: readonly CampoDoEditor[];
    opcoes: OpcoesDoDashboard;
    extras: OpcoesExtras;
    campoInicialId: string;
    entidade: string;
  };
  end?: React.ReactNode;
}) {
  const [avancadoAberto, setAvancadoAberto] = React.useState(false);
  const [rascunho, setRascunho] = React.useState<FiltrosDeConsulta>(estado.avancado);
  const nAvancado = totalAvancado(estado);

  return (
    <>
      <Toolbar label={rotulo} end={end}>
        {barra.map((f) =>
          f.tipo === "lista" ? (
            <FilterButton
              key={f.campo}
              label={f.rotulo}
              options={opcoes[f.campo] ?? []}
              selected={estado.listas[f.campo] ?? []}
              searchable
              onSearchChange={buscaDeOpcoes?.[f.campo]}
              onChange={(valores) => onEstado({ ...estado, listas: { ...estado.listas, [f.campo]: valores }, pagina: 1 })}
            />
          ) : (
            <DateFilterButton
              key={f.campo}
              label={f.rotulo}
              value={estado.datas[f.campo] ?? null}
              onChange={(p) => {
                const datas = { ...estado.datas };
                if (p) datas[f.campo] = p;
                else delete datas[f.campo];
                onEstado({ ...estado, datas, pagina: 1 });
              }}
            />
          )
        )}
        <ToolbarSeparator />
        <Button
          variant="ghost"
          size="sm"
          className="text-accent-fg hover:text-accent-fg"
          onClick={() => {
            setRascunho(estado.avancado);
            setAvancadoAberto(true);
          }}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filtros avançados
          {nAvancado > 0 && <span className="tabular-nums">({nAvancado})</span>}
        </Button>
        {filtrandoAlgo(estado) && (
          <Button variant="ghost" size="sm" onClick={() => onEstado(limparFiltros(estado))}>
            Limpar filtros
          </Button>
        )}
      </Toolbar>

      <Drawer open={avancadoAberto} onOpenChange={setAvancadoAberto}>
        <DrawerContent
          title="Filtros avançados"
          description={`Condições em grupos (E/OU). Valem junto com os filtros da barra.`}
          size="lg"
          footer={
            <>
              <Button variant="ghost" className="mr-auto" onClick={() => setRascunho({ logica: "e", grupos: [] })}>
                Limpar condições
              </Button>
              <Button variant="secondary" onClick={() => setAvancadoAberto(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onEstado({ ...estado, avancado: rascunho, pagina: 1 });
                  setAvancadoAberto(false);
                }}
              >
                Aplicar
              </Button>
            </>
          }
        >
          <EditorDeFiltros
            filtros={rascunho}
            aoMudar={setRascunho}
            opcoes={editor.opcoes}
            funilIds={[]}
            catalogo={editor.catalogo}
            opcoesExtras={editor.extras}
            campoInicialId={editor.campoInicialId}
            textoVazio={`Sem condições: entram todos os ${editor.entidade} da visão e da barra.`}
          />
        </DrawerContent>
      </Drawer>
    </>
  );
}
