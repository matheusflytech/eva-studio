import { cn } from "@/lib/utils";

/**
 * A marca do Eva Help.
 *
 * O ícone anterior era o salva-vidas do lucide — o clichê de "suporte", e um
 * desenho pesado de aro e cunhas que fica sujo em tamanho pequeno.
 *
 * Aqui é uma bússola de traço fino: navegar pelo app é literalmente o que esta
 * tela faz, e agulha em círculo sobrevive a 16px, que é o tamanho em que ela
 * mais aparece (na barra lateral). O traço herda a cor do texto e a moldura só
 * existe no tamanho grande, onde há espaço pro degradê respirar.
 */
export function MarcaAjuda({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9" opacity={0.55} />
      {/* A agulha: dois triângulos que se encontram no centro. */}
      <path d="M15.4 8.6 10.9 10.9 8.6 15.4 13.1 13.1Z" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A marca dentro da moldura com degradê, para o cabeçalho da página. */
export function SeloAjuda({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
        "bg-gradient-to-br from-accent-500/30 via-accent-500/10 to-purple-500/20",
        "text-accent-300 ring-1 ring-white/10",
        className
      )}
    >
      {/* Brilho no topo: dá volume sem sombra dura, do mesmo jeito que os
          cartões de vidro do resto do app. */}
      <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 to-transparent" />
      <MarcaAjuda size={24} className="relative" />
    </span>
  );
}
