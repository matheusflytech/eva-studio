"use client";

import * as React from "react";
import { gsap, reduzMovimento, useGSAP } from "./gsap";

/**
 * Número que rola até o valor novo (contagem e total em R$ do cabeçalho da
 * coluna). A primeira pintura já mostra o valor certo; só as mudanças animam.
 * Com menos movimento, troca direto.
 */
export function NumeroAnimado({ valor, formatar = (n) => Math.round(n).toLocaleString("pt-BR") }: { valor: number; formatar?: (n: number) => string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const atual = React.useRef(valor);
  const formatarRef = React.useRef(formatar);
  React.useEffect(() => {
    formatarRef.current = formatar;
  });

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || atual.current === valor) return;
      if (reduzMovimento()) {
        atual.current = valor;
        el.textContent = formatarRef.current(valor);
        return;
      }
      const estado = { n: atual.current };
      gsap.to(estado, {
        n: valor,
        duration: 0.4,
        ease: "power2.out",
        onUpdate: () => {
          atual.current = estado.n;
          el.textContent = formatarRef.current(estado.n);
        },
        onComplete: () => {
          atual.current = valor;
          el.textContent = formatarRef.current(valor);
        },
      });
    },
    { dependencies: [valor] }
  );

  // O texto é do GSAP depois da primeira pintura: o React pinta só o inicial
  // (sempre a mesma string), senão ele trocaria o número antes da animação.
  const [inicial] = React.useState(() => formatar(valor));
  return <span ref={ref}>{inicial}</span>;
}
