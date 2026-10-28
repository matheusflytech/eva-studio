// ---------------------------------------------------------------------------
// Regras do painel único do Dashboard, usadas pela rota do layout e pela tela.
//
// O layout mora num JSON (`dashboardLayout.widgets`), então "migrar" é ler o
// formato antigo e devolver o novo: quem salvar de novo já grava no novo.
// ---------------------------------------------------------------------------

export interface WidgetSalvo {
  id: string;
  tipo: string;
  fonte: string;
  titulo: string;
  /** Colunas (1–4); a grade limita ao que cabe na tela. */
  largura: number;
  /** Linhas (1–3). Ausente = layout salvo antes do painel único. */
  altura?: number;
  /** Fundo escuro. */
  destaque?: boolean;
  consulta?: unknown;
  relatorio?: unknown;
}

/** Os blocos da antiga visão geral, na ordem e no tamanho em que nascem. */
export const CARTOES_DA_VISAO: Omit<WidgetSalvo, "id">[] = [
  { tipo: "especial", fonte: "visaoReceita", titulo: "Receita", largura: 1, altura: 1, destaque: true },
  { tipo: "especial", fonte: "visaoVendas", titulo: "Vendas", largura: 1, altura: 1 },
  { tipo: "especial", fonte: "visaoConversas", titulo: "Conversas", largura: 1, altura: 1 },
  { tipo: "especial", fonte: "visaoConversao", titulo: "Conversão", largura: 1, altura: 1 },
  { tipo: "especial", fonte: "ritmo", titulo: "Ritmo", largura: 1, altura: 2 },
  { tipo: "especial", fonte: "receitaPorMes", titulo: "Receita por mês", largura: 3, altura: 2 },
  { tipo: "especial", fonte: "mapaDeHorarios", titulo: "Mapa de horários", largura: 4, altura: 2 },
];

export const FONTES_DA_VISAO = new Set(CARTOES_DA_VISAO.map((c) => c.fonte));

/** O que vinha abaixo da visão geral no painel de quem nunca mexeu. */
const PADRAO_ANTIGO: Omit<WidgetSalvo, "id">[] = [
  { tipo: "numero", fonte: "vendas", titulo: "Vendas fechadas", largura: 1 },
  { tipo: "numero", fonte: "receita", titulo: "Receita", largura: 1 },
  { tipo: "numero", fonte: "ticket", titulo: "Ticket médio", largura: 1 },
  { tipo: "linha", fonte: "receitaPorDia", titulo: "Receita por dia", largura: 2 },
  { tipo: "barras", fonte: "porEtapa", titulo: "Onde o dinheiro está parado", largura: 1 },
  { tipo: "pizza", fonte: "porCanalVendas", titulo: "Vendas por canal", largura: 1 },
  { tipo: "tabela", fonte: "vendasRecentes", titulo: "Últimas vendas", largura: 2 },
];

/** Número ocupa uma linha; gráfico e tabela, duas; os da visão, o tamanho deles. */
export function alturaPadrao(tipo: string, fonte: string): number {
  if (tipo === "especial") return CARTOES_DA_VISAO.find((c) => c.fonte === fonte)?.altura ?? 1;
  return tipo === "numero" ? 1 : 2;
}

const daVisao = (): WidgetSalvo[] => CARTOES_DA_VISAO.map((c, i) => ({ ...c, id: `v${i + 1}` }));

export function painelPadrao(): WidgetSalvo[] {
  return [
    ...daVisao(),
    ...PADRAO_ANTIGO.map((w, i) => ({ ...w, id: `p${i + 1}`, altura: alturaPadrao(w.tipo, w.fonte) })),
  ];
}

/**
 * Layout salvo antes do painel único (algum cartão sem altura): ganha altura,
 * "cheia" em 3 colunas vira 4, e os cartões da visão geral entram no topo
 * para nada sumir da tela. O próximo salvamento grava a altura, então isto
 * acontece uma vez só.
 */
export function lerLayoutSalvo(widgets: WidgetSalvo[]): WidgetSalvo[] {
  if (!widgets.some((w) => typeof w.altura !== "number")) return widgets;
  const presentes = new Set(widgets.map((w) => w.fonte));
  const convertidos = widgets.map((w) =>
    typeof w.altura === "number" ? w : { ...w, largura: w.largura === 3 ? 4 : w.largura, altura: alturaPadrao(w.tipo, w.fonte) }
  );
  return [...daVisao().filter((w) => !presentes.has(w.fonte)), ...convertidos];
}

/**
 * Posição de cada cartão numa grade com `grid-auto-flow: dense`: cada um vai
 * para o primeiro espaço livre, de cima para baixo e da esquerda para a direita.
 */
export function encaixeDenso(itens: { largura: number; altura: number }[], colunas: number): { coluna: number; linha: number }[] {
  const ocupado: boolean[][] = [];
  const livre = (l: number, c: number, larg: number, alt: number) => {
    for (let y = l; y < l + alt; y += 1) for (let x = c; x < c + larg; x += 1) if (ocupado[y]?.[x]) return false;
    return true;
  };
  return itens.map((item) => {
    const larg = Math.min(Math.max(1, item.largura), colunas);
    const alt = Math.max(1, item.altura);
    for (let linha = 0; ; linha += 1) {
      for (let coluna = 0; coluna + larg <= colunas; coluna += 1) {
        if (!livre(linha, coluna, larg, alt)) continue;
        for (let y = linha; y < linha + alt; y += 1) {
          ocupado[y] ??= [];
          for (let x = coluna; x < coluna + larg; x += 1) ocupado[y][x] = true;
        }
        return { coluna, linha };
      }
    }
  });
}
