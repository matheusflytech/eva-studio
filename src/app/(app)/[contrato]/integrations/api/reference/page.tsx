"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { montarOpenApi } from "@/lib/api-v1-openapi";
import { pathExamples } from "@/lib/api-v1-openapi-examples";
import { exampleUrl, toCurl, toFetch } from "@/lib/api-v1-examples";
import { CodeBlock, CodeTabs, Eyebrow, Field, LanguageProvider, Method, json, useOrigin } from "@/components/integrations/api-docs";

// Referência da API do CRM v1, montada do mesmo OpenAPI servido em
// /api/v1/openapi.json (a fonte que quem integra usa para gerar cliente).
// Cada endpoint: parâmetros, exemplo em cURL e JavaScript, resposta e erros.

interface Param {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: { type?: string };
}
interface Operation {
  tags: string[];
  summary: string;
  description?: string;
  "x-scope": string;
  "x-errors"?: Array<{ status: number; code: string }>;
  parameters?: Param[];
  requestBody?: { content: { "application/json": { example?: unknown } } };
  responses: Record<string, { content?: { "application/json"?: { example?: unknown } } }>;
}
interface Entry {
  path: string;
  method: string;
  op: Operation;
  pathParams: Param[];
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const anchor = (method: string, path: string) => `${method}-${path}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

function EndpointCard({ entry, base }: { entry: Entry; base: string }) {
  const { path, method, op, pathParams } = entry;
  const id = anchor(method, path);
  const params = [...pathParams, ...(op.parameters ?? [])];
  const body = op.requestBody?.content["application/json"].example;
  const req = {
    method,
    url: exampleUrl(base, path, pathExamples(path)),
    body,
    idempotency: op.parameters?.some((p) => p.name === "Idempotency-Key" && p.required),
  };
  const [status, response] = Object.entries(op.responses).find(([s]) => /^\d+$/.test(s)) ?? ["200", {}];
  const example = response.content?.["application/json"]?.example;

  return (
    <details id={id} className="group scroll-mt-4 rounded-[18px] border border-border-subtle bg-panel open:border-border-default">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-[18px] px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-focus sm:px-4 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-text-tertiary transition-transform group-open:rotate-90" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Method method={method} />
            <code className="min-w-0 break-all font-mono text-small text-text-primary">{path}</code>
          </div>
          <span className="min-w-0 text-small text-text-secondary sm:truncate">{op.summary}</span>
        </div>
        <span className="hidden shrink-0 font-mono text-caption text-text-tertiary md:inline">{op["x-scope"]}</span>
      </summary>

      <div className="grid min-w-0 gap-5 border-t border-border-subtle p-3 sm:p-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {op.description && <p className="text-small leading-relaxed text-text-secondary">{op.description}</p>}
          <div className="flex flex-wrap items-center gap-2 text-caption text-text-tertiary">
            <span>Escopo</span>
            <Badge variant="neutral" className="font-mono">
              {op["x-scope"]}
            </Badge>
          </div>

          {params.length > 0 && (
            <div>
              <Eyebrow>Parâmetros</Eyebrow>
              {params.map((p) => (
                <Field
                  key={`${p.in}-${p.name}`}
                  name={p.name}
                  type={`${p.in === "path" ? "caminho" : p.in === "query" ? "query" : "header"}${p.schema?.type === "integer" ? " · número" : ""}`}
                  required={p.required}
                >
                  {p.description ?? (p.in === "path" ? "Id do registro." : null)}
                </Field>
              ))}
            </div>
          )}

          {body !== undefined && (
            <div>
              <Eyebrow>Corpo (JSON)</Eyebrow>
              <CodeBlock label="application/json" code={json(body)} />
            </div>
          )}

          {op["x-errors"] && (
            <div>
              <Eyebrow>Erros deste endpoint</Eyebrow>
              <ul className="flex flex-wrap gap-1.5">
                {op["x-errors"].map((e) => (
                  <li key={`${e.status}-${e.code}`}>
                    <Badge variant="danger" className="font-mono">
                      {e.status} {e.code}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-caption text-text-tertiary">
                Mais os gerais: 401, 403, 429 e erros de formato.{" "}
                <Link href="/integrations/api#errors" className="text-accent-fg hover:underline">
                  Ver erros
                </Link>
              </p>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <CodeTabs
            label={`${method} ${path}`}
            samples={[
              { id: "curl", label: "cURL", code: toCurl(req) },
              { id: "js", label: "JavaScript", code: toFetch(req) },
            ]}
          />
          {example !== undefined && (
            <CodeBlock
              label={
                <span className="inline-flex items-center gap-2">
                  <Badge variant="success">{status}</Badge>
                  <span>Resposta</span>
                </span>
              }
              code={json(example)}
            />
          )}
        </div>
      </div>
    </details>
  );
}

export default function ApiReferencePage() {
  const origin = useOrigin();
  const base = `${origin}/api/v1`;
  const doc = React.useMemo(() => montarOpenApi(base), [base]);
  const [tag, setTag] = React.useState("");

  const entries = React.useMemo<Entry[]>(
    () =>
      Object.entries(doc.paths).flatMap(([path, item]) => {
        const pathParams = (item.parameters ?? []) as Param[];
        return METHODS.filter((m) => item[m]).map((m) => ({ path, method: m.toUpperCase(), op: item[m] as Operation, pathParams }));
      }),
    [doc]
  );
  const tags = [...new Set(entries.map((e) => e.op.tags[0]))];
  const groups = tags.filter((t) => !tag || t === tag).map((t) => ({ tag: t, items: entries.filter((e) => e.op.tags[0] === t) }));
  const count = groups.reduce((n, g) => n + g.items.length, 0);

  // Link direto (#post-deals-id-move) abre o endpoint.
  React.useEffect(() => {
    const el = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView();
    }
  }, []);

  return (
    <LanguageProvider>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-8 pt-1 lg:px-6">
        <Link
          href="/integrations/api"
          className="mb-2 inline-flex items-center gap-1.5 self-start text-small font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={15} /> API pública
        </Link>
        <div className="mb-5">
          <h1 className="text-heading font-semibold tracking-tight text-text-primary">API do CRM · v1</h1>
          <p className="mt-0.5 max-w-3xl text-small leading-relaxed text-text-tertiary">
            Todos os endpoints, com exemplo em cURL e JavaScript e a resposta. Autenticação, erros, paginação e limites estão no{" "}
            <Link href="/integrations/api" className="text-accent-fg hover:underline">
              guia da API
            </Link>
            .
          </p>
          <p className="mt-2 text-small text-text-tertiary">
            OpenAPI 3.1:{" "}
            <a className="break-all font-mono text-text-primary underline underline-offset-2" href="/api/v1/openapi.json" download="eva-studio-openapi.json">
              Baixar openapi.json
            </a>
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-56">
            <Select aria-label="Recurso" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Todos os recursos</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <span className="font-mono text-caption tabular-nums text-text-tertiary">
            {count} {count === 1 ? "endpoint" : "endpoints"}
          </span>
        </div>

        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.tag} aria-labelledby={`tag-${anchor("", g.tag)}`}>
              <h2 id={`tag-${anchor("", g.tag)}`} className="mb-2 text-title-sm text-text-primary">
                {g.tag}
              </h2>
              <div className="flex flex-col gap-2">
                {g.items.map((e) => (
                  <EndpointCard key={`${e.method} ${e.path}`} entry={e} base={base} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </LanguageProvider>
  );
}
