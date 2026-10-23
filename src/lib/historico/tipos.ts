// Histórico de alterações e auditoria: formato que o servidor grava e que a
// ficha e a auditoria leem. Fica fora de src/lib/server para a tela usar os
// mesmos tipos (spec: docs/superpowers/specs/2026-10-23-historico-e-auditoria-design.md).

export type AcaoDeRegistro = "criou" | "alterou" | "apagou" | "restaurou";

export type AcaoDaConta =
  | "membro.convidou"
  | "membro.removeu"
  | "membro.mudou_acesso"
  | "papel.criou"
  | "papel.alterou"
  | "papel.apagou"
  | "grupo.criou"
  | "grupo.alterou"
  | "grupo.apagou"
  | "equipe.criou"
  | "equipe.alterou"
  | "equipe.apagou"
  | "chave_api.criou"
  | "chave_api.revogou"
  | "exportou";

export type AcaoDoHistorico = AcaoDeRegistro | AcaoDaConta;

export type ObjetoDeRegistro = "deal" | "contact" | "company";
export type ObjetoDoHistorico = ObjetoDeRegistro | "member" | "role" | "permission_group" | "team" | "api_key" | "export";

/** { campo: { de, para } }, no formato da API v1 (custom_fields.<chave> um a um). */
export type Mudancas = Record<string, { de: unknown; para: unknown }>;

export type TipoDoAtor = "usuario" | "agente" | "automacao" | "api" | "integracao" | "sistema";

export interface LinhaDoHistorico {
  id: string;
  acao: AcaoDoHistorico;
  objeto: ObjetoDoHistorico;
  objetoId: string;
  objetoNome: string;
  mudancas: Mudancas | null;
  detalhes: Record<string, unknown>;
  atorTipo: TipoDoAtor;
  atorId: string | null;
  atorNome: string;
  /** ISO. */
  em: string;
}

/** Uma mudança pronta para ler: "Valor: R$ 5.000,00 → R$ 8.000,00". */
export interface MudancaLegivel {
  campo: string;
  rotulo: string;
  de: string;
  para: string;
}

/** Linha pronta para a ficha e a auditoria. */
export interface ItemDoHistorico extends Omit<LinhaDoHistorico, "mudancas"> {
  /** "Alterou 2 campos", "Exportou 1.240 contatos". */
  resumo: string;
  mudancas: MudancaLegivel[];
  /** O registro ainda existe (a auditoria mostra o link; senão, "apagado"). */
  existe: boolean;
}

export const ACOES_DE_REGISTRO: AcaoDeRegistro[] = ["criou", "alterou", "apagou", "restaurou"];

export const ROTULO_DO_OBJETO: Record<ObjetoDoHistorico, string> = {
  deal: "Negócio",
  contact: "Contato",
  company: "Empresa",
  member: "Membro",
  role: "Papel",
  permission_group: "Grupo de permissões",
  team: "Equipe",
  api_key: "Chave de API",
  export: "Exportação",
};

export const ROTULO_DO_ATOR: Record<TipoDoAtor, string> = {
  usuario: "Pessoa",
  agente: "Agente de IA",
  automacao: "Automação",
  api: "API",
  integracao: "Integração",
  sistema: "Sistema",
};

/** Filtro "Ação" da auditoria: o mesmo verbo para registro e para conta. */
export const ACOES_DO_FILTRO: Record<"criou" | "alterou" | "apagou" | "restaurou" | "exportou", AcaoDoHistorico[]> = {
  criou: ["criou", "papel.criou", "grupo.criou", "equipe.criou", "chave_api.criou", "membro.convidou"],
  alterou: ["alterou", "papel.alterou", "grupo.alterou", "equipe.alterou", "membro.mudou_acesso"],
  apagou: ["apagou", "papel.apagou", "grupo.apagou", "equipe.apagou", "chave_api.revogou", "membro.removeu"],
  restaurou: ["restaurou"],
  exportou: ["exportou"],
};

/** Filtro "Tipo" da auditoria. */
export const OBJETOS_DO_FILTRO: Record<"deal" | "contact" | "company" | "acesso" | "api_key" | "export", ObjetoDoHistorico[]> = {
  deal: ["deal"],
  contact: ["contact"],
  company: ["company"],
  acesso: ["member", "role", "permission_group", "team"],
  api_key: ["api_key"],
  export: ["export"],
};
