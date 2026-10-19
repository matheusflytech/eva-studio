"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

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
  GET: "bg-blue-500/15 text-blue-400",
  POST: "bg-emerald-500/15 text-emerald-400",
  PUT: "bg-violet-500/15 text-violet-400",
  PATCH: "bg-amber-500/15 text-amber-400",
  DELETE: "bg-danger/15 text-danger",
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
    <div className="flex-1 p-8">
      <Link
        href="/integracoes/api"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} /> API pública
      </Link>
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-text-primary">API do CRM · v1</h1>
        {doc && <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-text-secondary">{doc.info.description}</p>}
        <p className="mt-2 text-[12.5px] text-text-tertiary">
          OpenAPI 3.1: <a className="font-mono text-text-primary underline" href="/api/v1/openapi.json">/api/v1/openapi.json</a>
        </p>
      </div>

      {erro && <p className="text-[13px] text-danger">Não foi possível carregar a referência.</p>}

      {tags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {["", ...tags].map((t) => (
            <button
              key={t || "todos"}
              type="button"
              onClick={() => setTag(t)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px]",
                tag === t ? "border-border-strong bg-surface-3 text-text-primary" : "border-border-default text-text-secondary"
              )}
            >
              {t || "Todos"}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {visiveis.map(({ caminho, metodo, op }) => (
          <details key={`${metodo} ${caminho}`} className="glass-card rounded-3xl p-5">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5">
              <span className={cn("rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold", COR[metodo])}>{metodo}</span>
              <code className="font-mono text-[13px] text-text-primary">/api/v1{caminho}</code>
              <span className="text-[13px] text-text-secondary">{op.summary}</span>
              <span className="ml-auto font-mono text-[11px] text-text-tertiary">{op["x-scope"]}</span>
            </summary>
            <div className="mt-4">
              {op.description && <p className="mb-3 text-[13px] text-text-secondary">{op.description}</p>}
              {op.parameters && op.parameters.length > 0 && (
                <div className="mb-3">
                  {op.parameters.map((p) => (
                    <div key={`${p.in}-${p.name}`} className="flex gap-3 border-b border-border-subtle py-1.5 last:border-0">
                      <code className="w-[160px] shrink-0 font-mono text-[12px] text-text-primary">{p.name}</code>
                      <span className="text-[12px] text-text-tertiary">
                        {p.in}
                        {p.required ? " · obrigatório" : ""} {p.description ? `— ${p.description}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <pre className="overflow-x-auto rounded-xl border border-border-default bg-surface-3 p-3.5 font-mono text-[12px] leading-relaxed text-text-secondary">
                {curl(base, metodo, caminho, op)}
              </pre>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
