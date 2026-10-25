"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-cat-blue-subtle text-cat-blue",
  POST: "bg-cat-green-subtle text-cat-green",
  PATCH: "bg-cat-amber-subtle text-cat-amber",
  DELETE: "bg-cat-red-subtle text-cat-red",
};

function Method({ method }: { method: string }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-mono text-caption font-semibold", METHOD_STYLE[method])}>
      {method}
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-[14px] bg-raised p-3.5 font-mono text-caption leading-relaxed text-text-secondary">
      {children}
    </pre>
  );
}

function Field({ name, type, required, children }: { name: string; type: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border-subtle py-2.5 last:border-0">
      <div className="w-[120px] shrink-0 sm:w-[150px]">
        <code className="font-mono text-small text-text-primary">{name}</code>
        <p className="mt-0.5 font-mono text-caption text-text-tertiary">
          {type}
          {required && <span className="ml-1.5 text-danger">obrigatório</span>}
        </p>
      </div>
      <p className="text-small leading-relaxed text-text-secondary">{children}</p>
    </div>
  );
}

function Endpoint({
  method, path, title, children,
}: {
  method: string; path: string; title: string; children?: React.ReactNode;
}) {
  return (
    <section className="rounded-[18px] border border-border-subtle bg-panel p-5">
      <div className="mb-1 flex items-center gap-2.5">
        <Method method={method} />
        <code className="font-mono text-small text-text-primary">{path}</code>
      </div>
      <p className="mb-4 text-small text-text-secondary">{title}</p>
      {children}
    </section>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 pt-1 lg:px-6">
      <Link
        href="/integrations?tab=api"
        className="mb-2 inline-flex items-center gap-1.5 self-start text-small font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} /> Integrações
      </Link>

      <div className="mb-6">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">API pública</h1>
        <p className="mt-0.5 max-w-2xl text-small text-text-tertiary">
          Crie e gerencie leads de fora do Eva Studio, sua automação, seu CRM, um script próprio. Precisa de uma
          chave de API (crie em Integrações › API do contrato).
        </p>
      </div>

      <div className="flex w-full flex-col gap-4">
        <Link href="/integrations/api/reference" className="block rounded-[18px] border border-border-subtle bg-panel p-5 transition-colors hover:border-border-strong">
          <p className="mb-1 font-mono text-caption text-text-tertiary">Novo · API do CRM v1</p>
          <p className="text-small leading-relaxed text-text-secondary">
            Contatos, empresas, negócios, funis, tarefas, notas, fluxos, sequências e importação/exportação em lote.
            Abra a referência completa (OpenAPI em <code className="font-mono text-text-primary">/api/v1/openapi.json</code>).
          </p>
        </Link>

        <section className="rounded-[18px] border border-border-subtle bg-panel p-5">
          <p className="mb-2 font-mono text-caption text-text-tertiary">Autenticação</p>
          <p className="mb-3 text-small leading-relaxed text-text-secondary">
            Toda chamada leva a chave no cabeçalho <code className="font-mono text-text-primary">Authorization</code>,
            no formato Bearer.
          </p>
          <Code>{`Authorization: Bearer evs_live_...`}</Code>
          <p className="mt-3 text-small text-text-tertiary">
            Chave inválida, ausente ou revogada: <Badge variant="danger">401</Badge>. Mais de 120 requisições por
            minuto pra mesma organização: <Badge variant="danger">429</Badge>.
          </p>
        </section>

        <Endpoint method="GET" path="/api/v1/leads" title="Lista os leads da sua organização, mais recentes primeiro.">
          <p className="mb-2 font-mono text-caption text-text-tertiary">Parâmetros de busca</p>
          <Field name="limit" type="number, opcional">Quantos devolver de uma vez. Padrão 50, máximo 200.</Field>
          <Field name="stage" type="string, opcional">Filtra por estágio: novo, contatado, qualificado, ganho ou perdido.</Field>
          <p className="mb-2 mt-4 font-mono text-caption text-text-tertiary">Exemplo</p>
          <Code>{`curl https://seu-dominio.app/api/v1/leads?stage=novo \\
  -H "Authorization: Bearer evs_live_..."`}</Code>
        </Endpoint>

        <Endpoint method="POST" path="/api/v1/leads" title="Cria um lead novo.">
          <p className="mb-2 font-mono text-caption text-text-tertiary">Corpo da requisição</p>
          <Field name="agentId" type="string" required>Qual agente esse lead pertence (veja o id na URL do agente no Eva Studio).</Field>
          <Field name="fields" type="objeto" required>Os dados do lead, formato livre, ex: {"{ nome, email, telefone }"}. Viram as variáveis que aparecem no card do lead.</Field>
          <Field name="stage" type="string, opcional">Estágio inicial. Padrão: novo.</Field>
          <Field name="contactId" type="string, opcional">Identificador único seu pra esse contato. Se não mandar, o Eva Studio gera um.</Field>
          <p className="mb-2 mt-4 font-mono text-caption text-text-tertiary">Exemplo</p>
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
          <p className="mb-2 font-mono text-caption text-text-tertiary">Corpo da requisição</p>
          <Field name="stage" type="string, opcional">Novo estágio.</Field>
          <Field name="fields" type="objeto, opcional">Campos pra atualizar, mesclados com os que já existem, não substitui os outros.</Field>
          <p className="mb-2 mt-4 font-mono text-caption text-text-tertiary">Exemplo</p>
          <Code>{`curl -X PATCH https://seu-dominio.app/api/v1/leads/ID_DO_LEAD \\
  -H "Authorization: Bearer evs_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "stage": "qualificado" }'`}</Code>
        </Endpoint>

        <Endpoint method="DELETE" path="/api/v1/leads/:id" title="Apaga um lead. Não pode ser desfeito." />

        <section className="rounded-[18px] border border-border-subtle bg-panel p-5">
          <p className="mb-2 font-mono text-caption text-text-tertiary">Formato da resposta</p>
          <p className="mb-3 text-small leading-relaxed text-text-secondary">
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
