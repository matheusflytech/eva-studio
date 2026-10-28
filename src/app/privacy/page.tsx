import type { Metadata } from "next";

// Política de privacidade (pública, fora de (app): abre sem login). Também é
// a página que o Google pede para verificar o app OAuth do Google Agenda, por
// isso a seção do Google segue a Política de Dados do Usuário das APIs do
// Google (inclusive o texto de "Uso Limitado").

export const metadata: Metadata = {
  title: "Política de privacidade · Eva Studio",
  description: "Como o Eva Studio coleta, usa, guarda e protege dados pessoais.",
};

// Dados de quem responde pela plataforma. Razão social e CNPJ: preencher quando definidos.
const EMPRESA = {
  nome: "Eva Holding",
  documento: "",
  email: "lucasalfredotech@gmail.com",
};
const VIGENCIA = "28 de outubro de 2026";

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-heading font-semibold tracking-tight text-text-primary">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

const lista = "flex list-disc flex-col gap-1.5 pl-5";
const link = "font-medium text-accent-fg underline underline-offset-2";

export default function PrivacidadePage() {
  return (
    <main className="min-h-[100dvh] bg-canvas px-4 py-12 sm:py-16">
      <article className="mx-auto flex max-w-[720px] flex-col gap-10 text-body leading-relaxed text-text-secondary">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-caption uppercase tracking-[0.14em] text-text-tertiary">Eva Studio</p>
          <h1 className="text-display font-semibold tracking-tight text-text-primary">Política de privacidade</h1>
          <p className="text-small text-text-tertiary">Vigente desde {VIGENCIA}.</p>
        </header>

        <p>
          O Eva Studio é uma plataforma de CRM, atendimento e agentes de IA oferecida por {EMPRESA.nome}
          {EMPRESA.documento ? ` (${EMPRESA.documento})` : ""}. Esta política explica quais dados pessoais tratamos, para quê, com
          quem compartilhamos e como você exerce seus direitos, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).
        </p>

        <Secao id="papeis" titulo="1. Quem decide sobre os dados">
          <p>
            Cada empresa que contrata o Eva Studio (o &quot;contrato&quot;) decide quais dados dos clientes dela coloca na plataforma.
            Para esses dados, a empresa é a <strong>controladora</strong> e nós somos a <strong>operadora</strong>: tratamos os dados
            em nome dela e só para prestar o serviço. Para os dados de quem usa a plataforma (nome, e-mail de acesso, uso), nós
            somos a controladora.
          </p>
        </Secao>

        <Secao id="dados" titulo="2. Dados que tratamos">
          <ul className={lista}>
            <li>
              <strong>Conta:</strong> nome, e-mail, papel no contrato e foto, se você enviar uma.
            </li>
            <li>
              <strong>Dados do CRM:</strong> contatos, empresas, negócios, tarefas, notas, etiquetas e campos personalizados que o
              contrato cadastra ou importa.
            </li>
            <li>
              <strong>Conversas:</strong> mensagens trocadas pelos canais que o contrato conecta (WhatsApp, Instagram, Messenger,
              chat do site e e-mail), inclusive as respondidas por agentes de IA.
            </li>
            <li>
              <strong>Integrações:</strong> dados recebidos de serviços que o contrato liga, como vendas da Hotmart e eventos do
              Google Agenda (detalhes na seção 4).
            </li>
            <li>
              <strong>Dados técnicos:</strong> registros de acesso (data, hora e endereço IP), registros de auditoria e cookies
              necessários para manter a sessão.
            </li>
          </ul>
        </Secao>

        <Secao id="usos" titulo="3. Para que usamos e com que base legal">
          <ul className={lista}>
            <li>Prestar o serviço contratado: CRM, atendimento, automações e agentes de IA (execução de contrato).</li>
            <li>Manter a plataforma segura, investigar abusos e corrigir falhas (legítimo interesse).</li>
            <li>Dar suporte e avisar sobre mudanças no serviço (execução de contrato).</li>
            <li>Cumprir obrigações legais, como guardar registros de acesso (obrigação legal, Marco Civil da Internet).</li>
            <li>Ligar integrações de terceiros, como o Google Agenda, só quando você autoriza (consentimento).</li>
          </ul>
          <p>Não vendemos dados pessoais e não usamos os dados dos contratos para publicidade.</p>
        </Secao>

        <Secao id="google" titulo="4. Google Agenda">
          <p>
            Cada pessoa pode conectar a própria conta Google em Configurações → Sua conta. Ao conectar, você autoriza o Eva Studio
            a acessar:
          </p>
          <ul className={lista}>
            <li>
              <strong>Seu endereço de e-mail</strong>, para mostrar qual conta está conectada.
            </li>
            <li>
              <strong>A lista das suas agendas</strong> (somente leitura), para você escolher quais aparecem no Eva.
            </li>
            <li>
              <strong>Os eventos das agendas</strong> (ler e criar), para mostrar suas reuniões no calendário do Eva e, quando um
              agente de IA do contrato estiver configurado para isso, marcar uma reunião num horário livre da agenda escolhida.
            </li>
          </ul>
          <p>O que fazemos e o que não fazemos com esses dados:</p>
          <ul className={lista}>
            <li>
              Guardamos apenas o e-mail da conta, a lista de agendas com as suas escolhas e o token de acesso, cifrado (AES-256).
            </li>
            <li>
              Não guardamos seus eventos: eles são buscados no Google quando o calendário abre e ficam em memória por até um minuto.
            </li>
            <li>Não alteramos nem apagamos eventos que já existem. O Eva só cria eventos novos, pelo agente de IA.</li>
            <li>
              O agente de IA recebe só os horários livres, nunca o título, a descrição ou os participantes dos seus eventos. O
              evento criado leva o nome, o telefone e o e-mail do cliente da conversa, e o convite vai para o e-mail dele.
            </li>
            <li>
              Suas reuniões aparecem para você e, quando o papel permite ver a equipe, para gestores do mesmo contrato, como acontece
              com as tarefas.
            </li>
            <li>
              Não vendemos esses dados, não os usamos para publicidade e não os usamos para treinar modelos de IA. Ninguém da nossa
              equipe os lê, exceto com a sua autorização, por segurança ou por obrigação legal.
            </li>
          </ul>
          <p>
            O uso e a transferência para qualquer outro aplicativo de informações recebidas das APIs do Google pelo Eva Studio
            seguirão a{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" className={link} target="_blank" rel="noopener noreferrer">
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            , incluindo os requisitos de Uso Limitado.
          </p>
          <p>
            Para tirar o acesso, clique em Desconectar em Configurações → Sua conta (o token é revogado no Google e apagado do Eva) ou
            remova o Eva Studio em{" "}
            <a href="https://myaccount.google.com/permissions" className={link} target="_blank" rel="noopener noreferrer">
              myaccount.google.com/permissions
            </a>
            .
          </p>
        </Secao>

        <Secao id="compartilhamento" titulo="5. Com quem compartilhamos">
          <p>Só com fornecedores necessários para o serviço funcionar, sob contrato e para essa finalidade:</p>
          <ul className={lista}>
            <li>Hospedagem e banco de dados: Vercel e Supabase (servidores em São Paulo).</li>
            <li>Envio de e-mails: Resend.</li>
            <li>Canais de mensagem que o contrato conecta: Meta (WhatsApp, Instagram e Messenger).</li>
            <li>
              Provedores de IA escolhidos pelo contrato (por exemplo OpenAI, Anthropic, Google, Groq ou OpenRouter), que recebem o
              trecho da conversa necessário para o agente responder.
            </li>
            <li>Integrações que o contrato liga, como Hotmart e Google.</li>
            <li>Autoridades, quando a lei ou uma ordem judicial exigir.</li>
          </ul>
          <p>
            Alguns desses fornecedores podem tratar dados fora do Brasil. Nesses casos, a transferência segue as regras da LGPD
            (art. 33), com cláusulas contratuais e medidas de segurança adequadas.
          </p>
        </Secao>

        <Secao id="seguranca" titulo="6. Segurança e retenção">
          <ul className={lista}>
            <li>Toda comunicação usa HTTPS. Chaves e tokens de integração ficam cifrados no banco.</li>
            <li>Cada contrato só vê os próprios dados, e o acesso dentro dele segue papéis e permissões.</li>
            <li>Ações importantes ficam registradas na auditoria do contrato.</li>
            <li>
              Guardamos os dados enquanto o contrato estiver ativo. Depois do encerramento, eles são excluídos ou anonimizados,
              salvo o que a lei obriga a guardar (como os registros de acesso, por seis meses).
            </li>
          </ul>
        </Secao>

        <Secao id="direitos" titulo="7. Seus direitos">
          <p>Pela LGPD (art. 18), você pode pedir a qualquer momento:</p>
          <ul className={lista}>
            <li>confirmação de que tratamos seus dados e acesso a eles;</li>
            <li>correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;</li>
            <li>portabilidade dos dados;</li>
            <li>informação sobre com quem compartilhamos;</li>
            <li>revogação do consentimento, quando o tratamento depender dele.</li>
          </ul>
          <p>
            Escreva para{" "}
            <a href={`mailto:${EMPRESA.email}`} className={link}>
              {EMPRESA.email}
            </a>
            . Se você é cliente de uma empresa que usa o Eva Studio, o pedido também pode ir direto a ela, que é a controladora dos
            seus dados; nós ajudamos a atender. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
          </p>
        </Secao>

        <Secao id="cookies" titulo="8. Cookies">
          <p>
            Usamos só cookies necessários para manter você conectado, lembrar o contrato aberto e proteger o login com o Google
            contra fraude. Preferências de tela (tema, visões) ficam salvas no próprio navegador. Não usamos cookies de publicidade.
          </p>
        </Secao>

        <Secao id="menores" titulo="9. Menores de idade">
          <p>O Eva Studio é uma ferramenta de trabalho para empresas e não se destina a menores de 18 anos.</p>
        </Secao>

        <Secao id="mudancas" titulo="10. Mudanças nesta política">
          <p>
            Quando esta política mudar, a data no topo é atualizada. Mudanças importantes são avisadas dentro da plataforma antes de
            valer.
          </p>
        </Secao>

        <footer className="border-t border-border-subtle pt-6 text-small text-text-tertiary">
          Dúvidas sobre privacidade:{" "}
          <a href={`mailto:${EMPRESA.email}`} className={link}>
            {EMPRESA.email}
          </a>
        </footer>
      </article>
    </main>
  );
}
