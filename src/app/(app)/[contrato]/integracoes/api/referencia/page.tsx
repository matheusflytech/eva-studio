"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

// Referência da API do CRM v1, montada a partir do /api/v1/openapi.json (a
// mesma fonte que quem integra usa para gerar cliente). Os exemplos curl saem
// dos exemplos do próprio OpenAPI.

interface Operacao {
  tags: string[];
  summary: string;
  description?: string;
  "x-scope": string;
  parameters?: Array<{ name: string; in: string; required?: boolean; description?: string }>;
  requestBody?: { content: { "application/json": { example?: unknown } } };
}
interface Doc {
  info: { description: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, unknown>>;
}

const METODOS = ["get", "post", "put", "patch", "delete"] as const;
const COR: Record<string, string> = {
  GET: "bg-cat-blue-subtle text-cat-blue",
  POST: "bg-cat-green-subtle text-cat-green",
  PUT: "bg-cat-indigo-subtle text-cat-indigo",
  PATCH: "bg-cat-amber-subtle text-cat-amber",
  DELETE: "bg-cat-red-subtle text-cat-red",
};

function curl(base: string, metodo: string, caminho: string, op: Operacao): string {
  const linhas = [`curl -X ${metodo} "${base}${caminho}"`, `  -H "Authorization: Bearer evs_live_..."`];
  if (op.parameters?.some((p) => p.name === "Idempotency-Key")) linhas.push(`  -H "Idempotency-Key: $(uuidgen)"`);
  const exemplo = op.requestBody?.content["application/json"].example;
  if (exemplo !== undefined) {
    linhas.push(`  -H "Content-Type: application/json"`);
    linhas.push(`  -d '${JSON.stringify(exemplo, null, 2).replace(/'/g, "'\\''")}'`);
  }
  return linhas.join(" \\\n");
}

export default function ReferenciaApiPage() {
  const [doc, setDoc] = React.useState<Doc | null>(null);
  const [erro, setErro] = React.useState(false);
  const [tag, setTag] = React.useState<string>("");

  React.useEffect(() => {
    fetch("/api/v1/openapi.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Doc) => setDoc(d))
      .catch(() => setErro(true));
  }, []);

  const operacoes = React.useMemo(() => {
    if (!doc) return [];
    return Object.entries(doc.paths).flatMap(([caminho, item]) =>
      METODOS.filter((m) => item[m]).map((m) => ({ caminho, metodo: m.toUpperCase(), op: item[m] as Operacao }))
    );
  }, [doc]);
  const tags = [...new Set(operacoes.map((o) => o.op.tags[0]))];
  const visiveis = operacoes.filter((o) => !tag || o.op.tags[0] === tag);
  const base = doc?.servers[0]?.url ?? "/api/v1";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 pt-1 lg:px-6">
      <Link
        href="/integracoes/api"
        className="mb-2 inline-flex items-center gap-1.5 self-start text-small font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} /> API pública
      </Link>
      <div className="mb-5">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">API do CRM · v1</h1>
        {doc && <p className="mt-0.5 max-w-3xl text-small leading-relaxed text-text-tertiary">{doc.info.description}</p>}
        <p className="mt-2 text-small text-text-tertiary">
          OpenAPI 3.1: <a className="font-mono text-text-primary underline" href="/api/v1/openapi.json">/api/v1/openapi.json</a>
        </p>
      </div>

      {erro && <p className="text-small text-danger">Não foi possível carregar a referência.</p>}

      {tags.length > 0 && (
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
            {visiveis.length} {visiveis.length === 1 ? "endpoint" : "endpoints"}
          </span>
        </div>
      )}

      <div className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
        {visiveis.map(({ caminho, metodo, op }) => (
          <details key={`${metodo} ${caminho}`} className="group px-1 py-3">
            <summary className="flex min-h-8 cursor-pointer list-none flex-wrap items-center gap-2.5 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-focus">
              <span className={cn("rounded-full px-2 py-0.5 font-mono text-caption font-semibold", COR[metodo])}>{metodo}</span>
              <code className="font-mono text-small text-text-primary">/api/v1{caminho}</code>
              <span className="text-small text-text-secondary">{op.summary}</span>
              <span className="ml-auto font-mono text-caption text-text-tertiary">{op["x-scope"]}</span>
            </summary>
            <div className="mt-4">
              {op.description && <p className="mb-3 text-small text-text-secondary">{op.description}</p>}
              {op.parameters && op.parameters.length > 0 && (
                <div className="mb-3">
                  {op.parameters.map((p) => (
                    <div key={`${p.in}-${p.name}`} className="flex gap-3 border-b border-border-subtle py-1.5 last:border-0">
                      <code className="w-[160px] shrink-0 font-mono text-caption text-text-primary">{p.name}</code>
                      <span className="text-caption text-text-tertiary">
                        {p.in}
                        {p.required ? " · obrigatório" : ""} {p.description ? `— ${p.description}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <pre className="overflow-x-auto rounded-[14px] bg-raised p-3.5 font-mono text-caption leading-relaxed text-text-secondary">
                {curl(base, metodo, caminho, op)}
              </pre>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
