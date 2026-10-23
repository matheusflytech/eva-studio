"use client";

import * as React from "react";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import type { LinhaDoTempo } from "./linha-do-tempo";
import type { RegraDaEtapa } from "@/lib/regras-de-etapa";

export interface EtapaDaFicha {
  id: string;
  name: string;
  type: string;
  probability: number;
  position: number;
  color: string;
}

/** O que GET /api/deals/[dealId] devolve (Dates já como ISO). */
export interface NegocioDaFicha {
  id: string;
  name: string;
  description: string;
  amountCents: number;
  probability: number;
  lostReason: string;
  expectedClosingAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  stageSince: string;
  createdAt: string;
  stageId: string;
  pipelineId: string;
  ownerId: string | null;
  companyId: string | null;
  stage: EtapaDaFicha;
  pipeline: { id: string; name: string; stages: EtapaDaFicha[] };
  company: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  contacts: { contact: { id: string; name: string; email: string; phone: string; jobTitle?: string } }[];
  tasks: { id: string; type: string; text: string; dueAt: string | null; doneAt: string | null }[];
  customFields: Record<string, unknown>;
  /** Última atividade (relógio do parado). */
  lastActivityAt?: string | null;
  /** Motivo estruturado da perda (null = sem registro: vale lostReason). */
  perda?: { motivoId: string | null; rotulo: string; nota: string } | null;
}

export interface Membro {
  id: string;
  name: string;
  email: string;
}

export type EstadoDaFicha = "carregando" | "ok" | "nao_encontrado" | "erro";

/** Resposta de erro da API em texto para a tela. */
export async function mensagemDeErro(res: Response, padrao: string): Promise<string> {
  const corpo = await res.json().catch(() => ({}));
  return typeof corpo?.error === "string" && corpo.error ? corpo.error : padrao;
}

type Resultado =
  | { tipo: "ok"; deal: NegocioDaFicha; defs: DefinicaoDeCampo[]; linha: LinhaDoTempo | null; regras: Record<string, RegraDaEtapa> }
  | { tipo: "nao_encontrado" }
  | { tipo: "erro" };

async function buscarFicha(dealId: string): Promise<Resultado> {
  try {
    const [rDeal, rLinha] = await Promise.all([
      fetch(`/api/deals/${dealId}`),
      fetch(`/api/deals/${dealId}/linha-do-tempo`).catch(() => null),
    ]);
    if (rDeal.status === 404) return { tipo: "nao_encontrado" };
    if (!rDeal.ok) return { tipo: "erro" };
    const dados = await rDeal.json();
    const linha: LinhaDoTempo | null = rLinha?.ok ? await rLinha.json().catch(() => null) : null;
    return { tipo: "ok", deal: dados.deal, defs: dados.fields ?? [], linha, regras: dados.regras ?? {} };
  } catch {
    return { tipo: "erro" };
  }
}

/**
 * Dados da ficha: o negócio, a linha do tempo e quem pode ser responsável.
 *
 * Toda ação recarrega negócio e linha do tempo juntos: mover de etapa muda
 * probabilidade, "há N dias" e cria um item no histórico de uma vez, e
 * remendar cada pedaço na mão é onde a tela começa a mentir.
 */
export function useFicha(dealId: string) {
  const [estado, setEstado] = React.useState<EstadoDaFicha>("carregando");
  const [deal, setDeal] = React.useState<NegocioDaFicha | null>(null);
  const [defs, setDefs] = React.useState<DefinicaoDeCampo[]>([]);
  const [regras, setRegras] = React.useState<Record<string, RegraDaEtapa>>({});
  const [linha, setLinha] = React.useState<LinhaDoTempo>({ itens: [], conversas: [] });
  const [linhaFalhou, setLinhaFalhou] = React.useState(false);
  const [membros, setMembros] = React.useState<Membro[]>([]);
  // "Agora" fixado em cada carga: calcular no render deixaria "há N dias"
  // diferente entre servidor e navegador e entre um render e outro.
  const [agora, setAgora] = React.useState(() => new Date(0));

  // Trocou de negócio sem desmontar (o painel do quadro): o que está na tela
  // é do anterior. Volta a "carregando" já neste render, sem mostrar a linha
  // do tempo de um negócio no outro.
  const [doNegocio, setDoNegocio] = React.useState(dealId);
  if (doNegocio !== dealId) {
    setDoNegocio(dealId);
    setEstado("carregando");
    setDeal(null);
    setLinha({ itens: [], conversas: [] });
    setLinhaFalhou(false);
  }

  // A busca não mexe em estado; quem aplica é `aplicar`. Separado assim para
  // a carga inicial poder descartar resposta de outro negócio (trocou de
  // ficha antes de a anterior chegar).
  const aplicar = React.useCallback((r: Resultado) => {
    if (r.tipo === "nao_encontrado") return setEstado("nao_encontrado");
    // Falha com a ficha já na tela: fica com o que tinha.
    if (r.tipo === "erro") return setEstado((e) => (e === "ok" ? e : "erro"));
    setDeal(r.deal);
    setDefs(r.defs);
    setRegras(r.regras);
    // Linha do tempo é complemento: sem ela a ficha abre do mesmo jeito,
    // com o aviso no lugar da lista.
    if (r.linha) setLinha(r.linha);
    setLinhaFalhou(!r.linha);
    setAgora(new Date());
    setEstado("ok");
  }, []);

  const carregar = React.useCallback(async () => {
    aplicar(await buscarFicha(dealId));
  }, [dealId, aplicar]);

  React.useEffect(() => {
    let vivo = true;
    buscarFicha(dealId).then((r) => vivo && aplicar(r));
    return () => {
      vivo = false;
    };
  }, [dealId, aplicar]);

  React.useEffect(() => {
    fetch("/api/members")
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembros(d.members ?? []))
      .catch(() => {});
  }, []);

  /** PATCH no negócio. Devolve a mensagem de erro, ou null se deu certo. */
  const patch = React.useCallback(
    async (body: Record<string, unknown>): Promise<string | null> => {
      try {
        const res = await fetch(`/api/deals/${dealId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const falha = res.ok ? null : await mensagemDeErro(res, "Não foi possível salvar.");
        await carregar();
        return falha;
      } catch {
        return "Sem conexão. Tente de novo.";
      }
    },
    [dealId, carregar]
  );

  return { estado, deal, defs, regras, linha, linhaFalhou, membros, agora, carregar, patch };
}

export type Ficha = ReturnType<typeof useFicha>;
