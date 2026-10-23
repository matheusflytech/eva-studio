"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/lib/utils";
import type { ItemDoHistorico } from "@/lib/historico/tipos";
import { IconeDoAtor, ListaDeMudancas } from "./pecas";

interface Pagina {
  disponivel: boolean;
  itens: ItemDoHistorico[];
  proximo: string | null;
}

/**
 * Bloco "Histórico" de uma ficha (hoje a da empresa, que não tem linha do
 * tempo): as últimas alterações e "Ver mais". `versao` muda quando a ficha
 * salva algo; o histórico é gravado logo depois da resposta, então a busca
 * espera um instante.
 */
export function HistoricoDoRegistro({ url, versao }: { url: string; versao?: unknown }) {
  const [itens, setItens] = React.useState<ItemDoHistorico[]>([]);
  const [proximo, setProximo] = React.useState<string | null>(null);
  const [estado, setEstado] = React.useState<"carregando" | "pronto" | "indisponivel" | "erro">("carregando");
  const [maisCarregando, setMaisCarregando] = React.useState(false);
  const primeira = React.useRef(true);

  React.useEffect(() => {
    let vivo = true;
    const atraso = primeira.current ? 0 : 800;
    primeira.current = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error();
        const p: Pagina = await r.json();
        if (!vivo) return;
        setItens(p.itens);
        setProximo(p.proximo);
        setEstado(p.disponivel ? "pronto" : "indisponivel");
      } catch {
        if (vivo) setEstado("erro");
      }
    }, atraso);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [url, versao]);

  async function verMais() {
    if (!proximo) return;
    setMaisCarregando(true);
    try {
      const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(proximo)}`);
      if (!r.ok) throw new Error();
      const p: Pagina = await r.json();
      setItens((atual) => [...atual, ...p.itens.filter((i) => !atual.some((a) => a.id === i.id))]);
      setProximo(p.proximo);
    } catch {
      setEstado("erro");
    } finally {
      setMaisCarregando(false);
    }
  }

  return (
    <section aria-labelledby="historico-do-registro" className="flex min-w-0 flex-col gap-2">
      <h2 id="historico-do-registro" className="font-mono text-caption uppercase tracking-wider text-text-tertiary">
        Histórico
      </h2>
      {estado === "carregando" ? (
        <p className="inline-flex items-center gap-2 text-small text-text-tertiary">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Carregando…
        </p>
      ) : estado === "indisponivel" ? (
        <p className="text-small text-text-tertiary">O histórico de alterações ainda não está ativado neste contrato.</p>
      ) : estado === "erro" && itens.length === 0 ? (
        <p role="alert" className="text-small text-danger">Não foi possível carregar o histórico.</p>
      ) : itens.length === 0 ? (
        <p className="text-small text-text-tertiary">Nenhuma alteração registrada ainda.</p>
      ) : (
        <>
          <ol className="flex flex-col gap-0.5">
            {itens.map((h) => (
              <li key={h.id} className="flex gap-3 rounded-[14px] px-2.5 py-2 transition-colors hover:bg-raised">
                <IconeDoAtor tipo={h.atorTipo} nome={h.atorNome} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-small font-semibold text-text-primary">
                      {h.atorNome} <span className="font-normal text-text-secondary">· {h.resumo.charAt(0).toLowerCase() + h.resumo.slice(1)}</span>
                    </p>
                    <time dateTime={h.em} className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">
                      {formatRelativeDate(h.em)}
                    </time>
                  </div>
                  <ListaDeMudancas mudancas={h.mudancas} className="mt-1" />
                </div>
              </li>
            ))}
          </ol>
          {proximo && (
            <Button variant="ghost" size="sm" className="self-start" onClick={verMais} disabled={maisCarregando}>
              {maisCarregando && <Loader2 size={14} className="animate-spin" aria-hidden />}
              Ver mais
            </Button>
          )}
        </>
      )}
    </section>
  );
}
