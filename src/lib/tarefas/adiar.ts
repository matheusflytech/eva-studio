import { diaEmSP, diasEntre, noDia, proximoDiaDaSemana, somarDias } from "./calendario";

// ---------------------------------------------------------------------------
// Adiar (snooze): +1h, amanhã 9h, próxima segunda 9h ou data escolhida. Na
// tarefa de negócio, "empurrar também a previsão" move a previsão de
// fechamento pelos mesmos dias que a tarefa andou (padrão do Close).
// ---------------------------------------------------------------------------

export const OPCOES_DE_ADIAR = ["1h", "amanha", "segunda", "data"] as const;
export type OpcaoDeAdiar = (typeof OPCOES_DE_ADIAR)[number];

export const ROTULO_DE_ADIAR: Record<OpcaoDeAdiar, string> = {
  "1h": "+1 hora",
  amanha: "Amanhã 9h",
  segunda: "Próxima segunda 9h",
  data: "Escolher data",
};

export const HORA_PADRAO_DE_ADIAR = 9;

export interface Adiamento {
  dueAt: Date;
  diaTodo: boolean;
}

export function calcularAdiamento(
  opcao: OpcaoDeAdiar,
  agora: Date,
  escolhida?: { dueAt: Date; diaTodo?: boolean } | null
): Adiamento | null {
  const hoje = diaEmSP(agora);
  switch (opcao) {
    case "1h":
      return { dueAt: new Date(Math.floor((agora.getTime() + 3_600_000) / 60_000) * 60_000), diaTodo: false };
    case "amanha":
      return { dueAt: noDia(somarDias(hoje, 1), HORA_PADRAO_DE_ADIAR), diaTodo: false };
    case "segunda":
      return { dueAt: noDia(proximoDiaDaSemana(hoje, 1), HORA_PADRAO_DE_ADIAR), diaTodo: false };
    case "data":
      if (!escolhida || Number.isNaN(escolhida.dueAt.getTime())) return null;
      return { dueAt: escolhida.dueAt, diaTodo: !!escolhida.diaTodo };
  }
}

/**
 * Nova previsão de fechamento quando a tarefa anda de `antes` (ou de agora,
 * se não tinha prazo) para `depois`. Anda os mesmos dias de calendário; nunca
 * para trás; e nunca fica antes do novo prazo da tarefa. null = não mexer
 * (negócio sem previsão).
 */
export function empurrarPrevisao(previsao: Date | null, antes: Date | null, depois: Date, agora: Date): Date | null {
  if (!previsao) return null;
  // A previsão é um DIA de calendário guardado em UTC (a tela lê o
  // "AAAA-MM-DD" do ISO); a tarefa é um instante lido em SP.
  const diaDaPrevisao = { ano: previsao.getUTCFullYear(), mes: previsao.getUTCMonth() + 1, dia: previsao.getUTCDate() };
  const dias = Math.max(0, diasEntre(diaEmSP(antes ?? agora), diaEmSP(depois)));
  let alvo = somarDias(diaDaPrevisao, dias);
  // A previsão não pode ficar antes do próximo passo que acabou de ser marcado.
  const diaDoPrazo = diaEmSP(depois);
  if (diasEntre(alvo, diaDoPrazo) > 0) alvo = diaDoPrazo;
  return new Date(Date.UTC(alvo.ano, alvo.mes - 1, alvo.dia, previsao.getUTCHours(), previsao.getUTCMinutes()));
}
