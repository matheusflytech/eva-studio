"use client";

import * as React from "react";
import { MessageCircle, Inbox } from "lucide-react";
import Link from "@/components/contrato/link";
import { SearchInput } from "@/components/ui/search-input";
import { AvatarDoContato } from "@/components/inbox/avatar";
import { horaCurta, horaDaMensagem } from "@/components/inbox/tipos";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Aba "Conversas" da tela de Leads: as conversas do site do pipe escolhido
// (widget da Eva Holding, chat do Drawing Club...), lista à esquerda e a
// conversa inteira à direita. Só leitura: responder é na Caixa de entrada.
// Linha e bolhas seguem a Caixa de entrada, para a mesma conversa parecer a
// mesma nos dois lugares.
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

// Mesmo prefixo da prévia da Caixa de entrada.
function prefixoDaPrevia(papel: string | null): string {
  if (papel === "human") return "Você: ";
  if (papel === "contact") return "";
  return "Agente: ";
}

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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
        <Inbox size={20} className="text-text-tertiary" aria-hidden="true" />
        <p className="text-body font-medium text-text-primary">Nenhuma conversa desse site ainda.</p>
        <p className="max-w-md text-caption text-text-tertiary">As conversas aparecem aqui assim que o site começar a mandar cada troca para o agente.</p>
      </div>
    );
  }

  return (
    // Uma superfície só: lista e conversa no mesmo painel, separadas por linha.
    <div className="mt-2 flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-panel">
      <div className="flex w-[300px] shrink-0 flex-col border-r border-border-subtle">
        <div className="flex flex-col gap-1.5 border-b border-border-subtle p-2.5">
          <SearchInput value={busca} onValueChange={setBusca} placeholder="Buscar nas conversas" aria-label="Buscar nas conversas" />
          <p className="px-1 font-mono text-caption text-text-tertiary">
            {conversas.length}{temMais ? "+" : ""} conversa{conversas.length === 1 ? "" : "s"}, as mais recentes primeiro
          </p>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {lista.map((c) => {
            const nome = c.contato?.name || c.nome;
            const ativa = selecionada?.id === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setAberta(c.id)}
                  aria-current={ativa ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-border-subtle px-3 py-2.5 text-left transition-colors duration-120",
                    ativa ? "bg-accent-subtle" : "hover:bg-hover"
                  )}
                >
                  <AvatarDoContato chave={c.contato?.id ?? c.id} nome={nome} className="mt-0.5" />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-body font-medium text-text-primary">{nome}</span>
                      <span className="ml-auto shrink-0 text-caption tabular-nums text-text-tertiary">{horaCurta(c.lastMessageAt)}</span>
                    </span>
                    <span className="truncate text-small text-text-tertiary">
                      {c.lastMessageText ? `${prefixoDaPrevia(c.lastMessageRole)}${c.lastMessageText}` : "Sem mensagens"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {selecionada && <Transcricao key={selecionada.id} conversa={selecionada} />}
    </div>
  );
}

function Transcricao({ conversa }: { conversa: ConversaDoSite }) {
  const [mensagens, setMensagens] = React.useState<Mensagem[] | null>(null);
  const fim = React.useRef<HTMLDivElement>(null);
  const nome = conversa.contato?.name || conversa.nome;

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
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border-subtle px-4">
        <AvatarDoContato chave={conversa.contato?.id ?? conversa.id} nome={nome} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-text-primary">{nome}</p>
          <p className="truncate text-caption text-text-tertiary">
            {conversa.agentName}
            {conversa.contato ? " · contato salvo" : ""}
            {conversa.contato?.email ? ` · ${conversa.contato.email}` : ""}
            {conversa.contato?.phone ? ` · ${conversa.contato.phone}` : ""}
          </p>
        </div>
        <Link href={`/conversations?c=${conversa.id}`} className="flex shrink-0 items-center gap-1.5 text-small text-accent-fg hover:underline">
          <MessageCircle size={14} aria-hidden="true" /> Abrir na Caixa de entrada
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {mensagens === null ? null : mensagens.length === 0 ? (
          <p className="text-small text-text-tertiary">Sem mensagens.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {mensagens.map((m) => {
              // Cliente à esquerda, agente/atendente à direita (como na Caixa de entrada).
              const doContato = m.role === "contact";
              return (
                <div key={m.id} className={cn("flex flex-col", doContato ? "items-start" : "items-end")}>
                  <div
                    className={cn(
                      "max-w-[78%] rounded-[18px] px-3.5 py-2 lg:max-w-[66%]",
                      doContato
                        ? "rounded-bl-md border border-border-subtle bg-raised text-text-primary"
                        : "rounded-br-md bg-accent-solid text-text-on-accent"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-body leading-relaxed">{m.text}</p>
                    <p className={cn("mt-0.5 text-right font-mono text-caption tabular-nums", doContato ? "text-text-tertiary" : "text-text-on-accent/70")}>
                      {horaDaMensagem(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={fim} />
          </div>
        )}
      </div>
    </div>
  );
}
