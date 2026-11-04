"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Loader2, Trash2, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { IconButton } from "@/components/ui/icon-button";
import { MarcaEva } from "@/components/layout/marca-eva";
import { cn } from "@/lib/utils";

// Chat da Eva: botão flutuante em todas as telas. Pergunta em português, a Eva
// consulta os dados do contrato (só lê) e responde. A conversa vive na tela:
// recarregar a página começa de novo.

type Mensagem = { role: "user" | "assistant"; content: string };
type Falha = { texto: string; semChave?: boolean };

const SUGESTOES = [
  "Como está o funil de vendas?",
  "Quantos leads novos tivemos nos últimos 7 dias?",
  "Quais negócios foram ganhos neste mês?",
  "Como estão as conversas de hoje?",
];
const LIMITE = 2000;

export function ChatDaEva() {
  const pathname = usePathname();
  const [aberto, setAberto] = React.useState(false);
  const [mensagens, setMensagens] = React.useState<Mensagem[]>([]);
  const [texto, setTexto] = React.useState("");
  const [carregando, setCarregando] = React.useState(false);
  const [falha, setFalha] = React.useState<Falha | null>(null);
  const botao = React.useRef<HTMLButtonElement>(null);
  const campo = React.useRef<HTMLTextAreaElement>(null);
  const fim = React.useRef<HTMLDivElement>(null);
  const pedido = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => pedido.current?.abort(), []);
  React.useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);
  React.useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens, carregando, falha]);

  function fechar() {
    setAberto(false);
    botao.current?.focus();
  }

  async function enviar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || carregando) return;
    const conversa: Mensagem[] = [...mensagens, { role: "user", content: p }];
    setMensagens(conversa);
    setTexto("");
    setFalha(null);
    setCarregando(true);
    pedido.current?.abort();
    const ctrl = (pedido.current = new AbortController());
    try {
      const res = await fetch("/api/analytics/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        // Só a tela, sem o id do contrato.
        body: JSON.stringify({ mensagens: conversa, pagina: "/" + pathname.split("/").slice(2).join("/") }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || typeof d?.resposta !== "string") {
        setFalha({ texto: d?.error ?? "Não deu certo agora. Tenta de novo em instantes.", semChave: d?.codigo === "sem_chave" });
        return;
      }
      setMensagens([...conversa, { role: "assistant", content: d.resposta }]);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFalha({ texto: "Sem conexão com o servidor. Confere a internet e tenta de novo." });
    } finally {
      if (pedido.current === ctrl) setCarregando(false);
    }
  }

  function limpar() {
    pedido.current?.abort();
    setMensagens([]);
    setFalha(null);
    setCarregando(false);
    campo.current?.focus();
  }

  return (
    <div data-print-ocultar>
      {aberto && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Conversa com a Eva"
          onKeyDown={(e) => {
            if (e.key === "Escape") fechar();
          }}
          className="fixed bottom-20 right-4 z-40 flex h-[min(34rem,calc(100dvh-7rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[22px] border border-border-subtle bg-overlay text-text-primary shadow-overlay motion-safe:animate-[ds-pop-in_var(--dur-base)_var(--ease-out)]"
        >
          <header className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
            <MarcaEva size={18} />
            <div className="min-w-0 flex-1">
              <h2 className="text-body font-semibold">Eva</h2>
              <p className="truncate text-caption text-text-tertiary">Lê os dados deste contrato. Não altera nada.</p>
            </div>
            {mensagens.length > 0 && (
              <IconButton aria-label="Limpar a conversa" size="sm" onClick={limpar} tooltip>
                <Trash2 />
              </IconButton>
            )}
            <IconButton aria-label="Fechar a conversa" size="sm" onClick={fechar}>
              <X />
            </IconButton>
          </header>

          <div role="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {mensagens.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-small text-text-secondary">Pergunte sobre o funil, os leads, as vendas, as tarefas ou as conversas. Por exemplo:</p>
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => enviar(s)}
                    className="rounded-[12px] border border-border-subtle bg-raised px-3 py-2 text-left text-small text-text-primary transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {mensagens.map((m, i) => (
              <p
                key={i}
                className={cn(
                  "max-w-[88%] whitespace-pre-wrap break-words rounded-[14px] px-3 py-2 text-small leading-relaxed",
                  m.role === "user" ? "self-end bg-accent-solid text-text-on-accent" : "self-start bg-raised text-text-primary"
                )}
              >
                {m.content}
              </p>
            ))}
            {carregando && (
              <p className="flex items-center gap-2 self-start text-small text-text-tertiary">
                <Loader2 size={14} className="animate-spin" aria-hidden /> Consultando os dados...
              </p>
            )}
            {falha && (
              <p role="alert" className="self-start rounded-[14px] bg-danger-subtle px-3 py-2 text-small text-danger">
                {falha.texto}
                {falha.semChave && (
                  <>
                    {" "}
                    <Link href="/integrations" className="underline">Abrir Integrações</Link>
                  </>
                )}
              </p>
            )}
            <div ref={fim} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-border-subtle p-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, LIMITE))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  enviar(texto);
                }
              }}
              rows={1}
              maxLength={LIMITE}
              aria-label="Pergunta para a Eva"
              placeholder="Pergunte à Eva..."
              className="max-h-28 min-h-9 flex-1 resize-none rounded-[10px] border border-border-subtle bg-raised px-3 py-2 text-small text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-solid/60 focus:ring-2 focus:ring-accent-solid/20"
            />
            <button
              type="submit"
              disabled={!texto.trim() || carregando}
              aria-label="Enviar para a Eva"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-solid text-text-on-accent transition-colors hover:bg-accent-solid-hover disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          </form>
        </section>
      )}

      <button
        ref={botao}
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        aria-label={aberto ? "Fechar a conversa com a Eva" : "Perguntar à Eva"}
        aria-expanded={aberto}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-overlay text-text-primary shadow-overlay transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-focus motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        {aberto ? <X size={20} aria-hidden /> : <MarcaEva size={22} />}
      </button>
    </div>
  );
}
