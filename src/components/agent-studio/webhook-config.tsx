"use client";

import * as React from "react";
import { Copy, Check, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Input, Label } from "@/components/ui/input";

export function WebhookConfig({
  inboundUrl,
  outboundUrl,
  onOutboundChange,
}: {
  inboundUrl: string;
  outboundUrl: string;
  onOutboundChange: (value: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copyInbound() {
    await navigator.clipboard.writeText(inboundUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Label className="flex items-center gap-1.5">
          <ArrowDownToLine size={13} /> Webhook de entrada
        </Label>
        <p className="mb-2 text-[12.5px] text-text-tertiary">
          Cole essa URL no node de trigger do seu workflow no n8n.
        </p>
        <div className="flex gap-2">
          <Input readOnly value={inboundUrl} className="font-mono text-[12.5px] text-text-secondary" />
          <button
            type="button"
            onClick={copyInbound}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-default bg-surface-2 text-text-tertiary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      <div>
        <Label className="flex items-center gap-1.5">
          <ArrowUpFromLine size={13} /> Webhook de saída
        </Label>
        <p className="mb-2 text-[12.5px] text-text-tertiary">
          Cole aqui a URL do webhook do seu workflow n8n para onde este agente vai enviar dados.
        </p>
        <Input
          value={outboundUrl}
          onChange={(e) => onOutboundChange(e.target.value)}
          placeholder="https://seu-n8n.com/webhook/..."
          className="font-mono text-[12.5px]"
        />
      </div>
    </div>
  );
}
