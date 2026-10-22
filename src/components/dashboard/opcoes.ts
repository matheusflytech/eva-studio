"use client";

import * as React from "react";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { ROTULO_CANAL, ROTULO_TIPO_ETAPA, SEM_VALOR, type CampoDeFiltro, type RotulosDaConsulta } from "@/lib/consulta";
import type { OpcaoDeSelecao } from "@/components/dashboard/seletor-multiplo";

// O que os filtros do dashboard oferecem pra escolher (GET /api/analytics/opcoes).

export interface FunilComEtapas {
  id: string;
  name: string;
  stages: { id: string; name: string; type: string; position: number }[];
}

export interface OpcoesDoDashboard {
  funis: FunilComEtapas[];
  membros: { id: string; name: string }[];
  etiquetas: { id: string; name: string }[];
  empresas: { id: string; name: string }[];
  canais: string[];
  motivosDePerda: string[];
  campos: DefinicaoDeCampo[];
}

export const OPCOES_VAZIAS: OpcoesDoDashboard = {
  funis: [], membros: [], etiquetas: [], empresas: [], canais: [], motivosDePerda: [], campos: [],
};

export function useOpcoesDoDashboard(): { opcoes: OpcoesDoDashboard; carregado: boolean } {
  const [opcoes, setOpcoes] = React.useState<OpcoesDoDashboard>(OPCOES_VAZIAS);
  const [carregado, setCarregado] = React.useState(false);
  React.useEffect(() => {
    let vivo = true;
    fetch("/api/analytics/opcoes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d) setOpcoes({ ...OPCOES_VAZIAS, ...d });
      })
      .catch(() => {})
      .finally(() => vivo && setCarregado(true));
    return () => { vivo = false; };
  }, []);
  return { opcoes, carregado };
}

export function rotulosDasOpcoes(o: OpcoesDoDashboard): RotulosDaConsulta {
  return { campos: o.campos, funis: o.funis, membros: o.membros, empresas: o.empresas, etiquetas: o.etiquetas };
}

/** Itens de uma lista de filtro. Etapas só dos funis escolhidos (ou de todos). */
export function opcoesDoCampo(campo: CampoDeFiltro, o: OpcoesDoDashboard, funilIds: string[] = []): OpcaoDeSelecao[] {
  const nomes = (l: { id: string; name: string }[]) => l.map((x) => ({ id: x.id, label: x.name }));
  switch (campo.opcoes) {
    case "funis": return nomes(o.funis);
    case "etapas": {
      const funis = funilIds.length ? o.funis.filter((f) => funilIds.includes(f.id)) : o.funis;
      return funis.flatMap((f) => f.stages.map((s) => ({ id: s.id, label: s.name, grupo: funis.length > 1 ? f.name : undefined })));
    }
    case "tiposEtapa": return Object.entries(ROTULO_TIPO_ETAPA).map(([id, label]) => ({ id, label }));
    case "membros": return [{ id: SEM_VALOR, label: "Sem responsável" }, ...nomes(o.membros)];
    case "empresas": return [{ id: SEM_VALOR, label: "Sem empresa" }, ...nomes(o.empresas)];
    case "etiquetas": return nomes(o.etiquetas);
    case "canais": return o.canais.map((c) => ({ id: c, label: ROTULO_CANAL[c] ?? c }));
    case "campo": return (campo.def?.options ?? []).map((x) => ({ id: x.value, label: x.label }));
  }
  return [];
}
