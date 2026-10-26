"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { toCurl, toFetch } from "@/lib/api-v1-examples";
import { CONTACT, ME, list } from "@/lib/api-v1-openapi-examples";
import { CodeBlock, CodeTabs, CopyButton, Eyebrow, Field, LanguageProvider, Method, json, useOrigin } from "@/components/integrations/api-docs";
import { WebhooksGuide } from "./webhooks-guide";

// ---------------------------------------------------------------------------
// Integrações → API: guia da API pública (autenticação, convenções, erros,
// paginação, idempotência, limites, webhooks) e a API de Leads. A lista de
// endpoints do CRM fica na referência (/integrations/api/reference), montada
// do OpenAPI.
// ---------------------------------------------------------------------------

const SECTIONS = [
  { id: "quickstart", label: "Primeira chamada" },
  { id: "auth", label: "Autenticação e escopos" },
  { id: "conventions", label: "Convenções" },
  { id: "errors", label: "Erros" },
  { id: "pagination", label: "Paginação e sincronização" },
  { id: "idempotency", label: "Idempotência" },
  { id: "rate-limits", label: "Limites de uso" },
  { id: "webhooks", label: "Webhooks e eventos" },
  { id: "leads", label: "API de Leads" },
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 rounded-[18px] border border-border-subtle bg-panel p-4 sm:p-5">
      <h2 id={`${id}-title`} className="mb-3 text-title-sm text-text-primary">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="max-w-3xl text-small leading-relaxed text-text-secondary">{children}</p>;
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded-[6px] bg-raised px-1 py-px font-mono text-[0.92em] text-text-primary">{children}</code>;
}

/** Tabela simples que vira lista empilhada em tela estreita. */
function Rows({ head, rows }: { head: [string, string, string?]; rows: Array<[React.ReactNode, React.ReactNode, React.ReactNode?]> }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-border-subtle">
      <div className="hidden grid-cols-[minmax(0,160px)_minmax(0,220px)_1fr] gap-3 border-b border-border-subtle bg-raised px-3.5 py-2 font-mono text-caption text-text-tertiary sm:grid">
        <span>{head[0]}</span>
        <span>{head[1]}</span>
        <span>{head[2]}</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 border-b border-border-subtle px-3.5 py-2.5 text-small last:border-0 sm:grid sm:grid-cols-[minmax(0,160px)_minmax(0,220px)_1fr] sm:gap-3"
        >
          <span className="min-w-0 break-words text-text-primary">{r[0]}</span>
          <span className="min-w-0 break-words">{r[1]}</span>
          {r[2] !== undefined && <span className="min-w-0 text-text-secondary">{r[2]}</span>}
        </div>
      ))}
    </div>
  );
}

function Example({ method, url, body, idempotency, label }: { method: string; url: string; body?: unknown; idempotency?: boolean; label?: string }) {
  const req = { method, url, body, idempotency };
  return (
    <CodeTabs
      label={label}
      samples={[
        { id: "curl", label: "cURL", code: toCurl(req) },
        { id: "js", label: "JavaScript", code: toFetch(req) },
      ]}
    />
  );
}

function Response({ status, body, headers }: { status: number; body: unknown; headers?: string }) {
  const ok = status < 300;
  return (
    <CodeBlock
      label={
        <span className="inline-flex items-center gap-2">
          <Badge variant={ok ? "success" : "danger"}>{status}</Badge>
          <span>Resposta</span>
        </span>
      }
      code={(headers ? headers + "\n\n" : "") + json(body)}
    />
  );
}

const ERROR_401 = {
  error: {
    type: "authentication_error",
    code: "invalid_api_key",
    message: "Chave de API inválida ou ausente. Envie Authorization: Bearer evs_live_...",
    request_id: "req_4f2a9c1e7b3d4a8f9e0c1b2a",
  },
};
const ERROR_403 = {
  error: {
    type: "permission_error",
    code: "insufficient_scope",
    message: "Esta chave não tem o escopo deals:write.",
    details: { required: "deals:write", granted: ["contacts:*", "deals:read"] },
    request_id: "req_9b1c2d3e4f5a6b7c8d9e0f1a",
  },
};
const ERROR_422 = {
  error: {
    type: "invalid_request_error",
    code: "stage_requirements_missing",
    message: "Para mover para Proposta, preencha: Valor.",
    details: { missing_fields: [{ field: "valor", label: "Valor", stage_id: 3, stage_name: "Proposta" }] },
    request_id: "req_0c1d2e3f4a5b6c7d8e9f0a1b",
  },
};

const PAGINATION_LOOP = `// Lê todos os contatos alterados desde a última sincronização.
async function syncContacts(since) {
  const all = [];
  let cursor = null;
  do {
    const params = new URLSearchParams({ limit: "200", updated_since: since });
    if (cursor) params.set("cursor", cursor); // mesmos filtros + cursor
    const res = await fetch(\`\${BASE}/contacts?\${params}\`, {
      headers: { Authorization: \`Bearer \${process.env.EVA_API_KEY}\` },
    });
    const page = await res.json();
    if (!res.ok) throw new Error(page.error.code);
    all.push(...page.data);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all;
}`;

const RETRY = `// Repete em 429 (respeitando Retry-After) e em 5xx, com a mesma Idempotency-Key.
async function call(url, init = {}, attempt = 0) {
  const res = await fetch(url, init);
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const wait = Number(res.headers.get("Retry-After")) || 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait * 1000));
    return call(url, init, attempt + 1);
  }
  return res;
}`;

const LEAD = {
  id: CONTACT.id,
  agentId: CONTACT.channels[0].agent_id,
  contactId: "site-123",
  stage: "novo",
  fields: { nome: "Maria Silva", email: "maria@exemplo.com", origem: "landing-page" },
  name: "Maria Silva",
  email: "maria@exemplo.com",
  phone: "",
  channel: "website",
  conversationId: "6d7e8f9a-0b1c-4d2e-8f3a-4b5c6d7e8f9a",
  createdAt: "2026-10-19T10:00:00.000Z",
  updatedAt: "2026-10-19T11:00:00.000Z",
};

function LeadEndpoint({ method, path, title, children }: { method: string; path: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-4 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Method method={method} />
        <code className="break-all font-mono text-small text-text-primary">{path}</code>
      </div>
      <P>{title}</P>
      {children}
    </div>
  );
}

export default function ApiDocsPage() {
  const origin = useOrigin();
  const base = `${origin}/api/v1`;

  return (
    <LanguageProvider>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-8 pt-1 lg:px-6">
        <Link
          href="/integrations?tab=api"
          className="mb-2 inline-flex items-center gap-1.5 self-start text-small font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={15} /> Integrações
        </Link>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-heading font-semibold tracking-tight text-text-primary">API pública</h1>
            <p className="mt-0.5 max-w-2xl text-small leading-relaxed text-text-tertiary">
              Leia e escreva contatos, empresas, negócios, funis, tarefas, notas, fluxos e sequências de fora do Eva Studio: do seu
              ERP, do n8n ou de um script próprio. JSON por HTTPS, autenticado por chave de API.
            </p>
          </div>
          <Link href="/integrations/api/reference" className={cn(buttonVariants({ variant: "primary" }), "self-start lg:self-auto")}>
            Referência dos endpoints <ArrowRight size={15} />
          </Link>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-[14px] border border-border-subtle bg-panel py-2 pl-3.5 pr-1.5">
            <div className="min-w-0">
              <p className="font-mono text-caption text-text-tertiary">URL base</p>
              <code className="block truncate font-mono text-small text-text-primary">{base}</code>
            </div>
            <CopyButton text={base} label="Copiar URL base" />
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-[14px] border border-border-subtle bg-panel py-2 pl-3.5 pr-1.5">
            <div className="min-w-0">
              <p className="font-mono text-caption text-text-tertiary">OpenAPI 3.1 (sem chave)</p>
              <a href="/api/v1/openapi.json" download="eva-studio-openapi.json" className="block truncate font-mono text-small text-text-primary underline-offset-2 hover:underline">
                {base}/openapi.json
              </a>
            </div>
            <CopyButton text={`${base}/openapi.json`} label="Copiar URL do OpenAPI" />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Seções" className="hidden lg:block">
            <ul className="sticky top-4 flex flex-col gap-0.5">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block rounded-[10px] px-2.5 py-1.5 text-small text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col gap-4">
            <Section id="quickstart" title="Primeira chamada">
              <P>
                Crie uma chave em <strong className="font-medium text-text-primary">Integrações › API do contrato</strong> e teste com{" "}
                <C>GET /me</C>: ela diz de qual contrato é a chave e quais escopos tem. É a mesma chamada que o nó do n8n usa para testar a
                credencial.
              </P>
              <Example method="GET" url={`${base}/me`} />
              <Response
                status={200}
body={{ data: ME }} />
            </Section>

            <Section id="auth" title="Autenticação e escopos">
              <P>
                Toda chamada leva a chave no header <C>Authorization</C>, no formato Bearer. A chave pertence a um contrato: tudo o que
                ela lê e escreve fica dentro dele. Guarde a chave como segredo (variável de ambiente, cofre); nunca no front-end.
              </P>
              <CodeBlock label="Header" code="Authorization: Bearer evs_live_..." />
              <P>
                Cada chave tem escopos. <C>*</C> libera tudo; <C>recurso:*</C> lê e escreve no recurso; <C>recurso:read</C> e{" "}
                <C>recurso:write</C> separam leitura de escrita (escrever não dá direito a ler). O escopo exigido aparece em cada endpoint
                da referência.
              </P>
              <div className="flex flex-wrap gap-1.5">
                {["contacts", "companies", "deals", "tasks", "notes", "pipelines", "custom_fields", "tags", "flows", "sequences", "imports", "exports", "webhooks", "messages"].map(
                  (r) => (
                    <Badge key={r} variant="neutral" className="font-mono">
                      {r}
                    </Badge>
                  )
                )}
              </div>
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                <Response status={401} body={ERROR_401} />
                <Response status={403} body={ERROR_403} />
              </div>
            </Section>

            <Section id="conventions" title="Convenções">
              <Rows
                head={["Assunto", "Formato", "Detalhe"]}
                rows={[
                  ["Nomes", <C key="c">snake_case</C>, "Em inglês, no corpo, na query e na resposta: pipeline_id, amount_cents, updated_at."],
                  ["Datas", <C key="c">2026-10-20T14:32:10.000Z</C>, "ISO-8601 em UTC na resposta. Na entrada, qualquer ISO-8601 com fuso."],
                  ["Dinheiro", <C key="c">amount_cents: 150000</C>, "Inteiro em centavos (R$ 1.500,00), com currency ao lado."],
                  ["Funil e etapa", <C key="c">pipeline_id: 1, stage_id: 3</C>, "Número no contrato, não UUID. Veja GET /pipelines."],
                  ["Outros ids", <C key="c">uuid</C>, "Contato, empresa, negócio, tarefa, nota, agente, etiqueta."],
                  ["Seu id", <C key="c">external_id</C>, "Guarde o id do seu sistema e busque/atualize por ele em /by-external-id/{id}. Mais de um sistema? Use external_source; a resposta mostra o external_id dessa origem (padrão api)."],
                  ["PATCH", "Parcial", "Campo ausente não muda; null limpa."],
                  ["Campos e filtros", "Estritos", "Campo ou parâmetro desconhecido é erro 400 (unknown_field / unknown_parameter), nunca ignorado."],
                  ["Resposta", <C key="c">{"{ data }"}</C>, "Objeto em data; listas em { data, has_more, next_cursor }."],
                ]}
              />
            </Section>

            <Section id="errors" title="Erros">
              <P>
                Todo erro vem no mesmo envelope. Compare pelo <C>code</C> (estável, em inglês); a <C>message</C> é em português, para quem
                lê o log. <C>param</C> diz qual campo causou o erro e <C>details</C> traz o resto. Mande o <C>request_id</C> (também no
                header <C>X-Request-Id</C>) quando falar com o suporte.
              </P>
              <Response status={422} body={ERROR_422} />
              <Rows
                head={["Status", "type", "Quando"]}
                rows={[
                  [<Badge key="b" variant="danger">400</Badge>, <C key="c">invalid_request_error</C>, "JSON inválido, campo/parâmetro desconhecido, valor fora do formato, cursor inválido."],
                  [<Badge key="b" variant="danger">401</Badge>, <C key="c">authentication_error</C>, "Chave ausente, inválida ou revogada (invalid_api_key)."],
                  [<Badge key="b" variant="danger">403</Badge>, <C key="c">permission_error</C>, "A chave não tem o escopo (insufficient_scope)."],
                  [<Badge key="b" variant="danger">404</Badge>, <C key="c">not_found_error</C>, "Registro não existe neste contrato (not_found, invalid_reference)."],
                  [<Badge key="b" variant="danger">409</Badge>, <C key="c">conflict_error</C>, "Duplicado (duplicate), external_id em uso, negócio fechado (deal_closed)."],
                  [<Badge key="b" variant="danger">410</Badge>, <C key="c">invalid_request_error</C>, "Item passou dos 30 dias na lixeira (trash_expired)."],
                  [<Badge key="b" variant="danger">422</Badge>, <C key="c">invalid_request_error</C>, "Regra de negócio: campos obrigatórios da etapa, motivo de perda, fluxo inválido."],
                  [<Badge key="b" variant="danger">429</Badge>, <C key="c">rate_limit_error</C>, "Passou do limite por minuto (rate_limited). Veja Retry-After."],
                  [<Badge key="b" variant="danger">5xx</Badge>, <C key="c">api_error</C>, "Falha nossa (internal_error). Pode repetir com a mesma Idempotency-Key."],
                ]}
              />
            </Section>

            <Section id="pagination" title="Paginação e sincronização">
              <P>
                Listas usam cursor. A ordem é sempre crescente pela data de atualização (<C>updated_at</C>; em <C>/deleted</C>,{" "}
                <C>deleted_at</C>), então registros alterados durante a leitura não pulam nem repetem. Enquanto <C>has_more</C> for true,
                peça a próxima página com o <C>next_cursor</C> e os <strong className="font-medium text-text-primary">mesmos filtros</strong>{" "}
                (outro filtro com o mesmo cursor dá <C>cursor_mismatch</C>).
              </P>
              <div>
                <Field name="limit" type="1–200">Itens por página. Padrão 50.</Field>
                <Field name="cursor" type="texto">O next_cursor da página anterior.</Field>
                <Field name="include_total" type="true | false">Inclui total (contagem). Custa mais; use só quando precisar.</Field>
                <Field name="updated_since" type="ISO-8601">Só o que mudou desde essa data. A base da sincronização incremental.</Field>
              </div>
              <Example method="GET" url={`${base}/contacts?updated_since=2026-10-20T00:00:00Z&limit=50`} />
              <Response status={200} body={list(CONTACT, { has_more: true, next_cursor: "eyJ2IjoiMjAyNi0xMC0yMFQxNDozMjoxMC4wMDBaIiwiaSI6IjNmNmMy..." })} />
              <P>
                Para manter uma cópia em dia: guarde a hora de início, leia tudo com <C>updated_since</C> da última rodada e, para saber o
                que foi apagado, leia <C>/contacts/deleted?since=...</C> (o mesmo vale para empresas e negócios).
              </P>
              <CodeBlock label="JavaScript · ler todas as páginas" code={PAGINATION_LOOP} />
            </Section>

            <Section id="idempotency" title="Idempotência">
              <P>
                Se a rede cair no meio de um POST, você não sabe se o registro foi criado. Mande o header <C>Idempotency-Key</C> (um UUID
                por operação, até 255 caracteres) e repita à vontade: por 24 horas, a mesma chave com o mesmo corpo devolve a resposta da
                primeira vez, com o header <C>Idempotent-Replayed: true</C>, sem criar nada de novo.
              </P>
              <Example
                method="POST"
                url={`${base}/notes`}
                idempotency
                body={{ text: "Cliente pediu desconto.", deal_id: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" }}
              />
              <Rows
                head={["Situação", "Resposta", "O que fazer"]}
                rows={[
                  ["Mesma chave, mesmo corpo", "A resposta guardada", "Nada: é a repetição segura."],
                  ["Mesma chave, outro corpo ou endpoint", <C key="c">422 idempotency_key_reused</C>, "Gere uma chave nova para cada operação."],
                  ["Primeira ainda em andamento", <C key="c">409 idempotency_in_progress</C>, "Espere um instante e repita (Retry-After: 1)."],
                  ["Endpoint que exige a chave", <C key="c">400 idempotency_key_required</C>, "Lote (/contacts/batch) e importação (/imports) exigem."],
                ]}
              />
              <P>Resposta 5xx não fica guardada: repetir com a mesma chave executa de novo.</P>
            </Section>

            <Section id="rate-limits" title="Limites de uso">
              <P>
                Por chave e por minuto: <strong className="font-medium text-text-primary">600 leituras</strong> (GET) e{" "}
                <strong className="font-medium text-text-primary">300 escritas</strong> (POST, PUT, PATCH, DELETE), contadas em separado.
                Toda resposta traz os headers abaixo; ao passar do limite vem <C>429 rate_limited</C> com <C>Retry-After</C>.
              </P>
              <CodeBlock
                label="Headers de toda resposta"
                code={`X-Request-Id: req_4f2a9c1e7b3d4a8f9e0c1b2a\nRateLimit-Limit: 300\nRateLimit-Remaining: 287\nRateLimit-Reset: 42`}
              />
              <div>
                <Field name="RateLimit-Limit">Limite da janela atual (600 leitura, 300 escrita).</Field>
                <Field name="RateLimit-Remaining">Quantas chamadas ainda cabem na janela.</Field>
                <Field name="RateLimit-Reset">Segundos até a janela recomeçar.</Field>
                <Field name="Retry-After">Só no 429: segundos para esperar antes de repetir.</Field>
              </div>
              <P>
                Para volume grande, prefira o lote (<C>POST /contacts/batch</C>, até 100 por chamada) ou a importação assíncrona (
                <C>POST /imports</C>, até 5 mil registros ou CSV) a mandar um por um.
              </P>
              <CodeBlock label="JavaScript · repetir com espera" code={RETRY} />
            </Section>

            <WebhooksGuide base={base} />

            <Section id="leads" title="API de Leads">
              <Notice tone="info">
                Endpoints mais antigos, em camelCase e com erro simples <C>{"{ error: \"mensagem\" }"}</C>. Lead é um contato com etapa de
                lead; para integrações novas, prefira <C>/contacts</C>. Exigem o escopo <C>contacts:read</C> ou <C>contacts:write</C>; limite
                de 120 requisições por minuto por contrato.
              </Notice>

              <LeadEndpoint method="GET" path="/api/v1/leads" title="Lista os leads, mais recentes primeiro.">
                <div>
                  <Field name="limit" type="número">Padrão 50, máximo 200.</Field>
                  <Field name="stage" type="texto">novo, contatado, qualificado, ganho ou perdido.</Field>
                </div>
                <Example method="GET" url={`${base}/leads?stage=novo&limit=50`} />
                <Response status={200} body={{ data: [LEAD] }} />
              </LeadEndpoint>

              <LeadEndpoint method="POST" path="/api/v1/leads" title="Cria um lead (ou atualiza o contato com o mesmo e-mail/telefone).">
                <div>
                  <Field name="agentId" type="texto" required>Id do agente dono do lead (está na URL do agente).</Field>
                  <Field name="fields" type="objeto" required>
                    Dados do lead. <C>nome</C>, <C>email</C> e <C>telefone</C> vão para a ficha do contato; o resto vira campo livre.
                  </Field>
                  <Field name="stage" type="texto">Etapa inicial. Padrão: novo.</Field>
                </div>
                <Example
                  method="POST"
                  url={`${base}/leads`}
                  body={{ agentId: LEAD.agentId, fields: { nome: "Maria Silva", email: "maria@exemplo.com", origem: "landing-page" }, stage: "novo" }}
                />
                <Response status={201} body={{ data: LEAD }} />
                <Response status={404} body={{ error: "agentId não encontrado nessa organização." }} />
              </LeadEndpoint>

              <LeadEndpoint method="GET" path="/api/v1/leads/{id}" title="Busca um lead pelo id (o id do contato).">
                <Example method="GET" url={`${base}/leads/${LEAD.id}`} />
              </LeadEndpoint>

              <LeadEndpoint method="PATCH" path="/api/v1/leads/{id}" title="Muda a etapa e/ou os dados. fields é mesclado: o que não vier fica como está.">
                <div>
                  <Field name="stage" type="texto">Nova etapa.</Field>
                  <Field name="fields" type="objeto">Campos para atualizar.</Field>
                </div>
                <Example method="PATCH" url={`${base}/leads/${LEAD.id}`} body={{ stage: "qualificado" }} />
                <Response status={400} body={{ error: "stage precisa ser um de: novo, contatado, qualificado, ganho, perdido." }} />
              </LeadEndpoint>

              <LeadEndpoint method="DELETE" path="/api/v1/leads/{id}" title="Tira o contato da lista de leads. O contato e as conversas continuam.">
                <Example method="DELETE" url={`${base}/leads/${LEAD.id}`} />
                <Response status={200} body={{ data: { deleted: true, removed: true } }} />
              </LeadEndpoint>
            </Section>

            <div className="flex flex-col items-start gap-2 rounded-[18px] border border-border-subtle bg-panel p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <Eyebrow className="mb-1">Próximo passo</Eyebrow>
                <p className="text-small text-text-secondary">Todos os endpoints do CRM, com parâmetros, exemplos e respostas.</p>
              </div>
              <Link href="/integrations/api/reference" className={buttonVariants({ variant: "secondary" })}>
                Abrir a referência <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </LanguageProvider>
  );
}
