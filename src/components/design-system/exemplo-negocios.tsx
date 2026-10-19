"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar } from "@/components/ui/toolbar";
import { FilterButton } from "@/components/ui/filter-button";
import { ViewTabs } from "@/components/ui/view-tabs";
import { Avatar } from "@/components/ui/avatar";
import { KanbanCard, KanbanColumn, formatMoney } from "@/components/ui/kanban-column";
import { DONOS, ETAPAS_NEGOCIO, negociosFicticios } from "./dados-ficticios";

/* Exemplo de tela: quadro de negócios com 5 colunas e totais no rodapé. */

const QUANTIDADES = [6, 5, 4, 3, 2];

export function ExemploNegocios() {
  const [donos, setDonos] = React.useState<string[]>([]);
  const [recolhidas, setRecolhidas] = React.useState<Set<string>>(new Set());
  const [visao, setVisao] = React.useState("abertos");

  const colunas = ETAPAS_NEGOCIO.map((etapa, i) => {
    const todos = negociosFicticios(i, QUANTIDADES[i]);
    const itens = donos.length ? todos.filter((n) => donos.includes(n.dono)) : todos;
    const total = itens.reduce((s, n) => s + n.valor, 0);
    return { etapa, itens, total, ponderado: Math.round(total * etapa.probabilidade) };
  });
  const totalGeral = colunas.reduce((s, c) => s + c.total, 0);
  const qtdGeral = colunas.reduce((s, c) => s + c.itens.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Negócios"
        description={`${qtdGeral} negócios abertos · ${formatMoney(totalGeral)} no funil`}
        actions={
          <Button variant="primary">
            <Plus size={14} aria-hidden="true" />
            Criar negócio
          </Button>
        }
      />
      <ViewTabs
        label="Visões de negócios"
        value={visao}
        onChange={setVisao}
        views={[
          { id: "abertos", label: "Abertos", count: qtdGeral },
          { id: "meus", label: "Meus negócios", count: 7 },
          { id: "fechando", label: "Fechando este mês", count: 5 },
        ]}
      />
      <Toolbar label="Filtros do quadro">
        <FilterButton label="Proprietário" options={DONOS.map((d) => ({ value: d, label: d }))} selected={donos} onChange={setDonos} searchable />
        <FilterButton label="Previsão de fechamento" options={[{ value: "mes", label: "Este mês" }, { value: "tri", label: "Este trimestre" }]} selected={[]} onChange={() => undefined} />
        <FilterButton label="Produto" options={[{ value: "pro", label: "Plano Pro" }, { value: "equipe", label: "Plano Equipe" }]} selected={[]} onChange={() => undefined} />
      </Toolbar>
      <div className="flex min-h-[460px] gap-2 overflow-x-auto pb-2">
        {colunas.map(({ etapa, itens, total, ponderado }) => (
          <KanbanColumn
            key={etapa.id}
            title={etapa.nome}
            count={itens.length}
            total={total}
            weighted={ponderado}
            collapsed={recolhidas.has(etapa.id)}
            onCollapsedChange={(v) =>
              setRecolhidas((s) => {
                const n = new Set(s);
                if (v) n.add(etapa.id);
                else n.delete(etapa.id);
                return n;
              })
            }
          >
            {itens.map((n) => (
              <KanbanCard
                key={n.id}
                title={n.titulo}
                subtitle={n.empresa}
                value={n.valor}
                onClick={() => undefined}
                meta={
                  <>
                    <span className="tabular-nums">{n.previsao}</span>
                    <Avatar name={n.dono} size="sm" />
                  </>
                }
              />
            ))}
          </KanbanColumn>
        ))}
      </div>
    </div>
  );
}
