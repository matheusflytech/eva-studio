import type { LucideIcon } from "lucide-react";
import {
  Compass, LayoutGrid, Blocks, Radio, ArrowDownToLine, ArrowUpFromLine,
  Code2, Repeat, Database, ShieldAlert, ShieldCheck, MessagesSquare, SlidersHorizontal, Sparkles,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Conteúdo do Eva Help.
//
// Regra que vale pra tudo aqui: só entra o que o app faz de verdade. Um help
// center que promete recurso inexistente custa mais caro que nenhum help
// center — a pessoa tenta, não acha, e passa a duvidar do resto da página.
//
// Onde existe uma lista canônica no código (blocos do builder, fontes do
// dashboard), esta tela LÊ essa lista em vez de copiar. Documentação que
// repete a fonte de verdade envelhece em silêncio.
// ---------------------------------------------------------------------------

export interface Item {
  titulo: string;
  /** Uma linha, em português de quem não programa. */
  resumo: string;
  /** Onde fica, ou como se chama. Vira link quando `href` existe. */
  onde?: string;
  href?: string;
  /** Detalhe que evita uma pergunta de suporte. */
  nota?: string;
  /** Verbos e caminho, para as seções de API. */
  metodo?: string;
  caminho?: string;
}

export interface Secao {
  id: string;
  titulo: string;
  icone: LucideIcon;
  /** O que a pessoa vai encontrar aqui, antes de ler a lista. */
  intro: string;
  itens: Item[];
  /** Renderizado por um componente próprio em vez da lista padrão. */
  especial?: "blocos" | "fontes";
}

export const SECOES: Secao[] = [
  {
    id: "visao",
    titulo: "O que é o Eva Studio",
    icone: Compass,
    intro:
      "Um lugar para montar agentes que conversam pelos canais onde seu cliente já está, e um CRM que se preenche enquanto a conversa acontece. As três partes são: o agente (quem fala), o CRM (o que sobra da conversa) e as automações (o que acontece sozinho depois).",
    itens: [
      {
        titulo: "Agente",
        resumo: "Um atendente automático com fluxo próprio, base de conhecimento e canais conectados.",
        onde: "Eva Studio",
        href: "/agent-studio",
        nota: "Você pode ter vários. Cada um tem o próprio fluxo, os próprios canais e os próprios números.",
      },
      {
        titulo: "Fluxo",
        resumo: "O caminho da conversa, montado em blocos: o que perguntar, o que decidir, o que registrar.",
        onde: "Builder de conversa",
        nota: "Tem duas visões do mesmo fluxo — o canvas, para ver tudo, e o Modo Conversa, para ver como o cliente vive.",
      },
      {
        titulo: "CRM",
        resumo: "Contatos, empresas, negócios e tarefas. O agente escreve aqui enquanto conversa, e você define o que cada negócio guarda.",
        onde: "Contatos, Negócios, Tarefas",
        href: "/negocios",
        nota: "Funis, etapas e campos são seus: um negócio de energia solar guarda consumo e tipo de imóvel, uma clínica guarda procedimento e data da avaliação.",
      },
      {
        titulo: "Atendimento pelo app",
        resumo: "Conversas de WhatsApp, Instagram, Messenger e Telegram chegam numa caixa de entrada onde a equipe responde, sem sair do app.",
        onde: "Conversas",
        href: "/conversas",
      },
      {
        titulo: "Automações",
        resumo: "Sequências de follow-up, disparos agendados e respostas a comentário no Instagram.",
        onde: "Sequências, Disparos",
        href: "/sequencias",
      },
    ],
  },

  {
    id: "telas",
    titulo: "As telas, uma a uma",
    icone: LayoutGrid,
    intro:
      "O que dá para fazer em cada lugar do menu. O menu mostra só o do dia a dia (Início, Conversas, Negócios, Contatos, Tarefas, Dashboard e Agentes de IA). O resto fica em “Mais ferramentas”, no fim do menu, e abre sozinho quando você entra numa dessas páginas.",
    itens: [
      {
        titulo: "Início",
        resumo: "Responde uma pergunta só: o que precisa de você agora.",
        href: "/inicio",
        nota: "Lista gente esperando atendimento, tarefa atrasada ou vencendo hoje, negócio parado há mais de 7 dias na mesma etapa, bloco incompleto travando agente e relógio parado. Sem nada pendente, ela diz “tudo em dia” em vez de encher de cartão.",
      },
      {
        titulo: "Dashboard",
        resumo: "Painel de números que você mesmo monta: escolhe o cartão, a fonte e o nome.",
        href: "/dashboard",
        nota: "Em “Editar painel” dá pra adicionar, renomear, redimensionar (1/3, 2/3 ou cheia) e reordenar. Cinco formatos: número, linha, pizza, barras e tabela. Salva sozinho, e o painel é um por organização, não por pessoa. Em “Adicionar painel” há também “Montar do meu jeito”: você escolhe o que medir (quantidade, soma ou média de um valor ou de um campo seu), como separar (etapa, responsável, mês, dia ou um campo seu), quais negócios entram (andamento, ganhos, perdidos, funil, período e filtros) e vê a prévia calculada na hora.",
      },
      { titulo: "Insights", resumo: "Quanto o agente resolve sozinho, onde a conversa para, horário de pico e o que mais falam.", href: "/insights", nota: "“Onde a conversa para” mostra o último bloco de cada execução — é o painel que aponta a pergunta específica que faz gente desistir." },
      {
        titulo: "Agentes de IA",
        resumo: "Lista dos agentes, com o próximo passo de cada um e sete dias de conversa em barras.",
        href: "/agent-studio",
        nota: "Ao abrir um agente, a primeira aba (Resumo) responde se ele está funcionando: lista o que falta (fluxo, instruções, canal, teste) e mostra conversas, fila e erros. As outras abas são Comportamento (quem ele é, o que deve fazer, base de conhecimento), Canais (onde atende) e Avançado (n8n, variáveis, exclusão).",
      },
      {
        titulo: "Assistente de configuração",
        resumo: "Escolha o seu tipo de negócio e o app monta funil, campos e um atendimento de WhatsApp que já preenche o CRM.",
        href: "/comecar",
        nota: "Pacotes: energia solar, imobiliária, clínica e estética, loja e e-commerce, serviços e consultoria, escola e cursos, ou começar do zero. Não precisa de chave de IA: o atendimento do pacote é um fluxo de perguntas fixas. Aparece no Início enquanto a conta está vazia, e dá para refazer a qualquer hora.",
      },
      { titulo: "Builder de conversa", resumo: "Monta o fluxo em blocos. Tem Editor (canvas), Modo Conversa e Execuções.", nota: "O bloco novo já nasce conectado no bloco selecionado. A paleta diz onde ele vai cair antes de você clicar." },
      {
        titulo: "Aprovações",
        resumo: "O status real dos seus templates na Meta, lido ao vivo da conta de negócio.",
        href: "/aprovacoes",
        nota: "Mostra primeiro o que está quebrado: modelo configurado no Builder apontando para um template que a Meta rejeitou, pausou ou que nem existe mais. Fora da janela de 24h esses disparos não saem, e sem esta tela ninguém fica sabendo.",
      },
      { titulo: "Disparos", resumo: "Envio em massa para uma lista, agora ou agendado.", href: "/disparos" },
      { titulo: "Sequências", resumo: "Régua de follow-up: uma fila de mensagens com espera entre elas.", href: "/sequencias", nota: "Entra por etiqueta, por segmento, por etapa do funil (inclusive “parado há N dias”) ou só manualmente." },
      { titulo: "Biblioteca", resumo: "Fluxos prontos para aplicar num agente sem montar do zero.", href: "/biblioteca" },
      { titulo: "Integrações", resumo: "Credenciais de IA e e-mail, servidores MCP e chaves de API. Canal se conecta na aba do agente, não aqui.", href: "/integracoes" },
      { titulo: "Contatos", resumo: "Ficha das pessoas: dados, etiquetas, os campos que você criou, o que o fluxo capturou e a aba Atividade com todo o histórico.", href: "/contatos", nota: "Também tem etiquetas e segmentos, que são as listas que alimentam disparo e sequência. Os campos do contato são criados em Negócios > Personalizar." },
      { titulo: "Empresas", resumo: "A conta por trás das pessoas: quanto está aberto, quanto já foi ganho e quem trabalha lá.", href: "/empresas" },
      {
        titulo: "Negócios",
        resumo: "Funil em kanban. Arraste para mover de etapa, clique para abrir o painel completo.",
        href: "/negocios",
        nota: "O botão “Personalizar” leva às telas de funis, etapas e campos. Os cartões mostram as etapas na cor que você escolheu e, como etiqueta, os campos marcados “no cartão”. O painel do negócio tem a seção “Dados do negócio” com os seus campos.",
      },
      { titulo: "Tarefas", resumo: "O que você e o time precisam fazer, com prazo.", href: "/tarefas" },
      { titulo: "Leads", resumo: "Quem chegou pelo widget do site, com os campos que o fluxo capturou.", href: "/leads" },
      { titulo: "Conversas", resumo: "Caixa de entrada da equipe: lista, conversa aberta e painel do cliente lado a lado. Assume, responde e devolve para o agente.", href: "/conversas", nota: "Veja a seção “Atendimento pelo app” para tudo que dá para fazer aqui." },
      { titulo: "Playground", resumo: "Testa o agente sem envolver ninguém de verdade.", href: "/playground", nota: "Conversa de Playground não conta nos Insights: seria você medindo você mesmo." },
    ],
  },

  {
    id: "atendimento",
    titulo: "Atendimento pelo app",
    icone: MessagesSquare,
    intro:
      "A caixa de entrada onde a equipe conversa com os clientes, incluindo o WhatsApp. O agente atende primeiro; quando uma pessoa assume, o agente para de responder naquela conversa e tudo que o cliente escreve continua sendo registrado.",
    itens: [
      {
        titulo: "Filtros e busca",
        resumo: "Abas Todas, Esperando, Minhas, Com o agente e Encerradas, cada uma com o número de conversas. Busca por nome, telefone ou texto, e filtro por canal.",
        href: "/conversas",
        nota: "As conversas de teste (Playground e preview do Builder) ficam escondidas; “Mostrar testes” traz de volta. O aviso sonoro e o contador no título da aba avisam de mensagem nova.",
      },
      {
        titulo: "Assumir, devolver e resolver",
        resumo: "“Assumir” coloca a conversa no seu nome e pausa o agente. “Devolver ao agente” retoma o fluxo. “Resolver” encerra. Dá para transferir para outra pessoa da equipe.",
        nota: "Se outra pessoa já está com a conversa, o app avisa e só deixa assumir com confirmação, para duas pessoas não responderem o mesmo cliente.",
      },
      {
        titulo: "Responder e anexar",
        resumo: "Escreva e envie com Enter no computador (no celular, Enter pula linha). Anexe imagem, áudio, vídeo ou documento de até 16 MB.",
        nota: "O envio mostra o estado de cada mensagem: enviando, enviada, entregue, lida ou falhou. Quando falha, o motivo vem em português (por exemplo, janela de 24 horas fechada) e há o botão de tentar de novo. Entregue e lida dependem da Meta devolver o recibo; no WhatsApp por QR aparece só enviada.",
      },
      {
        titulo: "Janela de 24 horas",
        resumo: "No WhatsApp oficial, Instagram e Messenger, depois de 24 horas da última mensagem do cliente só sai modelo aprovado. O campo de resposta avisa e oferece escolher um modelo.",
        href: "/aprovacoes",
      },
      {
        titulo: "Nota interna",
        resumo: "Aba “Nota interna” no campo de resposta. Fica visível só para a equipe e nunca chega ao cliente nem ao agente de IA.",
      },
      {
        titulo: "Mídia que o cliente envia",
        resumo: "Fotos, áudios, vídeos, documentos, figurinhas, localização e contatos aparecem na conversa. Ficam guardados com acesso restrito à sua organização.",
        nota: "WhatsApp por QR: a mídia depende do worker estar atualizado e conectado. Não foi possível testar sem um número real conectado.",
      },
      {
        titulo: "Painel do cliente",
        resumo: "À direita da conversa: editar o nome, etiquetas, os negócios do contato (mudar de etapa, criar novo), tarefas e os campos capturados. Um clique abre o contato completo.",
      },
      {
        titulo: "No celular",
        resumo: "Abaixo de 1024 pixels o menu vira uma gaveta, e a Conversas mostra a lista, depois a conversa, com botão de voltar.",
      },
    ],
  },

  {
    id: "personalizar",
    titulo: "Personalizar o CRM",
    icone: SlidersHorizontal,
    intro:
      "Cada negócio funciona de um jeito. Em Negócios > Personalizar você monta os funis, as etapas e os campos do seu. Mexer aqui nunca apaga negócio sem você dizer para onde ele vai.",
    itens: [
      {
        titulo: "Funis",
        resumo: "Crie quantos funis precisar (até 15), renomeie, escolha o padrão e exclua. Ao excluir um funil com negócios, você escolhe para qual funil eles vão: cada um cai na etapa de mesmo nome ou na equivalente.",
        href: "/negocios/configurar",
        onde: "Negócios > Personalizar > Funis e etapas",
      },
      {
        titulo: "Etapas",
        resumo: "Arraste para reordenar, escolha a cor, o tipo (aberta, ganho ou perdido) e a chance de fechar. Até 20 por funil.",
        nota: "O tipo diz ao sistema o que a etapa significa: ganho e perdido encerram o negócio e entram nas contas de conversão. Mudar o tipo ajusta os negócios que já estão na etapa (data de fechamento). Mudar a chance atualiza os negócios que ainda usavam a antiga. Excluir uma etapa com negócios pede a etapa de destino.",
      },
      {
        titulo: "Campos do negócio e do contato",
        resumo: "Crie campos de texto, número, valor em reais, data, lista (uma ou várias opções), sim ou não, link, telefone e e-mail. Marque obrigatório, texto de ajuda, “mostrar no cartão” e se vale em todos os funis ou só em um.",
        nota: "O nome pode mudar à vontade sem perder dados. O tipo não muda depois de criado, para não ficar valor antigo no formato errado. Apagar um campo pode apagar também os valores já preenchidos, se você marcar. Até 40 por tipo de registro.",
      },
      {
        titulo: "Onde os campos aparecem",
        resumo: "No painel do negócio (“Dados do negócio”), no formulário de novo negócio, como etiqueta no cartão do funil, na ficha do contato e como fonte para cartões do Dashboard.",
        nota: "Obrigatório vale para quem preenche à mão. Negócio antigo não fica travado por um campo que passou a ser obrigatório depois, e o agente de IA nunca é bloqueado por isso.",
      },
      {
        titulo: "O agente preenchendo os campos",
        resumo: "Três jeitos: o bloco “Criar negócio” e o bloco “Atualizar dados” gravam as respostas do cliente; a ferramenta de CRM da IA tem a ação “Salvar dados do cliente”.",
        nota: "O jeito mais simples: dê à pergunta (variável) o mesmo nome do campo; o bloco lista os nomes dos seus campos. Com “Preencher pelo nome da variável” ligado, a resposta vai direto para o campo. O mapa do bloco serve para valor fixo ou variável de nome diferente. Resposta que não combina com o tipo (texto num campo de número) é descartada e aparece na aba Execuções. Em lista, vale o nome da opção, sem se importar com acento ou maiúscula.",
      },
    ],
  },

  {
    id: "pacotes",
    titulo: "Pacotes por tipo de negócio",
    icone: Sparkles,
    intro:
      "Um atalho para não começar de uma tela vazia. Cada pacote cria um funil, os campos que fazem sentido para o negócio e um agente de atendimento pronto.",
    itens: [
      {
        titulo: "O que o pacote cria",
        resumo: "Funil com etapas e chances, campos de negócio e de contato e um agente cujo fluxo pergunta o nome e os dados do nicho, abre o negócio já preenchido e chama uma pessoa da equipe.",
        href: "/comecar",
        nota: "Se a conta só tem o funil vazio que o sistema cria sozinho, o do pacote toma o lugar dele. Se já há negócios, o funil novo entra ao lado, sem mexer no que existe.",
      },
      {
        titulo: "Depois de criar",
        resumo: "Falta conectar o WhatsApp (aba Canais do agente). Dá para ajustar as perguntas no Builder e trocar o atendimento por um agente de IA quando quiser.",
        nota: "O pacote não precisa de chave de IA. A conversa só vai para o WhatsApp de verdade depois que o canal estiver conectado.",
      },
    ],
  },

  {
    id: "blocos",
    titulo: "Os blocos do builder",
    icone: Blocks,
    intro:
      "As peças com que o fluxo é montado. Blocos de ferramenta (recuados) não funcionam sozinhos: eles se penduram na porta roxa de um bloco de IA e dão poderes a ele.",
    itens: [],
    especial: "blocos",
  },

  {
    id: "canais",
    titulo: "Canais",
    icone: Radio,
    intro:
      "Por onde o agente fala. Cada canal se conecta na aba do agente, e o mesmo fluxo atende todos eles.",
    itens: [
      { titulo: "WhatsApp via QR code", resumo: "Conecta lendo um QR, como no WhatsApp Web.", nota: "Rápido para validar, mas não é o caminho oficial da Meta. Depende do worker estar no ar." },
      { titulo: "WhatsApp oficial (Cloud API)", resumo: "Canal oficial da Meta, recomendado para volume e cliente de verdade.", nota: "Fora da janela de 24 horas, só sai mensagem com modelo aprovado. O bloco de mensagem deixa você escolher qual." },
      { titulo: "Instagram Direct", resumo: "Mensagens diretas, pela conta Business ou Creator.", nota: "Precisa de um app da Meta configurado na instalação. Sem ele, o botão de conectar não aparece." },
      { titulo: "Messenger", resumo: "Mensagens da sua Página do Facebook, pelo mesmo webhook do WhatsApp e do Instagram." },
      { titulo: "Telegram", resumo: "Bot do Telegram, conectado com o token do BotFather." },
      { titulo: "TikTok", resumo: "Mensagens da conta business do TikTok." },
      { titulo: "Widget do site", resumo: "Uma caixinha de chat no seu site, com um script para colar.", onde: "Aba do agente → Widget", nota: "Quem chega por aqui aparece na tela de Leads." },
    ],
  },

  {
    id: "entrada",
    titulo: "Trazer dados para dentro",
    icone: ArrowDownToLine,
    intro:
      "Todos os caminhos pelos quais informação entra no Eva Studio — de uma mensagem de cliente a uma planilha de contatos.",
    itens: [
      {
        titulo: "Mensagem de um canal",
        resumo: "Cliente escreve no WhatsApp, Instagram, Messenger, Telegram ou TikTok e o fluxo roda.",
        metodo: "POST",
        caminho: "/api/webhooks/meta · /api/webhooks/telegram/{agentId} · /api/webhooks/tiktok/{agentId}",
        nota: "Configurado uma vez por canal. Você não chama isso à mão — a plataforma chama.",
      },
      {
        titulo: "Widget do site",
        resumo: "Visitante conversa pela caixinha no seu site.",
        metodo: "POST",
        caminho: "/api/widget/{agentId}/message",
      },
      {
        titulo: "Importar contatos por CSV",
        resumo: "Sobe uma planilha e vira ficha de contato.",
        onde: "Contatos → Importar CSV",
        href: "/contatos",
        metodo: "POST",
        caminho: "/api/contacts/import",
      },
      {
        titulo: "Criar lead pela API",
        resumo: "Seu site ou landing page cria o lead direto, sem passar por conversa.",
        metodo: "POST",
        caminho: "/api/v1/leads",
        nota: "Este é o endpoint público, com chave de API. Os outros da lista são internos da sessão.",
      },
      {
        titulo: "Criar contato, negócio, tarefa ou nota",
        resumo: "O que as telas de CRM fazem, um endpoint faz igual.",
        metodo: "POST",
        caminho: "/api/contacts · /api/deals · /api/tasks · /api/notes · /api/companies",
        nota: "Autenticados pela sessão do navegador, não por chave de API — servem para integração dentro do próprio app.",
      },
      {
        titulo: "O próprio agente escrevendo",
        resumo: "Blocos de CRM e a ferramenta de CRM da IA criam negócio, preenchem campos, movem etapa, etiquetam e registram nota durante a conversa.",
        nota: "É o caminho mais usado, e o que faz o CRM se preencher sozinho.",
      },
    ],
  },

  {
    id: "saida",
    titulo: "Levar dados para fora",
    icone: ArrowUpFromLine,
    intro:
      "Como tirar informação do Eva Studio, ou fazer ele falar com um sistema seu no meio da conversa.",
    itens: [
      {
        titulo: "Ler leads pela API",
        resumo: "Puxa os leads e o que foi capturado em cada um.",
        metodo: "GET",
        caminho: "/api/v1/leads",
        nota: "Aceita filtro por etapa e limite. É o endpoint público, com chave de API.",
      },
      {
        titulo: "Atualizar ou apagar um lead",
        resumo: "Muda a etapa do lead ou remove.",
        metodo: "PATCH · DELETE",
        caminho: "/api/v1/leads/{id}",
      },
      {
        titulo: "Bloco Requisição HTTP",
        resumo: "No meio do fluxo, chama uma URL sua e guarda a resposta numa variável.",
        nota: "Método, cabeçalhos, query e corpo configuráveis. Aceita {variavel} em qualquer campo.",
      },
      {
        titulo: "Ferramenta HTTP da IA",
        resumo: "Mesma coisa, mas quem decide a hora de chamar e o que mandar é o modelo.",
        nota: "Qualquer {parametro} que você deixar na URL ou no corpo vira um campo que a IA preenche.",
      },
      {
        titulo: "Bloco Enviar e-mail",
        resumo: "Dispara um e-mail no meio do fluxo, via credencial Resend.",
      },
      {
        titulo: "Servidor MCP",
        resumo: "Liga a IA às ferramentas de um servidor MCP seu.",
        onde: "Integrações → Servidores MCP",
        href: "/integracoes",
      },
      {
        titulo: "Delegar para o seu n8n",
        resumo: "O bloco “Enviar para meu fluxo” manda a conversa para um webhook seu e usa a resposta.",
        nota: "Para quem já tem automação montada fora e não quer refazer aqui.",
      },
    ],
  },

  {
    id: "api",
    titulo: "API pública",
    icone: Code2,
    intro:
      "Uma chave por organização, criada em Integrações → API. Autenticação por cabeçalho Authorization, no padrão Bearer. O limite é de 120 requisições por minuto por chave; acima disso a resposta é 429.",
    itens: [
      {
        titulo: "Autenticação",
        resumo: "Authorization: Bearer evs_live_...",
        nota: "A chave aparece inteira uma única vez, na criação — o banco guarda só o hash. Se perder, gere outra.",
        onde: "Integrações → API",
        href: "/integracoes/api",
      },
      { titulo: "Listar leads", resumo: "Todos os leads da organização, com filtro por etapa.", metodo: "GET", caminho: "/api/v1/leads" },
      { titulo: "Criar lead", resumo: "Cria um lead com os campos que você mandar.", metodo: "POST", caminho: "/api/v1/leads" },
      { titulo: "Ver um lead", resumo: "Um lead específico, com tudo que foi capturado.", metodo: "GET", caminho: "/api/v1/leads/{id}" },
      { titulo: "Mudar a etapa", resumo: "Move o lead entre novo, contatado, qualificado, ganho e perdido.", metodo: "PATCH", caminho: "/api/v1/leads/{id}" },
      { titulo: "Apagar um lead", resumo: "Remove o lead.", metodo: "DELETE", caminho: "/api/v1/leads/{id}" },
      {
        titulo: "Documentação com exemplos",
        resumo: "Corpo de cada requisição, campos e respostas, com exemplos prontos para copiar.",
        href: "/integracoes/api",
        onde: "Integrações → API",
      },
    ],
  },

  {
    id: "automacao",
    titulo: "O que acontece sozinho",
    icone: Repeat,
    intro:
      "Automações que rodam sem ninguém clicar. Todas dependem do relógio do produto, que bate de minuto em minuto.",
    itens: [
      {
        titulo: "Sequências",
        resumo: "Fila de mensagens com espera entre elas. O contato entra sozinho e sai sozinho ao responder.",
        href: "/sequencias",
        nota: "Gatilhos: recebeu uma etiqueta, entrou num segmento, o negócio entrou numa etapa (ou está parado nela há N dias), ou inscrição manual.",
      },
      {
        titulo: "Disparos agendados",
        resumo: "Envio em massa marcado para uma data e hora.",
        href: "/disparos",
        nota: "No WhatsApp oficial, fora da janela de 24h só sai com modelo aprovado.",
      },
      {
        titulo: "Automações de comentário",
        resumo: "Responde comentário no Instagram e puxa a pessoa para o direct.",
        onde: "Aba do agente",
      },
      {
        titulo: "Etiqueta que dispara régua",
        resumo: "Aplicar uma etiqueta — na mão ou por um bloco do fluxo — pode inscrever o contato numa sequência.",
      },
      {
        titulo: "Transferência para humano",
        resumo: "O bloco “Falar com atendente” para o agente e coloca a conversa na fila de Conversas.",
        href: "/conversas",
      },
    ],
  },

  {
    id: "templates",
    titulo: "Templates do WhatsApp oficial",
    icone: ShieldCheck,
    intro:
      "A regra que mais confunde: dentro de 24 horas da última mensagem da pessoa, o agente manda o texto que quiser. Passou disso, a Meta só entrega por template aprovado por ela. Vale para WhatsApp oficial e Instagram.",
    itens: [
      {
        titulo: "Criar um template",
        resumo: "Templates nascem no Gerenciador da Meta, não aqui.",
        nota: "O Eva Studio lê o que a Meta decidiu; criar e editar continua sendo lá, porque quem aprova é ela.",
      },
      {
        titulo: "Apontar um modelo para o template",
        resumo: "No Builder, o bloco de mensagem deixa escolher qual template usar fora da janela.",
        onde: "Aba do agente → Modelos de mensagem",
      },
      {
        titulo: "Ver o que foi aprovado",
        resumo: "A tela de Aprovações lista tudo da sua conta de negócio, com status, categoria e motivo da recusa.",
        href: "/aprovacoes",
        onde: "Aprovações",
      },
      {
        titulo: "Descobrir o que vai falhar antes de falhar",
        resumo: "Aprovações cruza os dois lados e avisa quando um modelo daqui aponta para um template que não entrega.",
        href: "/aprovacoes",
        nota: "Esse é o caso que quebra campanha em silêncio: o disparo sai, a Meta recusa e ninguém percebe.",
      },
      {
        titulo: "Modelo sem template",
        resumo: "Funciona dentro das 24h, como texto livre. Fora delas, não sai.",
      },
    ],
  },

  {
    id: "dashboard",
    titulo: "Números disponíveis no Dashboard",
    icone: Database,
    intro:
      "Tudo que pode virar cartão no seu painel. Todos saem de tabela — nada é estimativa.",
    itens: [],
    especial: "fontes",
  },

  {
    id: "limites",
    titulo: "O que o Eva Studio não faz",
    icone: ShieldAlert,
    intro:
      "A parte que costuma faltar num help center, e a que mais economiza tempo: o que não adianta procurar.",
    itens: [
      {
        titulo: "Não classifica tema nem sentimento das conversas",
        resumo: "Os Insights mostram as palavras mais repetidas, que é contagem — não interpretação.",
        nota: "Classificar exigiria um modelo lendo todas as conversas. Enquanto isso não existir como recurso, a tela não finge que existe.",
      },
      {
        titulo: "Não manda mensagem fora da janela de 24h sem modelo",
        resumo: "É regra da Meta, não limitação do app.",
        nota: "Vale para WhatsApp oficial e Instagram. Cadastre modelos aprovados na aba do agente.",
      },
      {
        titulo: "Template não se cria por aqui",
        resumo: "O Eva Studio lê o status na Meta, mas criar e editar template é no Gerenciador dela.",
        nota: "Quem aprova é a Meta; duplicar o formulário aqui só criaria duas verdades.",
      },
      {
        titulo: "A API pública cobre leads, não o CRM inteiro",
        resumo: "Contatos, negócios e tarefas têm endpoint, mas autenticado por sessão, não por chave.",
        nota: "Para integração externa hoje o caminho é /api/v1/leads ou um bloco HTTP dentro do fluxo.",
      },
      {
        titulo: "Cartão personalizado do Dashboard lê até 5 mil negócios",
        resumo: "É um painel de acompanhamento, não um relatório de milhões de linhas. Passando disso, o cartão considera os 5 mil mais recentes.",
        nota: "Para um recorte menor, use filtros, funil e período no cartão.",
      },
      {
        titulo: "O tipo de um campo não muda",
        resumo: "Trocar texto por número deixaria valores antigos que não são número. Crie um campo novo com o tipo certo.",
      },
      {
        titulo: "Não existe dashboard por usuário",
        resumo: "O painel é um por organização.",
        nota: "De propósito: painel pessoal vira cada um vendo um número diferente na mesma reunião.",
      },
      {
        titulo: "WhatsApp por QR depende de um processo externo",
        resumo: "Se o worker cair, o canal via QR para. O oficial (Cloud API) não depende dele. Recibos de entrega e leitura não existem nesse canal.",
      },
    ],
  },
];
