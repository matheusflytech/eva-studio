"use client";

import * as React from "react";
import { ExternalLink, FileText, Image as ImageIcon, Phone, Reply, Copy, Video } from "lucide-react";
import type { PreviaTemplate } from "@/lib/whatsapp/template-meta";

// Prévia no jeito do WhatsApp: balão claro sobre o fundo bege da conversa,
// com a formatação que o app de verdade aplica (*negrito*, _itálico_,
// ~riscado~). As cores são do WhatsApp, não do tema: a ideia é a pessoa ver
// como o cliente vai ver.

function formatar(texto: string): React.ReactNode[] {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return partes.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

const ICONE_BOTAO = {
  QUICK_REPLY: Reply,
  URL: ExternalLink,
  PHONE_NUMBER: Phone,
  OTP: Copy,
} as const;

export function PreviaWhatsApp({ previa, hora = "09:00" }: { previa: PreviaTemplate; hora?: string }) {
  const vazio = !previa.corpo.trim() && !previa.header && !previa.rodape;
  return (
    <div className="rounded-2xl bg-[#efeae2] p-4" aria-label="Prévia da mensagem no WhatsApp">
      <div className="max-w-[320px]">
        <div className="rounded-lg rounded-tl-none bg-white px-2.5 pb-1.5 pt-2 text-small leading-snug text-[#111b21] shadow-sm">
          {previa.header?.formato === "TEXT" && previa.header.texto && (
            <p className="mb-1 font-semibold">{previa.header.texto}</p>
          )}
          {previa.header && previa.header.formato !== "TEXT" && (
            <div className="mb-1.5 flex h-32 flex-col items-center justify-center gap-1 rounded-md bg-[#d1d7db] text-[#54656f]">
              {previa.header.formato === "IMAGE" ? <ImageIcon size={26} /> : previa.header.formato === "VIDEO" ? <Video size={26} /> : <FileText size={26} />}
              <span className="max-w-[90%] truncate text-caption">{previa.header.nomeArquivo ?? "arquivo de exemplo"}</span>
            </div>
          )}
          <p className="whitespace-pre-wrap break-words">
            {vazio ? <span className="text-[#8696a0]">A mensagem aparece aqui enquanto você escreve.</span> : formatar(previa.corpo)}
          </p>
          {previa.rodape && <p className="mt-1 text-caption text-[#8696a0]">{previa.rodape}</p>}
          <p className="mt-0.5 text-right text-caption text-[#8696a0]">{hora}</p>
        </div>
        {previa.botoes.length > 0 && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            {previa.botoes.slice(0, 10).map((b, i) => {
              const Icone = ICONE_BOTAO[b.tipo];
              return (
                <div
                  key={i}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-small font-medium text-[#027eb5] shadow-sm"
                >
                  <Icone size={13} /> {b.texto}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
