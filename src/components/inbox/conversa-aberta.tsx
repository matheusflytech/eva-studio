"use client";

import * as React from "react";
import {
  ArrowLeft, PanelRight, Bot, UserRound, CheckCircle2, Loader2, ChevronDown, Clock, Hand, Undo2, MoreHorizontal, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { avisarNaIlha } from "@/lib/fundo/eventos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AvatarDoContato } from "./avatar";
import { Balao } from "./balao";
import { Compositor, type AnexoPreparado } from "./compositor";
import { useSondagem } from "./use-sondagem";
import {
  NOME_DO_CANAL, minutosDesde, rotuloDoDia, tempoRestante,
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

/** "Esperando há 4 min". Conta da última mensagem, que é quando o agente passou a conversa. */
function tempoDeEspera(iso: string): string {
  const m = minutosDesde(iso);
  if (m < 1) return "Esperando agora";
  if (m >= 24 * 60) return `Esperando há ${Math.floor(m / (24 * 60))} d`;
  return `Esperando há ${tempoRestante(m)}`;
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
    // Só avisa quando assumiu de fato: "cancelar" no confirm também volta ok.
    let assumiu = false;
    await executar("assumir", async () => {
      let r = await chamar(`/api/conversations/${conversa.id}/take`, {});
      if (r.status === 409 && r.json.codigo === "de_outro") {
        const ok = window.confirm(`${r.json.assignedTo?.name ?? "Outra pessoa"} está atendendo esta conversa. Assumir mesmo assim?`);
        if (!ok) return { ok: true, json: {} };
        r = await chamar(`/api/conversations/${conversa.id}/take`, { forcar: true });
      }
      assumiu = r.ok;
      return r;
    });
    if (assumiu) avisarNaIlha({ titulo: "Você assumiu a conversa", detalhe: conversa.nome });
  }

  const devolver = () => executar("devolver", () => chamar(`/api/conversations/${conversa.id}/resume`));
  const resolver = () => executar("resolver", () => chamar(`/api/conversations/${conversa.id}/close`));
  const transferir = (para: string) =>
    executar("transferir", () => chamar(`/api/conversations/${conversa.id}/assign`, { assignedToId: para || null }, "PATCH"));

  const minha = conversa.status === "human" && conversa.assignedTo?.id === meuId;
  const encerrada = conversa.status === "ended";

  // Separadores de dia, e quem leva rótulo: só o primeiro balão de uma
  // sequência do mesmo autor (como no WhatsApp), para não repetir "Agente de IA".
  const blocos = React.useMemo(() => {
    const saida: ({ tipo: "dia"; rotulo: string; chave: string } | { tipo: "msg"; m: Mensagem; mostrarAutor: boolean })[] = [];
    let ultimoDia = "";
    let anterior: Mensagem | null = null;
    for (const m of mensagens) {
      const dia = new Date(m.createdAt).toDateString();
      if (dia !== ultimoDia) {
        saida.push({ tipo: "dia", rotulo: rotuloDoDia(m.createdAt), chave: `d-${dia}` });
        ultimoDia = dia;
        anterior = null;
      }
      const mesmoAutor = !!anterior && anterior.role === m.role && (anterior.author?.id ?? "") === (m.author?.id ?? "");
      saida.push({ tipo: "msg", m, mostrarAutor: !mesmoAutor });
      anterior = m;
    }
    return saida;
  }, [mensagens]);

  const podeDevolver = conversa.status === "human" || conversa.status === "waiting_human";
  const podeTransferir = membros.length > 1 && !encerrada;

  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border-subtle px-3.5">
        <Button variant="ghost" size="icon" onClick={onVoltar} aria-label="Voltar para a lista" className="-ml-1.5 shrink-0 lg:hidden">
          <ArrowLeft aria-hidden="true" />
        </Button>

        <AvatarDoContato chave={conversa.contactId} nome={conversa.nome} tamanho="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-text-primary">{conversa.nome}</p>
          <p className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-caption text-text-tertiary">
            {conversa.status === "waiting_human" && (
              <Badge variant="danger" dot>{tempoDeEspera(conversa.lastMessageAt)}</Badge>
            )}
            {conversa.status === "active" && (
              <span className="inline-flex shrink-0 items-center gap-1"><Bot size={12} aria-hidden="true" /> Agente respondendo</span>
            )}
            {conversa.status === "human" && (
              <span className="inline-flex shrink-0 items-center gap-1 text-text-secondary">
                <UserRound size={12} aria-hidden="true" /> {minha ? "Com você" : conversa.assignedTo?.name ?? "Com a equipe"}
              </span>
            )}
            {encerrada && <span className="shrink-0">Encerrada</span>}
            <span className="truncate">
              {NOME_DO_CANAL[conversa.channel] ?? conversa.channel} · {conversa.agentName}
            </span>
            {conversa.janela.restrita && !conversa.simulado && (
              <span
                className={cn("inline-flex shrink-0 items-center gap-1", !conversa.janela.aberta && "text-warning")}
                title="Regra da Meta: fora de 24h da última mensagem do cliente, só dá para enviar modelo aprovado."
              >
                <Clock size={12} aria-hidden="true" />
                {conversa.janela.aberta && conversa.janela.minutosRestantes !== null
                  ? `Janela: ${tempoRestante(conversa.janela.minutosRestantes)}`
                  : "Janela encerrada"}
              </span>
            )}
          </p>
        </div>

        {/* Uma ação principal (Assumir), Resolver como ícone, o resto no "…". */}
        <div className="flex shrink-0 items-center gap-1.5">
          {!minha && !encerrada && (
            <Button variant="primary" size="md" onClick={assumir} disabled={acao !== null} loading={acao === "assumir"}>
              {acao !== "assumir" && <Hand size={14} aria-hidden="true" />} Assumir
            </Button>
          )}

          {!encerrada && (
            <Button
              variant="secondary"
              size="icon"
              onClick={resolver}
              disabled={acao !== null}
              aria-label="Resolver conversa"
              title="Resolver"
            >
              {acao === "resolver" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onAbrirCliente}
            aria-label="Ver dados do cliente"
            title="Dados do cliente"
            className="xl:hidden"
          >
            <PanelRight aria-hidden="true" />
          </Button>

          {(podeDevolver || podeTransferir) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mais ações da conversa" disabled={acao !== null}>
                  {acao === "devolver" || acao === "transferir"
                    ? <Loader2 className="animate-spin" aria-hidden="true" />
                    : <MoreHorizontal aria-hidden="true" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[230px]">
                {podeDevolver && (
                  <DropdownMenuItem onSelect={() => void devolver()}>
                    <Undo2 aria-hidden="true" /> Devolver ao agente
                  </DropdownMenuItem>
                )}
                {podeDevolver && podeTransferir && <DropdownMenuSeparator />}
                {podeTransferir && (
                  <>
                    <DropdownMenuLabel>Transferir para</DropdownMenuLabel>
                    {membros.map((m) => {
                      const atual = conversa.assignedTo?.id === m.id;
                      return (
                        <DropdownMenuItem key={m.id} onSelect={() => { if (!atual) void transferir(m.id); }}>
                          <span className="min-w-0 flex-1 truncate">{m.isMe ? `${m.name} (você)` : m.name}</span>
                          {atual && <Check className="text-accent-fg!" aria-label="Responsável atual" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {erroDeAcao && (
        <p className="shrink-0 border-b border-border-subtle bg-danger-subtle px-4 py-2 text-caption text-danger">{erroDeAcao}</p>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={rolagem} onScroll={aoRolar} className="h-full overflow-y-auto px-4 py-4 lg:px-5">
          {!carregou ? (
            <p className="py-10 text-center text-small text-text-tertiary">Carregando mensagens...</p>
          ) : mensagens.length === 0 ? (
            <p className="py-10 text-center text-small text-text-tertiary">Ainda não há mensagens nesta conversa.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {temMais && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={carregarAnteriores}
                  loading={carregandoMais}
                  className="mx-auto mb-2"
                >
                  Mensagens anteriores
                </Button>
              )}

              {blocos.map((b) =>
                b.tipo === "dia" ? (
                  <p key={b.chave} className="mb-1 mt-2 text-center text-caption text-text-tertiary">{b.rotulo}</p>
                ) : (
                  <Balao key={b.m.id} m={b.m} mostrarAutor={b.mostrarAutor} onReenviar={reenviar} />
                )
              )}
            </div>
          )}
        </div>

        {novas > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              rolarParaOFim(true);
              setNovas(0);
            }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-overlay"
          >
            <ChevronDown size={14} aria-hidden="true" /> {novas === 1 ? "1 mensagem nova" : `${novas} mensagens novas`}
          </Button>
        )}
      </div>

      <Compositor conversa={conversa} meuId={meuId} onEnviar={enviar} onNota={anotar} onAssumir={assumir} />
    </section>
  );
}
