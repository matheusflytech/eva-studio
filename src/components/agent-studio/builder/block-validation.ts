import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { fonteDaIa } from "./fonte-da-ia";
import { fonteDoEmail } from "./fonte-do-email";
import { SAIDA_ERRO, capturaComValidacao, ehFerramenta, saidaDaLigacao, saidasDoBloco, temSaidasNomeadas } from "./saidas";

// ---------------------------------------------------------------------------
// Validação do fluxo, mostrada no canvas antes de publicar.
//
// O problema que isto resolve: dava pra salvar um bloco de CRM sem etapa
// escolhida ou um bloco de IA sem credencial, e só descobrir depois, quando a
// conversa rodava e alguém ia ler a aba Execuções. O sistema já sabia que
// estava errado e ficava calado.
//
// Regra do que entra aqui: só o que IMPEDE o bloco de funcionar. Aviso de
// gosto ("essa mensagem está longa") não entra, senão o alerta vira ruído e
// as pessoas param de olhar.
// ---------------------------------------------------------------------------

const vazio = (v: string | undefined) => !v || !v.trim();

/** Por que este bloco não vai funcionar, ou null se estiver completo. */
export function validateNode(data: FlowNodeData): string | null {
  switch (data.iconKey) {
    case "message":
      return vazio(data.detail) ? "Escreva a mensagem que o agente vai enviar." : null;

    case "capture": {
      if (vazio(data.detail)) return "Escreva a pergunta.";
      const campo = data.captureField ?? "text";
      if (campo === "custom" && vazio(data.captureCustomKey)) return "Escolha qual campo do contato a resposta preenche.";
      if (campo === "text" && vazio(data.variableName)) return "Escolha em qual variável guardar a resposta.";
      return null;
    }

    case "studio-block": {
      const textos = (data.blockContents ?? []).filter((c) => c.type === "text" && !vazio(c.text));
      if (data.waitForReply) {
        if (textos.length === 0) return "Escreva a pergunta no conteúdo.";
        const campo = data.captureField ?? "text";
        if (campo === "custom" && vazio(data.captureCustomKey)) return "Escolha qual campo do contato a resposta preenche.";
        if (campo === "text" && vazio(data.variableName)) return "Escolha em qual variável guardar a resposta.";
      }
      if ((data.exitConditions ?? []).some((c) => vazio(c.expression))) return "Escreva a condição de cada saída.";
      if ((data.blockContents ?? []).some((c) => (c.type === "link" || (c.type === "media" && !c.path)) && vazio(c.url))) {
        return "Informe o link de cada mídia e de cada link do conteúdo.";
      }
      for (const c of data.blockContents ?? []) {
        if (c.type !== "carousel") continue;
        const cards = c.cards ?? [];
        if (cards.length === 0) return "Adicione pelo menos um card ao carrossel.";
        if (cards.some((k) => vazio(k.title))) return "Dê um título a cada card do carrossel.";
        if (cards.some((k) => (k.buttons ?? []).some((x) => vazio(x.label) || vazio(x.url)))) {
          return "Preencha o texto e o link de cada botão do carrossel.";
        }
      }
      // Ação incompleta aparece aqui, no Bloco que a carrega.
      for (const a of [...(data.entryActions ?? []), ...(data.exitActions ?? [])]) {
        const problema = validateNode(a.data);
        if (problema) return `Ação "${a.data.label}": ${problema}`;
      }
      return null;
    }

    case "condition":
      return vazio(data.conditionExpression)
        ? 'Defina a condição, por exemplo {orcamento} > 5000.'
        : null;

    case "variable":
      return vazio(data.variableName) ? "Dê um nome à variável." : null;

    case "wait":
      return !data.waitDuration || data.waitDuration <= 0 ? "Informe quanto tempo esperar." : null;

    case "http":
    case "tool-http":
      return vazio(data.httpUrl) ? "Informe a URL da requisição." : null;

    case "email":
      if (fonteDoEmail(data) === "contrato") {
        // Sem "Para", vai para o e-mail do contato da conversa.
        if (vazio(data.emailModeloId) && (vazio(data.emailSubject) || vazio(data.emailBody))) {
          return "Escolha um modelo de e-mail ou escreva o assunto e o corpo.";
        }
        return null;
      }
      if (vazio(data.emailCredentialId)) return "Escolha a credencial do Resend.";
      if (vazio(data.emailTo)) return "Informe o destinatário.";
      return null;

    case "ai-agent":
      // Na conexão do contrato a chave vem da Central de IA, não do bloco.
      if (fonteDaIa(data) === "bloco" && vazio(data.aiCredentialId)) return "Escolha a credencial do provedor de IA.";
      if (data.aiSendToCustomer === false && vazio(data.aiResponseVariable)) return "Escolha a variável que guarda a resposta.";
      if ((data.aiExits ?? []).some((s) => vazio(s.name))) return "Dê um nome a cada saída: é por ele que a IA escolhe.";
      return null;

    case "tool-mcp":
      return vazio(data.mcpServerId) ? "Escolha o servidor MCP." : null;

    case "tool-crm":
      if ((data.crmToolActions ?? []).length === 0) return "Nenhuma ação liberada: a IA não poderá fazer nada.";
      return ["atualizar_campos", "registrar_lead"].some((a) => data.crmToolActions?.includes(a)) && data.crmToolFields?.length === 0
        ? "Nenhum campo marcado: a IA não terá onde salvar os dados do cliente."
        : null;

    // O motor exige etapa e etiqueta explícitas nesses dois. Nos outros
    // blocos de CRM ele tem padrão razoável (primeira etapa aberta do funil
    // padrão), então não travam.
    case "crm-stage":
      return vazio(data.crmStageId) ? "Escolha a etapa de destino." : null;

    case "crm-tag":
      return vazio(data.crmTagId) ? "Escolha a etiqueta." : null;

    case "crm-task":
      return vazio(data.crmTaskText) ? "Descreva a tarefa." : null;

    case "crm-update":
      return (data.crmFieldMap ?? []).some((m) => m.key) || data.crmAutoFill !== false
        ? null
        : "Ligue o preenchimento pelo nome da variável ou adicione um valor.";

    case "crm-note":
      return vazio(data.crmNoteText) ? "Escreva o texto da nota." : null;

    case "go-to-flow":
      return vazio(data.targetFlowId) ? "Escolha para qual fluxo a conversa vai." : null;

    case "track-event":
      return vazio(data.eventCategory) || vazio(data.eventAction) ? "Informe a categoria e a ação do evento." : null;

    default:
      return null;
  }
}

export type NivelDoProblema = "erro" | "aviso";

export interface FlowIssue {
  nodeId: string;
  label: string;
  motivo: string;
  /**
   * erro = o motor não consegue seguir (a API v1 recusa o fluxo);
   * aviso = funciona, mas provavelmente não é o que a pessoa quer.
   */
  nivel: NivelDoProblema;
}

/** O que a validação precisa saber do agente, além do desenho. */
export interface ContextoDoFluxo {
  /**
   * O agente tem URL do webhook de saída ("Ligar a um fluxo do n8n")?
   * undefined = não sei (ex.: validação no navegador sem o agente): não acusa.
   */
  temUrlDoFluxo?: boolean;
}

/**
 * Blocos em que ficar sem saída é normal: Encerrar e Falar com atendente
 * terminam a conversa; "Responder com IA" e "Enviar para meu fluxo" ficam com
 * a conversa até o fim se não houver ligação (com ligação, seguem por ela
 * quando terminam o trabalho — ver flow-engine.ts).
 */
const SAIDA_OPCIONAL = new Set(["end", "human", "agent", "ai-agent", "go-to-flow"]);

/**
 * Todos os problemas do fluxo: campo faltando em cada bloco e os problemas
 * de ligação que só existem olhando o desenho inteiro.
 */
export function validateFlow(nodes: Node<FlowNodeData>[], edges: Edge[], ctx: ContextoDoFluxo = {}): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const add = (node: Node<FlowNodeData>, motivo: string, nivel: NivelDoProblema = "erro") =>
    issues.push({ nodeId: node.id, label: node.data.label, motivo, nivel });

  for (const node of nodes) {
    const motivo = validateNode(node.data);
    if (motivo) add(node, motivo);
    if (node.data.iconKey === "agent" && ctx.temUrlDoFluxo === false) {
      add(node, "O agente não tem a URL do seu fluxo: preencha em Avançado → Ligar a um fluxo do n8n.");
    }
  }

  for (const node of nodes) {
    const kind = node.data.iconKey;

    // Ferramenta solta: é o erro mais silencioso do builder. Ela fica bonita
    // no canvas e simplesmente nunca é chamada.
    if (ehFerramenta(kind)) {
      const ligada = edges.some((e) => e.source === node.id && e.targetHandle === "tools");
      if (!ligada) add(node, "Ferramenta solta: conecte na porta de ferramentas de um bloco de IA.");
      continue;
    }

    // O texto manda usar uma ferramenta do CRM que não está ligada: a IA não
    // recebe a ferramenta e acaba escrevendo a "chamada" para o cliente.
    const citada = kind === "ai-agent" ? /\bcrm_[a-z_]+/i.exec(node.data.detail ?? "")?.[0] : undefined;
    if (citada) {
      const temCrm = edges.some(
        (e) => e.target === node.id && e.targetHandle === "tools" && nodes.find((n) => n.id === e.source)?.data.iconKey === "tool-crm"
      );
      if (!temCrm) add(node, `O texto manda usar ${citada}, mas nenhuma Ferramenta: CRM está ligada nesta IA.`);
    }

    const saidas = edges.filter((e) => e.source === node.id && e.targetHandle !== "tools");
    const nomeadas = temSaidasNomeadas(node.data);

    // Ligação presa numa saída que o bloco não tem (opção apagada, condição
    // ligada pelo meio): o motor nunca passa por ela.
    if (nomeadas && saidas.some((e) => !saidaDaLigacao(node.data, e.sourceHandle))) {
      add(node, "Há uma ligação saindo de uma saída que não existe mais neste bloco. Apague e ligue de novo.");
    }

    // Todo bloco de IA deveria ter um caminho para quando o provedor falha:
    // sem ele, a pessoa fica sem resposta e ninguém fica sabendo.
    if (kind === "ai-agent" && !saidas.some((e) => e.sourceHandle === SAIDA_ERRO)) {
      add(node, 'A saída "Erro" não está ligada: se a IA falhar, a pessoa fica sem resposta.', "aviso");
    }

    if (SAIDA_OPCIONAL.has(kind)) continue;
    if (saidasDoBloco(node.data).length === 0) continue;

    const ligada = (id: string | null) => saidas.some((e) => (e.sourceHandle ?? null) === id);

    if (kind === "condition") {
      for (const s of saidasDoBloco(node.data)) {
        if (!ligada(s.id)) add(node, `Falta ligar o caminho "${s.rotulo}": nesse caso a conversa para aqui.`);
      }
      continue;
    }

    if (saidas.length === 0) {
      add(node, "Não leva a lugar nenhum: a conversa para aqui sem encerrar.");
      continue;
    }

    if (capturaComValidacao(node.data)) {
      if (!ligada(null)) add(node, 'Falta ligar a saída "Respondeu": quem responder certo fica parado aqui.');
      continue;
    }

    if (nomeadas) {
      for (const s of saidasDoBloco(node.data)) {
        if (!ligada(s.id)) add(node, `A opção "${s.rotulo}" não está ligada: quem escolher ela fica sem resposta.`, "aviso");
      }
    }
  }

  // Bloco que ninguém alcança a partir do Início: nunca roda. Ferramentas
  // contam pelo bloco de IA a que estão ligadas.
  const inicio = nodes.find((n) => n.data.iconKey === "start");
  if (inicio) {
    const alcancados = new Set([inicio.id]);
    const fila = [inicio.id];
    while (fila.length > 0) {
      const atual = fila.shift()!;
      for (const e of edges) {
        if (e.source !== atual || e.targetHandle === "tools" || alcancados.has(e.target)) continue;
        alcancados.add(e.target);
        fila.push(e.target);
      }
    }
    for (const node of nodes) {
      if (alcancados.has(node.id) || ehFerramenta(node.data.iconKey)) continue;
      add(node, "Nenhum caminho a partir do Início chega neste bloco: ele nunca roda.", "aviso");
    }
  }

  return issues;
}
