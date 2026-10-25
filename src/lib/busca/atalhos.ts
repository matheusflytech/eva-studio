// ---------------------------------------------------------------------------
// Atalhos de teclado globais. Função pura (estado + tecla → ação); quem escuta
// o teclado é src/components/busca/paleta-de-busca.tsx.
//
// PRIORIDADE (da mais forte para a mais fraca):
//   1. Ctrl+K / ⌘K: sempre abre/fecha a paleta, até digitando num campo.
//   2. Digitando (input, textarea, select, contentEditable) ou com diálogo
//      modal aberto: nenhuma letra solta vale; o teclado é do campo/diálogo.
//   3. G pendente (até 1,5 s depois do G): a próxima tecla D/N/C/E/T navega e
//      é CONSUMIDA (o ouvinte global roda na captura e para a propagação), então
//      "G depois N" nunca abre o "novo negócio" nem "G depois T" foca o quick add.
//      Outra tecla cancela o G e segue para a tela.
//   4. Atalhos da tela, como antes: N (novo negócio) e / (busca da lista) em
//      Negócios; T (quick add) em Tarefas.
//   5. ? abre a folha de atalhos (Shift+/; o "/" sozinho continua da tela).
// ---------------------------------------------------------------------------

export const ESPERA_DO_G = 1500;

export const IR_PARA_COM_G: Record<string, { caminho: string; rotulo: string }> = {
  d: { caminho: "/dashboard", rotulo: "Dashboard" },
  n: { caminho: "/deals", rotulo: "Negócios" },
  c: { caminho: "/contacts", rotulo: "Contatos" },
  e: { caminho: "/companies", rotulo: "Empresas" },
  t: { caminho: "/tasks", rotulo: "Tarefas" },
};

export interface Tecla {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  repeat: boolean;
  /** O foco está num campo de texto. */
  emCampo: boolean;
  /** Há um diálogo modal aberto (o teclado é dele). */
  dialogoAberto: boolean;
}

export interface EstadoDosAtalhos {
  /** Quando o G foi apertado (null = nenhum G pendente). */
  gDesde: number | null;
}

export type AcaoDoAtalho = { tipo: "paleta" } | { tipo: "folha" } | { tipo: "ir"; caminho: string };

export interface Interpretacao {
  estado: EstadoDosAtalhos;
  acao: AcaoDoAtalho | null;
  /** preventDefault + parar a propagação (a tela não vê a tecla). */
  consumir: boolean;
}

export function interpretarTecla(estado: EstadoDosAtalhos, t: Tecla, agora: number): Interpretacao {
  const k = t.key.toLowerCase();
  const nada = (consumir = false): Interpretacao => ({ estado: { gDesde: null }, acao: null, consumir });

  if ((t.ctrl || t.meta) && !t.alt && k === "k") return { estado: { gDesde: null }, acao: { tipo: "paleta" }, consumir: true };
  if (t.ctrl || t.meta || t.alt || t.emCampo || t.dialogoAberto || t.repeat) return nada();

  const gPendente = estado.gDesde !== null && agora - estado.gDesde <= ESPERA_DO_G;
  if (gPendente) {
    const destino = IR_PARA_COM_G[k];
    if (destino) return { estado: { gDesde: null }, acao: { tipo: "ir", caminho: destino.caminho }, consumir: true };
    if (k === "g") return { estado: { gDesde: agora }, acao: null, consumir: true };
    return nada();
  }
  if (k === "g") return { estado: { gDesde: agora }, acao: null, consumir: true };
  if (t.key === "?") return { estado: { gDesde: null }, acao: { tipo: "folha" }, consumir: true };
  return nada();
}

// ── Folha de atalhos ─────────────────────────────────────────────────────────

export interface AtalhoDescrito {
  /** "mod" = ⌘ no Mac, Ctrl no resto. Duas teclas sem "mod" = sequência (G depois N). */
  teclas: string[];
  descricao: string;
  /** Onde vale (só para os da tela). */
  onde?: string;
}

export const ATALHOS_GLOBAIS: AtalhoDescrito[] = [
  { teclas: ["mod", "K"], descricao: "Buscar e executar ações" },
  ...Object.entries(IR_PARA_COM_G).map(([k, d]) => ({ teclas: ["G", k.toUpperCase()], descricao: `Ir para ${d.rotulo}` })),
  { teclas: ["?"], descricao: "Mostrar os atalhos" },
];

/** Os que já existiam nas telas (continuam valendo; ver prioridade acima). */
export const ATALHOS_DAS_TELAS: AtalhoDescrito[] = [
  { teclas: ["N"], descricao: "Novo negócio", onde: "Negócios" },
  { teclas: ["/"], descricao: "Buscar na lista", onde: "Negócios" },
  { teclas: ["T"], descricao: "Nova tarefa (quick add)", onde: "Tarefas" },
];

export const ATALHOS_DA_PALETA: AtalhoDescrito[] = [
  { teclas: ["↑", "↓"], descricao: "Escolher" },
  { teclas: ["Enter"], descricao: "Abrir / executar" },
  { teclas: ["Esc"], descricao: "Voltar / fechar" },
];

export function ehMac(plataforma: string | null | undefined): boolean {
  return /mac|iphone|ipad|ipod/i.test(plataforma ?? "");
}

export function rotuloDoAtalho(teclas: string[], mac: boolean): string {
  if (teclas[0] === "mod") {
    const resto = teclas.slice(1);
    return mac ? `⌘${resto.join("")}` : ["Ctrl", ...resto].join("+");
  }
  if (teclas.length === 2 && /^[A-Z]$/.test(teclas[0]) && /^[A-Z]$/.test(teclas[1])) return `${teclas[0]} depois ${teclas[1]}`;
  return teclas.join(" ");
}
