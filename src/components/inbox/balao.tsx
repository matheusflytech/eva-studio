"use client";

import * as React from "react";
import {
  Check, CheckCheck, Clock, AlertCircle, RotateCw, FileText, Download, Lock, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { horaDaMensagem, tamanhoLegivel, type Mensagem } from "./tipos";

/** Os tiques que todo mundo já conhece do WhatsApp. */
function Entrega({ m, onReenviar }: { m: Mensagem; onReenviar: () => void }) {
  if (!m.entrega) return null;
  const { status, erro, atrasada } = m.entrega;

  if (status === "failed") {
    return (
      <span className="mt-1 flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1 text-[11px] text-danger">
          <AlertCircle size={11} /> Não enviada
        </span>
        {erro && <span className="max-w-[260px] text-right text-[11px] leading-snug text-danger/90">{erro}</span>}
        <button
          type="button"
          onClick={onReenviar}
          className="inline-flex items-center gap-1 rounded-md bg-danger/12 px-2 py-0.5 text-[11px] font-medium text-danger transition-colors hover:bg-danger/20"
        >
          <RotateCw size={10} /> Tentar de novo
        </button>
      </span>
    );
  }

  if (status === "sending") {
    return <Clock size={11} className="text-white/55" aria-label="Enviando" />;
  }

  if (status === "queued") {
    return (
      <span className="inline-flex items-center gap-1" title="Na fila para envio">
        <Clock size={11} className={atrasada ? "text-amber-300" : "text-white/55"} />
        {atrasada && (
          <span className="text-[10.5px] text-amber-300">Parada na fila. O WhatsApp pode estar desconectado.</span>
        )}
      </span>
    );
  }

  if (status === "read") return <CheckCheck size={12} className="text-sky-300" aria-label="Lida" />;
  if (status === "delivered") return <CheckCheck size={12} className="text-white/60" aria-label="Entregue" />;
  return <Check size={12} className="text-white/60" aria-label="Enviada" />;
}

function Anexo({ m }: { m: Mensagem }) {
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
      className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2.5 transition-colors hover:bg-black/30"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <FileText size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{md.name ?? "Documento"}</span>
        <span className="block text-[11px] opacity-60">{tamanhoLegivel(md.size) || md.mime}</span>
      </span>
      <Download size={14} className="shrink-0 opacity-60" />
    </a>
  );
}

export function Balao({ m, onReenviar }: { m: Mensagem; onReenviar: (m: Mensagem) => void }) {
  // Nota interna: aparece na linha do tempo, mas é visualmente outra coisa. Se
  // parecesse uma mensagem, alguém acabaria achando que o cliente leu.
  if (m.role === "note") {
    return (
      <div className="mx-auto w-full max-w-[84%] rounded-2xl border border-dashed border-amber-400/35 bg-amber-400/8 px-4 py-2.5">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-300">
          <Lock size={11} /> Nota interna
          {m.author && <span className="font-normal text-amber-300/70">· {m.author.name}</span>}
          <span className="ml-auto font-normal text-amber-300/60">{horaDaMensagem(m.createdAt)}</span>
        </p>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">{m.text}</p>
      </div>
    );
  }

  const doContato = m.role === "contact";
  const doAgente = m.role === "bot";
  const semTexto = !m.text || /^\[(Foto|Áudio|Vídeo|Documento|Figurinha)\]$/.test(m.text);

  return (
    <div className={cn("flex flex-col", doContato ? "items-start" : "items-end")}>
      {!doContato && (
        <span className="mb-1 flex items-center gap-1 px-1 text-[11px] text-text-tertiary">
          {doAgente ? (
            <>
              <Bot size={11} /> Agente
            </>
          ) : (
            m.author?.name ?? "Atendente"
          )}
        </span>
      )}

      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5",
          doContato && "rounded-bl-md bg-surface-3 text-text-primary",
          doAgente && "rounded-br-md bg-[#1f2c44] text-white/95",
          m.role === "human" && "rounded-br-md bg-accent-500 text-white",
          m.entrega?.status === "failed" && "ring-1 ring-danger/50"
        )}
      >
        {m.media && (
          <div className={cn(!semTexto && "mb-2")}>
            <Anexo m={m} />
          </div>
        )}
        {!semTexto && <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{m.text}</p>}

        <div className={cn("mt-1 flex items-center justify-end gap-1.5 text-[10.5px]", doContato ? "text-text-tertiary" : "text-white/60")}>
          <span className="tabular-nums">{horaDaMensagem(m.createdAt)}</span>
          {!doContato && m.entrega?.status !== "failed" && <Entrega m={m} onReenviar={() => onReenviar(m)} />}
        </div>
      </div>

      {!doContato && m.entrega?.status === "failed" && <Entrega m={m} onReenviar={() => onReenviar(m)} />}
    </div>
  );
}
