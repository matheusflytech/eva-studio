"use client";

import * as React from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, Copy, RotateCcw } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";

/*
 * Ligação com um fluxo seu no n8n (ou qualquer URL), nos dois sentidos:
 * - saída: a Eva manda a mensagem do cliente para a URL do seu fluxo;
 * - entrada: o seu fluxo manda mensagem pelo agente, quando quiser
 *   (POST /api/hooks/agentes/{agentId}/{token}). O token na URL é a senha.
 */
function UrlDeEntrada({ agentId }: { agentId: string }) {
  const [estado, setEstado] = React.useState<{ disponivel: boolean; caminho: string | null } | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [copiou, setCopiou] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    void fetch(`/api/agents/${agentId}/entrada`)
      .then((r) => r.json())
      .catch(() => ({ disponivel: false, caminho: null }))
      .then((d) => {
        if (vivo) setEstado({ disponivel: d.disponivel !== false, caminho: d.caminho ?? null });
      });
    return () => {
      vivo = false;
    };
  }, [agentId]);

  async function chamar(metodo: "POST" | "DELETE") {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(`/api/agents/${agentId}/entrada`, { method: metodo });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não deu certo.");
      setEstado({ disponivel: true, caminho: metodo === "POST" ? d.caminho : null });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return null;
  const url = estado.caminho && typeof window !== "undefined" ? `${window.location.origin}${estado.caminho}` : null;

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
      <Label className="flex items-center gap-1.5">
        <ArrowDownToLine size={13} /> URL de entrada (o seu fluxo manda mensagem pelo agente)
      </Label>
      {!estado.disponivel && <Notice tone="warning">A URL de entrada ainda não foi ativada no banco deste ambiente.</Notice>}
      {erro && <Notice tone="danger">{erro}</Notice>}
      {url ? (
        <>
          <div className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-2 px-3 py-2">
            <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-text-primary">{url}</code>
            <IconButton
              aria-label="Copiar URL"
              tooltip
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopiou(true);
                  setTimeout(() => setCopiou(false), 1500);
                } catch {
                  /* sem área de transferência */
                }
              }}
            >
              {copiou ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            </IconButton>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => {
              if (confirm("Trocar a URL? A antiga para de funcionar na hora; atualize o seu fluxo.")) void chamar("POST");
            }}>
              <RotateCcw size={13} /> Trocar URL
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => {
              if (confirm("Desligar a URL de entrada? O seu fluxo não consegue mais mandar mensagem pelo agente.")) void chamar("DELETE");
            }}>
              Desligar
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button type="button" size="sm" variant="secondary" disabled={ocupado || !estado.disponivel} onClick={() => void chamar("POST")}>
            Gerar URL de entrada
          </Button>
        </div>
      )}
      <p className="text-caption text-text-tertiary">
        POST com <code className="font-mono">{"{ \"conversation_id\": \"...\", \"text\": \"...\" }"}</code>, usando o{" "}
        <code className="font-mono">conversation_id</code> que chegou no seu fluxo, ou{" "}
        <code className="font-mono">channel</code> e <code className="font-mono">to</code>. Serve para responder depois
        (quando o seu fluxo demora) ou avisar o cliente de algo. No WhatsApp oficial, fora da janela de 24h, mande{" "}
        <code className="font-mono">template_id</code> e <code className="font-mono">variables</code>. Quem tem a URL
        consegue mandar mensagem: guarde como senha.
      </p>
    </div>
  );
}

export function WebhookConfig({
  agentId,
  outboundUrl,
  onOutboundChange,
}: {
  /** null enquanto o agente não foi salvo: a URL de entrada precisa do agente no banco. */
  agentId: string | null;
  outboundUrl: string;
  onOutboundChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
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
          Quando a conversa chega no bloco “Enviar para o n8n” (ou se o agente não tem fluxo no Builder), a Eva manda a
          mensagem do cliente para esta URL por POST e envia de volta o que vier em <code className="font-mono">reply</code>.
          Para o fluxo seguir para o próximo bloco do Builder, responda também <code className="font-mono">done: true</code>.
        </p>
      </div>
      {agentId ? (
        <UrlDeEntrada agentId={agentId} />
      ) : (
        <p className="text-caption text-text-tertiary">Salve o agente para gerar a URL de entrada.</p>
      )}
    </div>
  );
}
