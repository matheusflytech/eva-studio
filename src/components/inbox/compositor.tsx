"use client";

import * as React from "react";
import {
  Send, Paperclip, X, Loader2, Lock, Bot, UserRound, FileText, Clock, MessageSquareText, AlertTriangle,
} from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";
import { cn } from "@/lib/utils";
import { tamanhoLegivel, type Conversa } from "./tipos";

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
          <p className="py-6 text-center text-[13px] text-text-tertiary">Carregando...</p>
        ) : modelos.length === 0 ? (
          <div className="rounded-2xl bg-surface-2 px-4 py-6 text-center">
            <p className="text-[13.5px] font-medium text-text-primary">Nenhum modelo ligado a um template da Meta</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] text-text-secondary">
              Cadastre um em Eva Studio, na aba do agente, em Modelos de mensagem, e ligue ao nome do template aprovado
              na Meta. A tela Aprovações mostra o que já foi aprovado.
            </p>
          </div>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {modelos.map((m) => (
              <div key={m.id} className="rounded-2xl bg-surface-2 p-4">
                <p className="text-[13px] font-medium text-text-primary">{m.name}</p>
                <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-text-secondary">{m.bodyText}</p>
                <button
                  type="button"
                  disabled={enviando !== null}
                  onClick={async () => {
                    setEnviando(m.id);
                    await onEscolher(m);
                    setEnviando(null);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-400 disabled:opacity-50"
                >
                  {enviando === m.id && <Loader2 size={12} className="animate-spin" />} Enviar este modelo
                </button>
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

  // Cada conversa tem o seu rascunho: trocar de conversa não pode levar o que
  // estava sendo escrito para outro cliente.
  React.useEffect(() => {
    setTexto("");
    setAnexo(null);
    setErro(null);
    setModo("responder");
  }, [conversa.id]);

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
  const respostaBloqueada = modo === "responder" && (deOutro || semCanal || janelaFechada);

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
    setTexto("");
    setAnexo(null);
    campo.current?.focus();
  }

  return (
    <div className="border-t border-border-subtle p-3">
      {/* Por que está bloqueado, dito com todas as letras, e o que fazer. */}
      {modo === "responder" && deOutro && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-400/10 px-3.5 py-2.5">
          <p className="flex items-center gap-2 text-[12.5px] text-amber-200">
            <UserRound size={14} /> {conversa.assignedTo?.name} está atendendo esta conversa.
          </p>
          <button
            type="button"
            onClick={onAssumir}
            className="rounded-lg bg-amber-400/20 px-2.5 py-1 text-[12px] font-medium text-amber-200 transition-colors hover:bg-amber-400/30"
          >
            Assumir mesmo assim
          </button>
        </div>
      )}

      {modo === "responder" && !deOutro && semCanal && (
        <div className="mb-2.5 flex items-start gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-text-secondary">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
          Este canal não permite responder por aqui: a mensagem não chegaria ao cliente. Você pode deixar uma nota
          interna.
        </div>
      )}

      {modo === "responder" && !deOutro && !semCanal && janelaFechada && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-400/10 px-3.5 py-2.5">
          <p className="flex items-start gap-2 text-[12.5px] text-amber-200">
            <Clock size={14} className="mt-0.5 shrink-0" />
            <span>
              A janela de 24h desta conversa acabou.{" "}
              {podeModelo
                ? "Só dá para enviar um modelo aprovado pela Meta."
                : "Neste canal só dá para responder quando o cliente escrever de novo."}
            </span>
          </p>
          {podeModelo && (
            <button
              type="button"
              onClick={() => setModelosAbertos(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/20 px-2.5 py-1 text-[12px] font-medium text-amber-200 transition-colors hover:bg-amber-400/30"
            >
              <MessageSquareText size={12} /> Enviar modelo
            </button>
          )}
        </div>
      )}

      {modo === "responder" && !deOutro && !semCanal && !janelaFechada && conversa.status === "active" && (
        <p className="mb-2 flex items-center gap-1.5 px-1 text-[11.5px] text-text-tertiary">
          <Bot size={12} /> O agente está respondendo. Ao enviar, você assume a conversa e ele fica em silêncio.
        </p>
      )}

      <div className="mb-2 flex items-center gap-1">
        {(["responder", "nota"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setModo(m); setErro(null); }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              modo === m
                ? m === "nota"
                  ? "bg-amber-400/15 text-amber-300"
                  : "bg-surface-3 text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {m === "nota" && <Lock size={11} />}
            {m === "responder" ? "Responder" : "Nota interna"}
          </button>
        ))}
      </div>

      {(anexo || subindo) && modo === "responder" && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-2 p-2.5">
          {anexo?.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={anexo.previewUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-tertiary">
              <FileText size={18} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] text-text-primary">{anexo?.name ?? subindo?.nome}</p>
            {subindo ? (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-1 rounded-full bg-accent-500 transition-all" style={{ width: `${subindo.pct}%` }} />
              </div>
            ) : (
              <p className="text-[11px] text-text-tertiary">{tamanhoLegivel(anexo?.size ?? 0)}</p>
            )}
          </div>
          {anexo && !subindo && (
            <button
              type="button"
              onClick={() => setAnexo(null)}
              aria-label="Remover anexo"
              className="rounded-md p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl px-3 py-2 transition-colors",
          modo === "nota" ? "bg-amber-400/8 ring-1 ring-amber-400/25" : "bg-surface-2",
          respostaBloqueada && "opacity-60"
        )}
      >
        {modo === "responder" && (
          <>
            <input ref={arquivo} type="file" accept={TIPOS_ACEITOS} onChange={aoEscolherArquivo} className="hidden" />
            <button
              type="button"
              onClick={() => arquivo.current?.click()}
              disabled={respostaBloqueada || !!subindo}
              aria-label="Anexar arquivo"
              title="Anexar foto, áudio, vídeo ou documento"
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-3 hover:text-text-primary disabled:pointer-events-none"
            >
              <Paperclip size={16} />
            </button>
          </>
        )}

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
          placeholder={
            modo === "nota"
              ? "Recado para a equipe. O cliente não vê."
              : respostaBloqueada
                ? "Resposta indisponível"
                : "Escreva uma mensagem"
          }
          className="max-h-40 min-h-[34px] flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-relaxed text-text-primary outline-none placeholder:text-text-tertiary"
        />

        <button
          type="button"
          onClick={() => void enviar()}
          disabled={!podeEnviar}
          aria-label={modo === "nota" ? "Salvar nota" : "Enviar mensagem"}
          className={cn(
            "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition-colors disabled:opacity-35",
            modo === "nota" ? "bg-amber-500 hover:bg-amber-400" : "bg-accent-500 hover:bg-accent-400"
          )}
        >
          {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>

      {erro && <p className="mt-2 px-1 text-[12px] text-danger">{erro}</p>}

      <p className="mt-1.5 hidden px-1 text-[10.5px] text-text-tertiary [@media(pointer:fine)]:block">
        Enter envia. Shift+Enter quebra a linha.
      </p>

      <EscolherModelo
        agentId={conversa.agentId}
        aberto={modelosAbertos}
        onFechar={() => setModelosAbertos(false)}
        onEscolher={async (m) => {
          const falha = await onEnviar({ templateId: m.id });
          if (falha) setErro(falha);
          else setModelosAbertos(false);
        }}
      />
    </div>
  );
}
