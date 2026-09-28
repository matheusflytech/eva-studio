"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-blue-500/15 text-blue-400",
  POST: "bg-emerald-500/15 text-emerald-400",
  PATCH: "bg-amber-500/15 text-amber-400",
  DELETE: "bg-danger/15 text-danger",
};

function Method({ method }: { method: string }) {
  return (
    <span className={cn("shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold", METHOD_STYLE[method])}>
      {method}
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border-default bg-surface-3 p-3.5 font-mono text-[12px] leading-relaxed text-text-secondary">
      {children}
    </pre>
  );
}

function Field({ name, type, required, children }: { name: string; type: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border-subtle py-2.5 last:border-0">
      <div className="w-[150px] shrink-0">
        <code className="font-mono text-[12.5px] text-text-primary">{name}</code>
        <p className="mt-0.5 text-[10.5px] text-text-tertiary">
          {type}
          {required && <span className="ml-1.5 text-danger">obrigatório</span>}
        </p>
      </div>
      <p className="text-[12.5px] leading-relaxed text-text-secondary">{children}</p>
    </div>
  );
}

function Endpoint({
  method, path, title, children,
}: {
  method: string; path: string; title: string; children?: React.ReactNode;
}) {
  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="mb-1 flex items-center gap-2.5">
        <Method method={method} />
        <code className="font-mono text-[13px] text-text-primary">{path}</code>
      </div>
      <p className="mb-4 text-[13px] text-text-secondary">{title}</p>
      {children}
    </section>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="flex-1 p-8">
      <Link
        href="/integracoes"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} /> Integrações
      </Link>

      <div className="mb-8">
        <h1 className="font-display text-xl font-semibold text-text-primary">API pública</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-text-secondary">
          Crie e gerencie leads de fora do Eva Studio, sua automação, seu CRM, um script próprio. Precisa de uma
          chave de API (crie em Integrações → API pública).
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <section className="glass-card rounded-3xl p-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Autenticação</p>
          <p className="mb-3 text-[13px] leading-relaxed text-text-secondary">
            Toda chamada leva a chave no cabeçalho <code className="font-mono text-text-primary">Authorization</code>,
            no formato Bearer.
          </p>
          <Code>{`Authorization: Bearer evs_live_...`}</Code>
          <p className="mt-3 text-[12.5px] text-text-tertiary">
            Chave inválida, ausente ou revogada: <Badge variant="danger">401</Badge>. Mais de 120 requisições por
            minuto pra mesma organização: <Badge variant="danger">429</Badge>.
          </p>
        </section>

        <Endpoint method="GET" path="/api/v1/leads" title="Lista os leads da sua organização, mais recentes primeiro.">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Parâmetros de busca</p>
          <Field name="limit" type="number, opcional">Quantos devolver de uma vez. Padrão 50, máximo 200.</Field>
          <Field name="stage" type="string, opcional">Filtra por estágio: novo, contatado, qualificado, ganho ou perdido.</Field>
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Exemplo</p>
          <Code>{`curl https://seu-dominio.app/api/v1/leads?stage=novo \\
  -H "Authorization: Bearer evs_live_..."`}</Code>
        </Endpoint>

        <Endpoint method="POST" path="/api/v1/leads" title="Cria um lead novo.">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Corpo da requisição</p>
          <Field name="agentId" type="string" required>Qual agente esse lead pertence (veja o id na URL do agente no Eva Studio).</Field>
          <Field name="fields" type="objeto" required>Os dados do lead, formato livre, ex: {"{ nome, email, telefone }"}. Viram as variáveis que aparecem no card do lead.</Field>
          <Field name="stage" type="string, opcional">Estágio inicial. Padrão: novo.</Field>
          <Field name="contactId" type="string, opcional">Identificador único seu pra esse contato. Se não mandar, o Eva Studio gera um.</Field>
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Exemplo</p>
          <Code>{`curl -X POST https://seu-dominio.app/api/v1/leads \\
  -H "Authorization: Bearer evs_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "...",
    "fields": { "nome": "Maria Silva", "email": "maria@exemplo.com" },
    "stage": "novo"
  }'`}</Code>
        </Endpoint>

        <Endpoint method="GET" path="/api/v1/leads/:id" title="Busca um lead específico pelo id." />

        <Endpoint method="PATCH" path="/api/v1/leads/:id" title="Atualiza o estágio e/ou os dados de um lead.">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Corpo da requisição</p>
          <Field name="stage" type="string, opcional">Novo estágio.</Field>
          <Field name="fields" type="objeto, opcional">Campos pra atualizar, mesclados com os que já existem, não substitui os outros.</Field>
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Exemplo</p>
          <Code>{`curl -X PATCH https://seu-dominio.app/api/v1/leads/ID_DO_LEAD \\
  -H "Authorization: Bearer evs_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "stage": "qualificado" }'`}</Code>
        </Endpoint>

        <Endpoint method="DELETE" path="/api/v1/leads/:id" title="Apaga um lead. Não pode ser desfeito." />

        <section className="glass-card rounded-3xl p-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Formato da resposta</p>
          <p className="mb-3 text-[13px] leading-relaxed text-text-secondary">
            Sucesso vem sempre dentro de <code className="font-mono text-text-primary">data</code>. Erro vem como{" "}
            <code className="font-mono text-text-primary">{"{ error: \"mensagem\" }"}</code>.
          </p>
          <Code>{`{
  "data": {
    "id": "...",
    "agentId": "...",
    "contactId": "...",
    "stage": "novo",
    "fields": { "nome": "Maria Silva", "email": "maria@exemplo.com" },
    "createdAt": "2026-09-16T03:25:33.151Z",
    "updatedAt": "2026-09-16T03:25:33.151Z"
  }
}`}</Code>
        </section>
      </div>
    </div>
  );
}
