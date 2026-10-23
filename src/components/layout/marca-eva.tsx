import * as React from "react";

// ---------------------------------------------------------------------------
// Símbolo da Eva (o "A" com a perna esquerda fechada em laço arredondado).
// Vetor na cor do texto (currentColor): funciona no claro e no escuro, ao
// contrário do public/eva-mark.png, que é branco. Também marca o que é IA.
// ---------------------------------------------------------------------------

export function MarcaEva({ size = 20, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 380 400"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M118 48Q132 15 165 15Q199 15 213 46L358 381H310L247 240L190 381H88Q20 381 21 318Q22 292 34 266ZM161 92Q167 80 173 92L221 186L158 323Q154 333 143 333H92Q67 333 76 306Z"
      />
    </svg>
  );
}
