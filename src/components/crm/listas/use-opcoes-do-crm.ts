"use client";

import * as React from "react";
import { OPCOES_VAZIAS, type OpcoesDoDashboard } from "@/components/dashboard/opcoes";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { SEM_VALOR } from "@/lib/consulta";
import { VALORES_DE_TAREFA, type EntidadeCrm } from "@/lib/filtro-crm";
import type { FilterOption } from "@/components/ui/filter-button";
import type { OpcoesExtras } from "@/components/dashboard/editor-de-filtros";

// ---------------------------------------------------------------------------
// O que as barras de filtro de Contatos e Negócios oferecem para escolher:
// membros, equipes, empresas, etiquetas, canais (GET /api/analytics/opcoes e
// /api/teams), segmentos ou produtos, os campos personalizados da entidade e
// quem está logado (para "Meus").
// ---------------------------------------------------------------------------

export interface OpcoesDoCrm {
  dash: OpcoesDoDashboard;
  equipes: { id: string; name: string }[];
  segmentos: { id: string; name: string }[];
  produtos: { id: string; name: string }[];
  /** Campos personalizados da entidade da lista. */
  campos: DefinicaoDeCampo[];
  meuId: string;
  meuNome: string;
  carregado: boolean;
}

const json = (url: string) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

export function useOpcoesDoCrm(entidade: EntidadeCrm): OpcoesDoCrm & { recarregar: () => void } {
  const [o, setO] = React.useState<OpcoesDoCrm>({
    dash: OPCOES_VAZIAS,
    equipes: [],
    segmentos: [],
    produtos: [],
    campos: [],
    meuId: "",
    meuNome: "",
    carregado: false,
  });
  const [versao, setVersao] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    Promise.all([
      json("/api/analytics/opcoes"),
      json("/api/teams"),
      json("/api/me"),
      entidade === "contatos" ? json("/api/segments") : json("/api/products"),
      entidade === "contatos" ? json("/api/custom-fields?entity=contact&todos=1") : Promise.resolve(null),
    ]).then(([dash, equipes, me, extra, camposDeContato]) => {
      if (!vivo) return;
      const d: OpcoesDoDashboard = { ...OPCOES_VAZIAS, ...(dash ?? {}) };
      setO({
        dash: d,
        equipes: equipes?.equipes ?? [],
        segmentos: entidade === "contatos" ? (extra?.segments ?? []) : [],
        produtos: entidade === "negocios" ? (extra?.produtos ?? []).map((p: { id: string; name?: string; nome?: string }) => ({ id: p.id, name: p.name ?? p.nome ?? "" })) : [],
        // Negócio: os campos de negócio vêm no próprio /api/analytics/opcoes.
        campos: entidade === "contatos" ? (camposDeContato?.fields ?? []) : d.campos,
        meuId: me?.session?.userId ?? "",
        meuNome: me?.session?.name ?? "",
        carregado: true,
      });
    });
    return () => {
      vivo = false;
    };
  }, [entidade, versao]);

  const recarregar = React.useCallback(() => setVersao((v) => v + 1), []);
  return { ...o, recarregar };
}

const nomes = (l: { id: string; name: string }[]): FilterOption[] => l.map((x) => ({ value: x.id, label: x.name || "Sem nome" }));

/** Opções de cada filtro de lista da barra, por campo. */
export function opcoesDaBarra(o: OpcoesDoCrm): Record<string, FilterOption[]> {
  return {
    responsavel: [{ value: SEM_VALOR, label: "Sem proprietário" }, ...nomes(o.dash.membros)],
    equipe: [{ value: SEM_VALOR, label: "Sem equipe" }, ...nomes(o.equipes)],
    empresa: [{ value: SEM_VALOR, label: "Sem empresa" }, ...nomes(o.dash.empresas)],
    etiqueta: nomes(o.dash.etiquetas),
    segmento: nomes(o.segmentos),
    produto: nomes(o.produtos),
    tarefa: VALORES_DE_TAREFA.map((t) => ({ value: t.id, label: t.rotulo })),
  };
}

/** Fontes de opção que o editor de filtros avançados não conhece sozinho. */
export function opcoesExtrasDoEditor(o: OpcoesDoCrm, contatos: { id: string; label: string }[] = []): OpcoesExtras {
  const sel = (l: { id: string; name: string }[]) => l.map((x) => ({ id: x.id, label: x.name || "Sem nome" }));
  return {
    equipes: [{ id: SEM_VALOR, label: "Sem equipe" }, ...sel(o.equipes)],
    segmentos: sel(o.segmentos),
    produtos: sel(o.produtos),
    tarefas: VALORES_DE_TAREFA.map((t) => ({ id: t.id, label: t.rotulo })),
    contatos,
  };
}

/** Opções do dashboard com os campos personalizados da entidade (para o editor). */
export function opcoesDoEditor(o: OpcoesDoCrm): OpcoesDoDashboard {
  return { ...o.dash, campos: o.campos };
}
