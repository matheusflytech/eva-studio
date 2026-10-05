"use client";

import * as React from "react";

/**
 * Atualização periódica que respeita a aba.
 *
 * Roda `fn` agora e de `intervalo` em `intervalo` ms, mas SÓ com a aba à vista.
 * Uma caixa de entrada esquecida aberta num segundo monitor, ou numa aba de
 * fundo, não tem motivo pra consultar o banco a cada poucos segundos — e com
 * pool de conexão pequeno isso se soma rápido. Ao voltar pra aba, atualiza na
 * hora, em vez de esperar o próximo ciclo.
 *
 * As chamadas nunca se sobrepõem: a próxima só é agendada depois que a atual
 * terminou. Assim uma resposta lenta não vira uma fila de pedidos.
 */
export function useSondagem(fn: () => Promise<void> | void, intervalo: number, ativo = true) {
  const ref = React.useRef(fn);
  ref.current = fn;

  React.useEffect(() => {
    if (!ativo) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let parado = false;

    const rodar = async () => {
      if (parado) return;
      if (document.visibilityState === "visible") {
        try {
          await ref.current();
        } catch {
          // Falha de rede é passageira: tenta de novo no próximo ciclo.
        }
      }
      if (!parado) timer = setTimeout(rodar, intervalo);
    };

    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void rodar();
    };

    void rodar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      parado = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [intervalo, ativo]);
}
