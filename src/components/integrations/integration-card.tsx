"use client";

import * as React from "react";
import { Copy, Check, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getIntegration, saveIntegration, buildIntegrationWebhookUrl } from "@/lib/data/integrations";

export function IntegrationCard({
  id,
  icon: Icon,
  name,
  description,
}: {
  id: string;
  icon: LucideIcon;
  name: string;
  description: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [outboundUrl, setOutboundUrl] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    getIntegration(id).then((cfg) => {
      setOutboundUrl(cfg.outboundUrl);
      setLoaded(true);
    });
  }, [id]);

  const connected = loaded && outboundUrl.trim().length > 0;
  const inboundUrl = buildIntegrationWebhookUrl(id);

  async function copyInbound() {
    await navigator.clipboard.writeText(inboundUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleSave() {
    await saveIntegration(id, { outboundUrl: outboundUrl.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="glass-card rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left"
      >
        <div className="flex items-center gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
            <Icon size={17} />
          </span>
          <div>
            <p className="text-[13.5px] font-medium text-text-primary">{name}</p>
            <p className="text-[12.5px] text-text-secondary">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={connected ? "success" : "neutral"}>{connected ? "Conectado" : "Não conectado"}</Badge>
          <ChevronDown size={15} className={cn("text-text-tertiary transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border-subtle p-4">
          <div>
            <Label>Webhook de entrada</Label>
            <p className="mb-2 text-[12px] text-text-tertiary">
              Cole essa URL no node de trigger do seu workflow no n8n para este canal.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={inboundUrl} className="font-mono text-[12px] text-text-secondary" />
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
            <Label>Webhook de saída</Label>
            <p className="mb-2 text-[12px] text-text-tertiary">
              URL do seu workflow n8n para onde os dados desse canal são enviados.
            </p>
            <Input
              value={outboundUrl}
              onChange={(e) => setOutboundUrl(e.target.value)}
              placeholder="https://seu-n8n.com/webhook/..."
              className="font-mono text-[12px]"
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave} className={buttonVariants({ variant: "solid", size: "sm" })}>
              Salvar conexão
            </button>
            {saved && <span className="text-[12px] text-text-tertiary">Salvo.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
