"use client";

/** Mídia de uma resposta do bot (Bloco do Studio) nas conversas de teste. A URL já vem validada (http/https) pelo motor. */
export interface MidiaDaMensagem {
  type: "image" | "video" | "audio" | "document" | "sticker";
  url: string;
  name?: string;
}

export function MidiaDaMensagem({ media }: { media: MidiaDaMensagem }) {
  if (media.type === "sticker") {
    // eslint-disable-next-line @next/next/no-img-element -- URL de fora, qualquer domínio
    return <img src={media.url} alt="Figurinha" className="size-32 object-contain" />;
  }
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

/** Carrossel de uma resposta do bot nas conversas de teste. */
export interface CardDaMensagem {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  buttons: { label: string; url: string }[];
}

export function CartoesDaMensagem({ cards }: { cards: CardDaMensagem[] }) {
  return (
    <div className="flex w-full snap-x gap-2 overflow-x-auto pb-1">
      {cards.map((k, i) => (
        <div key={i} className="flex w-48 shrink-0 snap-start flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-raised">
          {k.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL de fora, qualquer domínio
            <img src={k.imageUrl} alt="" className="h-28 w-full object-cover" />
          )}
          <div className="flex flex-1 flex-col gap-1 px-3 py-2">
            <span className="text-small font-medium text-text-primary">{k.title}</span>
            {k.subtitle && <span className="text-caption text-text-secondary">{k.subtitle}</span>}
          </div>
          {k.buttons.map((b, j) => (
            <a
              key={j}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="border-t border-border-subtle px-3 py-1.5 text-center text-caption font-medium text-accent-fg hover:bg-hover"
            >
              {b.label}
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
