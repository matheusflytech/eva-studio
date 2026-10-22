"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { MS_PARA_DESFAZER } from "@/lib/lixeira";

// ---------------------------------------------------------------------------
// "Apagar" das telas sem confirmação: apaga, e o toast oferece "Desfazer" por
// alguns segundos (restaura da lixeira). Undo em vez de confirmação.
//
// Única exceção: a lixeira ainda não está ativada no banco (o servidor
// responde 409 lixeira_indisponivel). Aí apagar é definitivo, então a tela
// pergunta antes e manda de novo com ?definitivo=1.
// ---------------------------------------------------------------------------

export interface PedidoDeExclusao {
  /** Rota DELETE, ex.: /api/deals/<id>. */
  url: string;
  /** Título do toast, ex.: "Negócio apagado". */
  titulo: string;
  /** Pergunta quando a lixeira não está ativada (apagar seria definitivo). */
  perguntaSemLixeira: string;
  /** Depois de restaurar pelo "Desfazer" (recarregar a lista, voltar para a ficha...). */
  aoRestaurar?: (entityId: string) => void;
}

export type ResultadoDaExclusao = { ok: true } | { ok: false; erro: string | null };

async function lerErro(res: Response, padrao: string): Promise<{ erro: string; codigo?: string }> {
  const d = await res.json().catch(() => ({}));
  return { erro: typeof d.error === "string" ? d.error : padrao, codigo: typeof d.codigo === "string" ? d.codigo : undefined };
}

/** Restaura um item da lixeira; devolve os avisos ou o erro. */
export async function restaurarItem(id: string): Promise<{ ok: true; entityId: string; avisos: string[] } | { ok: false; erro: string }> {
  try {
    const res = await fetch("/api/lixeira", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "restaurar", id }),
    });
    if (!res.ok) return { ok: false, erro: (await lerErro(res, "Não foi possível restaurar.")).erro };
    const d = await res.json().catch(() => ({}));
    return { ok: true, entityId: String(d.entityId ?? ""), avisos: Array.isArray(d.avisos) ? d.avisos : [] };
  } catch {
    return { ok: false, erro: "Sem conexão. Tente de novo." };
  }
}

export function useApagarComDesfazer() {
  const toast = useToast();

  return React.useCallback(
    async (p: PedidoDeExclusao): Promise<ResultadoDaExclusao> => {
      try {
        let res = await fetch(p.url, { method: "DELETE" });
        if (res.status === 409) {
          const e = await lerErro(res.clone(), "");
          if (e.codigo === "lixeira_indisponivel") {
            if (!window.confirm(p.perguntaSemLixeira)) return { ok: false, erro: null };
            res = await fetch(`${p.url}${p.url.includes("?") ? "&" : "?"}definitivo=1`, { method: "DELETE" });
          }
        }
        if (!res.ok) return { ok: false, erro: (await lerErro(res, "Não foi possível apagar.")).erro };
        const d = await res.json().catch(() => ({}));
        const trashId: string | null = d?.lixeira?.id ?? null;

        if (!trashId) {
          toast({ title: p.titulo, description: d?.aviso ?? undefined, tone: "info" });
          return { ok: true };
        }
        toast({
          title: p.titulo,
          description: "Fica 30 dias na Lixeira (Configurações).",
          durationMs: MS_PARA_DESFAZER,
          action: {
            label: "Desfazer",
            onClick: async () => {
              const r = await restaurarItem(trashId);
              if (!r.ok) {
                toast({ title: "Não deu para desfazer", description: r.erro, tone: "danger" });
                return;
              }
              toast({
                title: "Restaurado",
                description: r.avisos.length ? r.avisos.join(" ") : undefined,
                tone: r.avisos.length ? "info" : "success",
                durationMs: r.avisos.length ? 10_000 : undefined,
              });
              p.aoRestaurar?.(r.entityId);
            },
          },
        });
        return { ok: true };
      } catch {
        return { ok: false, erro: "Sem conexão. Tente de novo." };
      }
    },
    [toast]
  );
}
