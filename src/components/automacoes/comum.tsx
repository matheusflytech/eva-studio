"use client";

import * as React from "react";
import {
  Bell,
  Building2,
  CheckSquare,
  Clock,
  Contact,
  Database,
  Flag,
  GitBranch,
  Handshake,
  Hourglass,
  Mail,
  MessageCircle,
  MessageSquare,
  Repeat,
  Split,
  Tag,
  UserCheck,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Nomes } from "@/lib/automacoes/catalogo";
import type { Objeto } from "@/lib/automacoes/tipos";
import type { CategoryColor } from "@/lib/design-system/tokens";

// ---------------------------------------------------------------------------
// O que as telas de automação compartilham: as opções dos seletores (vindas
// de /api/automacoes/opcoes), os nomes que a frase legível usa, ícones e cores.
// ---------------------------------------------------------------------------

export interface Opcoes {
  funis: { id: string; nome: string; etapas: { id: string; nome: string; tipo: string }[] }[];
  tags: { id: string; nome: string }[];
  usuarios: { id: string; nome: string }[];
  agentes: { id: string; nome: string }[];
  camposPersonalizados: { chave: string; nome: string; tipo: string; objeto: string }[];
  modelosWhatsapp: { id: string; nome: string; agentId: string }[];
  modelosEmail: { id: string; nome: string }[];
  reguas: { id: string; nome: string; ativa: boolean }[];
  segmentos: { id: string; nome: string }[];
}

export const OPCOES_VAZIAS: Opcoes = {
  funis: [],
  tags: [],
  usuarios: [],
  agentes: [],
  camposPersonalizados: [],
  modelosWhatsapp: [],
  modelosEmail: [],
  reguas: [],
  segmentos: [],
};

export function useOpcoes(): Opcoes {
  const [opcoes, setOpcoes] = React.useState<Opcoes>(OPCOES_VAZIAS);
  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/automacoes/opcoes")
      .then((r) => (r.ok ? r.json() : OPCOES_VAZIAS))
      .catch(() => OPCOES_VAZIAS)
      .then((d) => {
        if (vivo) setOpcoes({ ...OPCOES_VAZIAS, ...d });
      });
    return () => {
      vivo = false;
    };
  }, []);
  return opcoes;
}

/** Rótulo dos campos de data/campo, inclusive os personalizados ("registro.custom_fields.x"). */
export function nomeDoCampo(caminho: string, opcoes: Opcoes, rotulos: Record<string, string>): string | undefined {
  if (rotulos[caminho]) return rotulos[caminho];
  const m = caminho.match(/^registro\.custom_fields\.(.+)$/);
  if (m) return opcoes.camposPersonalizados.find((c) => c.chave === m[1])?.nome;
  return undefined;
}

/** Nomes legíveis para a frase e os cartões (o que não achar aparece como id). */
export function nomesDasOpcoes(opcoes: Opcoes, rotulosDeCampo: Record<string, string> = {}): Nomes {
  const etapas = new Map(opcoes.funis.flatMap((f) => f.etapas.map((e) => [e.id, opcoes.funis.length > 1 ? `${e.nome} (${f.nome})` : e.nome])));
  const mapa = (l: { id: string; nome: string }[]) => {
    const m = new Map(l.map((x) => [x.id, x.nome]));
    return (id: string) => m.get(id);
  };
  const campo = (id: string) => nomeDoCampo(id, opcoes, rotulosDeCampo);
  return {
    etapa: (id) => etapas.get(id),
    funil: mapa(opcoes.funis),
    tag: mapa(opcoes.tags),
    usuario: mapa(opcoes.usuarios),
    usuarios: mapa(opcoes.usuarios),
    agente: mapa(opcoes.agentes),
    modelo_whatsapp: mapa(opcoes.modelosWhatsapp),
    modelo_email: mapa(opcoes.modelosEmail),
    regua: mapa(opcoes.reguas),
    segmento: mapa(opcoes.segmentos),
    campo,
    campo_data: campo,
  };
}

export const ICONE_DO_OBJETO: Record<Objeto, LucideIcon> = {
  deal: Handshake,
  contact: Contact,
  company: Building2,
  task: CheckSquare,
  conversation: MessageSquare,
};

/** Ícone e cor de cada passo no canvas (cor de categoria do design system). */
export function visualDoPasso(tipo: string, acao?: string): { icone: LucideIcon; cor: CategoryColor; categoria: string } {
  if (tipo === "gatilho") return { icone: Zap, cor: "amber", categoria: "Gatilho" };
  if (tipo === "condicao") return { icone: GitBranch, cor: "violet", categoria: "Condição" };
  if (tipo === "caminhos") return { icone: Split, cor: "violet", categoria: "Caminhos" };
  if (tipo === "espera") return { icone: Clock, cor: "slate", categoria: "Espera" };
  if (tipo === "esperar_evento") return { icone: Hourglass, cor: "slate", categoria: "Esperar evento" };
  if (tipo === "fim") return { icone: Flag, cor: "slate", categoria: "Fim" };
  switch (acao) {
    case "whatsapp.send":
      return { icone: MessageCircle, cor: "green", categoria: "Mensagem" };
    case "email.send":
      return { icone: Mail, cor: "cyan", categoria: "E-mail" };
    case "sequence.enroll":
    case "sequence.remove":
      return { icone: Repeat, cor: "teal", categoria: "Régua" };
    case "conversation.handoff":
      return { icone: UserCheck, cor: "green", categoria: "Conversa" };
    case "owner.assign":
      return { icone: UserCheck, cor: "orange", categoria: "Equipe" };
    case "task.create":
    case "task.complete_open":
      return { icone: CheckSquare, cor: "orange", categoria: "Tarefa" };
    case "team.notify":
      return { icone: Bell, cor: "orange", categoria: "Equipe" };
    case "contact.add_tag":
    case "contact.remove_tag":
      return { icone: Tag, cor: "blue", categoria: "CRM" };
    case "n8n.webhook":
    case "http.request":
      return { icone: Webhook, cor: "rose", categoria: "Integração" };
    default:
      return { icone: Database, cor: "blue", categoria: "CRM" };
  }
}

export const STATUS_DA_AUTOMACAO: Record<string, { rotulo: string; variante: "success" | "warning" | "neutral" }> = {
  ativa: { rotulo: "Ligada", variante: "success" },
  pausada: { rotulo: "Pausada", variante: "warning" },
  rascunho: { rotulo: "Rascunho", variante: "neutral" },
};

export function quando(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias < 1) return d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  if (dias < 7) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

export function duracao(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 3_600_000).toFixed(1).replace(".", ",")} h`;
}
