"use client";

import * as React from "react";
import { create } from "zustand";
import { useAuth } from "@/lib/auth/auth-context";
import { useContrato } from "@/lib/contrato/navegacao";
import type { ContextoDoRegistro } from "@/lib/busca/grupos";
import { chaveDosRecentes, gravarRecente } from "@/lib/busca/recentes";

// ---------------------------------------------------------------------------
// Registro aberto agora (ficha do negócio, prévia do quadro, ficha do
// contato, página da empresa). A tela registra o que sabe fazer — mudar
// etapa, atribuir, WhatsApp — e a paleta (⌘K) oferece essas ações primeiro,
// chamando as funções DA TELA: as regras de etapa, os modais e o desfazer
// continuam sendo os dela. Abrir um registro também o põe nos Recentes.
// ---------------------------------------------------------------------------

export interface RegistroEmFoco {
  tipo: ContextoDoRegistro["tipo"];
  id: string;
  titulo: string;
  /** Caminho de tela sem contrato (Recentes). */
  caminho: string;
  subtitulo?: string;
  /** Etapas do funil (Mudar etapa para…). */
  etapas?: { id: string; nome: string; tipo: string }[];
  etapaAtualId?: string;
  aoMudarEtapa?: (etapaId: string) => void;
  /** Membros (sem a lista, a paleta busca /api/members). */
  membros?: { id: string; name: string }[];
  donoAtualId?: string | null;
  aoAtribuir?: (userId: string | null) => void;
  /** Contato para WhatsApp. */
  whatsapp?: { nome: string; telefone?: string | null; conversaId?: string | null } | null;
  /** Vínculos da tarefa criada a partir daqui. */
  tarefa?: { dealId?: string; contactId?: string };
}

interface Estado {
  registro: RegistroEmFoco | null;
}

export const useRegistroEmFocoStore = create<Estado>(() => ({ registro: null }));

/** Contexto para os grupos da paleta. */
export function contextoDoRegistro(r: RegistroEmFoco | null): ContextoDoRegistro | null {
  if (!r) return null;
  return {
    tipo: r.tipo,
    id: r.id,
    titulo: r.titulo,
    mudarEtapa: !!r.aoMudarEtapa && (r.etapas?.length ?? 0) > 1,
    atribuir: !!r.aoAtribuir,
    whatsappPara: r.whatsapp && (r.whatsapp.telefone || r.whatsapp.conversaId) ? r.whatsapp.nome : null,
  };
}

/**
 * A tela chama com o registro aberto (null enquanto carrega). Passe um objeto
 * memorizado (useMemo): cada objeto novo re-registra.
 */
export function useRegistroEmFoco(registro: RegistroEmFoco | null) {
  const contrato = useContrato();
  const { session } = useAuth();
  const userId = session?.userId ?? null;

  React.useEffect(() => {
    if (!registro) return;
    useRegistroEmFocoStore.setState({ registro });
    return () => {
      // Só limpa se ainda é este (a próxima ficha pode já ter registrado).
      if (useRegistroEmFocoStore.getState().registro === registro) useRegistroEmFocoStore.setState({ registro: null });
    };
  }, [registro]);

  // Recentes: uma vez por registro aberto (não a cada recarga da ficha).
  const tipo = registro?.tipo;
  const id = registro?.id;
  const titulo = registro?.titulo;
  const caminho = registro?.caminho;
  const subtitulo = registro?.subtitulo;
  React.useEffect(() => {
    if (!tipo || !id || !titulo || !caminho || !contrato || !userId) return;
    let armazenamento: Storage | null = null;
    try {
      armazenamento = window.localStorage;
    } catch {
      /* bloqueado */
    }
    gravarRecente(armazenamento, chaveDosRecentes(contrato, userId), { tipo, id, titulo, caminho, subtitulo });
  }, [tipo, id, titulo, caminho, subtitulo, contrato, userId]);
}
