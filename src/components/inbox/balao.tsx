"use client";

import * as React from "react";
import {
  Check, CheckCheck, Clock, AlertCircle, RotateCw, FileText, Download, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { horaDaMensagem, tamanhoLegivel, type Mensagem } from "./tipos";
import { MarcaEva } from "@/components/layout/marca-eva";
import { OrbeDoAgente } from "@/components/agent-studio/orbe-do-agente";

/** Os tiques que todo mundo já conhece do WhatsApp. Ficam dentro do balão azul. */
function Entrega({ m, onReenviar }: { m: Mensagem; onReenviar: () => void }) {
  if (!m.entrega) return null;
  const { status, erro, atrasada } = m.entrega;

  if (status === "failed") {
    return (
      <span className="mt-1 flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1 text-caption text-danger">
          <AlertCircle size={12} aria-hidden="true" /> Não enviada
        </span>
        {erro && <span className="max-w-[260px] text-right text-caption text-danger">{erro}</span>}
        <button
          type="button"
          onClick={onReenviar}
          className="inline-flex items-center gap-1 rounded-full bg-danger-subtle px-2 py-0.5 text-caption font-medium text-danger transition-colors hover:opacity-80"
        >
          <RotateCw size={11} aria-hidden="true" /> Tentar de novo
        </button>
      </span>
    );
  }

  if (status === "sending") {
    return <Clock size={12} className="opacity-60" aria-label="Enviando" />;
  }

  if (status === "queued") {
    return (
      <span className="inline-flex items-center gap-1" title="Na fila para envio">
        <Clock size={12} className={atrasada ? "text-warning" : "opacity-60"} />
        {atrasada && (
          <span className="text-caption">Parada na fila. O WhatsApp pode estar desconectado.</span>
        )}
      </span>
    );
  }

  // No balão azul a "lida" é o tique cheio; entregue e enviada ficam apagados.
  if (status === "read") return <CheckCheck size={13} aria-label="Lida" />;
  if (status === "delivered") return <CheckCheck size={13} className="opacity-60" aria-label="Entregue" />;
  return <Check size={13} className="opacity-60" aria-label="Enviada" />;
}

function Anexo({ m, doContato }: { m: Mensagem; doContato: boolean }) {
  const md = m.media;
  if (!md) return null;

  if (md.type === "image" || md.type === "sticker") {
    return (
      <a href={md.url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={md.url}
          alt={md.name ?? "Imagem recebida"}
          loading="lazy"
          className={cn(
            "rounded-xl object-cover",
            md.type === "sticker" ? "h-28 w-28 object-contain" : "max-h-[260px] max-w-full"
          )}
        />
      </a>
    );
  }

  if (md.type === "audio") {
    return <audio controls preload="none" src={md.url} className="h-10 w-[240px] max-w-full" />;
  }

  if (md.type === "video") {
    return <video controls preload="metadata" src={md.url} className="max-h-[260px] max-w-full rounded-xl" />;
  }

  const baixar = `${md.url}&baixar=1&nome=${encodeURIComponent(md.name ?? "arquivo")}`;
  return (
    <a
      href={baixar}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-opacity hover:opacity-80",
        doContato ? "bg-hover" : "bg-text-on-accent/15"
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", doContato ? "bg-raised" : "bg-text-on-accent/10")}>
        <FileText size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-medium">{md.name ?? "Documento"}</span>
        <span className="block text-caption opacity-70">{tamanhoLegivel(md.size) || md.mime}</span>
      </span>
      <Download size={14} className="shrink-0 opacity-60" aria-hidden="true" />
    </a>
  );
}

export function Balao({
  m, onReenviar, mostrarAutor = true, agenteId,
}: {
  m: Mensagem;
  onReenviar: (m: Mensagem) => void;
  /** Só o primeiro balão de uma sequência do mesmo autor leva o rótulo. */
  mostrarAutor?: boolean;
  /** Agente da conversa: o rótulo das falas dele leva a orbe do agente. */
  agenteId?: string;
}) {
  // Nota interna: aparece na linha do tempo, mas é visualmente outra coisa. Se
  // parecesse uma mensagem, alguém acabaria achando que o cliente leu.
  if (m.role === "note") {
    return (
      <div className="mx-auto my-1 w-full max-w-[84%] rounded-[14px] border border-dashed border-warning/40 bg-warning-subtle px-4 py-2.5">
        <p className="mb-1 flex items-center gap-1.5 text-caption font-medium text-warning">
          <Lock size={12} aria-hidden="true" /> Nota interna
          {m.author && <span className="font-normal opacity-80">· {m.author.name}</span>}
          <span className="ml-auto font-mono font-normal tabular-nums opacity-70">{horaDaMensagem(m.createdAt)}</span>
        </p>
        <p className="whitespace-pre-wrap text-small leading-relaxed text-text-primary">{m.text}</p>
      </div>
    );
  }

  const doContato = m.role === "contact";
  const doAgente = m.role === "bot";
  const doAtendente = m.role === "human";

  // Qualquer outro papel é acontecimento da conversa, não fala de alguém:
  // linha centralizada, sem balão.
  if (!doContato && !doAgente && !doAtendente) {
    return (
      <p className="my-2 flex items-center justify-center gap-2 text-center text-caption text-text-tertiary">
        <span className="h-px w-10 bg-border-subtle" aria-hidden="true" />
        {m.text} · <span className="font-mono tabular-nums">{horaDaMensagem(m.createdAt)}</span>
        <span className="h-px w-10 bg-border-subtle" aria-hidden="true" />
      </p>
    );
  }

  const semTexto = !m.text || /^\[(Foto|Áudio|Vídeo|Documento|Figurinha)\]$/.test(m.text);
  const falhou = m.entrega?.status === "failed";

  return (
    <div className={cn("flex flex-col", doContato ? "items-start" : "items-end", mostrarAutor && !doContato && "mt-2")}>
      {!doContato && mostrarAutor && (
        doAgente ? (
          // A IA é marcada pela orbe do agente (ou, sem o id, pelo símbolo da Eva), não por cor.
          <span className="mb-1 inline-flex h-5 items-center gap-1 rounded-full bg-raised px-2 text-caption font-medium text-text-secondary">
            {agenteId ? <OrbeDoAgente agenteId={agenteId} tamanho={16} leve className="-ml-1" /> : <MarcaEva size={12} />}
            Agente de IA
          </span>
        ) : (
          <span className="mb-1 px-1 text-caption text-text-tertiary">{m.author?.name ?? "Atendente"}</span>
        )
      )}

      <div
        className={cn(
          "max-w-[78%] rounded-[18px] px-3.5 py-2 lg:max-w-[66%]",
          doContato
            ? "rounded-bl-md border border-border-subtle bg-raised text-text-primary"
            : "rounded-br-md bg-accent-solid text-text-on-accent",
          falhou && "ring-1 ring-danger/60"
        )}
      >
        {m.media && (
          <div className={cn(!semTexto && "mb-2")}>
            <Anexo m={m} doContato={doContato} />
          </div>
        )}
        {!semTexto && <p className="whitespace-pre-wrap break-words text-body leading-relaxed">{m.text}</p>}

        <div className={cn("mt-0.5 flex items-center justify-end gap-1.5 text-caption", doContato ? "text-text-tertiary" : "text-text-on-accent/70")}>
          <span className="font-mono tabular-nums">{horaDaMensagem(m.createdAt)}</span>
          {!doContato && !falhou && <Entrega m={m} onReenviar={() => onReenviar(m)} />}
        </div>
      </div>

      {!doContato && falhou && <Entrega m={m} onReenviar={() => onReenviar(m)} />}
    </div>
  );
}
