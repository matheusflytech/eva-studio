import * as React from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";
import { formatarTelefone, linkDoWhatsAppWeb } from "@/lib/telefone";
import { LogoDaMarca } from "./marca";

/*
 * Telefone com a bandeira do país (pelo DDI) e formatado: "+55 21 98171-0669".
 * A bandeira é um SVG local (public/bandeiras); DDI sem bandeira mostra um
 * globo neutro. Sem telefone, mostra o traço da tabela. Com `whatsapp`, mostra
 * ao lado o atalho para abrir a conversa no WhatsApp Web (só com número
 * completo).
 */
export function PhoneNumber({
  value,
  className,
  whatsapp = false,
}: {
  value: string | null | undefined;
  className?: string;
  whatsapp?: boolean;
}) {
  const t = formatarTelefone(value);
  if (!t) return <span className={cn("text-text-tertiary", className)}>—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      {t.pais ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/bandeiras/${t.pais.iso}.svg`}
          alt={t.pais.nome}
          title={t.pais.nome}
          width={16}
          height={12}
          className="h-3 w-4 shrink-0 rounded-xs ring-1 ring-border-subtle"
        />
      ) : (
        <Globe size={14} aria-hidden="true" className="shrink-0 text-text-tertiary" />
      )}
      {t.texto}
      {whatsapp && <AbrirNoWhatsApp telefone={value} />}
    </span>
  );
}

/** Atalho para abrir a conversa no WhatsApp Web, em outra aba. Não abre a linha da tabela. */
export function AbrirNoWhatsApp({ telefone, className }: { telefone: string | null | undefined; className?: string }) {
  const link = linkDoWhatsAppWeb(telefone);
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir no WhatsApp Web"
      aria-label="Abrir no WhatsApp Web"
      onClick={(e) => e.stopPropagation()}
      className={cn("inline-flex shrink-0 rounded-sm opacity-80 transition-opacity hover:opacity-100", focusRing, className)}
    >
      <LogoDaMarca marca="whatsapp" solto tamanho={15} />
    </a>
  );
}
