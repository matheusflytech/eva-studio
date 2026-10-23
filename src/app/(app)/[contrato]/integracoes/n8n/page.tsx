"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { LogoDaMarca } from "@/components/ui/marca";
import { IconButton } from "@/components/ui/icon-button";
import { WebhooksPanel } from "@/components/integrations/webhooks-panel";

// ---------------------------------------------------------------------------
// Integrações → n8n e webhooks. Os dois sentidos num lugar:
// - do n8n para o Eva: API v1 com chave (nó HTTP Request ou o nó da Eva);
// - do Eva para o n8n: webhooks de saída assinados, com teste e log.
// O bloco "Enviar para o n8n" do fluxo do agente continua no Builder.
// ---------------------------------------------------------------------------

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <IconButton
      aria-label="Copiar"
      tooltip
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* sem área de transferência */
        }
      }}
    >
      {ok ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </IconButton>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised font-mono text-caption text-text-secondary ring-1 ring-inset ring-border-subtle">{n}</span>
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-small font-medium text-text-primary">{titulo}</p>
        <div className="mt-0.5 text-small leading-relaxed text-text-secondary">{children}</div>
      </div>
    </li>
  );
}

function Codigo({ children }: { children: string }) {
  return (
    <span className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-border-subtle bg-raised px-2.5 py-1.5">
      <code className="min-w-0 flex-1 break-all font-mono text-caption text-text-primary">{children}</code>
      <Copiar texto={children} />
    </span>
  );
}

const VERIFICAR = `// Nó Code (JavaScript, "Run Once for All Items"), logo depois do Webhook. No n8n self-hosted,
// libere o módulo com NODE_FUNCTION_ALLOW_BUILTIN=crypto.
// No nó Webhook, ligue "Raw Body" para conferir o corpo exato.
const crypto = require('crypto');
const segredo = $env.EVA_WEBHOOK_SECRET; // whsec_...
const item = $input.first();
const h = item.json.headers;
const corpo = Buffer.from(item.binary.data.data, 'base64').toString('utf8');
const chave = Buffer.from(segredo.slice(6), 'base64');
const esperado = 'v1,' + crypto.createHmac('sha256', chave)
  .update(h['webhook-id'] + '.' + h['webhook-timestamp'] + '.' + corpo).digest('base64');
const ok = h['webhook-signature'].split(' ').some((s) => s.length === esperado.length &&
  crypto.timingSafeEqual(Buffer.from(s), Buffer.from(esperado)));
const recente = Math.abs(Date.now() / 1000 - Number(h['webhook-timestamp'])) < 300;
if (!ok || !recente) throw new Error('Assinatura inválida');
return [{ json: JSON.parse(corpo) }];`;

export default function N8nPage() {
  const [base, setBase] = React.useState("https://evapp.vercel.app/api/v1");
  React.useEffect(() => {
    // Endereço real deste ambiente (local, preview ou produção).
    const t = setTimeout(() => setBase(`${window.location.origin}/api/v1`), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 pt-1 lg:px-6">
      <Link href="/integracoes" className="mb-2 inline-flex items-center gap-1.5 self-start text-small font-medium text-text-secondary hover:text-text-primary">
        <ArrowLeft size={15} /> Integrações
      </Link>

      <div className="mb-6 flex items-start gap-4">
        <LogoDaMarca marca="n8n" tamanho={44} />
        <div>
          <h1 className="text-heading font-semibold tracking-tight text-text-primary">n8n e webhooks</h1>
          <p className="mt-0.5 max-w-2xl text-small text-text-tertiary">
            Ligue o Eva Studio ao n8n (ou a qualquer sistema) nos dois sentidos: o n8n lê e grava no CRM pela API, e o
            CRM avisa o n8n quando algo acontece.
          </p>
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[18px] border border-border-subtle bg-panel p-5">
          <p className="mb-3 font-mono text-caption text-text-tertiary">Do n8n para o Eva</p>
          <ol className="flex flex-col gap-3">
            <Passo n={1} titulo="Crie uma chave de API">
              Em <Link href="/integracoes?aba=api" className="text-accent-fg hover:underline">Integrações › API do contrato</Link>, só com os
              escopos que o fluxo precisa (por exemplo, contatos e negócios).
            </Passo>
            <Passo n={2} titulo="Crie a credencial no n8n">
              Tipo &quot;Header Auth&quot;: nome <code className="font-mono">Authorization</code>, valor{" "}
              <code className="font-mono">Bearer evs_live_...</code>. Endereço da API:
              <Codigo>{base}</Codigo>
            </Passo>
            <Passo n={3} titulo="Teste a ligação">
              Nó HTTP Request, GET no endereço abaixo. Volta o nome do contrato e os escopos da chave.
              <Codigo>{`${base}/me`}</Codigo>
            </Passo>
            <Passo n={4} titulo="Use os endpoints">
              Crie ou atualize sem duplicar com <code className="font-mono">PUT /contacts/upsert</code>, mova negócios com{" "}
              <code className="font-mono">POST /deals/{"{id}"}/move</code> e mande mensagem pelo agente com{" "}
              <code className="font-mono">POST /messages</code>. Tudo na{" "}
              <Link href="/integracoes/api/referencia" className="text-accent-fg hover:underline">referência da API</Link>.
            </Passo>
          </ol>
        </section>

        <section className="rounded-[18px] border border-border-subtle bg-panel p-5">
          <p className="mb-3 font-mono text-caption text-text-tertiary">Do Eva para o n8n</p>
          <ol className="flex flex-col gap-3">
            <Passo n={1} titulo="Crie um nó Webhook no n8n">
              Método POST. Copie a &quot;Production URL&quot; e ative o workflow (a &quot;Test URL&quot; só escuta enquanto o
              editor está aberto). Sem URL pública (n8n no seu computador)? Use o gatilho &quot;Eva Studio Trigger
              (Consulta)&quot; ou <code className="font-mono">GET /events</code>, que perguntam de tempos em tempos.
            </Passo>
            <Passo n={2} titulo="Cadastre aqui embaixo">
              Cole a URL e escolha os eventos: negócio ganho, mudou de etapa, contato criado, mensagem recebida...
            </Passo>
            <Passo n={3} titulo="Envie um teste">
              &quot;Enviar teste&quot; manda o evento <code className="font-mono">webhook.test</code> e mostra o que o n8n
              respondeu. Cada entrega fica no log, com &quot;Reenviar&quot;.
            </Passo>
            <Passo n={4} titulo="Confira a assinatura (recomendado)">
              Todo evento vem com <code className="font-mono">webhook-id</code>, <code className="font-mono">webhook-timestamp</code>{" "}
              e <code className="font-mono">webhook-signature</code> (padrão Standard Webhooks). Se falhar, o Eva tenta de novo
              sozinho por cerca de um dia e meio, sempre com o mesmo <code className="font-mono">webhook-id</code>: use-o para
              não processar repetido.
              <details className="mt-1.5">
                <summary className="cursor-pointer text-caption text-accent-fg">Ver código para conferir no n8n</summary>
                <pre className="mt-1.5 overflow-x-auto rounded-[12px] bg-raised p-2.5 font-mono text-caption leading-relaxed text-text-secondary">
                  {VERIFICAR}
                </pre>
              </details>
            </Passo>
          </ol>
        </section>
      </div>

      <div className="mb-3">
        <h2 className="text-title-sm font-semibold tracking-tight text-text-primary">Webhooks de saída</h2>
        <p className="mt-0.5 max-w-2xl text-small text-text-tertiary">
          Endereços que recebem os eventos deste contrato. O corpo traz o objeto completo, no mesmo formato da API, e o que
          mudou em <code className="font-mono">previous</code>.
        </p>
      </div>
      <WebhooksPanel />

      <p className="mt-8 max-w-2xl text-caption text-text-tertiary">
        Quer que um agente chame o n8n no meio da conversa? Use o bloco &quot;Enviar para o n8n&quot; no fluxo do agente, ou o
        modelo pronto &quot;Atendimento com n8n&quot; ao criar um agente. Para o seu fluxo responder depois, gere a URL de
        entrada na aba Avançado do agente.
      </p>
    </div>
  );
}
