"use client";

import * as React from "react";
import { MessageCircle, Inbox } from "lucide-react";
import Link from "@/components/contrato/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatRelativeDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Aba "Conversas" da tela de Leads: as conversas do site do pipe escolhido
// (widget da Eva Holding, chat do Drawing Club...), lista à esquerda e a
// conversa inteira à direita. Só leitura: responder é na Caixa de entrada.
// ---------------------------------------------------------------------------

interface ConversaDoSite {
  id: string;
  agentName: string;
  nome: string;
  status: string;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastMessageRole: string | null;
  contato: { id: string; name: string; phone: string; email: string } | null;
}

interface Mensagem {
  id: string;
  role: string;
  text: string;
  createdAt: string;
}

const CANAL_DO_SITE = "website";
const POR_PAGINA = 100;

export function ConversasDoPipe({ agentId }: { agentId: string | null }) {
  const [conversas, setConversas] = React.useState<ConversaDoSite[] | null>(null);
  const [temMais, setTemMais] = React.useState(false);
  const [aberta, setAberta] = React.useState<string | null>(null);
  const [busca, setBusca] = React.useState("");

  const carregar = React.useCallback(async () => {
    const p = new URLSearchParams({ canal: CANAL_DO_SITE, limite: String(POR_PAGINA) });
    if (agentId) p.set("agente", agentId);
    const res = await fetch(`/api/conversations?${p}`);
    const data = res.ok ? await res.json() : { conversations: [] };
    setConversas(data.conversations ?? []);
    setTemMais(!!data.temMais);
  }, [agentId]);

  React.useEffect(() => {
    const agora = setTimeout(carregar, 0);
    const t = setInterval(carregar, 10000);
    return () => {
      clearTimeout(agora);
      clearInterval(t);
    };
  }, [carregar]);

  if (conversas === null) return <div className="flex-1" />;

  const termo = busca.trim().toLowerCase();
  const lista = termo ? conversas.filter((c) => `${c.nome} ${c.lastMessageText ?? ""} ${c.contato?.email ?? ""}`.toLowerCase().includes(termo)) : conversas;
  const selecionada = lista.find((c) => c.id === aberta) ?? lista[0] ?? null;

  if (conversas.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-default p-10 text-center">
        <Inbox size={18} className="text-text-tertiary" />
        <p className="text-[13px] text-text-secondary">Nenhuma conversa desse site ainda.</p>
        <p className="max-w-md text-[12px] text-text-tertiary">As conversas aparecem aqui assim que o site começar a mandar cada troca para o agente.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
        <div className="border-b border-border-subtle p-2.5">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas conversas..." />
          <p className="mt-1.5 px-1 text-[11px] text-text-tertiary">
            {conversas.length}{temMais ? "+" : ""} conversa{conversas.length === 1 ? "" : "s"}, as mais recentes primeiro
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {lista.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setAberta(c.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b border-border-subtle px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                selecionada?.id === c.id && "bg-surface-2"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-medium text-text-primary">{c.contato?.name || c.nome}</span>
                {c.contato && <Badge variant="neutral" className="text-[10px]">Contato</Badge>}
                <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">{formatRelativeDate(c.lastMessageAt)}</span>
              </div>
              <span className="truncate text-[12px] text-text-secondary">
                {c.lastMessageRole === "contact" ? "" : "IA: "}
                {c.lastMessageText || "—"}
              </span>
            </button>
          ))}
        </div>
      </div>
      {selecionada && <Transcricao key={selecionada.id} conversa={selecionada} />}
    </div>
  );
}

function Transcricao({ conversa }: { conversa: ConversaDoSite }) {
  const [mensagens, setMensagens] = React.useState<Mensagem[] | null>(null);
  const fim = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/conversations/${conversa.id}/messages`)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => vivo && setMensagens(data.messages ?? []))
      .catch(() => vivo && setMensagens([]));
    return () => {
      vivo = false;
    };
  }, [conversa.id, conversa.lastMessageAt]);

  React.useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-text-primary">{conversa.contato?.name || conversa.nome}</p>
          <p className="truncate text-[11.5px] text-text-tertiary">
            {conversa.agentName}
            {conversa.contato?.email ? ` · ${conversa.contato.email}` : ""}
            {conversa.contato?.phone ? ` · ${conversa.contato.phone}` : ""}
          </p>
        </div>
        <Link href={`/conversas?c=${conversa.id}`} className="flex shrink-0 items-center gap-1.5 text-[12px] text-accent-400 hover:underline">
          <MessageCircle size={13} /> Abrir na Caixa de entrada
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {mensagens === null ? null : mensagens.length === 0 ? (
          <p className="text-[12.5px] text-text-tertiary">Sem mensagens.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {mensagens.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "contact" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed shadow-sm",
                    m.role === "contact" ? "bg-accent-500 text-text-on-accent" : "border border-border-subtle bg-surface-2 text-text-primary"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={fim} />
          </div>
        )}
      </div>
    </div>
  );
}
