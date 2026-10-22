"use client";

import * as React from "react";
import { CalendarClock, Loader2, Ban, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CampoDataSP } from "@/components/whatsapp/campo-data-sp";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";
import { amanhaAs, deSaoPaulo, formatarSaoPaulo, paraCampoSaoPaulo } from "@/lib/fuso-sp";
import { decidirEnvio } from "@/lib/whatsapp/janela";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Agendar uma mensagem avulsa pra um contato ("mandar amanhã 9h").
//
// Dois jeitos de abrir: da conversa (o destino já é aquela conversa) ou da
// ficha do negócio (a tela busca os canais em que os contatos do negócio já
// falaram com algum agente). A regra da janela de 24h roda aqui ao vivo, com
// a hora escolhida — e de novo no servidor, ao salvar e na hora de enviar.
// ---------------------------------------------------------------------------

export interface DestinoDeAgendamento {
  agentId: string;
  agentName?: string;
  channel: string;
  /** Conversation.contactId / ContactChannel.externalId */
  to: string;
  lastContactMessageAt: string | null;
  contactId?: string | null;
  contactName?: string;
}

interface Agendada {
  id: string;
  channel: string;
  to: string;
  text: string;
  status: string;
  scheduledAt: string | null;
  lastError: string | null;
  failedCount: number;
  agentName: string;
}

const CANAL: Record<string, string> = {
  whatsapp_meta: "WhatsApp oficial",
  whatsapp_qr: "WhatsApp (QR)",
  telegram: "Telegram",
};

const chave = (d: DestinoDeAgendamento) => `${d.agentId}|${d.channel}|${d.to}`;

/** Botão + modal. Use `destino` (conversa) ou `contatos` (ficha do negócio). */
export function AgendarMensagem({
  destino,
  contatos,
  dealId,
  rotulo = "Agendar mensagem",
  variante = "secondary",
  className,
}: {
  destino?: DestinoDeAgendamento;
  contatos?: { id: string; name: string }[];
  dealId?: string;
  rotulo?: string;
  variante?: "secondary" | "ghost";
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" variant={variante} onClick={() => setAberto(true)} className={className}>
        <CalendarClock size={14} aria-hidden /> {rotulo}
      </Button>
      {aberto && (
        <ModalAgendar destino={destino} contatos={contatos} dealId={dealId} onFechar={() => setAberto(false)} />
      )}
    </>
  );
}

function ModalAgendar({
  destino,
  contatos,
  dealId,
  onFechar,
}: {
  destino?: DestinoDeAgendamento;
  contatos?: { id: string; name: string }[];
  dealId?: string;
  onFechar: () => void;
}) {
  const [destinos, setDestinos] = React.useState<DestinoDeAgendamento[] | null>(destino ? [destino] : null);
  const [escolhido, setEscolhido] = React.useState<string>(destino ? chave(destino) : "");
  const [modelos, setModelos] = React.useState<MessageTemplate[]>([]);
  const [quando, setQuando] = React.useState(() => paraCampoSaoPaulo(amanhaAs(9)));
  const [texto, setTexto] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [agendadas, setAgendadas] = React.useState<Agendada[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const atual = destinos?.find((d) => chave(d) === escolhido) ?? null;
  const ehMeta = atual?.channel === "whatsapp_meta";
  const idsDosContatos = (contatos ?? []).map((c) => c.id).join(",");

  // Destinos: da ficha do negócio, os canais de cada contato.
  React.useEffect(() => {
    if (destino || !idsDosContatos) return;
    let vivo = true;
    (async () => {
      const lista: DestinoDeAgendamento[] = [];
      for (const c of contatos ?? []) {
        const res = await fetch(`/api/mensagens-agendadas/destinos?contactId=${encodeURIComponent(c.id)}`);
        if (!res.ok) continue;
        const data = await res.json();
        for (const d of data.destinos ?? []) lista.push({ ...d, contactId: c.id, contactName: c.name });
      }
      if (!vivo) return;
      setDestinos(lista);
      if (lista[0]) setEscolhido(chave(lista[0]));
    })();
    return () => { vivo = false; };
    // contatos entra pela chave estável idsDosContatos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino, idsDosContatos]);

  React.useEffect(() => {
    if (!atual?.agentId) return;
    listTemplates(atual.agentId)
      .then((l) => setModelos(l.filter((m) => m.metaTemplateName)))
      .catch(() => setModelos([]));
  }, [atual?.agentId]);

  const buscarAgendadas = React.useCallback(async (): Promise<Agendada[]> => {
    const q = new URLSearchParams();
    if (dealId) q.set("dealId", dealId);
    else if (destino?.contactId) q.set("contactId", destino.contactId);
    if (destino) {
      q.set("agentId", destino.agentId);
      q.set("channel", destino.channel);
      q.set("to", destino.to);
    }
    const res = await fetch(`/api/mensagens-agendadas?${q.toString()}`);
    return res.ok ? ((await res.json()).agendadas ?? []) : [];
  }, [dealId, destino]);

  const carregarAgendadas = React.useCallback(async () => {
    setAgendadas(await buscarAgendadas());
  }, [buscarAgendadas]);

  React.useEffect(() => {
    let vivo = true;
    buscarAgendadas().then((l) => vivo && setAgendadas(l)).catch(() => {});
    return () => { vivo = false; };
  }, [buscarAgendadas]);

  const instante = deSaoPaulo(quando);
  const decisao =
    atual && instante
      ? decidirEnvio({
          channel: atual.channel,
          lastContactMessageAt: atual.lastContactMessageAt ? new Date(atual.lastContactMessageAt) : null,
          quando: instante,
          temTexto: !templateId && texto.trim().length > 0,
          temModelo: ehMeta && !!templateId,
        })
      : null;
  const janelaFecha =
    ehMeta && atual?.lastContactMessageAt
      ? new Date(new Date(atual.lastContactMessageAt).getTime() + 24 * 60 * 60 * 1000)
      : null;

  async function salvar() {
    if (!atual || !instante) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch("/api/mensagens-agendadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: atual.agentId,
          channel: atual.channel,
          to: atual.to,
          text: templateId ? "" : texto,
          templateId: ehMeta && templateId ? templateId : null,
          scheduledAt: instante.toISOString(),
          contactId: atual.contactId ?? null,
          dealId: dealId ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível agendar.");
      setAviso(`Agendada para ${formatarSaoPaulo(data.scheduledAt)} (horário de São Paulo).`);
      setTexto("");
      setTemplateId("");
      await carregarAgendadas();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível agendar.");
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar(id: string) {
    if (!window.confirm("Cancelar esta mensagem agendada?")) return;
    const res = await fetch(`/api/mensagens-agendadas/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErro(data.error ?? "Não foi possível cancelar.");
    await carregarAgendadas();
  }

  const proximas = agendadas.filter((a) => a.status === "scheduled");
  const passadas = agendadas.filter((a) => a.status !== "scheduled").slice(0, 5);

  return (
    <Modal open onOpenChange={(o) => !o && onFechar()}>
      <ModalContent
        title="Agendar mensagem"
        description="Sai sozinha na hora marcada, pelo canal escolhido. Dá para cancelar até a hora de sair."
        className="max-h-[92vh] max-w-xl overflow-y-auto"
      >
        <div className="flex flex-col gap-4">
          {destinos === null ? (
            <p className="text-small text-text-tertiary">Procurando os canais do contato...</p>
          ) : destinos.length === 0 ? (
            <div className="rounded-[14px] bg-raised px-4 py-4 text-small text-text-secondary">
              Nenhum contato deste negócio falou ainda por WhatsApp ou Telegram com um agente. Sem um canal, não há
              para onde mandar.
            </div>
          ) : (
            <div>
              <Label htmlFor="agendar-destino">Para</Label>
              <Select
                id="agendar-destino"
                value={escolhido}
                disabled={!!destino}
                onChange={(e) => { setEscolhido(e.target.value); setTemplateId(""); }}
              >
                {destinos.map((d) => (
                  <option key={chave(d)} value={chave(d)}>
                    {[d.contactName, CANAL[d.channel] ?? d.channel, d.agentName, d.to.replace(/@.*/, "")].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {atual && (
            <>
              <div>
                <Label htmlFor="agendar-quando">Quando</Label>
                <CampoDataSP id="agendar-quando" valor={quando} onChange={setQuando} />
              </div>

              {ehMeta && (
                <div className={cn("rounded-xl px-3.5 py-2.5 text-small", decisao && !decisao.ok ? "bg-warning-subtle text-warning" : "bg-raised text-text-secondary")}>
                  {janelaFecha
                    ? instante && janelaFecha.getTime() > instante.getTime()
                      ? <>A janela de 24h fica aberta até <strong>{formatarSaoPaulo(janelaFecha)}</strong>: na hora marcada dá para mandar texto livre.</>
                      : <>A janela de 24h fecha em <strong>{formatarSaoPaulo(janelaFecha)}</strong>, antes da hora marcada: só sai modelo aprovado pela Meta.</>
                    : "Este contato ainda não escreveu: só sai modelo aprovado pela Meta."}
                </div>
              )}

              {ehMeta && (
                <div>
                  <Label htmlFor="agendar-modelo">Modelo aprovado {decisao && !decisao.ok ? "" : <span className="font-normal text-text-tertiary">(opcional dentro da janela)</span>}</Label>
                  <Select id="agendar-modelo" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    <option value="">Sem modelo (texto livre)</option>
                    {modelos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                  {templateId && (
                    <p className="mt-1.5 whitespace-pre-wrap rounded-[14px] bg-raised px-3 py-2 text-caption text-text-secondary">
                      {modelos.find((m) => m.id === templateId)?.bodyText}
                    </p>
                  )}
                </div>
              )}

              {!templateId && (
                <div>
                  <Label htmlFor="agendar-texto">Mensagem</Label>
                  <Textarea
                    id="agendar-texto"
                    rows={4}
                    value={texto}
                    placeholder="Oi {nome}, passando para lembrar da nossa conversa de ontem."
                    onChange={(e) => setTexto(e.target.value)}
                  />
                  <p className="mt-1 text-caption text-text-tertiary">{"{nome}"} e {"{email}"} são trocados pelos dados do contato.</p>
                </div>
              )}

              {decisao && !decisao.ok && (texto.trim() || templateId) && (
                <p className="flex items-start gap-1.5 text-small text-warning">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {decisao.erro}
                </p>
              )}
              {erro && <p className="text-small text-danger">{erro}</p>}
              {aviso && <p className="text-small text-success">{aviso}</p>}

              <Button type="button" disabled={salvando || !instante || !decisao?.ok} onClick={salvar}>
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />} Agendar
              </Button>
            </>
          )}

          {(proximas.length > 0 || passadas.length > 0) && (
            <div className="border-t border-border-subtle pt-4">
              <p className="mb-2 text-small font-medium text-text-secondary">Agendadas</p>
              <div className="flex flex-col gap-1.5">
                {[...proximas, ...passadas].map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 rounded-[14px] bg-raised px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-caption text-text-tertiary">
                        {a.scheduledAt ? formatarSaoPaulo(a.scheduledAt) : ""} · {CANAL[a.channel] ?? a.channel}
                      </p>
                      <p className="line-clamp-2 text-small text-text-primary">{a.text}</p>
                      {a.status === "done" && a.failedCount > 0 && (
                        <p className="mt-0.5 flex items-center gap-1 text-caption text-danger"><XCircle size={11} /> {a.lastError ?? "Não saiu."}</p>
                      )}
                      {a.status === "done" && a.failedCount === 0 && (
                        <p className="mt-0.5 flex items-center gap-1 text-caption text-success"><CheckCircle2 size={11} /> Enviada</p>
                      )}
                      {a.status === "sending" && <p className="mt-0.5 text-caption text-text-tertiary">Enviando...</p>}
                      {a.status === "canceled" && <p className="mt-0.5 text-caption text-text-tertiary">Cancelada</p>}
                    </div>
                    {a.status === "scheduled" && (
                      <button
                        type="button"
                        onClick={() => cancelar(a.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-caption text-text-tertiary hover:bg-danger-subtle hover:text-danger"
                      >
                        <Ban size={12} /> Cancelar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
