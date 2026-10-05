"use client";

import * as React from "react";
import {
  ArrowLeft, PanelRight, Bot, UserRound, CheckCircle2, Loader2, ChevronDown, Clock, Hand, Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Balao } from "./balao";
import { Compositor, type AnexoPreparado } from "./compositor";
import { useSondagem } from "./use-sondagem";
import {
  NOME_DO_CANAL, iniciais, rotuloDoDia, tempoRestante,
  type Conversa, type Membro, type Mensagem,
} from "./tipos";

/** Junta o que chegou com o que já estava, por id, em ordem de horário. */
function juntar(atual: Mensagem[], novas: Mensagem[]): Mensagem[] {
  const mapa = new Map(atual.map((m) => [m.id, m]));
  for (const m of novas) mapa.set(m.id, m);
  return [...mapa.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Muda quando algo visível mudou (mensagem nova, tique, falha). Evita re-render à toa. */
function assinatura(l: Mensagem[]): string {
  return l.map((m) => `${m.id}:${m.entrega?.status ?? ""}:${m.entrega?.atrasada ? 1 : 0}`).join("|");
}

async function chamar(url: string, corpo?: unknown, metodo = "POST") {
  const res = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export function ConversaAberta({
  conversa, meuId, membros, onMudou, onVoltar, onAbrirCliente, className,
}: {
  conversa: Conversa;
  meuId: string;
  membros: Membro[];
  onMudou: () => void;
  onVoltar: () => void;
  onAbrirCliente: () => void;
  className?: string;
}) {
  const [mensagens, setMensagens] = React.useState<Mensagem[]>([]);
  const [carregou, setCarregou] = React.useState(false);
  const [temMais, setTemMais] = React.useState(false);
  const [carregandoMais, setCarregandoMais] = React.useState(false);
  const [novas, setNovas] = React.useState(0);
  const [acao, setAcao] = React.useState<string | null>(null);
  const [erroDeAcao, setErroDeAcao] = React.useState<string | null>(null);

  const rolagem = React.useRef<HTMLDivElement>(null);
  const grudado = React.useRef(true);
  const forcarRolagem = React.useRef(true);
  const envios = React.useRef(0);
  const idAtual = React.useRef(conversa.id);

  const rolarParaOFim = React.useCallback((suave = false) => {
    const el = rolagem.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? "smooth" : "auto" });
  }, []);

  // Trocou de conversa: começa limpo. Sem isso, as mensagens da conversa
  // anterior apareceriam por um instante dentro da nova.
  React.useEffect(() => {
    idAtual.current = conversa.id;
    setMensagens([]);
    setCarregou(false);
    setTemMais(false);
    setNovas(0);
    setErroDeAcao(null);
    grudado.current = true;
    forcarRolagem.current = true;
    void chamar(`/api/conversations/${conversa.id}/read`).then(onMudou);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa.id]);

  const carregar = React.useCallback(async () => {
    // Enquanto uma resposta está sendo enviada, não mexe na lista: o servidor
    // já gravou a mensagem, e juntá-la agora duplicaria a que ainda aparece
    // como "enviando".
    if (envios.current > 0) return;
    const id = conversa.id;
    const res = await fetch(`/api/conversations/${id}/messages?limite=60`);
    if (!res.ok || idAtual.current !== id) return;
    const dados = await res.json();
    if (idAtual.current !== id || envios.current > 0) return;

    setMensagens((atual) => {
      const proximo = juntar(atual, dados.messages as Mensagem[]);
      if (assinatura(proximo) === assinatura(atual)) return atual;

      const chegaram = proximo.filter((m) => !atual.some((a) => a.id === m.id) && m.role === "contact").length;
      if (atual.length > 0 && chegaram > 0 && !grudado.current) setNovas((n) => n + chegaram);
      return proximo;
    });
    if (!carregou) setTemMais(!!dados.temMais);
    setCarregou(true);
  }, [conversa.id, carregou]);

  useSondagem(carregar, 3000);

  // Rola pro fim quando chegou algo e a pessoa estava embaixo, ou quando ela
  // mesma enviou. Se estava lendo mensagem antiga, não puxa o chão debaixo dela.
  React.useLayoutEffect(() => {
    if (forcarRolagem.current || grudado.current) {
      rolarParaOFim();
      forcarRolagem.current = false;
    }
  }, [mensagens, rolarParaOFim]);

  // Conversa aberta e mensagem nova do cliente: marca como vista, senão o
  // contador da lista continuaria subindo com a pessoa olhando a conversa.
  React.useEffect(() => {
    if (conversa.naoLidas > 0 && document.visibilityState === "visible") {
      void chamar(`/api/conversations/${conversa.id}/read`).then(onMudou);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa.naoLidas, conversa.id]);

  function aoRolar() {
    const el = rolagem.current;
    if (!el) return;
    const colado = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    grudado.current = colado;
    if (colado && novas > 0) setNovas(0);
  }

  async function carregarAnteriores() {
    if (mensagens.length === 0) return;
    setCarregandoMais(true);
    const altura = rolagem.current?.scrollHeight ?? 0;
    const res = await fetch(`/api/conversations/${conversa.id}/messages?limite=60&antes=${encodeURIComponent(mensagens[0].createdAt)}`);
    if (res.ok) {
      const dados = await res.json();
      grudado.current = false;
      setMensagens((atual) => juntar(atual, dados.messages));
      setTemMais(!!dados.temMais);
      // Mantém o que a pessoa estava lendo no mesmo lugar da tela.
      requestAnimationFrame(() => {
        const el = rolagem.current;
        if (el) el.scrollTop = el.scrollHeight - altura;
      });
    }
    setCarregandoMais(false);
  }

  // ── envio ─────────────────────────────────────────────────────────────────
  async function enviar(p: { text?: string; templateId?: string; attachment?: AnexoPreparado }): Promise<string | null> {
    const temporaria: Mensagem = {
      id: `tmp-${Date.now()}`,
      role: "human",
      text: p.text ?? "",
      createdAt: new Date().toISOString(),
      author: { id: meuId, name: "Você" },
      media: p.attachment
        ? {
            url: p.attachment.previewUrl ?? "#",
            type: p.attachment.type,
            mime: p.attachment.mime,
            name: p.attachment.name,
            size: p.attachment.size,
          }
        : null,
      entrega: { status: "sending", erro: null, atrasada: false },
    };

    envios.current += 1;
    forcarRolagem.current = true;
    if (!p.templateId) setMensagens((l) => [...l, temporaria]);

    const r = await chamar(`/api/conversations/${conversa.id}/reply`, {
      text: p.text,
      templateId: p.templateId,
      attachment: p.attachment
        ? { path: p.attachment.path, type: p.attachment.type, mime: p.attachment.mime, name: p.attachment.name, size: p.attachment.size }
        : undefined,
    });

    envios.current -= 1;
    setMensagens((l) => {
      const semTemp = l.filter((m) => m.id !== temporaria.id);
      return r.ok ? juntar(semTemp, [r.json.message as Mensagem]) : semTemp;
    });
    forcarRolagem.current = true;
    onMudou();
    return r.ok ? null : (r.json.error ?? "Não foi possível enviar.");
  }

  async function anotar(texto: string): Promise<string | null> {
    const r = await chamar(`/api/conversations/${conversa.id}/note`, { text: texto });
    if (!r.ok) return r.json.error ?? "Não foi possível salvar a nota.";
    forcarRolagem.current = true;
    setMensagens((l) => juntar(l, [r.json.message as Mensagem]));
    return null;
  }

  async function reenviar(m: Mensagem) {
    setMensagens((l) => l.map((x) => (x.id === m.id ? { ...x, entrega: { status: "sending", erro: null, atrasada: false } } : x)));
    const r = await chamar(`/api/conversations/${conversa.id}/messages/${m.id}/retry`);
    if (r.ok) setMensagens((l) => juntar(l, [r.json.message as Mensagem]));
    else {
      setMensagens((l) =>
        l.map((x) => (x.id === m.id ? { ...x, entrega: { status: "failed", erro: r.json.error ?? "Falha no envio.", atrasada: false } } : x))
      );
    }
  }

  // ── ações da conversa ─────────────────────────────────────────────────────
  async function executar(nome: string, fn: () => Promise<{ ok: boolean; json: { error?: string } }>) {
    setAcao(nome);
    setErroDeAcao(null);
    const r = await fn();
    setAcao(null);
    if (!r.ok) setErroDeAcao(r.json.error ?? "Não foi possível concluir.");
    onMudou();
  }

  async function assumir() {
    await executar("assumir", async () => {
      let r = await chamar(`/api/conversations/${conversa.id}/take`, {});
      if (r.status === 409 && r.json.codigo === "de_outro") {
        const ok = window.confirm(`${r.json.assignedTo?.name ?? "Outra pessoa"} está atendendo esta conversa. Assumir mesmo assim?`);
        if (!ok) return { ok: true, json: {} };
        r = await chamar(`/api/conversations/${conversa.id}/take`, { forcar: true });
      }
      return r;
    });
  }

  const devolver = () => executar("devolver", () => chamar(`/api/conversations/${conversa.id}/resume`));
  const resolver = () => executar("resolver", () => chamar(`/api/conversations/${conversa.id}/close`));
  const transferir = (para: string) =>
    executar("transferir", () => chamar(`/api/conversations/${conversa.id}/assign`, { assignedToId: para || null }, "PATCH"));

  const minha = conversa.status === "human" && conversa.assignedTo?.id === meuId;
  const encerrada = conversa.status === "ended";

  // Separadores de dia.
  const blocos = React.useMemo(() => {
    const saida: ({ tipo: "dia"; rotulo: string; chave: string } | { tipo: "msg"; m: Mensagem })[] = [];
    let ultimoDia = "";
    for (const m of mensagens) {
      const dia = new Date(m.createdAt).toDateString();
      if (dia !== ultimoDia) {
        saida.push({ tipo: "dia", rotulo: rotuloDoDia(m.createdAt), chave: `d-${dia}` });
        ultimoDia = dia;
      }
      saida.push({ tipo: "msg", m });
    }
    return saida;
  }, [mensagens]);

  return (
    <section className={cn("glass-card flex min-h-0 flex-col overflow-hidden rounded-3xl", className)}>
      <header className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            aria-label="Voltar para a lista"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-2 hover:text-text-primary lg:hidden"
          >
            <ArrowLeft size={17} />
          </button>

          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12.5px] font-semibold text-text-secondary">
            {iniciais(conversa.nome) || <UserRound size={18} />}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold text-text-primary">{conversa.nome}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-text-tertiary">
              <span>{NOME_DO_CANAL[conversa.channel] ?? conversa.channel}</span>
              <span>{conversa.agentName}</span>
              {conversa.status === "waiting_human" && <span className="font-medium text-danger">Esperando atendente</span>}
              {conversa.status === "active" && (
                <span className="inline-flex items-center gap-1"><Bot size={11} /> Agente respondendo</span>
              )}
              {conversa.status === "human" && (
                <span className="inline-flex items-center gap-1 text-accent-300">
                  <UserRound size={11} /> {minha ? "Com você" : conversa.assignedTo?.name ?? "Com a equipe"}
                </span>
              )}
              {encerrada && <span>Encerrada</span>}
              {conversa.janela.restrita && !conversa.simulado && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    conversa.janela.aberta ? "text-text-tertiary" : "text-amber-300"
                  )}
                  title="Regra da Meta: fora de 24h da última mensagem do cliente, só dá para enviar modelo aprovado."
                >
                  <Clock size={11} />
                  {conversa.janela.aberta && conversa.janela.minutosRestantes !== null
                    ? `Janela: ${tempoRestante(conversa.janela.minutosRestantes)}`
                    : "Janela encerrada"}
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onAbrirCliente}
            aria-label="Ver dados do cliente"
            title="Dados do cliente"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-2 hover:text-text-primary xl:hidden"
          >
            <PanelRight size={17} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!minha && !encerrada && (
            <button
              type="button"
              onClick={assumir}
              disabled={acao !== null}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-50",
                conversa.status === "waiting_human"
                  ? "bg-accent-500 text-white hover:bg-accent-400"
                  : "bg-surface-2 text-text-primary hover:bg-surface-3"
              )}
            >
              {acao === "assumir" ? <Loader2 size={13} className="animate-spin" /> : <Hand size={13} />} Assumir
            </button>
          )}

          {(conversa.status === "human" || conversa.status === "waiting_human") && (
            <button
              type="button"
              onClick={devolver}
              disabled={acao !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary disabled:opacity-50"
            >
              {acao === "devolver" ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Devolver ao agente
            </button>
          )}

          {!encerrada && (
            <button
              type="button"
              onClick={resolver}
              disabled={acao !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary disabled:opacity-50"
            >
              {acao === "resolver" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Resolver
            </button>
          )}

          {membros.length > 1 && !encerrada && (
            <select
              value={conversa.assignedTo?.id ?? ""}
              onChange={(e) => void transferir(e.target.value)}
              disabled={acao !== null}
              aria-label="Transferir para"
              className="ml-auto rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-text-secondary outline-none disabled:opacity-50"
            >
              <option value="">Transferir para...</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>{m.isMe ? `${m.name} (você)` : m.name}</option>
              ))}
            </select>
          )}
        </div>

        {erroDeAcao && <p className="mt-2 text-[12px] text-danger">{erroDeAcao}</p>}
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={rolagem} onScroll={aoRolar} className="h-full overflow-y-auto px-4 py-4">
          {!carregou ? (
            <p className="py-10 text-center text-[13px] text-text-tertiary">Carregando mensagens...</p>
          ) : mensagens.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-text-tertiary">Ainda não há mensagens nesta conversa.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {temMais && (
                <button
                  type="button"
                  onClick={carregarAnteriores}
                  disabled={carregandoMais}
                  className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
                >
                  {carregandoMais && <Loader2 size={12} className="animate-spin" />} Mensagens anteriores
                </button>
              )}

              {blocos.map((b) =>
                b.tipo === "dia" ? (
                  <div key={b.chave} className="my-1.5 flex justify-center">
                    <span className="rounded-full bg-surface-2 px-3 py-1 text-[11px] text-text-tertiary">{b.rotulo}</span>
                  </div>
                ) : (
                  <Balao key={b.m.id} m={b.m} onReenviar={reenviar} />
                )
              )}
            </div>
          )}
        </div>

        {novas > 0 && (
          <button
            type="button"
            onClick={() => {
              rolarParaOFim(true);
              setNovas(0);
            }}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent-500 px-3.5 py-1.5 text-[12px] font-medium text-white shadow-lg transition-colors hover:bg-accent-400"
          >
            <ChevronDown size={13} /> {novas === 1 ? "1 mensagem nova" : `${novas} mensagens novas`}
          </button>
        )}
      </div>

      <Compositor conversa={conversa} meuId={meuId} onEnviar={enviar} onNota={anotar} onAssumir={assumir} />
    </section>
  );
}
