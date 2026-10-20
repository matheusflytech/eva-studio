"use client";

import * as React from "react";
import { ArrowUpFromLine } from "lucide-react";
import { Input, Label } from "@/components/ui/input";

/*
 * Ligação com um fluxo seu no n8n (ou qualquer URL).
 *
 * Só existe o sentido Eva → seu fluxo. A tela mostrava também um "webhook de
 * entrada" (hooks.evaagentstudio.app/in/...) que não existia: colar aquela
 * URL no n8n não fazia nada. Saiu daqui até existir de verdade (plano F6).
 */
export function WebhookConfig({
  outboundUrl,
  onOutboundChange,
}: {
  outboundUrl: string;
  onOutboundChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="agent-outbound-url" className="flex items-center gap-1.5">
        <ArrowUpFromLine size={13} /> URL do seu fluxo
      </Label>
      <Input
        id="agent-outbound-url"
        value={outboundUrl}
        onChange={(e) => onOutboundChange(e.target.value)}
        placeholder="https://seu-n8n.com/webhook/..."
        className="font-mono text-[12.5px]"
      />
      <p className="text-caption text-text-tertiary">
        Quando a conversa chega no bloco “Enviar para meu fluxo” (ou se o agente não tem fluxo no Builder), a Eva manda a
        mensagem do cliente para esta URL por POST e envia de volta o que vier em <code className="font-mono">reply</code>.
        Para o fluxo seguir para o próximo bloco do Builder, responda também <code className="font-mono">done: true</code>.
        O caminho contrário (o seu fluxo chamar a Eva) ainda não existe.
      </p>
    </div>
  );
}
