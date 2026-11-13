// Qualidade de um chip nos disparos dos últimos 7 dias. Não é a nota do WhatsApp
// (o QR não tem nota oficial): é o que dá para medir dos nossos envios.
//   falha alta  = número caindo, sendo bloqueado ou lista ruim
//   entrega baixa = mensagens saindo mas não chegando (sinal de restrição)

export type NivelDeQualidade = "boa" | "atencao" | "ruim" | "sem_dados";

export const ROTULO_DA_QUALIDADE: Record<NivelDeQualidade, string> = {
  boa: "Boa",
  atencao: "Atenção",
  ruim: "Ruim",
  sem_dados: "Sem dados",
};

/** Abaixo disso a conta não diz nada: poucos envios. */
export const MINIMO_PARA_AVALIAR = 20;

export interface Envios {
  enviados: number;
  entregues: number;
  falhas: number;
}

export function qualidadeDoChip({ enviados, entregues, falhas }: Envios): {
  nivel: NivelDeQualidade;
  taxaDeEntrega: number | null;
  taxaDeFalha: number | null;
} {
  const tentados = enviados + falhas;
  if (tentados < MINIMO_PARA_AVALIAR) return { nivel: "sem_dados", taxaDeEntrega: null, taxaDeFalha: null };
  const taxaDeFalha = falhas / tentados;
  const taxaDeEntrega = enviados > 0 ? entregues / enviados : 0;
  const nivel: NivelDeQualidade = taxaDeFalha > 0.15 || taxaDeEntrega < 0.6 ? "ruim" : taxaDeFalha > 0.05 || taxaDeEntrega < 0.85 ? "atencao" : "boa";
  return { nivel, taxaDeEntrega, taxaDeFalha };
}
