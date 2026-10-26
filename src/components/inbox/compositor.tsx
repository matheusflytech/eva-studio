"use client";

import * as React from "react";
import {
  Send, Paperclip, X, Lock, Bot, UserRound, FileText, Clock, MessageSquareText, AlertTriangle, Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { pulsar } from "@/lib/fundo/eventos";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";
import { cn } from "@/lib/utils";
import { tamanhoLegivel, type Conversa } from "./tipos";
import { AgendarMensagem } from "@/components/whatsapp/agendar-mensagem";
import { CANAIS_AGENDAVEIS } from "@/lib/whatsapp/janela";

export interface AnexoPreparado {
  path: string;
  type: string;
  mime: string;
  name: string;
  size: number;
  previewUrl?: string;
}

const TIPOS_ACEITOS = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "audio/wav", "audio/webm",
  "video/mp4", "video/3gpp", "video/webm",
  "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
].join(",");

const LIMITE = 16 * 1024 * 1024;

// Formato da gravação: AAC (mp4) é o que a Meta aceita e o Chrome e o Safari
// gravam; o Firefox grava ogg/opus, que o WhatsApp também aceita.
// shortcut: navegador que só grava webm manda webm, que o WhatsApp oficial recusa; converter no servidor se aparecer.
const FORMATOS_DE_GRAVACAO = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus"];
const MAX_GRAVACAO_MS = 5 * 60 * 1000;
const EXTENSAO: Record<string, string> = { "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm" };

const minutos = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Envia o arquivo direto ao storage por uma URL assinada.
 *
 * Não passa pelo servidor do app: a Vercel recusa corpo acima de 4,5 MB, e uma
 * proposta em PDF passa disso fácil. XMLHttpRequest e não fetch porque só ele
 * informa o progresso do envio, e num arquivo de 10 MB a pessoa precisa ver que
 * está andando.
 */
async function subirArquivo(
  file: File,
  aoProgredir: (pct: number) => void
): Promise<AnexoPreparado> {
  const res = await fetch("/api/conversations/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }),
  });
  const auth = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(auth.error ?? "Não foi possível enviar o arquivo.");

  await new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", auth.uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("O envio do arquivo falhou.")));
    xhr.onerror = () => reject(new Error("Sem conexão ao enviar o arquivo."));
    xhr.send(form);
  });

  return {
    path: auth.path,
    type: auth.type,
    mime: file.type,
    name: file.name,
    size: file.size,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
  };
}

function EscolherModelo({
  agentId, aberto, onFechar, onEscolher,
}: {
  agentId: string;
  aberto: boolean;
  onFechar: () => void;
  onEscolher: (t: MessageTemplate) => Promise<void>;
}) {
  const [modelos, setModelos] = React.useState<MessageTemplate[] | null>(null);
  const [enviando, setEnviando] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    listTemplates(agentId)
      .then((l) => setModelos(l.filter((m) => m.metaTemplateName)))
      .catch(() => setModelos([]));
  }, [agentId, aberto]);

  return (
    <Modal open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <ModalContent
        title="Enviar um modelo aprovado"
        description="A janela de 24h acabou. A Meta só entrega, a partir de agora, mensagens de modelo aprovado por ela."
        className="max-w-xl"
      >
        {modelos === null ? (
          <p className="py-6 text-center text-small text-text-tertiary">Carregando...</p>
        ) : modelos.length === 0 ? (
          <div className="rounded-[14px] border border-border-subtle bg-raised px-4 py-6 text-center">
            <p className="text-body font-medium text-text-primary">Nenhum modelo ligado a um template da Meta</p>
            <p className="mx-auto mt-1.5 max-w-sm text-small text-text-secondary">
              Cadastre um em Eva Studio, na aba do agente, em Modelos de mensagem, e ligue ao nome do template aprovado
              na Meta. A tela Aprovações mostra o que já foi aprovado.
            </p>
          </div>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {modelos.map((m) => (
              <div key={m.id} className="rounded-[14px] border border-border-subtle bg-raised p-4">
                <p className="text-small font-medium text-text-primary">{m.name}</p>
                <p className="mt-1 whitespace-pre-wrap text-small leading-relaxed text-text-secondary">{m.bodyText}</p>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={enviando !== null}
                  loading={enviando === m.id}
                  onClick={async () => {
                    setEnviando(m.id);
                    await onEscolher(m);
                    setEnviando(null);
                  }}
                  className="mt-3"
                >
                  Enviar este modelo
                </Button>
              </div>
            ))}
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}

export function Compositor({
  conversa, meuId, onEnviar, onNota, onAssumir,
}: {
  conversa: Conversa;
  meuId: string;
  onEnviar: (p: { text?: string; templateId?: string; attachment?: AnexoPreparado }) => Promise<string | null>;
  onNota: (text: string) => Promise<string | null>;
  onAssumir: () => Promise<void>;
}) {
  const [modo, setModo] = React.useState<"responder" | "nota">("responder");
  const [texto, setTexto] = React.useState("");
  const [anexo, setAnexo] = React.useState<AnexoPreparado | null>(null);
  const [subindo, setSubindo] = React.useState<{ nome: string; pct: number } | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [modelosAbertos, setModelosAbertos] = React.useState(false);
  const campo = React.useRef<HTMLTextAreaElement>(null);
  const arquivo = React.useRef<HTMLInputElement>(null);
  const botaoEnviar = React.useRef<HTMLButtonElement>(null);
  const [gravando, setGravando] = React.useState<number | null>(null);
  const [agora, setAgora] = React.useState(0);
  const gravador = React.useRef<{ mr: MediaRecorder; cancelado: boolean; limite: ReturnType<typeof setTimeout> } | null>(null);
  // Lido depois de montar: no servidor não existe microfone, e o HTML tem de bater.
  const [podeGravar, setPodeGravar] = React.useState(false);
  React.useEffect(() => setPodeGravar(!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"), []);

  // Cada conversa tem o seu rascunho: trocar de conversa não pode levar o que
  // estava sendo escrito para outro cliente.
  React.useEffect(() => {
    setTexto("");
    setAnexo(null);
    setErro(null);
    setModo("responder");
    return () => pararGravacao(true);
  }, [conversa.id]);

  React.useEffect(() => {
    if (gravando === null) return;
    const t = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [gravando]);

  /** Grava como no WhatsApp: toca no microfone, fala, toca em enviar (ou cancela). */
  async function gravar() {
    setErro(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setErro("Sem acesso ao microfone. Libere o microfone para este site no navegador.");
    }
    const formato = FORMATOS_DE_GRAVACAO.find((f) => MediaRecorder.isTypeSupported(f));
    const mr = new MediaRecorder(stream, formato ? { mimeType: formato } : undefined);
    const partes: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && partes.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const atual = gravador.current;
      gravador.current = null;
      setGravando(null);
      if (!atual || atual.cancelado || partes.length === 0) return;
      const mime = (mr.mimeType || formato || "audio/webm").split(";")[0];
      const file = new File(partes, `audio-${Date.now()}.${EXTENSAO[mime] ?? "webm"}`, { type: mime });
      setSubindo({ nome: "Áudio", pct: 0 });
      try {
        const preparado = await subirArquivo(file, (pct) => setSubindo({ nome: "Áudio", pct }));
        setSubindo(null);
        setEnviando(true);
        const falha = await onEnviar({ attachment: preparado });
        setEnviando(false);
        if (falha) setErro(falha);
        else pulsar(botaoEnviar.current, 1.2);
      } catch (err) {
        setSubindo(null);
        setErro(err instanceof Error ? err.message : "Não foi possível enviar o áudio.");
      }
    };
    gravador.current = { mr, cancelado: false, limite: setTimeout(() => pararGravacao(false), MAX_GRAVACAO_MS) };
    mr.start();
    setAgora(Date.now());
    setGravando(Date.now());
  }

  function pararGravacao(cancelar: boolean) {
    const g = gravador.current;
    if (!g) return;
    clearTimeout(g.limite);
    g.cancelado = cancelar;
    if (g.mr.state !== "inactive") g.mr.stop();
  }

  React.useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto, modo]);

  const deOutro = conversa.status === "human" && !!conversa.assignedTo && conversa.assignedTo.id !== meuId;
  const semCanal = !conversa.respondivel && !conversa.simulado;
  const janelaFechada = conversa.janela.restrita && !conversa.janela.aberta && !conversa.simulado;
  const podeModelo = conversa.channel === "whatsapp_meta";
  // Trava: só escreve para o cliente quem assumiu a conversa. Enquanto ela está
  // com o agente (ou esperando alguém), o campo fica fechado até clicar em Assumir.
  const precisaAssumir =
    !conversa.simulado && !deOutro && !semCanal && !(conversa.status === "human" && conversa.assignedTo?.id === meuId);
  const respostaBloqueada = modo === "responder" && (deOutro || semCanal || janelaFechada || precisaAssumir);
  const podeAgendar = !conversa.simulado && conversa.respondivel && CANAIS_AGENDAVEIS.has(conversa.channel);

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErro(null);
    if (file.size > LIMITE) return setErro("O arquivo precisa ter até 16 MB.");
    if (!TIPOS_ACEITOS.split(",").includes(file.type)) {
      return setErro("Este tipo de arquivo não é aceito. Use imagem, áudio, vídeo, PDF ou documento do Office.");
    }
    setSubindo({ nome: file.name, pct: 0 });
    try {
      setAnexo(await subirArquivo(file, (pct) => setSubindo({ nome: file.name, pct })));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar o arquivo.");
    } finally {
      setSubindo(null);
    }
  }

  const podeEnviar =
    !enviando && !subindo && !respostaBloqueada && (modo === "nota" ? texto.trim().length > 0 : texto.trim().length > 0 || !!anexo);

  async function enviar() {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(null);

    const falha =
      modo === "nota"
        ? await onNota(texto.trim())
        : await onEnviar({ text: texto.trim() || undefined, attachment: anexo ?? undefined });

    setEnviando(false);
    if (falha) {
      setErro(falha);
      return;
    }
    // Mensagem saiu: a onda no fundo parte do botão. Nota interna não sai
    // para ninguém, então fica quieta.
    if (modo === "responder") pulsar(botaoEnviar.current, 1.2);
    setTexto("");
    setAnexo(null);
    campo.current?.focus();
  }

  return (
    <div className="shrink-0 border-t border-border-subtle px-3.5 pb-3 pt-2.5">
      {/* Por que está bloqueado, dito com todas as letras, e o que fazer. */}
      {modo === "responder" && deOutro && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-warning-subtle px-3.5 py-2.5">
          <p className="flex items-center gap-2 text-small text-warning">
            <UserRound size={14} aria-hidden="true" /> {conversa.assignedTo?.name} está atendendo esta conversa.
          </p>
          <Button variant="secondary" size="sm" onClick={onAssumir}>
            Assumir mesmo assim
          </Button>
        </div>
      )}

      {modo === "responder" && !deOutro && semCanal && (
        <div className="mb-2.5 flex items-start gap-2 rounded-[10px] bg-raised px-3.5 py-2.5 text-small text-text-secondary">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          Este canal não permite responder por aqui: a mensagem não chegaria ao cliente. Você pode deixar uma nota
          interna.
        </div>
      )}

      {modo === "responder" && !deOutro && !semCanal && janelaFechada && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-warning-subtle px-3.5 py-2.5">
          <p className="flex items-start gap-2 text-small text-warning">
            <Clock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              A janela de 24h desta conversa acabou.{" "}
              {podeModelo
                ? "Só dá para enviar um modelo aprovado pela Meta."
                : "Neste canal só dá para responder quando o cliente escrever de novo."}
            </span>
          </p>
          {podeModelo && (
            <Button variant="secondary" size="sm" onClick={() => setModelosAbertos(true)}>
              <MessageSquareText size={14} aria-hidden="true" /> Enviar modelo
            </Button>
          )}
        </div>
      )}

      {/* Regra do PR #7: só responde quem assumiu. O Assumir principal fica no
          cabeçalho; aqui ele repete, perto de onde a pessoa ia escrever. */}
      {modo === "responder" && precisaAssumir && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-raised px-3.5 py-2.5">
          <p className="flex items-center gap-2 text-small text-text-secondary">
            <Bot size={14} className="shrink-0" aria-hidden="true" />
            {conversa.status === "active"
              ? "O agente está respondendo. Assuma para escrever; ele fica em silêncio até você devolver."
              : "Assuma a conversa para responder. O agente fica em silêncio até você devolver."}
          </p>
          <Button variant="secondary" size="sm" onClick={onAssumir}>
            Assumir para responder
          </Button>
        </div>
      )}

      <div className="mb-2 flex items-center gap-4">
        {(["responder", "nota"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setModo(m); setErro(null); }}
            aria-pressed={modo === m}
            className={cn(
              "inline-flex items-center gap-1.5 text-caption font-medium transition-colors duration-120",
              modo === m
                ? m === "nota" ? "text-warning" : "text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {m === "nota" && <Lock size={12} aria-hidden="true" />}
            {m === "responder" ? "Responder" : "Nota interna"}
          </button>
        ))}
        {podeAgendar && (
          <AgendarMensagem
            rotulo="Agendar"
            variante="ghost"
            className="ml-auto h-7 px-2.5 text-small"
            destino={{
              agentId: conversa.agentId,
              agentName: conversa.agentName,
              channel: conversa.channel,
              to: conversa.contactId,
              // A janela abre na última mensagem do cliente: expiraEm - 24h.
              lastContactMessageAt: conversa.janela.expiraEm
                ? new Date(new Date(conversa.janela.expiraEm).getTime() - 24 * 60 * 60 * 1000).toISOString()
                : null,
              contactId: conversa.contato?.id ?? null,
              contactName: conversa.nome,
            }}
          />
        )}
      </div>

      {(anexo || subindo) && modo === "responder" && (
        <div className="mb-2 flex items-center gap-3 rounded-[10px] border border-border-subtle bg-raised p-2.5">
          {anexo?.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={anexo.previewUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-hover text-text-tertiary">
              <FileText size={18} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-small text-text-primary">{anexo?.name ?? subindo?.nome}</p>
            {subindo ? (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hover">
                <div className="h-1 rounded-full bg-accent-solid transition-[width] duration-[var(--dur-base)] ease-out" style={{ width: `${subindo.pct}%` }} />
              </div>
            ) : (
              <p className="text-caption text-text-tertiary">{tamanhoLegivel(anexo?.size ?? 0)}</p>
            )}
          </div>
          {anexo && !subindo && (
            <Button variant="ghost" size="icon" onClick={() => setAnexo(null)} aria-label="Remover anexo" className="h-7 w-7">
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
      )}

      {gravando !== null ? (
        <div className="flex items-center gap-2 rounded-[14px] border border-border-default bg-raised py-1.5 pl-3 pr-1.5">
          <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-danger motion-reduce:animate-none" aria-hidden="true" />
          <span className="flex-1 font-mono text-small tabular-nums text-text-primary" role="timer" aria-live="off">
            Gravando {minutos(Math.max(0, agora - gravando))}
          </span>
          <Button variant="ghost" size="icon" onClick={() => pararGravacao(true)} aria-label="Cancelar gravação" className="shrink-0">
            <X aria-hidden="true" />
          </Button>
          <Button ref={botaoEnviar} variant="primary" size="md" onClick={() => pararGravacao(false)} aria-label="Enviar áudio" className="shrink-0">
            <Send size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Enviar</span>
          </Button>
        </div>
      ) : (
      <div
        className={cn(
          "flex items-end gap-1.5 rounded-[14px] border py-1.5 pl-3 pr-1.5 transition-colors duration-120",
          modo === "nota" ? "border-warning/40 bg-warning-subtle" : "border-border-default bg-raised focus-within:border-focus",
          respostaBloqueada && "opacity-60"
        )}
      >
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // No celular o Enter do teclado virtual é "nova linha": quem manda é
            // o botão, como em qualquer app de conversa. Interceptar o Enter ali
            // faria a mensagem sair pela metade a cada quebra de linha.
            const toque = window.matchMedia?.("(pointer: coarse)").matches;
            if (!toque && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={1}
          disabled={respostaBloqueada}
          aria-label={modo === "nota" ? "Nota interna" : "Mensagem para o cliente"}
          placeholder={
            modo === "nota"
              ? "Recado para a equipe. O cliente não vê."
              : precisaAssumir
                ? "Assuma a conversa para responder"
                : respostaBloqueada
                  ? "Resposta indisponível"
                  : `Escreva para ${conversa.nome.split(" ")[0]}`
          }
          // 16px no celular: abaixo disso o iPhone dá zoom ao tocar no campo.
          className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-body-lg leading-relaxed text-text-primary outline-none placeholder:text-text-tertiary lg:text-body"
        />

        {modo === "responder" && (
          <>
            <input ref={arquivo} type="file" accept={TIPOS_ACEITOS} onChange={aoEscolherArquivo} className="hidden" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => arquivo.current?.click()}
              disabled={respostaBloqueada || !!subindo}
              aria-label="Anexar arquivo"
              title="Anexar foto, áudio, vídeo ou documento"
              className="shrink-0"
            >
              <Paperclip aria-hidden="true" />
            </Button>
          </>
        )}

        {/* Campo vazio: o microfone ocupa o lugar do enviar, como no WhatsApp. */}
        {modo === "responder" && podeGravar && !texto.trim() && !anexo && !enviando ? (
          <Button
            variant="primary"
            size="md"
            onClick={() => void gravar()}
            disabled={respostaBloqueada || !!subindo}
            aria-label="Gravar áudio"
            title="Gravar áudio"
            className="shrink-0"
          >
            <Mic size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Áudio</span>
          </Button>
        ) : (
        <Button
          ref={botaoEnviar}
          variant="primary"
          size="md"
          onClick={() => void enviar()}
          disabled={!podeEnviar}
          loading={enviando}
          aria-label={modo === "nota" ? "Salvar nota" : "Enviar mensagem"}
          className="shrink-0"
        >
          {!enviando && <Send size={14} aria-hidden="true" />}
          <span className="hidden sm:inline">{modo === "nota" ? "Salvar" : "Enviar"}</span>
        </Button>
        )}
      </div>
      )}

      {erro && <p className="mt-2 px-1 text-caption text-danger">{erro}</p>}

      <p className="mt-1.5 hidden px-1 text-caption text-text-tertiary [@media(pointer:fine)]:block">
        Enter envia. Shift+Enter quebra a linha.
      </p>

      <EscolherModelo
        agentId={conversa.agentId}
        aberto={modelosAbertos}
        onFechar={() => setModelosAbertos(false)}
        onEscolher={async (m) => {
          const falha = await onEnviar({ templateId: m.id });
          if (falha) setErro(falha);
          else {
            pulsar(botaoEnviar.current, 1.2);
            setModelosAbertos(false);
          }
        }}
      />
    </div>
  );
}
