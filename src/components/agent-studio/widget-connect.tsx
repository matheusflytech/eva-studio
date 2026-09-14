"use client";

import * as React from "react";
import { Check, Copy, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WidgetConnect({ agentId }: { agentId: string }) {
  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const [isToggling, setIsToggling] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => {
    setOrigin(window.location.origin);
    fetch(`/api/agents/${agentId}/widget`)
      .then((res) => res.json())
      .then((data) => setEnabled(!!data.enabled))
      .catch(() => setEnabled(false));
  }, [agentId]);

  async function handleToggle() {
    setIsToggling(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/widget`, { method: "POST" });
      const data = await res.json();
      setEnabled(!!data.enabled);
    } finally {
      setIsToggling(false);
    }
  }

  const snippet = `<script src="${origin}/api/widget/${agentId}/script.js" async></script>`;

  function handleCopy() {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (enabled === null) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-2.5 text-text-primary">
          <MessagesSquare size={16} className={enabled ? "text-emerald-400" : "text-text-tertiary"} />
          <span className="text-[13px] font-medium">{enabled ? "Widget ativo" : "Widget desativado"}</span>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={handleToggle} disabled={isToggling}>
          {isToggling ? "..." : enabled ? "Desativar" : "Ativar"}
        </Button>
      </div>

      {enabled && (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] text-text-secondary">
            Cole essa linha antes do <code className="font-mono">&lt;/body&gt;</code> do seu site. O widget abre
            sozinho pra novos visitantes e manda a conversa direto pro fluxo desse agente — capturas de input
            viram leads na página <span className="font-medium text-text-primary">Leads</span>.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-border-default bg-surface-3 px-3 py-2.5">
            <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11.5px] text-text-secondary">{snippet}</code>
            <button type="button" onClick={handleCopy} className="shrink-0 rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
