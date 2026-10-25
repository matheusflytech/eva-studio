"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Notice } from "@/components/ui/notice";
import type { FlowNodeData } from "./flow-node";

interface Modelo {
  id: string;
  nome: string;
  assunto: string;
}

// Bloco "Enviar e-mail" pelo domínio do contrato: escolhe um modelo da
// Biblioteca ou escreve aqui (editor simples), e para quem vai. Avisa quando
// o domínio ainda não foi verificado (aí o e-mail não sai).
export function EmailDoContrato({ data, onChange }: { data: FlowNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  const [modelos, setModelos] = React.useState<Modelo[] | null>(null);
  const [verificado, setVerificado] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/email/modelos")
      .then((r) => r.json())
      .catch(() => ({ modelos: [] }))
      .then((d) => {
        if (vivo) setModelos(d.modelos ?? []);
      });
    void fetch("/api/email/dominio")
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (vivo) setVerificado(d?.dominio?.status === "verified");
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {verificado === false && (
        <Notice tone="warning">
          O contrato ainda não tem domínio de e-mail verificado: este bloco não envia até lá.{" "}
          <Link href="/integrations" className="underline">Integrações → E-mail</Link>
        </Notice>
      )}
      <div>
        <Label htmlFor="node-email-to">Para</Label>
        <Input
          id="node-email-to"
          placeholder="O e-mail do contato da conversa"
          value={data.emailTo ?? ""}
          onChange={(e) => onChange({ emailTo: e.target.value })}
        />
        <p className="mt-1 text-caption text-text-tertiary">Vazio = o e-mail do contato. Ou use uma variável do fluxo, ex.: {"{email_cliente}"}.</p>
      </div>
      <div>
        <Label htmlFor="node-email-modelo">Conteúdo</Label>
        <Select id="node-email-modelo" value={data.emailModeloId ?? ""} onChange={(e) => onChange({ emailModeloId: e.target.value || undefined })}>
          <option value="">Escrever aqui</option>
          {(modelos ?? []).map((m) => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
        </Select>
        <p className="mt-1 text-caption text-text-tertiary">
          Modelos ficam na <Link href="/library?tab=emails" className="underline">Biblioteca → Modelos de e-mail</Link>.
        </p>
      </div>
      {!data.emailModeloId && (
        <>
          <div>
            <Label htmlFor="node-email-subject">Assunto</Label>
            <Input id="node-email-subject" value={data.emailSubject ?? ""} onChange={(e) => onChange({ emailSubject: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="node-email-body">Corpo</Label>
            <Textarea id="node-email-body" rows={6} value={data.emailBody ?? ""} onChange={(e) => onChange({ emailBody: e.target.value })} />
            <p className="mt-1 text-caption text-text-tertiary">
              **negrito**, [texto](https://link), linhas com &quot;- &quot; viram lista. Variáveis do fluxo: {"{nome}"}. Do contato:{" "}
              {"{{contato.primeiro_nome}}"}. O rodapé de descadastro entra sozinho.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
