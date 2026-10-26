"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Badge } from "@/components/ui/badge";
import { EVENTOS } from "@/lib/webhooks/eventos";
import { WEBHOOK_VERIFY_SNIPPET, toCurl, toFetch } from "@/lib/api-v1-examples";
import { EVENT_DEAL_STAGE_CHANGED, WEBHOOK } from "@/lib/api-v1-openapi-examples";
import { CodeBlock, CodeTabs, Field, json } from "@/components/integrations/api-docs";

// Seção "Webhooks e eventos" da página da API: assinar, formato da entrega,
// conferir a assinatura, novas tentativas e a alternativa por consulta.

const DELIVERY_HEADERS = `POST /webhook/abc HTTP/1.1
Content-Type: application/json
User-Agent: EvaStudio-Webhooks/1.0
webhook-id: msg_6b1f0a2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b
webhook-timestamp: 1792506730
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=`;

const RETRIES = ["5 s", "5 min", "30 min", "2 h", "5 h", "10 h", "10 h"];

export function WebhooksGuide({ base }: { base: string }) {
  const create = {
    method: "POST",
    url: `${base}/webhooks`,
    body: { url: "https://seu-n8n.com/webhook/abc", events: ["deal.stage_changed", "deal.won"], description: "n8n" },
  };
  return (
    <section id="webhooks" aria-labelledby="webhooks-title" className="scroll-mt-4 rounded-[18px] border border-border-subtle bg-panel p-4 sm:p-5">
      <h2 id="webhooks-title" className="mb-3 text-title-sm text-text-primary">
        Webhooks e eventos
      </h2>
      <div className="flex flex-col gap-4">
        <p className="max-w-3xl text-small leading-relaxed text-text-secondary">
          Em vez de perguntar de tempos em tempos o que mudou, receba um POST no seu endereço quando algo acontece. Assine pela API ou
          pela tela{" "}
          <Link href="/integrations/n8n" className="text-accent-fg hover:underline">
            Integrações › n8n e webhooks
          </Link>{" "}
          (que também tem teste e log de entregas). Filtros: o tipo exato, <code className="font-mono text-text-primary">deal.*</code>{" "}
          para tudo de um objeto, ou <code className="font-mono text-text-primary">*</code>.
        </p>

        <CodeTabs
          samples={[
            { id: "curl", label: "cURL", code: toCurl(create) },
            { id: "js", label: "JavaScript", code: toFetch(create) },
          ]}
        />
        <CodeBlock
          label={
            <span className="inline-flex items-center gap-2">
              <Badge variant="success">201</Badge>
              <span>Resposta · o secret só aparece aqui</span>
            </span>
          }
          code={json({ data: { ...WEBHOOK, last_success_at: null, secret: "whsec_q8Zk3N0vXb1r7YtLm2PaQw9sEe4uDc6H" } })}
        />

        <div>
          <p className="mb-2 text-small font-medium text-text-primary">Eventos</p>
          <div className="overflow-hidden rounded-[14px] border border-border-subtle">
            {EVENTOS.map((e) => (
              <div key={e.tipo} className="flex flex-col gap-0.5 border-b border-border-subtle px-3.5 py-2 last:border-0 sm:flex-row sm:items-center sm:gap-3">
                <code className="font-mono text-small text-text-primary sm:w-[200px] sm:shrink-0">{e.tipo}</code>
                <span className="text-small text-text-secondary">{e.nome}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-small font-medium text-text-primary">O que chega</p>
          <p className="mb-3 max-w-3xl text-small leading-relaxed text-text-secondary">
            Um POST com JSON. <code className="font-mono text-text-primary">data</code> é o objeto no mesmo formato da API (negócio,
            contato, empresa, tarefa) no momento do evento. <code className="font-mono text-text-primary">previous</code> traz o valor
            anterior: nas mudanças de etapa, <code className="font-mono text-text-primary">{"{ stage_id }"}</code>; em{" "}
            <code className="font-mono text-text-primary">*.updated</code> e <code className="font-mono text-text-primary">deal.owner_changed</code>, os
            campos que mudaram. Em <code className="font-mono text-text-primary">contact.tag_added</code> e{" "}
            <code className="font-mono text-text-primary">contact.tag_removed</code>, o campo{" "}
            <code className="font-mono text-text-primary">{"tag: { id, name }"}</code> diz qual etiqueta.
          </p>
          <div className="flex flex-col gap-3">
            <CodeBlock label="Headers" code={DELIVERY_HEADERS} />
            <CodeBlock label="Corpo · deal.stage_changed" code={json(EVENT_DEAL_STAGE_CHANGED)} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-small font-medium text-text-primary">Conferir a assinatura</p>
          <p className="mb-3 max-w-3xl text-small leading-relaxed text-text-secondary">
            Toda entrega é assinada com o secret do endpoint: HMAC-SHA256 de{" "}
            <code className="font-mono text-text-primary">webhook-id.webhook-timestamp.corpo</code>, com a chave que é o base64 depois de{" "}
            <code className="font-mono text-text-primary">whsec_</code>. Confira sobre o corpo cru (antes de converter o JSON) e recuse
            o que não bater. Use o <code className="font-mono text-text-primary">webhook-id</code> para ignorar entrega repetida: ele é o
            mesmo em todas as tentativas.
          </p>
          <CodeBlock label="Node.js" code={WEBHOOK_VERIFY_SNIPPET} />
        </div>

        <div>
          <p className="mb-2 text-small font-medium text-text-primary">Respostas e novas tentativas</p>
          <div>
            <Field name="2xx">Entregue. Responda rápido (processe depois, numa fila) para não estourar o tempo.</Field>
            <Field name="Rede, timeout, 408, 429, 5xx">
              Tenta de novo depois de {RETRIES.join(", ")} (até 8 tentativas). Retry-After maior que a espera é respeitado.
            </Field>
            <Field name="Outro 4xx">Falha na hora, sem nova tentativa.</Field>
            <Field name="410">Desliga o endpoint (o endereço não existe mais).</Field>
            <Field name="5 dias falhando">Desliga o endpoint. Religue pela tela depois de corrigir.</Field>
          </div>
        </div>

        <div>
          <p className="mb-2 text-small font-medium text-text-primary">Sem URL pública? Consulte os eventos</p>
          <p className="mb-3 max-w-3xl text-small leading-relaxed text-text-secondary">
            <code className="font-mono text-text-primary">GET /events</code> devolve os mesmos eventos (contact.created, lead.captured,
            deal.created, deal.stage_changed, deal.won, deal.lost, deal.reopened, task.completed), montados do histórico do CRM.
            Comece com <code className="font-mono text-text-primary">since</code> (até 30 dias atrás) e depois mande só o{" "}
            <code className="font-mono text-text-primary">next_cursor</code>. Aqui <code className="font-mono text-text-primary">data</code> é o
            objeto como está agora.
          </p>
          <CodeTabs
            samples={[
              { id: "curl", label: "cURL", code: toCurl({ method: "GET", url: `${base}/events?types=deal.*&since=2026-10-20T00:00:00Z` }) },
              { id: "js", label: "JavaScript", code: toFetch({ method: "GET", url: `${base}/events?types=deal.*&since=2026-10-20T00:00:00Z` }) },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
