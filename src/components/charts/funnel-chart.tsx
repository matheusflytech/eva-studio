import { cn } from "@/lib/utils";

export interface EtapaDoFunil {
  etapaId: string;
  nome: string;
  quantidade: number;
  taxaDaAnterior: number;
  taxaDoInicio: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Funil de conversão: uma barra por etapa, centrada e proporcional ao começo
 * do funil. Número e "% da anterior" ficam sempre escritos — a cor é só
 * reforço (azul de destaque; a última, a etapa de ganho, em verde de dado).
 */
export function FunnelChart({ etapas }: { etapas: EtapaDoFunil[] }) {
  const inicio = etapas[0]?.quantidade ?? 0;
  if (inicio === 0) {
    return (
      <p className="rounded-[14px] bg-raised px-4 py-7 text-center text-small text-text-tertiary">
        Nenhum negócio criado no período.
      </p>
    );
  }

  const descricao = etapas
    .map((e, i) => `${e.nome} ${e.quantidade}${i > 0 ? ` (${pct(e.taxaDaAnterior)} da anterior)` : ""}`)
    .join(", ");

  return (
    <div role="img" aria-label={`Funil de conversão: ${descricao}.`} className="flex flex-col gap-1.5 pt-1">
      {etapas.map((e, i) => {
        const ultima = i === etapas.length - 1;
        const largura = Math.max(6, (e.quantidade / inicio) * 100);
        return (
          <div key={e.etapaId} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-small">
            <span className="truncate text-text-secondary" title={e.nome}>
              {e.nome}
            </span>
            <div className="flex h-7 items-center justify-center rounded-[9px] bg-raised">
              <div
                className={cn(
                  "h-7 rounded-[9px] transition-[width] duration-500 ease-out motion-reduce:transition-none",
                  ultima ? "bg-cat-green-solid" : "bg-accent-solid"
                )}
                style={{ width: `${largura}%`, opacity: ultima ? 1 : 1 - (i / Math.max(etapas.length, 1)) * 0.55 }}
              />
            </div>
            <span className="w-[5.5rem] shrink-0 text-right tabular-nums">
              <span className="font-semibold text-text-primary">{e.quantidade.toLocaleString("pt-BR")}</span>
              {i > 0 && <span className="ml-1.5 font-mono text-caption text-text-tertiary">{pct(e.taxaDaAnterior)}</span>}
            </span>
          </div>
        );
      })}
      <p className="mt-1.5 text-caption text-text-tertiary">
        Do início ao ganho: <span className="font-medium text-text-secondary">{pct(etapas[etapas.length - 1].taxaDoInicio)}</span>.
        A porcentagem ao lado de cada etapa compara com a etapa anterior.
      </p>
    </div>
  );
}
