"use client";

import * as React from "react";
import { Check, Copy, Mail, RefreshCw, Trash2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

interface Registro {
  record: string;
  name: string;
  type: string;
  value: string;
  priority?: number;
  status?: string;
}

interface Dominio {
  dominio: string;
  status: string;
  registros: Registro[];
  remetenteNome: string;
  remetenteLocal: string;
  responderPara: string;
  verificadoEm: string | null;
}

interface Estado {
  configurado: boolean;
  disponivel: boolean;
  dominio: Dominio | null;
}

const SITUACAO: Record<string, { rotulo: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  verified: { rotulo: "Verificado", variant: "success" },
  pending: { rotulo: "Verificando", variant: "warning" },
  not_started: { rotulo: "Falta criar no DNS", variant: "neutral" },
  failed: { rotulo: "Não verificou", variant: "danger" },
  temporary_failure: { rotulo: "Falha temporária", variant: "warning" },
};

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <IconButton
      aria-label="Copiar"
      tooltip
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* sem área de transferência */
        }
      }}
    >
      {ok ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </IconButton>
  );
}

// ---------------------------------------------------------------------------
// Integrações → E-mail. O contrato envia pela conta Resend da Eva, como ele
// mesmo: verifica o domínio (registros SPF/DKIM/MX no DNS do cliente) e
// escolhe o remetente. Sem domínio verificado nenhum e-mail sai (é o que
// segura a entrega na caixa de entrada, não no spam).
// ---------------------------------------------------------------------------
export function EmailPanel() {
  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [novo, setNovo] = React.useState("");
  const [rem, setRem] = React.useState({ remetenteNome: "", remetenteLocal: "contato", responderPara: "" });
  const [ocupado, setOcupado] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tom: "info" | "danger"; texto: string } | null>(null);

  const aplicar = React.useCallback((e: Estado) => {
    setEstado(e);
    if (e.dominio) setRem({ remetenteNome: e.dominio.remetenteNome, remetenteLocal: e.dominio.remetenteLocal, responderPara: e.dominio.responderPara });
  }, []);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/email/dominio")
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (vivo && d && "configurado" in d) aplicar(d);
      });
    return () => {
      vivo = false;
    };
  }, [aplicar]);

  async function chamar(metodo: string, corpo?: unknown, ok?: string) {
    setOcupado(true);
    setMsg(null);
    try {
      const res = await fetch("/api/email/dominio", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não deu certo.");
      setEstado((e) => (e ? { ...e, dominio: data.dominio ?? null } : e));
      if (data.dominio) setRem({ remetenteNome: data.dominio.remetenteNome, remetenteLocal: data.dominio.remetenteLocal, responderPara: data.dominio.responderPara });
      if (ok) setMsg({ tom: "info", texto: ok });
      return data;
    } catch (err) {
      setMsg({ tom: "danger", texto: err instanceof Error ? err.message : "Não deu certo." });
      return null;
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return null;
  const d = estado.dominio;
  const situacao = d ? SITUACAO[d.status] ?? { rotulo: d.status, variant: "neutral" as const } : null;

  return (
    <div className="mb-8">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">E-mail</p>
        <p className="mt-1 max-w-2xl text-[12.5px] text-text-secondary">
          Os e-mails dos fluxos, réguas e disparos saem com o domínio do contrato. Verifique o domínio uma vez e escolha
          o remetente.
        </p>
      </div>

      <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
        {!estado.configurado && (
          <Notice tone="warning">O envio de e-mail ainda não foi configurado neste ambiente (chave da Resend da plataforma).</Notice>
        )}
        {!estado.disponivel && (
          <Notice tone="warning">O e-mail ainda não foi ativado no banco deste ambiente. Nenhum e-mail sai até lá.</Notice>
        )}
        {msg && <Notice tone={msg.tom}>{msg.texto}</Notice>}

        {estado.disponivel && !d && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="email-dominio">Domínio de envio</Label>
              <Input id="email-dominio" placeholder="suaempresa.com.br" value={novo} onChange={(e) => setNovo(e.target.value)} />
            </div>
            <Button type="button" disabled={ocupado || !novo.trim() || !estado.configurado} onClick={() => void chamar("POST", { dominio: novo }, "Domínio adicionado. Crie os registros abaixo no DNS e peça a verificação.")}>
              <Mail size={14} /> Adicionar domínio
            </Button>
          </div>
        )}

        {d && situacao && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[14px] font-semibold text-text-primary">{d.dominio}</p>
              <Badge variant={situacao.variant}>{situacao.rotulo}</Badge>
              <div className="ml-auto flex gap-2">
                {d.status !== "verified" && (
                  <Button type="button" variant="secondary" size="sm" disabled={ocupado} onClick={() => void chamar("POST", { acao: "verificar" }, "Verificação pedida. Se o DNS ainda não propagou, tente de novo em alguns minutos.")}>
                    <RefreshCw size={14} /> Verificar agora
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" disabled={ocupado} onClick={() => {
                  if (confirm(`Remover ${d.dominio}? Os e-mails param de sair até um domínio novo ser verificado.`)) void chamar("DELETE");
                }}>
                  <Trash2 size={14} /> Remover
                </Button>
              </div>
            </div>

            {d.status !== "verified" && d.registros.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border-subtle">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-surface-2 text-text-tertiary">
                    <tr>
                      <th className="px-3 py-2 font-medium">Para</th>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Nome</th>
                      <th className="px-3 py-2 font-medium">Valor</th>
                      <th className="px-3 py-2 font-medium">Prioridade</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {d.registros.map((r, i) => (
                      <tr key={`${r.record}-${r.name}-${i}`}>
                        <td className="px-3 py-2 text-text-secondary">{r.record}</td>
                        <td className="px-3 py-2 font-mono">{r.type}</td>
                        <td className="px-3 py-2 font-mono break-all">
                          <span className="inline-flex items-center gap-1">{r.name} <Copiar texto={r.name} /></span>
                        </td>
                        <td className="max-w-[320px] px-3 py-2 font-mono break-all">
                          <span className="inline-flex items-start gap-1">{r.value} <Copiar texto={r.value} /></span>
                        </td>
                        <td className="px-3 py-2">{r.priority ?? "—"}</td>
                        <td className="px-3 py-2">
                          {r.status === "verified" ? <Badge variant="success">ok</Badge> : <Badge variant="neutral">falta</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="email-nome">Nome do remetente</Label>
                <Input id="email-nome" placeholder="Nome da empresa" value={rem.remetenteNome} onChange={(e) => setRem({ ...rem, remetenteNome: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="email-local">Endereço</Label>
                <div className="flex items-center gap-1.5">
                  <Input id="email-local" value={rem.remetenteLocal} onChange={(e) => setRem({ ...rem, remetenteLocal: e.target.value })} />
                  <span className="shrink-0 text-[12.5px] text-text-tertiary">@{d.dominio}</span>
                </div>
              </div>
              <div>
                <Label htmlFor="email-responder">Respostas vão para</Label>
                <Input id="email-responder" placeholder="vendas@suaempresa.com.br" value={rem.responderPara} onChange={(e) => setRem({ ...rem, responderPara: e.target.value })} />
              </div>
            </div>
            <div>
              <Button type="button" variant="secondary" size="sm" disabled={ocupado} onClick={() => void chamar("PATCH", rem, "Remetente salvo.")}>
                Salvar remetente
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
