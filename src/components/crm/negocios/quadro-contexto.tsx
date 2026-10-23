"use client";

import * as React from "react";
import type { NegocioKanban } from "./modelo";

// O que o cartão pode pedir ao quadro (quadro v4): abrir o painel (já numa
// criação de tarefa ou nota) e mover de etapa pelo "⋯". Fora do quadro
// (prévia da configuração, cartão que segue o mouse) não há contexto, e o
// cartão mostra as ações sem clique.

export type FocoDoPainel = "tarefa" | "nota";

export interface AcoesDoQuadro {
  etapas: { id: string; name: string; type: string }[];
  onAbrir: (deal: NegocioKanban, foco?: FocoDoPainel) => void;
  onMover: (deal: NegocioKanban, etapaId: string) => void;
}

export const QuadroContexto = React.createContext<AcoesDoQuadro | null>(null);
