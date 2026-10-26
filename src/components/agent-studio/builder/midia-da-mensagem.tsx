"use client";

/** Mídia de uma resposta do bot (Bloco do Studio) nas conversas de teste. A URL já vem validada (http/https) pelo motor. */
export interface MidiaDaMensagem {
  type: "image" | "video" | "audio" | "document";
  url: string;
  name?: string;
}

export function MidiaDaMensagem({ media }: { media: MidiaDaMensagem }) {
  if (media.type === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- URL de fora, qualquer domínio
    return <img src={media.url} alt="" className="max-h-60 max-w-[85%] rounded-[14px] outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />;
  }
  if (media.type === "video") return <video src={media.url} controls className="max-h-60 max-w-[85%] rounded-[14px]" />;
  if (media.type === "audio") return <audio src={media.url} controls className="max-w-[85%]" />;
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noopener noreferrer"
      className="max-w-[85%] truncate rounded-[14px] border border-border-subtle bg-raised px-3 py-2 text-small text-accent-fg underline-offset-2 hover:underline"
    >
      {media.name || "Abrir arquivo"}
    </a>
  );
}
